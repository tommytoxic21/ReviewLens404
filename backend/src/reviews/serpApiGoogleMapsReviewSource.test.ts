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
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
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

  it('imports the next ten reviews on a later click instead of replaying page one', async () => {
    const firstTen = Array.from({ length: 10 }, (_, index) => ({
      review_id: `review-${index + 1}`,
      snippet: `Review ${index + 1}`,
      rating: 5,
    }));
    const secondTen = Array.from({ length: 10 }, (_, index) => ({
      review_id: `review-${index + 11}`,
      snippet: `Review ${index + 11}`,
      rating: 4,
    }));
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      return jsonResponse(
        url.searchParams.get('next_page_token') === 'page-2'
          ? { reviews: secondTen }
          : {
              reviews: firstTen,
              serpapi_pagination: { next_page_token: 'page-2' },
            },
      );
    });
    const source = new SerpApiGoogleMapsReviewSource(
      'private-api-key',
      fetchImplementation,
    );
    const place = target(
      'https://www.google.com/maps/place/Test/?query_place_id=ChITest',
    );

    const first = await source.fetchReviews(place);
    expect(first).toHaveLength(10);
    expect(first[0]?.sourceReviewId).toBe('review-1');
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const firstUrl = fetchImplementation.mock.calls[0]![0] as URL;
    expect(firstUrl.searchParams.get('num')).toBe('10');
    expect(firstUrl.searchParams.get('sort_by')).toBe('newestFirst');

    const second = await source.fetchReviews(
      place,
      new Set(first.map((review) => String(review.sourceReviewId))),
    );
    expect(second).toHaveLength(10);
    expect(second[0]?.sourceReviewId).toBe('review-11');
    expect(second[9]?.sourceReviewId).toBe('review-20');
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    const secondPageUrl = fetchImplementation.mock.calls[2]![0] as URL;
    expect(secondPageUrl.searchParams.get('next_page_token')).toBe('page-2');
  });

  it('returns an empty batch when no additional reviews exist', async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({
        reviews: [
          {
            review_id: 'already-imported',
            snippet: 'Existing review',
            rating: 5,
          },
        ],
      }),
    );
    const source = new SerpApiGoogleMapsReviewSource(
      'private-api-key',
      fetchImplementation,
    );
    const newReviews = await source.fetchReviews(
      target('https://www.google.com/maps/place/Test/?query_place_id=ChITest'),
      new Set(['already-imported']),
    );
    expect(newReviews).toEqual([]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('stops on a repeated pagination token rather than looping indefinitely', async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({
        reviews: [{ review_id: 'review-1', snippet: 'First', rating: 4 }],
        serpapi_pagination: { next_page_token: 'stuck-page' },
      }),
    );
    const source = new SerpApiGoogleMapsReviewSource(
      'private-api-key',
      fetchImplementation,
    );
    const reviews = await source.fetchReviews(
      target('https://www.google.com/maps/place/Test/?query_place_id=ChITest'),
    );
    expect(reviews).toHaveLength(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
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

  it('returns a partial batch when pagination reaches its safety limit', async () => {
    let requestCount = 0;

    const fetchImplementation = vi.fn(async () => {
      requestCount++;

      return jsonResponse({
        reviews: [
          {
            review_id: 'only-new-review',
            snippet: 'Great place.',
            rating: 5,
          },
        ],
        serpapi_pagination: {
          next_page_token: `page-${requestCount + 1}`,
        },
      });
    });

    const source = new SerpApiGoogleMapsReviewSource(
      'private-api-key',
      fetchImplementation,
    );

    const reviews = await source.fetchReviews(
      target('https://www.google.com/maps/place/Test/?query_place_id=ChITest'),
    );

    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.sourceReviewId).toBe('only-new-review');
    expect(fetchImplementation).toHaveBeenCalledTimes(25);
  });
});
