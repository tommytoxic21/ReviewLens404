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

  try {
    const sourceReviews = await reviewSource.fetchReviews(target);
    const normalized = normalizeSourceReviews(sourceReviews);

    if (normalized.reviews.length === 0) {
      throw new IngestionError(
        'No usable reviews with both review text and rating were returned.',
      );
    }

    const completedAttempt = await db.transaction(async (transaction) => {
      const persistedReviews = await transaction
        .insert(reviews)
        .values(
          normalized.reviews.map((review) => ({
            analysisTargetId: targetId,
            ...review,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: reviews.id });
      const [completed] = await transaction
        .update(ingestionAttempts)
        .set({
          status: 'succeeded',
          reviewCount: persistedReviews.length,
          rejectedReviewCount: normalized.rejectedReviewCount,
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
        reviewCount: 0,
        completedAt: new Date(),
        errorMessage: ingestionError.message,
      })
      .where(eq(ingestionAttempts.id, attempt.id));

    throw ingestionError;
  }
}
