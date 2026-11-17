import { describe, expect, it, vi } from 'vitest';
import type { AnalysisTarget } from '../db/schema.js';
import {
  extractGoogleMapsPlaceReference,
  SerpApiGoogleMapsReviewSource,
} from './serpApiGoogleMapsReviewSource.js';

function target(sourceUrl: string): AnalysisTarget {
  return {
    id: '9c33bc25-8849-4996-90f0-4efc2c122a86',
    ownerId: 'user_owner',
    entityName: 'ReviewLens Coffee',
    platform: 'google',
    sourceUrl,
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SerpApiGoogleMapsReviewSource', () => {
  const popeyesUrl =
    'https://www.google.com/maps/place/Popeyes+Louisiana+Kitchen/' +
    '@40.7350495,-74.1898732,17z/data=!3m2!4b1' +
    '!5s0x89c25365efb4ee71:0xa445fcf8a0cad745!4m6!3m5' +
    '!1s0x89c2536590244249:0x8c8de97e6e3da280!8m2' +
    '!3d40.7350455!4d-74.1872983!16s%2Fg%2F11dzw7hxxw';

  it.each([
    popeyesUrl,
    popeyesUrl.replaceAll('!', '%21').replaceAll(':0x', '%3A0x'),
  ])(
    'extracts the business ID instead of the preceding building ID: %s',
    (sourceUrl) => {
      expect(extractGoogleMapsPlaceReference(sourceUrl)).toMatchObject({
        dataId: '0x89c2536590244249:0x8c8de97e6e3da280',
      });
    },
  );

  it('does not treat an unrelated hexadecimal pair as a place identifier', () => {
    expect(
      extractGoogleMapsPlaceReference(
        'https://www.google.com/maps/place/Popeyes/data=!5s0x123:0x456!8m2',
      ),
    ).toEqual({ query: 'Popeyes' });
  });

  it('retrieves business reviews from a short link containing a building ID', async () => {
    const redirectResponse = new Response(null, { status: 200 });
    Object.defineProperty(redirectResponse, 'url', { value: popeyesUrl });
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      if (url.hostname === 'maps.app.goo.gl') {
        return redirectResponse;
      }

      // The containing floor has no reviews; only the business does.
      return jsonResponse(
        url.searchParams.get('data_id') ===
          '0x89c2536590244249:0x8c8de97e6e3da280'
          ? {
              reviews: [
                { review_id: 'review-1', snippet: 'Great service.', rating: 5 },
              ],
            }
          : { place_info: { title: '1', type: 'Level' } },
      );
    });
    const source = new SerpApiGoogleMapsReviewSource(
      'private-api-key',
      fetchImplementation,
    );

    await expect(
      source.fetchReviews({
        ...target('https://maps.app.goo.gl/zg9WmqLxC5sQNWMw8'),
        entityName: 'Popeyes',
      }),
    ).resolves.toEqual([
      expect.objectContaining({ reviewText: 'Great service.', rating: 5 }),
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('extracts a place reference from the saved Google Maps URL', () => {
    expect(
      extractGoogleMapsPlaceReference(
        'https://www.google.com/maps/place/ReviewLens+Coffee/@40.7,-73.9,17z/data=!4m8!3m7!1s0x89c259af336b3341:0xa4969e07ce3108de!8m2',
      ),
    ).toMatchObject({
      dataId: '0x89c259af336b3341:0xa4969e07ce3108de',
      query: 'ReviewLens Coffee',
    });
  });

  it('uses the source URL identifier and preserves provider metadata', async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({
        reviews: [
          {
            review_id: 'source-review-1',
            snippet: 'Great service.',
            rating: 5,
            iso_date: '2026-10-20T10:00:00.000Z',
            link: 'https://www.google.com/maps/reviews/source-review-1',
            user: { name: 'Grace' },
          },
        ],
      }),
    );
    const source = new SerpApiGoogleMapsReviewSource(
      'private-api-key',
      fetchImplementation,
    );

    const reviews = await source.fetchReviews(
      target(
        'https://www.google.com/maps/place/ReviewLens+Coffee/data=!4m8!1s0x89c259af336b3341:0xa4969e07ce3108de',
      ),
    );

    expect(reviews).toEqual([
      {
        sourceReviewId: 'source-review-1',
        reviewText: 'Great service.',
        rating: 5,
        reviewerName: 'Grace',
        reviewedAt: '2026-10-20T10:00:00.000Z',
        reviewUrl: 'https://www.google.com/maps/reviews/source-review-1',
      },
    ]);
    const requestedUrl = fetchImplementation.mock.calls[0]?.[0];
    expect(requestedUrl).toBeInstanceOf(URL);
    expect((requestedUrl as URL).searchParams.get('data_id')).toBe(
      '0x89c259af336b3341:0xa4969e07ce3108de',
    );
    expect((requestedUrl as URL).searchParams.get('api_key')).toBe(
      'private-api-key',
    );
  });

  it('resolves a place URL through a Google Maps search before reviews', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          local_results: [
            {
              title: 'ReviewLens Coffee',
              data_id: '0x123:0x456',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ reviews: [] }));
    const source = new SerpApiGoogleMapsReviewSource(
      'private-api-key',
      fetchImplementation,
    );

    await source.fetchReviews(
      target('https://www.google.com/maps/place/ReviewLens+Coffee'),
    );

    const searchUrl = fetchImplementation.mock.calls[0]?.[0] as URL;
    const reviewsUrl = fetchImplementation.mock.calls[1]?.[0] as URL;
    expect(searchUrl.searchParams.get('engine')).toBe('google_maps');
    expect(searchUrl.searchParams.get('q')).toBe('ReviewLens Coffee');
    expect(reviewsUrl.searchParams.get('engine')).toBe('google_maps_reviews');
    expect(reviewsUrl.searchParams.get('data_id')).toBe('0x123:0x456');
  });

  it('resolves an accepted Google Maps short URL before ingestion', async () => {
    const redirectResponse = new Response(null, { status: 200 });
    Object.defineProperty(redirectResponse, 'url', {
      value:
        'https://www.google.com/maps/place/ReviewLens+Coffee/data=!1s0x123:0x456',
    });
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse)
      .mockResolvedValueOnce(jsonResponse({ reviews: [] }));
    const source = new SerpApiGoogleMapsReviewSource(
      'private-api-key',
      fetchImplementation,
    );

    await source.fetchReviews(target('https://maps.app.goo.gl/AbCdEf123456'));

    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: 'HEAD',
      redirect: 'follow',
    });
    const reviewsUrl = fetchImplementation.mock.calls[1]?.[0] as URL;
    expect(reviewsUrl.searchParams.get('data_id')).toBe('0x123:0x456');
  });
});
