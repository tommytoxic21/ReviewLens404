import 'dotenv/config';

import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
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

const getAuthMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/fastify', () => ({
  getAuth: getAuthMock,
}));

import { createAnalysisTarget } from '../analysisTargets/analysisTargetRepository.js';
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '../db/client.js';
import { analysisTargets, ingestionAttempts, reviews } from '../db/schema.js';
import { ingestionRoutes } from './ingestionRoutes.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required.');
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('Integration tests must use a separate test database.');
}

const owner = { userId: 'integration_ingestion_owner' };

const sourceUrl =
  'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z';

const sampleReview = {
  text: 'Excellent service and friendly staff!',
  rating: 5,
  sourceReviewId: 'integration-review-001',
  reviewerName: 'Integration Test Reviewer',
};

describe('S1-019 through S1-023: Database-backed ingestion', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let targetId: string;

  const ingestMock = vi.fn();

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl);

    await migrate(connection.db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
  });

  beforeEach(async () => {
    getAuthMock.mockReset();
    ingestMock.mockReset();

    getAuthMock.mockReturnValue({
      isAuthenticated: true,
      userId: owner.userId,
    });

    ingestMock.mockResolvedValue({
      reviews: [sampleReview],
      rejected: [],
      receivedCount: 1,
    });

    const target = await createAnalysisTarget(connection.db, owner, {
      entityName: 'Integration Test Coffee Shop',
      platform: 'google',
      sourceUrl,
    });

    targetId = target.id;

    app = Fastify({ logger: false });
    app.decorateRequest('authenticationContext', null);

    // Real database, real repositories, mocked external fetch.
    app.register(ingestionRoutes, {
      db: connection.db,
      ingest: ingestMock,
    });
  });

  afterEach(async () => {
    await app.close();

    // Cascade deletion removes reviews and attempts too.
    if (targetId) {
      await connection.db
        .delete(analysisTargets)
        .where(eq(analysisTargets.id, targetId));
    }

    targetId = '';
  });

  afterAll(async () => {
    await connection.close();
  });

  async function readPersistedData() {
    const savedReviews = await connection.db
      .select()
      .from(reviews)
      .where(eq(reviews.analysisTargetId, targetId));

    const savedAttempts = await connection.db
      .select()
      .from(ingestionAttempts)
      .where(eq(ingestionAttempts.analysisTargetId, targetId));

    return { savedReviews, savedAttempts };
  }

  it('persists reviews and records success', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
      payload: {
        sourceUrl: 'https://example.com/untrusted',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(body).toMatchObject({
      analysisTargetId: targetId,
      status: 'succeeded',
      receivedCount: 1,
      savedCount: 1,
      rejectedCount: 0,
    });

    expect(body.attemptId).toEqual(expect.any(String));

    // The stored URL must override client-supplied input.
    expect(ingestMock).toHaveBeenCalledExactlyOnceWith(sourceUrl);

    const { savedReviews, savedAttempts } = await readPersistedData();

    expect(savedReviews).toHaveLength(1);

    expect(savedReviews[0]).toMatchObject({
      analysisTargetId: targetId,
      text: sampleReview.text,
      rating: 5,
      sourceReviewId: sampleReview.sourceReviewId,
      reviewerName: sampleReview.reviewerName,
    });

    expect(savedAttempts).toHaveLength(1);

    expect(savedAttempts[0]).toMatchObject({
      id: body.attemptId,
      analysisTargetId: targetId,
      status: 'succeeded',
      receivedCount: 1,
      savedCount: 1,
      rejectedCount: 0,
      errorMessage: null,
    });

    expect(savedAttempts[0].completedAt).toBeInstanceOf(Date);
  });

  it('blocks another user before fetching or writing', async () => {
    getAuthMock.mockReturnValue({
      isAuthenticated: true,
      userId: 'integration_other_user',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(404);
    expect(ingestMock).not.toHaveBeenCalled();

    const { savedReviews, savedAttempts } = await readPersistedData();

    expect(savedReviews).toHaveLength(0);
    expect(savedAttempts).toHaveLength(0);
  });

  it('records failed source ingestion without saving reviews', async () => {
    ingestMock.mockRejectedValue(new Error('Sensitive external API error'));

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().status).toBe('failed');
    expect(response.body).not.toContain('Sensitive');

    const { savedReviews, savedAttempts } = await readPersistedData();

    expect(savedReviews).toHaveLength(0);
    expect(savedAttempts).toHaveLength(1);

    expect(savedAttempts[0]).toMatchObject({
      status: 'failed',
      receivedCount: 0,
      savedCount: 0,
      rejectedCount: 0,
      errorMessage: 'Unable to retrieve reviews from the source.',
    });

    expect(savedAttempts[0].completedAt).toBeInstanceOf(Date);
  });

  it('records failure when every review is rejected', async () => {
    ingestMock.mockResolvedValue({
      reviews: [],
      rejected: [
        { index: 0, reason: 'Missing review text' },
        { index: 1, reason: 'Invalid rating' },
      ],
      receivedCount: 2,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().status).toBe('failed');

    const { savedReviews, savedAttempts } = await readPersistedData();

    expect(savedReviews).toHaveLength(0);
    expect(savedAttempts).toHaveLength(1);

    expect(savedAttempts[0]).toMatchObject({
      status: 'failed',
      receivedCount: 2,
      savedCount: 0,
      rejectedCount: 2,
      errorMessage: 'No valid reviews were available to save.',
    });
  });

  it('records a database persistence failure safely', async () => {
    // Deliberately bypass normalization with an invalid
    // rating to exercise PostgreSQL's CHECK constraint.
    ingestMock.mockResolvedValue({
      reviews: [
        {
          text: 'Database constraint test',
          rating: 6,
        },
      ],
      rejected: [],
      receivedCount: 1,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/analysis-targets/${targetId}/ingest`,
    });

    expect(response.statusCode).toBe(500);

    expect(response.json()).toMatchObject({
      analysisTargetId: targetId,
      status: 'failed',
      error: 'Unable to save reviews.',
    });

    expect(response.body).not.toContain('constraint');

    const { savedReviews, savedAttempts } = await readPersistedData();

    expect(savedReviews).toHaveLength(0);
    expect(savedAttempts).toHaveLength(1);

    expect(savedAttempts[0]).toMatchObject({
      status: 'failed',
      receivedCount: 1,
      savedCount: 0,
      rejectedCount: 0,
      errorMessage: 'Unable to save reviews.',
    });
  });
});
