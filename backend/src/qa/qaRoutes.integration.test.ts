import 'dotenv/config';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const getAuth = vi.hoisted(() =>
  vi.fn((request: { headers: Record<string, unknown> }) => {
    const userId = request.headers['x-test-user'];
    return typeof userId === 'string'
      ? { isAuthenticated: true, userId }
      : { isAuthenticated: false, userId: null };
  }),
);
vi.mock('@clerk/fastify', () => ({ getAuth }));

import { registerApiRoutes } from '../api/routes.js';
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '../db/client.js';
import { analysisTargets, reviews } from '../db/schema.js';
import { ReviewQaError } from './qaService.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl)
  throw new Error(
    'TEST_DATABASE_URL is required to run Q&A integration tests.',
  );
if (testDatabaseUrl === process.env.DATABASE_URL)
  throw new Error('TEST_DATABASE_URL must use a separate test database.');

describe('S2-010..012 authenticated Q&A database integration', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  const answer = vi.fn();
  const reviewSource = { fetchReviews: vi.fn() };
  const owner = { 'x-test-user': 'user-qa-owner' };
  const stranger = { 'x-test-user': 'user-qa-stranger' };
  let firstTargetId: string;
  let secondTargetId: string;
  let strangersTargetId: string;

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl);
    await migrate(connection.db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
  });
  beforeEach(async () => {
    await connection.db.delete(analysisTargets);
    answer.mockReset();
    reviewSource.fetchReviews.mockReset();
    answer.mockImplementation(
      async (
        _question: string,
        context: { reviews: Array<{ text: string }> },
      ) => ({
        status: 'answered',
        answer: `Evidence: ${context.reviews.map((r) => r.text).join(' | ')}`,
      }),
    );
    const [first, second, other] = await connection.db
      .insert(analysisTargets)
      .values([
        {
          ownerId: 'user-qa-owner',
          entityName: 'First Coffee',
          platform: 'google',
          sourceUrl: 'https://maps.google.com/a',
        },
        {
          ownerId: 'user-qa-owner',
          entityName: 'Second Coffee',
          platform: 'google',
          sourceUrl: 'https://maps.google.com/b',
        },
        {
          ownerId: 'user-qa-stranger',
          entityName: 'Other Coffee',
          platform: 'google',
          sourceUrl: 'https://maps.google.com/c',
        },
      ])
      .returning();
    firstTargetId = first!.id;
    secondTargetId = second!.id;
    strangersTargetId = other!.id;
    await connection.db.insert(reviews).values([
      {
        analysisTargetId: firstTargetId,
        text: 'Unique battery life complaint',
        rating: 2,
      },
      {
        analysisTargetId: secondTargetId,
        text: 'Unique friendly customer service praise',
        rating: 5,
      },
      {
        analysisTargetId: strangersTargetId,
        text: 'PRIVATE USER B SECRET',
        rating: 1,
      },
    ]);
    app = Fastify({ logger: false });
    app.decorateRequest('authenticationContext', null);
    app.setErrorHandler((error, _request, reply) => {
      const code =
        'statusCode' in error && typeof error.statusCode === 'number'
          ? error.statusCode
          : 500;
      return reply.code(code).send({ error: error.message });
    });
    await app.register(
      async (api) =>
        registerApiRoutes(api, {
          database: connection.db,
          reviewSource,
          qaModel: { answer },
        }),
      { prefix: '/api' },
    );
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });
  afterAll(async () => {
    await connection.db.delete(analysisTargets);
    await connection.close();
  });

  function ask(targetId: string, headers = owner) {
    return app.inject({
      method: 'POST',
      url: `/api/analysis-targets/${targetId}/questions`,
      headers,
      payload: { question: 'What do reviews say?' },
    });
  }

  it('ingests persisted reviews and uses them for owned-target Q&A', async () => {
    const [target] = await connection.db
      .insert(analysisTargets)
      .values({
        ownerId: 'user-qa-owner',
        entityName: 'Ingested Coffee',
        platform: 'google',
        sourceUrl: 'https://maps.google.com/ingested',
      })
      .returning();
    const targetId = target!.id;
    reviewSource.fetchReviews.mockResolvedValue([
      {
        sourceReviewId: 'ingested-review',
        reviewText: 'Persisted review praises the quiet patio',
        rating: 5,
      },
      {
        sourceReviewId: 'rejected-review',
        reviewText: 'This invalid rating must not be stored',
        rating: 6,
      },
    ]);

    const emptyTargetResponse = await ask(targetId);
    expect(emptyTargetResponse.statusCode).toBe(409);
    expect(answer).not.toHaveBeenCalled();

    const ingestion = await app.inject({
      method: 'POST',
      url: `/api/analysis-targets/${targetId}/ingestions`,
      headers: owner,
    });
    expect(ingestion.statusCode).toBe(201);
    expect(ingestion.json().attempt).toMatchObject({
      analysisTargetId: targetId,
      status: 'succeeded',
      receivedCount: 2,
      savedCount: 1,
      rejectedCount: 1,
    });
    expect(reviewSource.fetchReviews).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: targetId,
        ownerId: 'user-qa-owner',
      }),
    );

    const persistedTarget = await app.inject({
      method: 'GET',
      url: `/api/analysis-targets/${targetId}`,
      headers: owner,
    });
    expect(persistedTarget.statusCode).toBe(200);
    expect(persistedTarget.json()).toMatchObject({
      reviews: [
        {
          analysisTargetId: targetId,
          reviewText: 'Persisted review praises the quiet patio',
          rating: 5,
        },
      ],
      latestIngestion: {
        status: 'succeeded',
        receivedCount: 2,
        savedCount: 1,
        rejectedCount: 1,
      },
    });

    const response = await ask(targetId);
    expect(response.statusCode).toBe(200);
    expect(response.json().answer).toContain(
      'Persisted review praises the quiet patio',
    );
    expect(answer).toHaveBeenCalledOnce();
    expect(answer.mock.calls[0]?.[1]).toMatchObject({
      targetId,
      targetName: 'Ingested Coffee',
      totalReviewCount: 1,
      reviews: [
        expect.objectContaining({
          text: 'Persisted review praises the quiet patio',
        }),
      ],
    });
    const context = JSON.stringify(answer.mock.calls[0]?.[1]);
    expect(context).not.toContain('invalid rating');
    expect(context).not.toContain('Unique battery life complaint');
    expect(context).not.toContain('PRIVATE USER B SECRET');
  });

  it('uses only the selected target and replaces evidence after a switch', async () => {
    const a = await ask(firstTargetId);
    expect(a.statusCode).toBe(200);
    expect(a.json().answer).toContain('battery life complaint');
    expect(a.json().answer).not.toContain('customer service');
    expect(answer.mock.calls[0]?.[1]).toMatchObject({
      targetId: firstTargetId,
      targetName: 'First Coffee',
      totalReviewCount: 1,
      reviews: [
        expect.objectContaining({ text: 'Unique battery life complaint' }),
      ],
    });

    const b = await ask(secondTargetId);
    expect(b.statusCode).toBe(200);
    expect(b.json().answer).toContain('friendly customer service');
    expect(b.json().answer).not.toContain('battery life');
    expect(answer.mock.calls[1]?.[1]).toMatchObject({
      targetId: secondTargetId,
      targetName: 'Second Coffee',
      totalReviewCount: 1,
      reviews: [
        expect.objectContaining({
          text: 'Unique friendly customer service praise',
        }),
      ],
    });
    const firstContext = JSON.stringify(answer.mock.calls[0]?.[1]);
    const secondContext = JSON.stringify(answer.mock.calls[1]?.[1]);
    expect(firstContext).not.toContain('Unique friendly customer service');
    expect(secondContext).not.toContain('Unique battery life');
    expect(`${firstContext}${secondContext}`).not.toContain(
      'PRIVATE USER B SECRET',
    );
  });

  it('rejects cross-user access and never sends that user review data to OpenAI', async () => {
    expect((await ask(strangersTargetId)).statusCode).toBe(404);
    expect((await ask(firstTargetId, stranger)).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/analysis-targets/${firstTargetId}/questions`,
          payload: { question: 'Anything?' },
        })
      ).statusCode,
    ).toBe(401);
    expect(answer).not.toHaveBeenCalled();
  });

  it.each(['not-started', 'failed', 'empty-result'])(
    'S2-020: declines an empty target after %s ingestion without invoking OpenAI',
    async (ingestionState) => {
      const [empty] = await connection.db
        .insert(analysisTargets)
        .values({
          ownerId: 'user-qa-owner',
          entityName: 'Empty Coffee',
          platform: 'google',
          sourceUrl: 'https://maps.google.com/empty',
        })
        .returning();
      if (ingestionState !== 'not-started') {
        if (ingestionState === 'failed') {
          reviewSource.fetchReviews.mockRejectedValue(
            new Error('Provider unavailable'),
          );
        } else {
          reviewSource.fetchReviews.mockResolvedValue([]);
        }
        const ingestion = await app.inject({
          method: 'POST',
          url: `/api/analysis-targets/${empty!.id}/ingestions`,
          headers: owner,
          payload: {},
        });
        expect(ingestion.statusCode).toBe(422);
      }
      const workspace = await app.inject({
        method: 'GET',
        url: `/api/analysis-targets/${empty!.id}`,
        headers: owner,
      });
      expect(workspace.statusCode).toBe(200);
      expect(workspace.json().reviews).toEqual([]);
      expect(workspace.json().latestIngestion?.status ?? null).toBe(
        ingestionState === 'not-started' ? null : 'failed',
      );
      const response = await ask(empty!.id);
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatch(/No reviews/);
      expect(response.json().error).toMatch(/Ingest reviews before asking/);
      expect(response.json()).not.toHaveProperty('answer');
      expect(answer).not.toHaveBeenCalled();
    },
  );

  it('S2-020: retains the stored dataset for Q&A after a failed re-import', async () => {
    reviewSource.fetchReviews.mockRejectedValue(
      new Error('Provider unavailable'),
    );
    const ingestion = await app.inject({
      method: 'POST',
      url: `/api/analysis-targets/${firstTargetId}/ingestions`,
      headers: owner,
      payload: {},
    });
    expect(ingestion.statusCode).toBe(422);
    const workspace = await app.inject({
      method: 'GET',
      url: `/api/analysis-targets/${firstTargetId}`,
      headers: owner,
    });
    expect(workspace.json().latestIngestion.status).toBe('failed');
    expect(workspace.json().reviews).toHaveLength(1);
    const response = await ask(firstTargetId);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'answered',
      reviewsUsed: 1,
      totalReviews: workspace.json().reviews.length,
    });
    expect(answer).toHaveBeenCalledOnce();
    expect(answer.mock.calls[0]?.[1].reviews[0].text).toBe(
      workspace.json().reviews[0].reviewText,
    );
  });

  it('returns insufficient evidence from a controlled model response', async () => {
    answer.mockResolvedValue({
      status: 'insufficient_evidence',
      answer: 'Reviews do not mention parking safety.',
    });
    const response = await ask(firstTargetId);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'insufficient_evidence',
      answer: 'Reviews do not mention parking safety.',
    });
  });

  it('returns a controlled provider failure without claiming an answer', async () => {
    answer.mockRejectedValue(
      new ReviewQaError(
        'The AI service could not answer the question right now.',
        502,
      ),
    );
    const response = await ask(firstTargetId);
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: 'The AI service could not answer the question right now.',
    });
    expect(answer).toHaveBeenCalledOnce();
  });
});
