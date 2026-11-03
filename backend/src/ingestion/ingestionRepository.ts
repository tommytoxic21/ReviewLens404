import { desc, eq } from 'drizzle-orm';
import type { AuthenticationContext } from '../authentication.js';
import { requireAnalysisTargetForOwner } from '../analysisTargets/analysisTargetRepository.js';
import type { Database } from '../db/client.js';
import { ingestionAttempts, type IngestionAttempt } from '../db/schema.js';

export async function createIngestionAttemptForOwnedTarget(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<IngestionAttempt> {
  await requireAnalysisTargetForOwner(db, authenticationContext, targetId);

  const [attempt] = await db
    .insert(ingestionAttempts)
    .values({ analysisTargetId: targetId, status: 'processing' })
    .returning();

  if (!attempt) {
    throw new Error('Failed to create ingestion attempt.');
  }

  return attempt;
}

export async function getLatestIngestionAttemptForOwnedTarget(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<IngestionAttempt | undefined> {
  await requireAnalysisTargetForOwner(db, authenticationContext, targetId);

  const [attempt] = await db
    .select()
    .from(ingestionAttempts)
    .where(eq(ingestionAttempts.analysisTargetId, targetId))
    .orderBy(desc(ingestionAttempts.startedAt))
    .limit(1);

  return attempt;
}
