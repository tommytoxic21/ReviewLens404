import { eq } from 'drizzle-orm';
import type { AuthenticationContext } from '../authentication.js';
import { requireAnalysisTargetForOwner } from '../analysisTargets/analysisTargetRepository.js';
import type { Database } from '../db/client.js';
import { reviews, type Review } from '../db/schema.js';
import type { NormalizedReview } from './reviewNormalization.js';

export async function listReviewsForOwnedTarget(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<Review[]> {
  await requireAnalysisTargetForOwner(db, authenticationContext, targetId);

  return db
    .select()
    .from(reviews)
    .where(eq(reviews.analysisTargetId, targetId))
    .orderBy(reviews.createdAt);
}

export async function persistReviewsForOwnedTarget(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
  input: readonly NormalizedReview[],
): Promise<Review[]> {
  await requireAnalysisTargetForOwner(db, authenticationContext, targetId);

  if (input.length === 0) {
    return [];
  }

  return db
    .insert(reviews)
    .values(
      input.map((review) => ({
        analysisTargetId: targetId,
        ...review,
      })),
    )
    .onConflictDoNothing()
    .returning();
}
