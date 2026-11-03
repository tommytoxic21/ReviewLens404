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
import { analysisTargets } from '../db/schema.js';

import {
  startIngestionAttemptForTargetOwner,
  finalizeIngestionAttemptForTargetOwner,
  getIngestionAttemptsForTargetOwner,
} from './ingestionAttemptRepository.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required.');
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('Tests must not use the development database.');
}

describe('S1-023 Ingestion Attempt Repository', () => {
  let connection: DatabaseConnection;

  const createdTargetIds: string[] = [];

  const ownerA = { userId: 'attempt_test_owner_a' };
  const ownerB = { userId: 'attempt_test_owner_b' };

  async function makeTarget(ownerId: string, entityName: string) {
    const target = await createAnalysisTarget(
      connection.db,
      { userId: ownerId },
      {
        entityName,
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

  afterEach(async () => {
    // Deleting these targets cascades to their attempts.
    for (const targetId of createdTargetIds) {
      await connection.db
        .delete(analysisTargets)
        .where(eq(analysisTargets.id, targetId));
    }

    createdTargetIds.length = 0;
  });

  afterAll(async () => {
    await connection.close();
  });

  it('creates an attempt with processing status', async () => {
    const target = await makeTarget(ownerA.userId, 'Processing Test');

    const attempt = await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
    );

    expect(attempt).not.toBeNull();

    expect(attempt).toMatchObject({
      analysisTargetId: target.id,
      status: 'processing',
      receivedCount: 0,
      savedCount: 0,
      rejectedCount: 0,
      errorMessage: null,
      completedAt: null,
    });

    expect(attempt?.startedAt).toBeInstanceOf(Date);
  });

  it('records successful ingestion and review counts', async () => {
    const target = await makeTarget(ownerA.userId, 'Success Test');

    const attempt = await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
    );

    expect(attempt).not.toBeNull();

    const completed = await finalizeIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
      attempt!.id,
      {
        status: 'succeeded',
        counts: {
          receivedCount: 10,
          savedCount: 8,
          rejectedCount: 2,
        },
      },
    );

    expect(completed).toMatchObject({
      id: attempt!.id,
      status: 'succeeded',
      receivedCount: 10,
      savedCount: 8,
      rejectedCount: 2,
      errorMessage: null,
    });

    expect(completed?.completedAt).toBeInstanceOf(Date);
  });

  it('records failed ingestion with a safe error', async () => {
    const target = await makeTarget(ownerA.userId, 'Failure Test');

    const attempt = await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
    );

    expect(attempt).not.toBeNull();

    const failed = await finalizeIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
      attempt!.id,
      {
        status: 'failed',
        errorMessage: 'Unable to retrieve reviews from the source.',
      },
    );

    expect(failed).toMatchObject({
      status: 'failed',
      receivedCount: 0,
      savedCount: 0,
      rejectedCount: 0,
      errorMessage: 'Unable to retrieve reviews from the source.',
    });

    expect(failed?.completedAt).toBeInstanceOf(Date);
  });

  it('prevents finalized attempts from changing again', async () => {
    const target = await makeTarget(ownerA.userId, 'Finalization Test');

    const attempt = await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
    );

    expect(attempt).not.toBeNull();

    const first = await finalizeIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
      attempt!.id,
      {
        status: 'succeeded',
        counts: {
          receivedCount: 5,
          savedCount: 5,
          rejectedCount: 0,
        },
      },
    );

    expect(first?.status).toBe('succeeded');

    const second = await finalizeIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
      attempt!.id,
      {
        status: 'failed',
        errorMessage: 'Should not overwrite success.',
      },
    );

    expect(second).toBeNull();

    const persisted = await getIngestionAttemptsForTargetOwner(
      connection.db,
      ownerA,
      target.id,
    );

    expect(persisted).toHaveLength(1);
    expect(persisted?.[0].status).toBe('succeeded');
  });

  it('prevents other users from accessing attempts', async () => {
    const target = await makeTarget(ownerA.userId, 'Private Attempts Test');

    const attempt = await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      target.id,
    );

    expect(attempt).not.toBeNull();

    const unauthorizedStart = await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerB,
      target.id,
    );

    const unauthorizedRead = await getIngestionAttemptsForTargetOwner(
      connection.db,
      ownerB,
      target.id,
    );

    const unauthorizedFinalize = await finalizeIngestionAttemptForTargetOwner(
      connection.db,
      ownerB,
      target.id,
      attempt!.id,
      {
        status: 'failed',
        errorMessage: 'Unauthorized update.',
      },
    );

    expect(unauthorizedStart).toBeNull();
    expect(unauthorizedRead).toBeNull();
    expect(unauthorizedFinalize).toBeNull();

    const ownerAttempts = await getIngestionAttemptsForTargetOwner(
      connection.db,
      ownerA,
      target.id,
    );

    expect(ownerAttempts).toHaveLength(1);
    expect(ownerAttempts?.[0].status).toBe('processing');
  });

  it('cannot finalize an attempt through a different target', async () => {
    const targetA = await makeTarget(ownerA.userId, 'Target A');

    const targetB = await makeTarget(ownerA.userId, 'Target B');

    const attempt = await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      targetA.id,
    );

    expect(attempt).not.toBeNull();

    const result = await finalizeIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      targetB.id,
      attempt!.id,
      {
        status: 'succeeded',
        counts: {
          receivedCount: 1,
          savedCount: 1,
          rejectedCount: 0,
        },
      },
    );

    expect(result).toBeNull();

    const attemptsA = await getIngestionAttemptsForTargetOwner(
      connection.db,
      ownerA,
      targetA.id,
    );

    expect(attemptsA?.[0].status).toBe('processing');
  });

  it('isolates attempt history between targets', async () => {
    const targetA = await makeTarget(ownerA.userId, 'History A');

    const targetB = await makeTarget(ownerA.userId, 'History B');

    await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      targetA.id,
    );

    await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      targetA.id,
    );

    await startIngestionAttemptForTargetOwner(
      connection.db,
      ownerA,
      targetB.id,
    );

    const attemptsA = await getIngestionAttemptsForTargetOwner(
      connection.db,
      ownerA,
      targetA.id,
    );

    const attemptsB = await getIngestionAttemptsForTargetOwner(
      connection.db,
      ownerA,
      targetB.id,
    );

    expect(attemptsA).toHaveLength(2);
    expect(attemptsB).toHaveLength(1);

    expect(
      attemptsA?.every((attempt) => attempt.analysisTargetId === targetA.id),
    ).toBe(true);

    expect(
      attemptsB?.every((attempt) => attempt.analysisTargetId === targetB.id),
    ).toBe(true);
  });
});
