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

  it('uses only the selected target and replaces evidence after a switch', async () => {
    const a = await ask(firstTargetId);
    expect(a.statusCode).toBe(200);
    expect(a.json().answer).toContain('battery life complaint');
    expect(a.json().answer).not.toContain('customer service');

    const b = await ask(secondTargetId);
    expect(b.statusCode).toBe(200);
    expect(b.json().answer).toContain('friendly customer service');
    expect(b.json().answer).not.toContain('battery life');
    expect(JSON.stringify(answer.mock.calls)).not.toContain(
      'PRIVATE USER B SECRET',
    );
    expect(answer.mock.calls[0]?.[1].targetId).toBe(firstTargetId);
    expect(answer.mock.calls[1]?.[1].targetId).toBe(secondTargetId);
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

  it('declines empty targets without invoking OpenAI', async () => {
    const [empty] = await connection.db
      .insert(analysisTargets)
      .values({
        ownerId: 'user-qa-owner',
        entityName: 'Empty Coffee',
        platform: 'google',
        sourceUrl: 'https://maps.google.com/empty',
      })
      .returning();
    const response = await ask(empty!.id);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/No reviews/);
    expect(answer).not.toHaveBeenCalled();
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
});
