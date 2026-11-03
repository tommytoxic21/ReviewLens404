import 'dotenv/config';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createAnalysisTarget,
  AnalysisTargetAccessError,
} from '../analysisTargets/analysisTargetRepository.js';
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '../db/client.js';
import { analysisTargets } from '../db/schema.js';
import {
  listReviewsForOwnedTarget,
  persistReviewsForOwnedTarget,
} from '../reviews/reviewRepository.js';
import { ReviewSourceError } from '../reviews/reviewSource.js';
import { getLatestIngestionAttemptForOwnedTarget } from './ingestionRepository.js';
import {
  ingestReviewsForOwnedTarget,
  IngestionError,
} from './ingestionService.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to run ingestion tests.');
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must use a separate test database.');
}

describe('review ingestion ownership and result state', () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl);
    await migrate(connection.db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
  });

  beforeEach(async () => {
    await connection.db.delete(analysisTargets);
  });

  afterAll(async () => {
    await connection.db.delete(analysisTargets);
    await connection.close();
  });

  it('persists valid reviews under the owned target and records success', async () => {
    const owner = { userId: 'user_owner_a' };
    const target = await createAnalysisTarget(connection.db, owner, {
      entityName: 'ReviewLens Coffee',
      platform: 'google',
      sourceUrl: 'https://www.google.com/maps/place/ReviewLens+Coffee',
    });
    const reviewSource = {
      fetchReviews: vi.fn().mockResolvedValue([
        {
          sourceReviewId: 'review-1',
          reviewText: 'Excellent coffee.',
          rating: 5,
          reviewerName: 'Ada',
        },
        { sourceReviewId: 'review-invalid', reviewText: '', rating: 4 },
      ]),
    };

    const result = await ingestReviewsForOwnedTarget(
      connection.db,
      reviewSource,
      owner,
      target.id,
    );
    const persistedReviews = await listReviewsForOwnedTarget(
      connection.db,
      owner,
      target.id,
    );

    expect(reviewSource.fetchReviews).toHaveBeenCalledWith(target);
    expect(result.attempt).toMatchObject({
      analysisTargetId: target.id,
      status: 'succeeded',
      reviewCount: 1,
      rejectedReviewCount: 1,
      errorMessage: null,
    });
    expect(persistedReviews).toHaveLength(1);
    expect(persistedReviews[0]).toMatchObject({
      analysisTargetId: target.id,
      reviewText: 'Excellent coffee.',
      rating: 5,
      reviewerName: 'Ada',
    });
  });

  it('denies cross-user review reads and ingestion before calling the source', async () => {
    const ownerA = { userId: 'user_owner_a' };
    const ownerB = { userId: 'user_owner_b' };
    const target = await createAnalysisTarget(connection.db, ownerA, {
      entityName: 'Owner A Restaurant',
      platform: 'google',
      sourceUrl: 'https://www.google.com/maps/place/Owner+A+Restaurant',
    });
    const reviewSource = { fetchReviews: vi.fn() };

    await expect(
      listReviewsForOwnedTarget(connection.db, ownerB, target.id),
    ).rejects.toBeInstanceOf(AnalysisTargetAccessError);
    await expect(
      persistReviewsForOwnedTarget(connection.db, ownerB, target.id, [
        {
          sourceReviewId: 'fabricated-review',
          reviewText: 'This must not be persisted.',
          rating: 5,
          reviewerName: null,
          reviewedAt: null,
          reviewUrl: null,
        },
      ]),
    ).rejects.toBeInstanceOf(AnalysisTargetAccessError);
    await expect(
      ingestReviewsForOwnedTarget(
        connection.db,
        reviewSource,
        ownerB,
        target.id,
      ),
    ).rejects.toBeInstanceOf(AnalysisTargetAccessError);
    expect(reviewSource.fetchReviews).not.toHaveBeenCalled();
  });

  it('records a failed attempt without creating fabricated reviews', async () => {
    const owner = { userId: 'user_owner_a' };
    const target = await createAnalysisTarget(connection.db, owner, {
      entityName: 'Unavailable Restaurant',
      platform: 'google',
      sourceUrl: 'https://www.google.com/maps/place/Unavailable+Restaurant',
    });
    const reviewSource = {
      fetchReviews: vi
        .fn()
        .mockRejectedValue(
          new ReviewSourceError('The review source is unavailable.'),
        ),
    };

    await expect(
      ingestReviewsForOwnedTarget(
        connection.db,
        reviewSource,
        owner,
        target.id,
      ),
    ).rejects.toMatchObject({
      name: 'IngestionError',
      message: 'The review source is unavailable.',
    });

    const [attempt, persistedReviews] = await Promise.all([
      getLatestIngestionAttemptForOwnedTarget(connection.db, owner, target.id),
      listReviewsForOwnedTarget(connection.db, owner, target.id),
    ]);
    expect(attempt).toMatchObject({
      status: 'failed',
      reviewCount: 0,
      errorMessage: 'The review source is unavailable.',
    });
    expect(persistedReviews).toEqual([]);
  });

  it('fails when every returned review lacks required data', async () => {
    const owner = { userId: 'user_owner_a' };
    const target = await createAnalysisTarget(connection.db, owner, {
      entityName: 'Incomplete Reviews Restaurant',
      platform: 'google',
      sourceUrl:
        'https://www.google.com/maps/place/Incomplete+Reviews+Restaurant',
    });

    await expect(
      ingestReviewsForOwnedTarget(
        connection.db,
        {
          fetchReviews: vi
            .fn()
            .mockResolvedValue([{ reviewText: '', rating: 5 }]),
        },
        owner,
        target.id,
      ),
    ).rejects.toBeInstanceOf(IngestionError);

    const persistedReviews = await listReviewsForOwnedTarget(
      connection.db,
      owner,
      target.id,
    );
    expect(persistedReviews).toEqual([]);
  });
});
