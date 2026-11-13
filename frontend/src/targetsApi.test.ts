import { afterEach, describe, expect, it, vi } from 'vitest';
import { targetsApi } from './targetsApi';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('targetsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the Clerk token and maps owner-scoped target responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        targets: [
          {
            id: 'target-1',
            entityName: 'ReviewLens Coffee',
            platform: 'google',
            sourceUrl: 'https://www.google.com/maps/place/ReviewLens+Coffee',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(targetsApi.list('verified-session-token')).resolves.toEqual([
      {
        id: 'target-1',
        name: 'ReviewLens Coffee',
        platform: 'google',
        sourceReference: 'https://www.google.com/maps/place/ReviewLens+Coffee',
        ingestionStatus: undefined,
        ingestionError: undefined,
        rejectedCount: undefined,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/api/analysis-targets', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer verified-session-token',
      },
    });
  });

  it('maps the latest ingestion rejected count for a target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          target: {
            id: 'target-1',
            entityName: 'ReviewLens Coffee',
            platform: 'google',
            sourceUrl:
              'https://www.google.com/maps/place/ReviewLens+Coffee',
          },
          latestIngestion: {
            status: 'succeeded',
            errorMessage: null,
            rejectedCount: 3,
          },
          reviews: [],
        }),
      ),
    );

    await expect(targetsApi.get('verified-session-token', 'target-1')).resolves
      .toMatchObject({
        id: 'target-1',
        rejectedCount: 3,
      });
  });

  it('translates the UI form to the fixed Google backend contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        target: {
          id: 'target-1',
          entityName: 'ReviewLens Coffee',
          platform: 'google',
          sourceUrl: 'https://www.google.com/maps/place/ReviewLens+Coffee',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await targetsApi.create('verified-session-token', {
      name: 'ReviewLens Coffee',
      platform: 'google_maps',
      sourceReference: 'https://www.google.com/maps/place/ReviewLens+Coffee',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/analysis-targets', {
      method: 'POST',
      body: JSON.stringify({
        entityName: 'ReviewLens Coffee',
        platform: 'google',
        sourceUrl: 'https://www.google.com/maps/place/ReviewLens+Coffee',
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer verified-session-token',
      },
    });
  });

  it('shows backend validation details instead of failing silently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Analysis target input is invalid.',
            issues: [{ message: 'Source URL is required.' }],
          },
          400,
        ),
      ),
    );

    await expect(
      targetsApi.create('verified-session-token', {
        name: 'ReviewLens Coffee',
        platform: 'google_maps',
        sourceReference: '',
      }),
    ).rejects.toThrow('Source URL is required.');
  });

  it('loads a target workspace and maps its import status and reviews', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        target: {
          id: 'target/1',
          entityName: 'ReviewLens Coffee',
          platform: 'google',
          sourceUrl: 'https://maps.google.com/example',
        },
        latestIngestion: {
          status: 'failed',
          errorMessage: 'Provider unavailable.',
        },
        reviews: [
          {
            id: 'review-1',
            reviewText: 'Great coffee.',
            rating: 5,
            reviewerName: 'Sam',
            reviewedAt: null,
            reviewUrl: null,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(targetsApi.get('token', 'target/1')).resolves.toMatchObject({
      id: 'target/1',
      name: 'ReviewLens Coffee',
      ingestionStatus: 'failed',
      ingestionError: 'Provider unavailable.',
      reviews: [{ id: 'review-1', reviewText: 'Great coffee.' }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analysis-targets/target%2F1',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
      }),
    );
  });

  it('defaults missing workspace reviews to an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          target: {
            id: 'target-1',
            entityName: 'ReviewLens Coffee',
            platform: 'google',
            sourceUrl: 'https://maps.google.com/example',
          },
          latestIngestion: null,
        }),
      ),
    );

    await expect(targetsApi.get('token', 'target-1')).resolves.toMatchObject({
      ingestionStatus: undefined,
      ingestionError: undefined,
      reviews: [],
    });
  });

  it('submits ingestion and review questions to the selected target', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          attempt: { status: 'succeeded', errorMessage: null },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ answer: 'Customers like it.' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(targetsApi.ingest('token', 'target/1')).resolves.toEqual({
      attempt: { status: 'succeeded', errorMessage: null },
    });
    await expect(
      targetsApi.ask('token', 'target/1', 'What do customers like?'),
    ).resolves.toBe('Customers like it.');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/analysis-targets/target%2F1/ingestions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/analysis-targets/target%2F1/questions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ question: 'What do customers like?' }),
      }),
    );
  });

  it('uses the server error when validation issues are absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'The target could not be loaded.' }, 500),
        ),
    );

    await expect(targetsApi.list('token')).rejects.toThrow(
      'The target could not be loaded.',
    );
  });

  it('falls back to the HTTP status when the error response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not json', { status: 502 })),
    );

    await expect(targetsApi.list('token')).rejects.toThrow(
      'Request failed (502).',
    );
  });
});
