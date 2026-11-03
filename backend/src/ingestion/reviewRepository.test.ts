import 'dotenv/config';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createAnalysisTarget } from '../analysisTargets/analysisTargetRepository.js';
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '../db/client.js';
import { analysisTargets, reviews } from '../db/schema.js';
import {
  getReviewsForTargetOwner,
  saveReviewsForTargetOwner,
} from './reviewRepository.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required.');
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('Use a separate test database.');
}

describe('S1-022 Review Repository', () => {
  let connection: DatabaseConnection;
  const createdTargetIds: string[] = [];

  async function makeTarget(ownerId: string, name: string) {
    const target = await createAnalysisTarget(
      connection.db,
      { userId: ownerId },
      {
        entityName: name,
        platform: 'google',
        sourceUrl:
          'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z',
      },
    );

    createdTargetIds.push(target.id);
    return target;
  }

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl);

    await migrate(connection.db, {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
  });

  // Clean up only the targets created by these tests.
  afterEach(async () => {
    for (const id of createdTargetIds) {
      await connection.db
        .delete(analysisTargets)
        .where(eq(analysisTargets.id, id));
    }

    createdTargetIds.length = 0;
  });

  afterAll(async () => {
    await connection.close();
  });

  // Test 1: Reviews are saved with the correct fields.
  it('persists normalized reviews for an owned target', async () => {
    const owner = { userId: 'review_test_owner_a' };
    const target = await makeTarget(owner.userId, 'Test Coffee Shop');

    const saved = await saveReviewsForTargetOwner(
      connection.db,
      owner,
      target.id,
      [
        {
          text: 'Excellent customer service!',
          rating: 5,
          sourceReviewId: 'google-review-123',
          reviewerName: 'Test Reviewer',
          sourceMetadata: { source: 'google_maps' },
        },
      ],
    );

    expect(saved).toHaveLength(1);

    expect(saved?.[0]).toMatchObject({
      analysisTargetId: target.id,
      text: 'Excellent customer service!',
      rating: 5,
      sourceReviewId: 'google-review-123',
      reviewerName: 'Test Reviewer',
      sourceMetadata: { source: 'google_maps' },
    });

    const retrieved = await getReviewsForTargetOwner(
      connection.db,
      owner,
      target.id,
    );

    expect(retrieved).toHaveLength(1);
    expect(retrieved?.[0].text).toBe('Excellent customer service!');
  });

  // Test 2: Reviews cannot mix between AnalysisTargets.
  it('isolates reviews belonging to different targets', async () => {
    const owner = { userId: 'review_test_owner_a' };

    const targetA = await makeTarget(owner.userId, 'Restaurant A');
    const targetB = await makeTarget(owner.userId, 'Restaurant B');

    await saveReviewsForTargetOwner(connection.db, owner, targetA.id, [
      { text: 'Review for A', rating: 5 },
    ]);

    await saveReviewsForTargetOwner(connection.db, owner, targetB.id, [
      { text: 'Review for B', rating: 2 },
    ]);

    const reviewsA = await getReviewsForTargetOwner(
      connection.db,
      owner,
      targetA.id,
    );

    const reviewsB = await getReviewsForTargetOwner(
      connection.db,
      owner,
      targetB.id,
    );

    expect(reviewsA?.map((review) => review.text)).toEqual(['Review for A']);

    expect(reviewsB?.map((review) => review.text)).toEqual(['Review for B']);
  });

  // Test 3: Other users cannot save or retrieve reviews.
  it('prevents cross-user review access', async () => {
    const ownerA = { userId: 'review_test_owner_a' };
    const ownerB = { userId: 'review_test_owner_b' };

    const target = await makeTarget(ownerA.userId, 'Private Business');

    await saveReviewsForTargetOwner(connection.db, ownerA, target.id, [
      { text: 'Private review', rating: 4 },
    ]);

    const unauthorizedRead = await getReviewsForTargetOwner(
      connection.db,
      ownerB,
      target.id,
    );

    const unauthorizedSave = await saveReviewsForTargetOwner(
      connection.db,
      ownerB,
      target.id,
      [{ text: 'Unauthorized review', rating: 1 }],
    );

    expect(unauthorizedRead).toBeNull();
    expect(unauthorizedSave).toBeNull();

    const persisted = await connection.db
      .select()
      .from(reviews)
      .where(eq(reviews.analysisTargetId, target.id));

    expect(persisted).toHaveLength(1);
    expect(persisted[0].text).toBe('Private review');
  });

  // Test 4: Empty input does not create review records.
  it('handles empty review batches', async () => {
    const owner = { userId: 'review_test_owner_a' };
    const target = await makeTarget(owner.userId, 'Empty Business');

    const saved = await saveReviewsForTargetOwner(
      connection.db,
      owner,
      target.id,
      [],
    );

    expect(saved).toEqual([]);

    const retrieved = await getReviewsForTargetOwner(
      connection.db,
      owner,
      target.id,
    );

    expect(retrieved).toEqual([]);
  });
});
