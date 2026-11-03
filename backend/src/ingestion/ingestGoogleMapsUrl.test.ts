import assert from 'node:assert/strict';
import { test } from 'vitest';

import { ingestGoogleMapsUrl } from './ingestGoogleMapsUrl';

const testUrl =
  'https://www.google.com/maps/place/Example/' +
  'data=!4m5!3m4!1s0x8644cd7fdc1bf17b:0x1eb1b9a3fe5dab90!8m2';

test('ingests and normalizes reviews from a Google Maps URL', async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = new URL(String(input));

    assert.equal(
      url.searchParams.get('data_id'),
      '0x8644cd7fdc1bf17b:0x1eb1b9a3fe5dab90',
    );

    return new Response(
      JSON.stringify({
        reviews: [
          { snippet: 'Great service!', rating: 5 },
          { snippet: '', rating: 4 },
          { snippet: 'Nice place', rating: 4 },
        ],
      }),
      { status: 200 },
    );
  };

  const result = await ingestGoogleMapsUrl(testUrl, {
    apiKey: 'test-key',
    fetchImpl: mockFetch,
  });

  assert.equal(result.receivedCount, 3);
  assert.equal(result.reviews.length, 2);
  assert.equal(result.rejected.length, 1);

  assert.equal(result.reviews[0].text, 'Great service!');
  assert.equal(result.reviews[1].rating, 4);
});

test('rejects an unsupported URL before calling the API', async () => {
  let apiCalled = false;

  const mockFetch: typeof fetch = async () => {
    apiCalled = true;
    throw new Error('Should not be called');
  };

  await assert.rejects(
    ingestGoogleMapsUrl('https://example.com/place/123', {
      apiKey: 'test-key',
      fetchImpl: mockFetch,
    }),
    /Google Maps/,
  );

  assert.equal(apiCalled, false);
});

test('propagates API failures instead of fabricating reviews', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('Unavailable', { status: 503 });

  await assert.rejects(
    ingestGoogleMapsUrl(testUrl, {
      apiKey: 'test-key',
      fetchImpl: mockFetch,
    }),
    /HTTP 503/,
  );
});

test('ingests reviews from a shortened Google Maps URL', async () => {
  const shortUrl = 'https://maps.app.goo.gl/example123';

  const expandedUrl =
    'https://www.google.com/maps/place/Example/' +
    'data=!4m5!3m4!1s0x8644cd7fdc1bf17b:0x1eb1b9a3fe5dab90!8m2';

  // Simulates Google's URL redirect.
  const mockRedirectFetch: typeof fetch = async () =>
    new Response(null, {
      status: 302,
      headers: {
        location: expandedUrl,
      },
    });

  // Simulates SerpApi returning reviews.
  const mockSerpApiFetch: typeof fetch = async (input) => {
    const url = new URL(String(input));

    assert.equal(
      url.searchParams.get('data_id'),
      '0x8644cd7fdc1bf17b:0x1eb1b9a3fe5dab90',
    );

    return new Response(
      JSON.stringify({
        reviews: [
          {
            review_id: 'review-123',
            snippet: 'Excellent service!',
            rating: 5,
          },
          {
            review_id: 'review-456',
            snippet: 'Friendly staff',
            rating: 4,
          },
        ],
      }),
      { status: 200 },
    );
  };

  const result = await ingestGoogleMapsUrl(shortUrl, {
    apiKey: 'test-key',
    redirectFetchImpl: mockRedirectFetch,
    fetchImpl: mockSerpApiFetch,
  });

  assert.equal(result.receivedCount, 2);
  assert.equal(result.reviews.length, 2);
  assert.equal(result.rejected.length, 0);

  assert.equal(result.reviews[0].text, 'Excellent service!');
  assert.equal(result.reviews[0].rating, 5);
  assert.equal(result.reviews[1].rating, 4);
});
