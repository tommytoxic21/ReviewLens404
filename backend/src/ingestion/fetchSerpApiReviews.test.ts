import assert from 'node:assert/strict';
import { test } from 'vitest';

import { fetchSerpApiReviews } from './fetchSerpApiReviews';

// Test 1: Successful HTTP response.
test('fetches and parses reviews from SerpApi', async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = new URL(String(input));

    assert.equal(url.searchParams.get('engine'), 'google_maps_reviews');
    assert.equal(url.searchParams.get('place_id'), 'test-place-123');

    return new Response(
      JSON.stringify({
        reviews: [
          {
            review_id: 'review-1',
            snippet: 'Great experience!',
            rating: 5,
          },
        ],
      }),
      { status: 200 },
    );
  };

  const reviews = await fetchSerpApiReviews({
    id: 'test-place-123',
    idType: 'place_id',
    apiKey: 'test-key',
    fetchImpl: mockFetch,
  });

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].text, 'Great experience!');
  assert.equal(reviews[0].rating, 5);
});

// Test 2: Reject missing credentials.
test('rejects missing API credentials', async () => {
  await assert.rejects(
    fetchSerpApiReviews({
      id: 'test-place',
      idType: 'place_id',
      apiKey: '',
    }),
    /API key is not configured/,
  );
});

// Test 3: Reject missing place identifier.
test('rejects an empty place identifier', async () => {
  await assert.rejects(
    fetchSerpApiReviews({
      id: ' ',
      idType: 'place_id',
      apiKey: 'test-key',
    }),
    /place identifier is required/,
  );
});

// Test 4: Handle HTTP errors.
test('reports HTTP errors without exposing credentials', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('Unauthorized', { status: 401 });

  await assert.rejects(
    fetchSerpApiReviews({
      id: 'test-place',
      idType: 'place_id',
      apiKey: 'secret-test-key',
      fetchImpl: mockFetch,
    }),
    /HTTP 401/,
  );
});

// Test 5: Handle unavailable API.
test('reports network failures', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('Network unavailable');
  };

  await assert.rejects(
    fetchSerpApiReviews({
      id: 'test-place',
      idType: 'place_id',
      apiKey: 'test-key',
      fetchImpl: mockFetch,
    }),
    /Could not connect to SerpApi/,
  );
});

// Test 6: Handle malformed JSON.
test('rejects invalid JSON responses', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('not json', { status: 200 });

  await assert.rejects(
    fetchSerpApiReviews({
      id: 'test-place',
      idType: 'data_id',
      apiKey: 'test-key',
      fetchImpl: mockFetch,
    }),
    /invalid JSON/,
  );
});
