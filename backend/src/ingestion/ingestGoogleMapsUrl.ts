import { expandGoogleMapsShortUrl } from './expandGoogleMapsShortUrl.js';

import { resolveGoogleMapsUrl } from './resolveGoogleMapsUrl.js';

import { fetchSerpApiReviews } from './fetchSerpApiReviews.js';

import { normalizeReviews } from './normalizeReview.js';

import type { NormalizedReview } from './normalizeReview.js';

/**
 * S1-020 / S1-021
 *
 * Accepts a Google Maps URL, including supported short links,
 * retrieves reviews, and normalizes the returned records.
 *
 * Authentication and database persistence are handled separately.
 */

export interface GoogleMapsIngestionResult {
  reviews: NormalizedReview[];
  rejected: {
    index: number;
    reason: string;
  }[];
  receivedCount: number;
}

export async function ingestGoogleMapsUrl(
  googleMapsUrl: string,
  options: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    redirectFetchImpl?: typeof fetch;
  } = {},
): Promise<GoogleMapsIngestionResult> {
  // Step 1: Expand shortened Google Maps URLs.
  // Full Google Maps URLs pass through unchanged.
  const expandedUrl = await expandGoogleMapsShortUrl(
    googleMapsUrl,
    options.redirectFetchImpl,
  );

  // Step 2: Extract the Google Maps place identifier.
  const identifier = resolveGoogleMapsUrl(expandedUrl);

  // Step 3: Retrieve real review data from SerpApi.
  const rawReviews = await fetchSerpApiReviews({
    ...identifier,
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
  });

  // Step 4: Normalize individual review records.
  const result = normalizeReviews(rawReviews);

  return {
    reviews: result.reviews,
    rejected: result.rejected,
    receivedCount: rawReviews.length,
  };
}
