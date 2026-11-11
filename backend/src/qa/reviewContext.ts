import type { AuthenticationContext } from '../authentication.js';
import { requireAnalysisTargetForOwner } from '../analysisTargets/analysisTargetRepository.js';
import type { Database } from '../db/client.js';
import { listReviewsForOwnedTarget } from '../reviews/reviewRepository.js';

// We deliberately supply a bounded, recent subset of stored reviews rather
// than an unbounded prompt. This is not semantic retrieval or a complete census.
export const MAX_CONTEXT_REVIEWS = 80;
export const MAX_REVIEW_CHARACTERS = 1_500;
export const MAX_CONTEXT_CHARACTERS = 30_000;

export interface ReviewEvidence {
  id: string;
  rating: number;
  text: string;
  reviewedAt: string | null;
}

export interface ReviewContext {
  targetId: string;
  targetName: string;
  totalReviewCount: number;
  reviews: ReviewEvidence[];
}

export async function buildReviewContext(
  db: Database,
  authentication: AuthenticationContext,
  targetId: string,
): Promise<ReviewContext> {
  // Never trust a target name, reviews, or owner ID supplied by the browser.
  // Both repository calls enforce ownership on the server.
  const target = await requireAnalysisTargetForOwner(
    db,
    authentication,
    targetId,
  );
  const storedReviews = await listReviewsForOwnedTarget(
    db,
    authentication,
    targetId,
  );

  let charactersRemaining = MAX_CONTEXT_CHARACTERS;
  const selected: ReviewEvidence[] = [];
  // The repository orders by ingestion timestamp. Prefer the most recently
  // ingested reviews; every selection is scoped to this one owned target.
  for (const review of storedReviews.slice(-MAX_CONTEXT_REVIEWS).reverse()) {
    if (charactersRemaining <= 0) break;
    const text = review.text
      .trim()
      .slice(0, Math.min(MAX_REVIEW_CHARACTERS, charactersRemaining));
    if (!text) continue;
    selected.push({
      id: review.id,
      rating: review.rating,
      text,
      reviewedAt: review.reviewDate,
    });
    charactersRemaining -= text.length;
  }

  return {
    targetId: target.id,
    targetName: target.entityName,
    totalReviewCount: storedReviews.length,
    reviews: selected,
  };
}
