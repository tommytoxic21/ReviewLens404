/**
 * S1-021: Normalize ingested review data.
 *
 * This module does not access the database, authentication,
 * or any external review service.
 */

export interface RawReview {
  text?: unknown;
  rating?: unknown;
  sourceReviewId?: unknown;
  reviewerName?: unknown;
  reviewDate?: unknown;
  reviewUrl?: unknown;
  sourceMetadata?: unknown;
}

export interface NormalizedReview {
  text: string;
  rating: number;
  sourceReviewId?: string;
  reviewerName?: string;
  reviewDate?: string;
  reviewUrl?: string;
  sourceMetadata?: Record<string, unknown>;
}

export type NormalizationResult =
  | { success: true; review: NormalizedReview }
  | { success: false; reason: string };

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeReview(raw: RawReview): NormalizationResult {
  // Written review text is required.
  const text = optionalString(raw.text);

  if (!text) {
    return {
      success: false,
      reason: 'Review text is missing or empty',
    };
  }

  // The Google Maps source uses a 1-5 rating scale.
  const rating =
    typeof raw.rating === 'number' ||
    (typeof raw.rating === 'string' && raw.rating.trim() !== '')
      ? Number(raw.rating)
      : NaN;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return {
      success: false,
      reason: 'Review rating must be an integer from 1 to 5',
    };
  }

  const review: NormalizedReview = {
    text,
    rating,
  };

  // Preserve optional metadata when available.
  const sourceReviewId = optionalString(raw.sourceReviewId);
  const reviewerName = optionalString(raw.reviewerName);
  const reviewDate = optionalString(raw.reviewDate);
  const reviewUrl = optionalString(raw.reviewUrl);

  if (sourceReviewId) review.sourceReviewId = sourceReviewId;
  if (reviewerName) review.reviewerName = reviewerName;
  if (reviewDate) review.reviewDate = reviewDate;
  if (reviewUrl) review.reviewUrl = reviewUrl;

  if (
    raw.sourceMetadata !== null &&
    typeof raw.sourceMetadata === 'object' &&
    !Array.isArray(raw.sourceMetadata)
  ) {
    review.sourceMetadata = raw.sourceMetadata as Record<string, unknown>;
  }

  return {
    success: true,
    review,
  };
}

export function normalizeReviews(rawReviews: RawReview[]) {
  const reviews: NormalizedReview[] = [];
  const rejected: { index: number; reason: string }[] = [];

  rawReviews.forEach((raw, index) => {
    const result = normalizeReview(raw);

    if (result.success) {
      reviews.push(result.review);
    } else {
      rejected.push({
        index,
        reason: result.reason,
      });
    }
  });

  return { reviews, rejected };
}
