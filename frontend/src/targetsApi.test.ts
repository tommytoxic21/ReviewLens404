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
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/api/analysis-targets', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer verified-session-token',
      },
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

  it('submits a Q&A question using the selected target and Clerk token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          answer: 'Reviewers frequently mention friendly staff.',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      targetsApi.ask(
        'verified-session-token',
        'target-1',
        'What do reviewers like?',
      ),
    ).resolves.toBe('Reviewers frequently mention friendly staff.');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analysis-targets/target-1/questions',
      {
        method: 'POST',
        body: JSON.stringify({ question: 'What do reviewers like?' }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer verified-session-token',
        },
      },
    );
  });

  it('encodes the target ID in Q&A endpoint paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ answer: 'OK' }));
    vi.stubGlobal('fetch', fetchMock);

    await targetsApi.ask(
      'verified-session-token',
      'target/with?symbols',
      'Hello',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analysis-targets/target%2Fwith%3Fsymbols/questions',
      expect.anything(),
    );
  });

  it('displays useful backend Q&A errors to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: 'No reviews are available for this target.' },
            422,
          ),
        ),
    );

    await expect(
      targetsApi.ask(
        'verified-session-token',
        'target-1',
        'What do reviewers say?',
      ),
    ).rejects.toThrow('No reviews are available for this target.');
  });
});
