import assert from 'node:assert/strict';
import { test } from 'vitest';

import { parseSerpApiReviews } from './serpApiReviews';
import { normalizeReviews } from './normalizeReview';

test('parses a representative SerpApi review', () => {
  const raw = parseSerpApiReviews({
    reviews: [
      {
        review_id: 'google-review-123',
        snippet: 'Great customer service!',
        rating: 5,
        user: { name: 'Test Reviewer' },
        iso_date: '2026-10-01T12:00:00Z',
        link: 'https://www.google.com/maps/reviews/example',
        source: 'Google',
      },
    ],
  });

  const result = normalizeReviews(raw);

  assert.equal(result.reviews.length, 1);
  assert.equal(result.rejected.length, 0);

  assert.equal(result.reviews[0].text, 'Great customer service!');
  assert.equal(result.reviews[0].rating, 5);
  assert.equal(result.reviews[0].sourceReviewId, 'google-review-123');
  assert.equal(result.reviews[0].reviewerName, 'Test Reviewer');
});

test('prefers original review text when available', () => {
  const raw = parseSerpApiReviews({
    reviews: [
      {
        snippet: 'Translated text',
        extracted_snippet: { original: 'Original text' },
        rating: 4,
      },
    ],
  });

  const result = normalizeReviews(raw);

  assert.equal(result.reviews[0].text, 'Original text');
});

test('keeps valid reviews when another record is malformed', () => {
  const raw = parseSerpApiReviews({
    reviews: [
      { snippet: 'Excellent!', rating: 5 },
      { snippet: '', rating: 4 },
      null,
      { snippet: 'Good experience', rating: 4 },
    ],
  });

  const result = normalizeReviews(raw);

  assert.equal(result.reviews.length, 2);
  assert.equal(result.rejected.length, 2);
});

test('rejects a malformed API response', () => {
  assert.throws(
    () => parseSerpApiReviews({ unexpected: true }),
    /missing its reviews array/,
  );
});

test('does not treat an API error as successful ingestion', () => {
  assert.throws(
    () => parseSerpApiReviews({ error: 'Invalid API key' }),
    /SerpApi returned an error/,
  );
});

test('handles a genuinely empty review list', () => {
  assert.deepEqual(parseSerpApiReviews({ reviews: [] }), []);
});
