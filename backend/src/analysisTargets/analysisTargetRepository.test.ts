import 'dotenv/config';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '../db/client.js';
import { analysisTargets, ingestionAttempts, reviews } from '../db/schema.js';
import {
  createAnalysisTarget,
  deleteAnalysisTargetForOwner,
  getAnalysisTargetByIdForOwner,
  type CreateAnalysisTargetInput,
} from './analysisTargetRepository.js';
import { AnalysisTargetValidationError } from './analysisTargetValidation.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required to run database integration tests.',
  );
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must use a separate test database.');
}

describe('AnalysisTarget repository', () => {
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

  it('persists and retrieves a target with generated fields and ownership', async () => {
    const beforeCreation = new Date();
    const createdTarget = await createAnalysisTarget(
      connection.db,
      { userId: 'user_owner_123' },
      {
        entityName: 'ReviewLens Coffee',
        platform: 'google',
        sourceUrl:
          'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z',
      },
    );
    const afterCreation = new Date();

    const retrievedTarget = await getAnalysisTargetByIdForOwner(
      connection.db,
      { userId: 'user_owner_123' },
      createdTarget.id,
    );

    expect(createdTarget.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(createdTarget.createdAt).toBeInstanceOf(Date);
    expect(createdTarget.createdAt.getTime()).toBeGreaterThanOrEqual(
      beforeCreation.getTime(),
    );
    expect(createdTarget.createdAt.getTime()).toBeLessThanOrEqual(
      afterCreation.getTime(),
    );
    expect(retrievedTarget).toEqual(createdTarget);
    expect(retrievedTarget).toMatchObject({
      ownerId: 'user_owner_123',
      entityName: 'ReviewLens Coffee',
      platform: 'google',
      sourceUrl:
        'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z',
    });
  });

  it.each([
    {
      description: 'a missing entity name',
      input: {
        platform: 'google',
        sourceUrl:
          'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z',
      } as CreateAnalysisTargetInput,
    },
    {
      description: 'an empty entity name',
      input: {
        entityName: '   ',
        platform: 'google',
        sourceUrl:
          'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z',
      },
    },
    {
      description: 'a missing platform',
      input: {
        entityName: 'ReviewLens Coffee',
        sourceUrl:
          'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z',
      } as CreateAnalysisTargetInput,
    },
    {
      description: 'an unsupported platform',
      input: {
        entityName: 'ReviewLens Coffee',
        platform: 'yelp',
        sourceUrl:
          'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z',
      },
    },
    {
      description: 'a missing source URL',
      input: {
        entityName: 'ReviewLens Coffee',
        platform: 'google',
      } as CreateAnalysisTargetInput,
    },
    {
      description: 'a malformed source URL',
      input: {
        entityName: 'ReviewLens Coffee',
        platform: 'google',
        sourceUrl: 'not-a-url',
      },
    },
    {
      description: 'an unsupported source URL',
      input: {
        entityName: 'ReviewLens Coffee',
        platform: 'google',
        sourceUrl: 'https://example.com/maps/place/ReviewLens+Coffee',
      },
    },
  ])('rejects $description before persistence', async ({ input }) => {
    await expect(
      createAnalysisTarget(connection.db, { userId: 'user_owner_123' }, input),
    ).rejects.toBeInstanceOf(AnalysisTargetValidationError);

    const persistedTargets = await connection.db.select().from(analysisTargets);
    expect(persistedTargets).toEqual([]);
  });

  it("does not retrieve or delete another owner's target", async () => {
    const ownerA = { userId: 'user_owner_a' };
    const ownerB = { userId: 'user_owner_b' };
    const createdTarget = await createAnalysisTarget(connection.db, ownerA, {
      entityName: 'Owner A Restaurant',
      platform: 'google',
      sourceUrl:
        'https://www.google.com/maps/place/Owner+A+Restaurant/@40.748,-73.985,17z',
    });

    const retrievedTarget = await getAnalysisTargetByIdForOwner(
      connection.db,
      ownerB,
      createdTarget.id,
    );
    const deletedTarget = await deleteAnalysisTargetForOwner(
      connection.db,
      ownerB,
      createdTarget.id,
    );
    const unchangedTarget = await getAnalysisTargetByIdForOwner(
      connection.db,
      ownerA,
      createdTarget.id,
    );

    expect(retrievedTarget).toBeUndefined();
    expect(deletedTarget).toBe(false);
    expect(unchangedTarget).toEqual(createdTarget);
  });

  it("deletes an owner's target", async () => {
    const owner = { userId: 'user_owner_123' };
    const createdTarget = await createAnalysisTarget(connection.db, owner, {
      entityName: 'Owner Restaurant',
      platform: 'google',
      sourceUrl:
        'https://www.google.com/maps/place/Owner+Restaurant/@40.748,-73.985,17z',
    });

    const deletedTarget = await deleteAnalysisTargetForOwner(
      connection.db,
      owner,
      createdTarget.id,
    );
    const retrievedTarget = await getAnalysisTargetByIdForOwner(
      connection.db,
      owner,
      createdTarget.id,
    );

    expect(deletedTarget).toBe(true);
    expect(retrievedTarget).toBeUndefined();
  });

  it('deletes a place with reviews and ingestion attempts without affecting other places', async () => {
    const owner = { userId: 'user_owner_123' };
    const otherOwner = { userId: 'user_other_456' };
    const toDelete = await createAnalysisTarget(connection.db, owner, {
      entityName: 'Place to delete',
      platform: 'google',
      sourceUrl: 'https://www.google.com/maps/place/Place+to+delete',
    });
    const toKeep = await createAnalysisTarget(connection.db, otherOwner, {
      entityName: 'Place to keep',
      platform: 'google',
      sourceUrl: 'https://www.google.com/maps/place/Place+to+keep',
    });

    await connection.db.insert(reviews).values([
      { analysisTargetId: toDelete.id, text: 'A review to remove.', rating: 5 },
      { analysisTargetId: toKeep.id, text: 'A review to keep.', rating: 4 },
    ]);
    await connection.db.insert(ingestionAttempts).values([
      { analysisTargetId: toDelete.id, status: 'succeeded', savedCount: 1 },
      { analysisTargetId: toKeep.id, status: 'succeeded', savedCount: 1 },
    ]);

    expect(
      await deleteAnalysisTargetForOwner(connection.db, owner, toDelete.id),
    ).toBe(true);

    const targetsLeft = await connection.db.select().from(analysisTargets);
    const reviewsLeft = await connection.db.select().from(reviews);
    const attemptsLeft = await connection.db.select().from(ingestionAttempts);

    expect(targetsLeft).toHaveLength(1);
    expect(targetsLeft[0]?.id).toBe(toKeep.id);
    expect(reviewsLeft).toHaveLength(1);
    expect(reviewsLeft[0]?.analysisTargetId).toBe(toKeep.id);
    expect(attemptsLeft).toHaveLength(1);
    expect(attemptsLeft[0]?.analysisTargetId).toBe(toKeep.id);
  });

  it('ignores client-submitted ownership fields', async () => {
    const clientInput = {
      entityName: 'Trusted Owner Restaurant',
      platform: 'google',
      sourceUrl:
        'https://www.google.com/maps/place/Trusted+Owner+Restaurant/@40.748,-73.985,17z',
      userId: 'user_submitted',
      ownerId: 'owner_submitted',
    };

    const createdTarget = await createAnalysisTarget(
      connection.db,
      { userId: 'user_verified' },
      clientInput,
    );

    expect(createdTarget.ownerId).toBe('user_verified');
  });
});
