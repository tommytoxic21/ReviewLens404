import type { SourceReview } from './reviewSource.js';

export interface NormalizedReview {
  sourceReviewId: string | null;
  reviewText: string;
  rating: number;
  reviewerName: string | null;
  reviewedAt: Date | null;
  reviewUrl: string | null;
}

export interface ReviewNormalizationResult {
  reviews: NormalizedReview[];
  rejectedReviewCount: number;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalDate(value: unknown): Date | null {
  const normalized = optionalString(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalHttpUrl(value: unknown): string | null {
  const normalized = optionalString(value);

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function normalizeSourceReviews(
  sourceReviews: readonly SourceReview[],
): ReviewNormalizationResult {
  const reviews: NormalizedReview[] = [];
  let rejectedReviewCount = 0;

  for (const sourceReview of sourceReviews) {
    const reviewText = optionalString(sourceReview.reviewText);
    const rating = sourceReview.rating;

    if (
      !reviewText ||
      typeof rating !== 'number' ||
      !Number.isFinite(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      rejectedReviewCount += 1;
      continue;
    }

    reviews.push({
      sourceReviewId: optionalString(sourceReview.sourceReviewId),
      reviewText,
      rating,
      reviewerName: optionalString(sourceReview.reviewerName),
      reviewedAt: optionalDate(sourceReview.reviewedAt),
      reviewUrl: optionalHttpUrl(sourceReview.reviewUrl),
    });
  }

  return { reviews, rejectedReviewCount };
}
