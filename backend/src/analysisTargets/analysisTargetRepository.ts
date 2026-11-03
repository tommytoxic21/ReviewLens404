import { and, eq } from 'drizzle-orm';
import type { AuthenticationContext } from '../authentication.js';
import type { Database } from '../db/client.js';
import { analysisTargets, type AnalysisTarget } from '../db/schema.js';
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
  const [deletedTarget] = await db
    .delete(analysisTargets)
    .where(
      and(
        eq(analysisTargets.id, targetId),
        eq(analysisTargets.ownerId, authenticationContext.userId),
      ),
    )
    .returning({ id: analysisTargets.id });

  return deletedTarget !== undefined;
}
