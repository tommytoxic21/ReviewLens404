import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeReview, normalizeReviews } from './normalizeReview';

// Test 1: A valid review should be normalized.
test('normalizes a valid review', () => {
  const result = normalizeReview({
    text: '  Great customer service!  ',
    rating: 5,
    reviewerName: 'John Smith',
    sourceReviewId: 'review-123',
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.deepEqual(result.review, {
      text: 'Great customer service!',
      rating: 5,
      reviewerName: 'John Smith',
      sourceReviewId: 'review-123',
    });
  }
});

// Test 2: Missing review text should be rejected.
test('rejects a review with missing text', () => {
  const result = normalizeReview({
    rating: 4,
  });

  assert.equal(result.success, false);

  if (!result.success) {
    assert.equal(result.reason, 'Review text is missing or empty');
  }
});

// Test 3: Empty review text should be rejected.
test('rejects empty review text', () => {
  const result = normalizeReview({
    text: '   ',
    rating: 5,
  });

  assert.equal(result.success, false);
});

// Test 4: A missing or invalid rating should be rejected.
test('rejects missing and invalid ratings', () => {
  const invalidRatings = [undefined, null, 0, 6, -1, 3.5, 'invalid', ''];

  for (const rating of invalidRatings) {
    const result = normalizeReview({
      text: 'Good experience',
      rating,
    });

    assert.equal(
      result.success,
      false,
      `Expected rating ${String(rating)} to be rejected`,
    );
  }
});

// Test 5: Optional metadata may be absent.
test('accepts a review without optional metadata', () => {
  const result = normalizeReview({
    text: 'Amazing food!',
    rating: 4,
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.deepEqual(result.review, {
      text: 'Amazing food!',
      rating: 4,
    });
  }
});

// Test 6: One invalid review must not block valid ones.
test('normalizes valid reviews and rejects invalid records', () => {
  const result = normalizeReviews([
    { text: 'Excellent!', rating: 5 },
    { text: '', rating: 4 },
    { text: 'Terrible rating', rating: 9 },
    { text: 'Friendly staff', rating: 4 },
  ]);

  assert.equal(result.reviews.length, 2);
  assert.equal(result.rejected.length, 2);

  assert.equal(result.reviews[0].text, 'Excellent!');
  assert.equal(result.reviews[1].text, 'Friendly staff');

  assert.deepEqual(
    result.rejected.map((item) => item.index),
    [1, 2],
  );
});

// Test 7: Preserve useful source metadata.
test('preserves source metadata when available', () => {
  const result = normalizeReview({
    text: 'Would visit again',
    rating: '5',
    reviewDate: '2 weeks ago',
    reviewUrl: 'https://example.com/review/123',
    sourceMetadata: {
      source: 'google_maps',
      likes: 12,
    },
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.review.rating, 5);
    assert.equal(result.review.reviewDate, '2 weeks ago');
    assert.equal(result.review.reviewUrl, 'https://example.com/review/123');
    assert.deepEqual(result.review.sourceMetadata, {
      source: 'google_maps',
      likes: 12,
    });
  }
});
