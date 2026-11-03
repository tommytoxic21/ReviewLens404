import type { AnalysisTarget } from '../db/schema.js';

export interface SourceReview {
  sourceReviewId?: unknown;
  reviewText?: unknown;
  rating?: unknown;
  reviewerName?: unknown;
  reviewedAt?: unknown;
  reviewUrl?: unknown;
}

export interface ReviewSource {
  fetchReviews(target: AnalysisTarget): Promise<readonly SourceReview[]>;
}

export class ReviewSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewSourceError';
  }
}
