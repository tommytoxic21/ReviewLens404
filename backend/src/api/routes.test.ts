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

import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '../db/client.js';
import { analysisTargets } from '../db/schema.js';
import { registerApiRoutes } from './routes.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to run API tests.');
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must use a separate test database.');
}

describe('protected ReviewLens API', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  const reviewSource = {
    fetchReviews: vi.fn().mockResolvedValue([
      {
        sourceReviewId: 'api-review-1',
        reviewText: 'Created only by server-side ingestion.',
        rating: 5,
      },
    ]),
  };

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl);
    await migrate(connection.db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
  });

  beforeEach(async () => {
    await connection.db.delete(analysisTargets);
    reviewSource.fetchReviews.mockClear();
    app = Fastify();
    app.decorateRequest('authenticationContext', null);
    await app.register(
      async (api) =>
        registerApiRoutes(api, {
          database: connection.db,
          reviewSource,
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

  it('rejects unauthenticated access without returning protected data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/analysis-targets',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Authentication required.' });
    expect(response.body).not.toContain('targets');
  });

  it('derives ownership from identity and denies every cross-user child operation', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/analysis-targets',
      headers: { 'x-test-user': 'user_owner_a' },
      payload: {
        entityName: 'Owner A Restaurant',
        platform: 'google',
        sourceUrl: 'https://www.google.com/maps/place/Owner+A+Restaurant',
        ownerId: 'user_owner_b',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const targetId = createResponse.json<{ target: { id: string } }>().target
      .id;

    const crossUserRead = await app.inject({
      method: 'GET',
      url: `/api/analysis-targets/${targetId}`,
      headers: { 'x-test-user': 'user_owner_b' },
    });
    const crossUserIngestion = await app.inject({
      method: 'POST',
      url: `/api/analysis-targets/${targetId}/ingestions`,
      headers: { 'x-test-user': 'user_owner_b' },
    });
    const clientReviewCreation = await app.inject({
      method: 'POST',
      url: `/api/analysis-targets/${targetId}/reviews`,
      headers: { 'x-test-user': 'user_owner_b' },
      payload: { reviewText: 'Fabricated review', rating: 5 },
    });

    expect(crossUserRead.statusCode).toBe(404);
    expect(crossUserIngestion.statusCode).toBe(404);
    expect(clientReviewCreation.statusCode).toBe(404);
    expect(reviewSource.fetchReviews).not.toHaveBeenCalled();

    const crossUserList = await app.inject({
      method: 'GET',
      url: '/api/analysis-targets',
      headers: { 'x-test-user': 'user_owner_b' },
    });
    expect(crossUserList.json()).toEqual({ targets: [] });

    const ownerIngestion = await app.inject({
      method: 'POST',
      url: `/api/analysis-targets/${targetId}/ingestions`,
      headers: { 'x-test-user': 'user_owner_a' },
    });
    expect(ownerIngestion.statusCode).toBe(201);
    expect(reviewSource.fetchReviews).toHaveBeenCalledOnce();
    expect(reviewSource.fetchReviews.mock.calls[0]?.[0]).toMatchObject({
      id: targetId,
      ownerId: 'user_owner_a',
      sourceUrl: 'https://www.google.com/maps/place/Owner+A+Restaurant',
    });

    const ownerWorkspace = await app.inject({
      method: 'GET',
      url: `/api/analysis-targets/${targetId}`,
      headers: { 'x-test-user': 'user_owner_a' },
    });
    expect(ownerWorkspace.statusCode).toBe(200);
    expect(ownerWorkspace.json()).toMatchObject({
      reviews: [
        {
          analysisTargetId: targetId,
          reviewText: 'Created only by server-side ingestion.',
          rating: 5,
        },
      ],
      latestIngestion: {
        analysisTargetId: targetId,
        status: 'succeeded',
      },
    });
  });
});
