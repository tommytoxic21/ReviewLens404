import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client.js';

const { answerMock } = vi.hoisted(() => ({ answerMock: vi.fn() }));
vi.mock('./qaService.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./qaService.js')>()),
  answerQuestionForTarget: answerMock,
}));
import { ReviewQaError } from './qaService.js';
import { registerReviewQaRoutes } from './qaRoutes.js';

const targetId = '11111111-1111-4111-8111-111111111111';
const db = {} as Database;

describe('Q&A route validation and authentication', () => {
  let app: ReturnType<typeof Fastify>;
  const model = { answer: vi.fn() };
  beforeEach(async () => {
    vi.resetAllMocks();
    answerMock.mockResolvedValue({
      answer: 'Fresh coffee.',
      status: 'answered',
      reviewsUsed: 1,
      totalReviews: 1,
    });
    app = Fastify({ logger: false });
    app.decorateRequest('authenticationContext', null);
    app.addHook('preHandler', async (request) => {
      const userId = request.headers['x-test-user'];
      if (typeof userId === 'string')
        request.authenticationContext = { userId };
      else throw new ReviewQaError('Authentication required.', 401);
    });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof ReviewQaError)
        return reply.code(error.statusCode).send({ error: error.message });
      return reply.code(500).send({ error: 'Server error' });
    });
    registerReviewQaRoutes(app, { database: db, model });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests before attempting Q&A', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/questions`,
      payload: { question: 'How is the coffee?' },
    });
    expect(response.statusCode).toBe(401);
    expect(answerMock).not.toHaveBeenCalled();
  });
  it('validates question text and target IDs', async () => {
    const options = {
      method: 'POST' as const,
      headers: { 'x-test-user': 'user-a' },
    };
    expect(
      (
        await app.inject({
          ...options,
          url: `/analysis-targets/${targetId}/questions`,
          payload: { question: '   ' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          ...options,
          url: `/analysis-targets/${targetId}/questions`,
          payload: { question: 42 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          ...options,
          url: `/analysis-targets/${targetId}/questions`,
          payload: { question: 'x'.repeat(501) },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          ...options,
          url: '/analysis-targets/invalid/questions',
          payload: { question: 'Hello' },
        })
      ).statusCode,
    ).toBe(400);
    expect(answerMock).not.toHaveBeenCalled();
  });
  it('sends trimmed question and actual authenticated user ID to the orchestration', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/questions`,
      headers: { 'x-test-user': 'user-a' },
      payload: { question: '  Is the service fast?  ' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      answer: 'Fresh coffee.',
      status: 'answered',
    });
    expect(answerMock).toHaveBeenCalledWith(
      db,
      { userId: 'user-a' },
      targetId,
      'Is the service fast?',
      model,
    );
  });
});
