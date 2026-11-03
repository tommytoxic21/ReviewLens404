import { describe, expect, it } from 'vitest';
import { normalizeSourceReviews } from './reviewNormalization.js';

describe('normalizeSourceReviews', () => {
  it('keeps required fields and useful source metadata', () => {
    const result = normalizeSourceReviews([
      {
        sourceReviewId: 'review-123',
        reviewText: '  Excellent coffee.  ',
        rating: 4.5,
        reviewerName: '  Ada  ',
        reviewedAt: '2026-10-20T10:00:00.000Z',
        reviewUrl: 'https://www.google.com/maps/reviews/review-123',
      },
    ]);

    expect(result).toEqual({
      rejectedReviewCount: 0,
      reviews: [
        {
          sourceReviewId: 'review-123',
          reviewText: 'Excellent coffee.',
          rating: 4.5,
          reviewerName: 'Ada',
          reviewedAt: new Date('2026-10-20T10:00:00.000Z'),
          reviewUrl: 'https://www.google.com/maps/reviews/review-123',
        },
      ],
    });
  });

  it.each([
    { reviewText: '', rating: 5 },
    { reviewText: 'No rating', rating: undefined },
    { reviewText: 'Invalid rating', rating: 8 },
  ])('rejects unusable source records without fabricating values', (record) => {
    expect(normalizeSourceReviews([record])).toEqual({
      reviews: [],
      rejectedReviewCount: 1,
    });
  });

  it('allows optional metadata to be absent', () => {
    expect(
      normalizeSourceReviews([{ reviewText: 'Useful review', rating: 5 }]),
    ).toEqual({
      rejectedReviewCount: 0,
      reviews: [
        {
          sourceReviewId: null,
          reviewText: 'Useful review',
          rating: 5,
          reviewerName: null,
          reviewedAt: null,
          reviewUrl: null,
        },
      ],
    });
  });
});
