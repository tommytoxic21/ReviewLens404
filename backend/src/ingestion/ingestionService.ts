import { eq } from 'drizzle-orm';
import type { AuthenticationContext } from '../authentication.js';
import { requireAnalysisTargetForOwner } from '../analysisTargets/analysisTargetRepository.js';
import type { Database } from '../db/client.js';
import {
  ingestionAttempts,
  reviews,
  type IngestionAttempt,
} from '../db/schema.js';
import { normalizeSourceReviews } from '../reviews/reviewNormalization.js';
import {
  type ReviewSource,
  ReviewSourceError,
} from '../reviews/reviewSource.js';
import { createIngestionAttemptForOwnedTarget } from './ingestionRepository.js';

export class IngestionError extends Error {
  readonly statusCode = 422;

  constructor(message: string) {
    super(message);
    this.name = 'IngestionError';
  }
}

export interface IngestionResult {
  attempt: IngestionAttempt;
}

function publicIngestionError(error: unknown): IngestionError {
  if (error instanceof IngestionError) {
    return error;
  }

  if (error instanceof ReviewSourceError) {
    return new IngestionError(error.message);
  }

  return new IngestionError(
    'Review ingestion failed. No new reviews were recorded.',
  );
}

export async function ingestReviewsForOwnedTarget(
  db: Database,
  reviewSource: ReviewSource,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<IngestionResult> {
  const target = await requireAnalysisTargetForOwner(
    db,
    authenticationContext,
    targetId,
  );
  const attempt = await createIngestionAttemptForOwnedTarget(
    db,
    authenticationContext,
    targetId,
  );
  let receivedCount = 0;
  let rejectedCount = 0;

  try {
    // Only examine review IDs from this already-authorized target.
    const storedReviews = await db
      .select({ sourceReviewId: reviews.sourceReviewId })
      .from(reviews)
      .where(eq(reviews.analysisTargetId, targetId));
    const existingIds = new Set(
      storedReviews.flatMap((review) =>
        review.sourceReviewId ? [review.sourceReviewId] : [],
      ),
    );
    const sourceReviews = await (existingIds.size
      ? reviewSource.fetchReviews(target, existingIds)
      : reviewSource.fetchReviews(target));
    receivedCount = sourceReviews.length;

    // Defense in depth for mocked/alternate review sources that do not
    // implement pagination or that return duplicate IDs in one response.
    const seenIds = new Set(existingIds);
    const newReviews = sourceReviews.filter((review) => {
      const id =
        typeof review.sourceReviewId === 'string'
          ? review.sourceReviewId.trim()
          : '';
      if (id && seenIds.has(id)) return false;
      if (id) seenIds.add(id);
      return true;
    });
    const normalized = normalizeSourceReviews(newReviews);
    rejectedCount =
      normalized.rejectedReviewCount + (sourceReviews.length - newReviews.length);

    if (normalized.reviews.length === 0 && sourceReviews.length > 0) {
      throw new IngestionError(
        'No usable new reviews with both review text and rating were returned.',
      );
    }
    if (normalized.reviews.length === 0 && storedReviews.length === 0) {
      throw new IngestionError(
        'No usable reviews with both review text and rating were returned.',
      );
    }

    const completedAttempt = await db.transaction(async (transaction) => {
      const persistedReviews = normalized.reviews.length
        ? await transaction
            .insert(reviews)
            .values(
              normalized.reviews.map((review) => ({
                analysisTargetId: targetId,
                text: review.reviewText,
                rating: review.rating,
                sourceReviewId: review.sourceReviewId,
                reviewerName: review.reviewerName,
                reviewDate: review.reviewedAt?.toISOString() ?? null,
                reviewUrl: review.reviewUrl,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: reviews.id })
        : [];
      const [completed] = await transaction
        .update(ingestionAttempts)
        .set({
          status: 'succeeded',
          receivedCount,
          savedCount: persistedReviews.length,
          rejectedCount,
          completedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(ingestionAttempts.id, attempt.id))
        .returning();

      if (!completed) {
        throw new Error('Failed to complete ingestion attempt.');
      }

      return completed;
    });

    return { attempt: completedAttempt };
  } catch (error) {
    const ingestionError = publicIngestionError(error);

    await db
      .update(ingestionAttempts)
      .set({
        status: 'failed',
        receivedCount,
        savedCount: 0,
        rejectedCount,
        completedAt: new Date(),
        errorMessage: ingestionError.message,
      })
      .where(eq(ingestionAttempts.id, attempt.id));

    throw ingestionError;
  }
}
