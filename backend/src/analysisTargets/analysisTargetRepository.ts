import { and, eq } from 'drizzle-orm';
import type { AuthenticationContext } from '../authentication.js';
import type { Database } from '../db/client.js';
import {
  analysisTargets,
  ingestionAttempts,
  reviews,
  type AnalysisTarget,
} from '../db/schema.js';
import { validateAnalysisTargetInput } from './analysisTargetValidation.js';

export interface CreateAnalysisTargetInput {
  entityName: string;
  platform: string;
  sourceUrl: string;
}

export class AnalysisTargetAccessError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Analysis target was not found.');
    this.name = 'AnalysisTargetAccessError';
  }
}

export async function createAnalysisTarget(
  db: Database,
  authenticationContext: AuthenticationContext,
  input: CreateAnalysisTargetInput,
): Promise<AnalysisTarget> {
  validateAnalysisTargetInput(input);

  const [createdTarget] = await db
    .insert(analysisTargets)
    .values({
      ownerId: authenticationContext.userId,
      entityName: input.entityName,
      platform: input.platform,
      sourceUrl: input.sourceUrl,
    })
    .returning();

  if (!createdTarget) {
    throw new Error('Failed to create AnalysisTarget.');
  }

  return createdTarget;
}

export async function getAnalysisTargetByIdForOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<AnalysisTarget | undefined> {
  const [target] = await db
    .select()
    .from(analysisTargets)
    .where(
      and(
        eq(analysisTargets.id, targetId),
        eq(analysisTargets.ownerId, authenticationContext.userId),
      ),
    )
    .limit(1);

  return target;
}

export async function requireAnalysisTargetForOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<AnalysisTarget> {
  const target = await getAnalysisTargetByIdForOwner(
    db,
    authenticationContext,
    targetId,
  );

  if (!target) {
    throw new AnalysisTargetAccessError();
  }

  return target;
}

export async function listAnalysisTargetsForOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
): Promise<AnalysisTarget[]> {
  return db
    .select()
    .from(analysisTargets)
    .where(eq(analysisTargets.ownerId, authenticationContext.userId))
    .orderBy(analysisTargets.createdAt);
}

export async function deleteAnalysisTargetForOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<boolean> {
  // Delete child records explicitly so existing databases with older foreign
  // key rules do not reject removal of an analysis target.
  // The transaction ensures that all deletions succeed or none of them do.
  return db.transaction(async (tx) => {
    const [ownedTarget] = await tx
      .select({ id: analysisTargets.id })
      .from(analysisTargets)
      .where(
        and(
          eq(analysisTargets.id, targetId),
          eq(analysisTargets.ownerId, authenticationContext.userId),
        ),
      )
      .limit(1)
      .for('update');

    if (!ownedTarget) return false;

    await tx
      .delete(reviews)
      .where(eq(reviews.analysisTargetId, ownedTarget.id));
    await tx
      .delete(ingestionAttempts)
      .where(eq(ingestionAttempts.analysisTargetId, ownedTarget.id));

    const [deletedTarget] = await tx
      .delete(analysisTargets)
      .where(
        and(
          eq(analysisTargets.id, ownedTarget.id),
          eq(analysisTargets.ownerId, authenticationContext.userId),
        ),
      )
      .returning({ id: analysisTargets.id });

    return deletedTarget !== undefined;
  });
}
