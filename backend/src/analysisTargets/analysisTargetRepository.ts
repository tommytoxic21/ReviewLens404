import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { analysisTargets, type AnalysisTarget } from '../db/schema.js';

export interface CreateAnalysisTargetInput {
  entityName: string;
  platform: string;
  sourceUrl: string;
}

export async function createAnalysisTarget(
  db: Database,
  authenticatedOwnerId: string,
  input: CreateAnalysisTargetInput,
): Promise<AnalysisTarget> {
  const [createdTarget] = await db
    .insert(analysisTargets)
    .values({
      ownerId: authenticatedOwnerId,
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
  authenticatedOwnerId: string,
  targetId: string,
): Promise<AnalysisTarget | undefined> {
  const [target] = await db
    .select()
    .from(analysisTargets)
    .where(
      and(
        eq(analysisTargets.id, targetId),
        eq(analysisTargets.ownerId, authenticatedOwnerId),
      ),
    )
    .limit(1);

  return target;
}
