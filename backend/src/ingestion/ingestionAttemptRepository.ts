import { and, desc, eq } from 'drizzle-orm';

import type { AuthenticationContext } from '../authentication.js';
import { getAnalysisTargetByIdForOwner } from '../analysisTargets/analysisTargetRepository.js';
import type { Database } from '../db/client.js';
import { ingestionAttempts, type IngestionAttempt } from '../db/schema.js';

/**
 * S1-023: Ingestion attempt persistence.
 *
 * Every operation verifies AnalysisTarget ownership.
 * Completed attempts cannot be finalized a second time.
 */

export interface IngestionCounts {
  receivedCount: number;
  savedCount: number;
  rejectedCount: number;
}

export type IngestionOutcome =
  | {
      status: 'succeeded';
      counts: IngestionCounts;
    }
  | {
      status: 'failed';
      errorMessage: string;
      counts?: IngestionCounts;
    };

/**
 * Create an attempt before fetching reviews.
 *
 * Returns null if the AnalysisTarget does not exist
 * or does not belong to the authenticated user.
 */
export async function startIngestionAttemptForTargetOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<IngestionAttempt | null> {
  const target = await getAnalysisTargetByIdForOwner(
    db,
    authenticationContext,
    targetId,
  );

  if (!target) {
    return null;
  }

  const [attempt] = await db
    .insert(ingestionAttempts)
    .values({
      analysisTargetId: target.id,
      status: 'processing',
    })
    .returning();

  return attempt ?? null;
}

/**
 * Finish a previously started ingestion attempt.
 *
 * Only attempts currently marked "processing"
 * can transition to a terminal status.
 *
 * The caller must only report "succeeded" after
 * review persistence has completed successfully.
 *
 * Pass only safe, predefined error messages.
 */
export async function finalizeIngestionAttemptForTargetOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
  attemptId: string,
  outcome: IngestionOutcome,
): Promise<IngestionAttempt | null> {
  const target = await getAnalysisTargetByIdForOwner(
    db,
    authenticationContext,
    targetId,
  );

  if (!target) {
    return null;
  }

  const counts = outcome.counts ?? {
    receivedCount: 0,
    savedCount: 0,
    rejectedCount: 0,
  };

  const [updated] = await db
    .update(ingestionAttempts)
    .set({
      status: outcome.status,
      receivedCount: counts.receivedCount,
      savedCount: counts.savedCount,
      rejectedCount: counts.rejectedCount,
      errorMessage: outcome.status === 'failed' ? outcome.errorMessage : null,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(ingestionAttempts.id, attemptId),
        eq(ingestionAttempts.analysisTargetId, target.id),
        eq(ingestionAttempts.status, 'processing'),
      ),
    )
    .returning();

  return updated ?? null;
}

/**
 * Retrieve ingestion attempts for an owned target.
 *
 * Returns null for missing or unauthorized targets.
 * Returns [] for owned targets with no attempts.
 */
export async function getIngestionAttemptsForTargetOwner(
  db: Database,
  authenticationContext: AuthenticationContext,
  targetId: string,
): Promise<IngestionAttempt[] | null> {
  const target = await getAnalysisTargetByIdForOwner(
    db,
    authenticationContext,
    targetId,
  );

  if (!target) {
    return null;
  }

  return db
    .select()
    .from(ingestionAttempts)
    .where(eq(ingestionAttempts.analysisTargetId, target.id))
    .orderBy(desc(ingestionAttempts.startedAt), desc(ingestionAttempts.id));
}
