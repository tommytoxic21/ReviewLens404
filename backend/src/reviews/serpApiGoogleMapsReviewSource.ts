import type { AnalysisTarget } from '../db/schema.js';
import {
  type ReviewSource,
  ReviewSourceError,
  type SourceReview,
} from './reviewSource.js';

type FetchImplementation = typeof fetch;

interface PlaceReference {
  dataId?: string;
  placeId?: string;
  query?: string;
}

interface JsonRecord {
  [key: string]: unknown;
}

const SERP_API_ENDPOINT = 'https://serpapi.com/search.json';
const REQUEST_TIMEOUT_MS = 15_000;
const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null
    ? (value as JsonRecord)
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function decodedUrlText(url: URL): string {
  try {
    return decodeURIComponent(url.toString());
  } catch {
    return url.toString();
  }
}

function extractPathQuery(url: URL, segment: 'place' | 'search') {
  const marker = `/maps/${segment}/`;
  const start = url.pathname.indexOf(marker);

  if (start < 0) {
    return undefined;
  }

  const value = url.pathname.slice(start + marker.length).split('/')[0];

  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value.replaceAll('+', ' ')).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function extractGoogleMapsPlaceReference(
  sourceUrl: string,
): PlaceReference {
  const url = new URL(sourceUrl);
  const decoded = decodedUrlText(url);
  const dataId = decoded.match(/0x[0-9a-f]+:0x[0-9a-f]+/i)?.[0];
  const placeId =
    url.searchParams.get('query_place_id') ??
    decoded.match(/(?:!1s|\b)(ChI[A-Za-z0-9_-]+)/)?.[1];
  const query =
    url.searchParams.get('query')?.trim() ||
    url.searchParams.get('q')?.trim() ||
    extractPathQuery(url, 'place') ||
    extractPathQuery(url, 'search');

  return {
    ...(dataId ? { dataId } : {}),
    ...(placeId ? { placeId } : {}),
    ...(query ? { query } : {}),
  };
}

function chooseLocalResult(
  payload: JsonRecord,
  entityName: string,
): JsonRecord {
  const localResults = Array.isArray(payload.local_results)
    ? payload.local_results
        .map(asRecord)
        .filter((result) => result !== undefined)
    : [];

  if (localResults.length === 0) {
    throw new ReviewSourceError(
      'No Google Maps place could be resolved from the target source URL.',
    );
  }

  const normalizedEntityName = entityName.trim().toLocaleLowerCase();

  return (
    localResults.find(
      (result) =>
        asNonEmptyString(result.title)?.toLocaleLowerCase() ===
        normalizedEntityName,
    ) ?? localResults[0]!
  );
}

function sourceReviewsFromPayload(payload: JsonRecord): SourceReview[] {
  if (!Array.isArray(payload.reviews)) {
    return [];
  }

  return payload.reviews.flatMap((value) => {
    const review = asRecord(value);

    if (!review) {
      return [];
    }

    const user = asRecord(review.user);
    const extractedSnippet = asRecord(review.extracted_snippet);

    return [
      {
        sourceReviewId: review.review_id,
        reviewText: extractedSnippet?.original ?? review.snippet,
        rating: review.rating,
        reviewerName: user?.name,
        reviewedAt: review.iso_date ?? review.iso_date_of_last_edit,
        reviewUrl: review.link,
      },
    ];
  });
}

export class SerpApiGoogleMapsReviewSource implements ReviewSource {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {
    if (apiKey.trim().length === 0) {
      throw new Error('SERPAPI_API_KEY is required for review ingestion.');
    }
  }

  private async request(
    parameters: Record<string, string>,
  ): Promise<JsonRecord> {
    const url = new URL(SERP_API_ENDPOINT);

    for (const [name, value] of Object.entries(parameters)) {
      url.searchParams.set(name, value);
    }

    url.searchParams.set('api_key', this.apiKey);

    let response: Response;

    try {
      response = await this.fetchImplementation(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ReviewSourceError(
        'The Google Maps review service could not be reached.',
      );
    }

    if (!response.ok) {
      throw new ReviewSourceError(
        'The Google Maps review service rejected the request.',
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new ReviewSourceError(
        'The Google Maps review service returned an invalid response.',
      );
    }

    const record = asRecord(payload);

    if (!record) {
      throw new ReviewSourceError(
        'The Google Maps review service returned an invalid response.',
      );
    }

    const providerError = asNonEmptyString(record.error);

    if (providerError) {
      throw new ReviewSourceError(
        'The Google Maps review service could not process this source URL.',
      );
    }

    return record;
  }

  private async resolveShortLink(sourceUrl: string): Promise<string> {
    const url = new URL(sourceUrl);

    if (!SHORT_LINK_HOSTS.has(url.hostname)) {
      return sourceUrl;
    }

    let response: Response;

    try {
      response = await this.fetchImplementation(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ReviewSourceError(
        'The Google Maps short URL could not be resolved.',
      );
    }

    if (!response.ok || !response.url) {
      throw new ReviewSourceError(
        'The Google Maps short URL could not be resolved.',
      );
    }

    const resolvedUrl = new URL(response.url);
    const isGoogleHost =
      resolvedUrl.hostname === 'maps.google.com' ||
      /^(?:www\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(
        resolvedUrl.hostname,
      );

    if (resolvedUrl.protocol !== 'https:' || !isGoogleHost) {
      throw new ReviewSourceError(
        'The Google Maps short URL redirected to an unsupported location.',
      );
    }

    return resolvedUrl.toString();
  }

  async fetchReviews(target: AnalysisTarget): Promise<readonly SourceReview[]> {
    const resolvedSourceUrl = await this.resolveShortLink(target.sourceUrl);
    const reference = extractGoogleMapsPlaceReference(resolvedSourceUrl);
    let dataId = reference.dataId;
    let placeId = reference.placeId;

    if (!dataId && !placeId) {
      if (!reference.query) {
        throw new ReviewSourceError(
          'The Google Maps source URL does not contain a usable place reference.',
        );
      }

      const searchResult = await this.request({
        engine: 'google_maps',
        type: 'search',
        q: reference.query,
      });
      const place = chooseLocalResult(searchResult, target.entityName);
      dataId = asNonEmptyString(place.data_id);
      placeId = asNonEmptyString(place.place_id);

      if (!dataId && !placeId) {
        throw new ReviewSourceError(
          'The Google Maps place did not include a review identifier.',
        );
      }
    }

    const reviewPayload = await this.request({
      engine: 'google_maps_reviews',
      hl: 'en',
      ...(dataId ? { data_id: dataId } : { place_id: placeId! }),
    });

    return sourceReviewsFromPayload(reviewPayload);
  }
}
