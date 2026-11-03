import type { RawReview } from './normalizeReview.js';
import { parseSerpApiReviews } from './serpApiReviews.js';

/**
 * S1-020: Retrieve Google Maps reviews using SerpApi.
 */

export interface SerpApiFetchOptions {
  id: string;
  idType: 'place_id' | 'data_id';
  apiKey?: string;

  // Allows automated tests to substitute a fake HTTP response.
  fetchImpl?: typeof fetch;
}

export async function fetchSerpApiReviews(
  options: SerpApiFetchOptions,
): Promise<RawReview[]> {
  const { id, idType, fetchImpl = fetch } = options;

  const apiKey = options.apiKey ?? process.env.SERPAPI_API_KEY;

  // Check required configuration.
  if (!apiKey?.trim()) {
    throw new Error('SerpApi API key is not configured');
  }

  if (!id.trim()) {
    throw new Error('Google Maps place identifier is required');
  }

  if (idType !== 'place_id' && idType !== 'data_id') {
    throw new Error('Unsupported Google Maps identifier type');
  }

  // Build the request with a fixed, trusted API endpoint.
  const url = new URL('https://serpapi.com/search.json');

  url.searchParams.set('engine', 'google_maps_reviews');
  url.searchParams.set(idType, id.trim());
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('num', '20');

  let response: Response;

  try {
    response = await fetchImpl(url.toString(), {
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // Do not expose URLs containing the secret API key.
    throw new Error('Could not connect to SerpApi');
  }

  if (!response.ok) {
    throw new Error(`SerpApi request failed (HTTP ${response.status})`);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error('SerpApi returned invalid JSON');
  }

  // Reuse the parser already tested for S1-020.
  return parseSerpApiReviews(payload);
}
