import 'dotenv/config';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '../db/client.js';
import { analysisTargets } from '../db/schema.js';
import {
  createAnalysisTarget,
  getAnalysisTargetByIdForOwner,
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
      'user_owner_123',
      {
        entityName: 'ReviewLens Coffee',
        platform: 'google',
        sourceUrl: 'https://example.com/reviewlens-coffee',
      },
    );
    const afterCreation = new Date();

    const retrievedTarget = await getAnalysisTargetByIdForOwner(
      connection.db,
      'user_owner_123',
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
      sourceUrl: 'https://example.com/reviewlens-coffee',
    });
  });

  it('rejects an empty entity name before persistence', async () => {
    await expect(
      createAnalysisTarget(connection.db, 'user_owner_123', {
        entityName: '   ',
        platform: 'google',
        sourceUrl: 'https://example.com/reviewlens-coffee',
      }),
    ).rejects.toBeInstanceOf(AnalysisTargetValidationError);

    const persistedTargets = await connection.db.select().from(analysisTargets);
    expect(persistedTargets).toEqual([]);
  });

  it("does not retrieve another owner's target", async () => {
    const createdTarget = await createAnalysisTarget(
      connection.db,
      'user_owner_a',
      {
        entityName: 'Owner A Restaurant',
        platform: 'google',
        sourceUrl: 'https://example.com/owner-a-restaurant',
      },
    );

    const retrievedTarget = await getAnalysisTargetByIdForOwner(
      connection.db,
      'user_owner_b',
      createdTarget.id,
    );

    expect(retrievedTarget).toBeUndefined();
  });
});
