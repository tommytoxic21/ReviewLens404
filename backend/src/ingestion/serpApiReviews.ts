import type { RawReview } from './normalizeReview.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * S1-020: Convert SerpApi's Google Maps review records
 * into the raw format expected by S1-021.
 *
 * This function makes no network or database requests.
 */
export function parseSerpApiReviews(payload: unknown): RawReview[] {
  if (!isRecord(payload)) {
    throw new Error('Invalid SerpApi response');
  }

  // Never treat an API error as a successful empty import.
  if (typeof payload.error === 'string') {
    throw new Error('SerpApi returned an error');
  }

  if (!Array.isArray(payload.reviews)) {
    throw new Error('SerpApi response is missing its reviews array');
  }

  return payload.reviews.map((item): RawReview => {
    // Leave malformed individual records for S1-021 to reject.
    if (!isRecord(item)) {
      return {};
    }

    const user = isRecord(item.user) ? item.user : {};
    const extracted = isRecord(item.extracted_snippet)
      ? item.extracted_snippet
      : {};

    const metadata: Record<string, unknown> = {};

    if (item.source !== undefined) metadata.source = item.source;
    if (item.likes !== undefined) metadata.likes = item.likes;

    return {
      text:
        typeof extracted.original === 'string'
          ? extracted.original
          : item.snippet,
      rating: item.rating,
      sourceReviewId: item.review_id,
      reviewerName: user.name,
      reviewDate: item.iso_date ?? item.date,
      reviewUrl: item.link,
      sourceMetadata: metadata,
    };
  });
}
