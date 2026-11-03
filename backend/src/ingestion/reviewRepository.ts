import { eq } from 'drizzle-orm';

import type { AuthenticationContext } from '../authentication.js';
import { getAnalysisTargetByIdForOwner } from '../analysisTargets/analysisTargetRepository.js';
import type { Database } from '../db/client.js';
import { reviews, type Review } from '../db/schema.js';
import type { NormalizedReview } from './normalizeReview.js';

/**
 * S1-022: Persist reviews for an AnalysisTarget.
 *
 * Returns null if the target does not exist or the
 * authenticated user does not own it.
 *
 * Returns the saved review records on success.
 */
export async function saveReviewsForTargetOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
  normalizedReviews: NormalizedReview[],
): Promise<Review[] | null> {
  // Verify the user owns the requested target.
  const target = await getAnalysisTargetByIdForOwner(
    db,
    authenticationContext,
    targetId,
  );

  if (!target) {
    return null;
  }

  // Nothing to insert.
  if (normalizedReviews.length === 0) {
    return [];
  }

  // Associate every review with the verified target.
  const savedReviews = await db
    .insert(reviews)
    .values(
      normalizedReviews.map((review) => ({
        analysisTargetId: target.id,
        text: review.text,
        rating: review.rating,
        sourceReviewId: review.sourceReviewId ?? null,
        reviewerName: review.reviewerName ?? null,
        reviewDate: review.reviewDate ?? null,
        reviewUrl: review.reviewUrl ?? null,
        sourceMetadata: review.sourceMetadata ?? null,
      })),
    )
    .returning();

  return savedReviews;
}

/**
 * Retrieve reviews belonging to an AnalysisTarget.
 *
 * Returns null when the target is not owned by the user
 * or does not exist.
 *
 * Returns an empty array when an owned target has no reviews.
 */
export async function getReviewsForTargetOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<Review[] | null> {
  const target = await getAnalysisTargetByIdForOwner(
    db,
    authenticationContext,
    targetId,
  );

  if (!target) {
    return null;
  }

  return db
    .select()
    .from(reviews)
    .where(eq(reviews.analysisTargetId, target.id))
    .orderBy(reviews.createdAt, reviews.id);
}
