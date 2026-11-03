import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client.js';

const {
  getAuthMock,
  targetLookupMock,
  saveReviewsMock,
  ingestMock,
  startAttemptMock,
  finalizeAttemptMock,
} = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  targetLookupMock: vi.fn(),
  saveReviewsMock: vi.fn(),
  ingestMock: vi.fn(),
  startAttemptMock: vi.fn(),
  finalizeAttemptMock: vi.fn(),
}));

vi.mock('@clerk/fastify', () => ({
  getAuth: getAuthMock,
}));

vi.mock('../analysisTargets/analysisTargetRepository.js', () => ({
  getAnalysisTargetByIdForOwner: targetLookupMock,
}));

vi.mock('./reviewRepository.js', () => ({
  saveReviewsForTargetOwner: saveReviewsMock,
}));

vi.mock('./ingestionAttemptRepository.js', () => ({
  startIngestionAttemptForTargetOwner: startAttemptMock,
  finalizeIngestionAttemptForTargetOwner: finalizeAttemptMock,
}));

import { ingestionRoutes } from './ingestionRoutes.js';

const targetId = '11111111-1111-4111-8111-111111111111';
const attemptId = '33333333-3333-4333-8333-333333333333';

const storedSourceUrl = 'https://maps.app.goo.gl/dUz2g3bMPRg2jiUE6';

const owner = { userId: 'user_owner' };

const testReview = {
  text: 'Amazing customer service!',
  rating: 5,
  sourceReviewId: 'google-review-123',
};

const counts = {
  receivedCount: 1,
  savedCount: 1,
  rejectedCount: 0,
};

describe('S1-019 / S1-023 Authenticated Review Ingestion', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.resetAllMocks();

    getAuthMock.mockReturnValue({
      isAuthenticated: true,
      userId: owner.userId,
    });

    targetLookupMock.mockResolvedValue({
      id: targetId,
      ownerId: owner.userId,
      entityName: 'Test Coffee Shop',
      platform: 'google',
      sourceUrl: storedSourceUrl,
      createdAt: new Date(),
    });

    ingestMock.mockResolvedValue({
      reviews: [testReview],
      rejected: [],
      receivedCount: 1,
    });

    saveReviewsMock.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        analysisTargetId: targetId,
        ...testReview,
      },
    ]);

    startAttemptMock.mockResolvedValue({
      id: attemptId,
      analysisTargetId: targetId,
      status: 'processing',
    });

    finalizeAttemptMock.mockImplementation(async (...args: unknown[]) => {
      const outcome = args[4] as {
        status: 'succeeded' | 'failed';
      };

      return {
        id: attemptId,
        status: outcome.status,
      };
    });

    app = Fastify({ logger: false });
    app.decorateRequest('authenticationContext', null);

    app.register(ingestionRoutes, {
      db: {} as Database,
      ingest: ingestMock,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests before processing', async () => {
    getAuthMock.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Authentication required.',
    });

    expect(targetLookupMock).not.toHaveBeenCalled();
    expect(startAttemptMock).not.toHaveBeenCalled();
    expect(ingestMock).not.toHaveBeenCalled();
    expect(saveReviewsMock).not.toHaveBeenCalled();
    expect(finalizeAttemptMock).not.toHaveBeenCalled();
  });

  it('rejects invalid target IDs before processing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/analysis-targets/invalid-id/ingest',
    });

    expect(response.statusCode).toBe(400);
    expect(targetLookupMock).not.toHaveBeenCalled();
    expect(startAttemptMock).not.toHaveBeenCalled();
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('rejects targets not owned by the user', async () => {
    targetLookupMock.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(404);

    expect(targetLookupMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      targetId,
    );

    expect(startAttemptMock).not.toHaveBeenCalled();
    expect(ingestMock).not.toHaveBeenCalled();
    expect(saveReviewsMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported review sources', async () => {
    targetLookupMock.mockResolvedValue({
      id: targetId,
      ownerId: owner.userId,
      platform: 'unsupported',
      sourceUrl: 'https://example.com/reviews',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(422);
    expect(startAttemptMock).not.toHaveBeenCalled();
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('records success only after saving reviews', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
      payload: {
        sourceUrl: 'https://example.com/untrusted',
      },
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      analysisTargetId: targetId,
      attemptId,
      status: 'succeeded',
      ...counts,
    });

    expect(startAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      targetId,
    );

    expect(ingestMock).toHaveBeenCalledExactlyOnceWith(storedSourceUrl);

    expect(saveReviewsMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      targetId,
      [testReview],
    );

    expect(finalizeAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      targetId,
      attemptId,
      {
        status: 'succeeded',
        counts,
      },
    );

    // Verify the required operation order.
    const startOrder = startAttemptMock.mock.invocationCallOrder[0];
    const ingestOrder = ingestMock.mock.invocationCallOrder[0];
    const saveOrder = saveReviewsMock.mock.invocationCallOrder[0];
    const finalizeOrder = finalizeAttemptMock.mock.invocationCallOrder[0];

    expect(startOrder).toBeLessThan(ingestOrder);
    expect(ingestOrder).toBeLessThan(saveOrder);
    expect(saveOrder).toBeLessThan(finalizeOrder);
  });

  it('records a failed attempt when source fetching fails', async () => {
    ingestMock.mockRejectedValue(new Error('Sensitive SerpApi failure'));

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(502);

    expect(response.json()).toEqual({
      analysisTargetId: targetId,
      attemptId,
      status: 'failed',
      error: 'Unable to retrieve reviews from the source.',
    });

    expect(response.body).not.toContain('Sensitive');

    expect(finalizeAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      targetId,
      attemptId,
      {
        status: 'failed',
        errorMessage: 'Unable to retrieve reviews from the source.',
        counts: undefined,
      },
    );

    expect(saveReviewsMock).not.toHaveBeenCalled();
  });

  it('records a failed attempt when persistence fails', async () => {
    saveReviewsMock.mockRejectedValue(
      new Error('Sensitive PostgreSQL failure'),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(500);

    expect(response.json()).toEqual({
      analysisTargetId: targetId,
      attemptId,
      status: 'failed',
      error: 'Unable to save reviews.',
    });

    expect(response.body).not.toContain('Sensitive');

    expect(finalizeAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      targetId,
      attemptId,
      {
        status: 'failed',
        errorMessage: 'Unable to save reviews.',
        counts: {
          receivedCount: 1,
          savedCount: 0,
          rejectedCount: 0,
        },
      },
    );
  });

  it('fails when no valid reviews are available', async () => {
    ingestMock.mockResolvedValue({
      reviews: [],
      rejected: [{ index: 0, reason: 'Missing review text' }],
      receivedCount: 1,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().status).toBe('failed');

    expect(finalizeAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      targetId,
      attemptId,
      {
        status: 'failed',
        errorMessage: 'No valid reviews were available to save.',
        counts: {
          receivedCount: 1,
          savedCount: 0,
          rejectedCount: 1,
        },
      },
    );

    expect(saveReviewsMock).not.toHaveBeenCalled();
  });

  it('does not fetch when attempt creation fails', async () => {
    startAttemptMock.mockRejectedValue(
      new Error('Database connection unavailable'),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'Unable to start ingestion.',
    });

    expect(ingestMock).not.toHaveBeenCalled();
    expect(saveReviewsMock).not.toHaveBeenCalled();
    expect(finalizeAttemptMock).not.toHaveBeenCalled();
  });

  it('handles targets disappearing before attempt creation', async () => {
    startAttemptMock.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'AnalysisTarget no longer available.',
    });

    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('does not report success if finalization fails', async () => {
    finalizeAttemptMock.mockRejectedValue(new Error('Database update failed'));

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(saveReviewsMock).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'Unable to record ingestion outcome.',
    });

    expect(response.body).not.toContain('Database update failed');
  });

  it('does not claim failure was recorded when finalization fails', async () => {
    ingestMock.mockRejectedValue(new Error('Source unavailable'));
    finalizeAttemptMock.mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'Unable to record ingestion outcome.',
    });

    expect(saveReviewsMock).not.toHaveBeenCalled();
  });

  it('rejects incomplete persistence counts', async () => {
    saveReviewsMock.mockResolvedValue([]);

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().status).toBe('failed');

    expect(finalizeAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      targetId,
      attemptId,
      {
        status: 'failed',
        errorMessage: 'Unable to save all accepted reviews.',
        counts: {
          receivedCount: 1,
          savedCount: 0,
          rejectedCount: 0,
        },
      },
    );
  });
});
