import type { FastifyPluginAsync } from 'fastify';

import { requireAuthentication } from '../authentication.js';
import { getAnalysisTargetByIdForOwner } from '../analysisTargets/analysisTargetRepository.js';
import type { Database } from '../db/client.js';

import { ingestGoogleMapsUrl } from './ingestGoogleMapsUrl.js';
import {
  startIngestionAttemptForTargetOwner,
  finalizeIngestionAttemptForTargetOwner,
  type IngestionCounts,
} from './ingestionAttemptRepository.js';
import { saveReviewsForTargetOwner } from './reviewRepository.js';

interface IngestionRouteOptions {
  db: Database;
  ingest?: typeof ingestGoogleMapsUrl;
}

interface IngestionParams {
  targetId: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ingestionRoutes: FastifyPluginAsync<
  IngestionRouteOptions
> = async (app, options) => {
  const { db } = options;
  const runIngestion = options.ingest ?? ingestGoogleMapsUrl;

  app.post<{ Params: IngestionParams }>(
    '/analysis-targets/:targetId/ingest',
    { preHandler: requireAuthentication },
    async (request, reply) => {
      // S1-019: Require a verified Clerk identity.
      const authenticationContext = request.authenticationContext;

      if (!authenticationContext) {
        return reply.code(401).send({
          error: 'Authentication required.',
        });
      }

      const { targetId } = request.params;

      if (!uuidPattern.test(targetId)) {
        return reply.code(400).send({
          error: 'Invalid AnalysisTarget ID.',
        });
      }

      // Check ownership before external processing.
      const target = await getAnalysisTargetByIdForOwner(
        db,
        authenticationContext,
        targetId,
      );

      if (!target) {
        return reply.code(404).send({
          error: 'AnalysisTarget not found.',
        });
      }

      if (target.platform !== 'google' || !target.sourceUrl.trim()) {
        return reply.code(422).send({
          error: 'Unsupported review source.',
        });
      }

      // S1-023: Record that ingestion has started.
      let attempt: Awaited<
        ReturnType<typeof startIngestionAttemptForTargetOwner>
      >;

      try {
        attempt = await startIngestionAttemptForTargetOwner(
          db,
          authenticationContext,
          targetId,
        );
      } catch (error) {
        request.log.error(
          { err: error, targetId },
          'Failed to create ingestion attempt',
        );

        return reply.code(500).send({
          error: 'Unable to start ingestion.',
        });
      }

      if (!attempt) {
        return reply.code(404).send({
          error: 'AnalysisTarget no longer available.',
        });
      }

      const attemptId = attempt.id;

      // Finalize an attempt as failed and return a safe error.
      const reportFailure = async (
        statusCode: number,
        publicMessage: string,
        counts?: IngestionCounts,
      ) => {
        try {
          const finalized = await finalizeIngestionAttemptForTargetOwner(
            db,
            authenticationContext,
            targetId,
            attemptId,
            {
              status: 'failed',
              errorMessage: publicMessage,
              counts,
            },
          );

          if (!finalized) {
            request.log.error(
              { targetId, attemptId },
              'Could not finalize failed ingestion attempt',
            );

            return reply.code(500).send({
              error: 'Unable to record ingestion outcome.',
            });
          }
        } catch (error) {
          request.log.error(
            { err: error, targetId, attemptId },
            'Failed to record ingestion outcome',
          );

          return reply.code(500).send({
            error: 'Unable to record ingestion outcome.',
          });
        }

        return reply.code(statusCode).send({
          analysisTargetId: targetId,
          attemptId,
          status: 'failed',
          error: publicMessage,
        });
      };

      // S1-020 / S1-021: Fetch and normalize reviews.
      let result: Awaited<ReturnType<typeof ingestGoogleMapsUrl>>;

      try {
        result = await runIngestion(target.sourceUrl);
      } catch (error) {
        request.log.error(
          { err: error, targetId, attemptId },
          'Review source ingestion failed',
        );

        return reportFailure(
          502,
          'Unable to retrieve reviews from the source.',
        );
      }

      const counts: IngestionCounts = {
        receivedCount: result.receivedCount,
        savedCount: 0,
        rejectedCount: result.rejected.length,
      };

      // Do not mark an attempt successful if no usable
      // reviews are available for persistence.
      if (result.reviews.length === 0) {
        return reportFailure(
          422,
          'No valid reviews were available to save.',
          counts,
        );
      }

      // S1-022: Persist reviews in PostgreSQL.
      let savedReviews: Awaited<ReturnType<typeof saveReviewsForTargetOwner>>;

      try {
        savedReviews = await saveReviewsForTargetOwner(
          db,
          authenticationContext,
          targetId,
          result.reviews,
        );
      } catch (error) {
        request.log.error(
          { err: error, targetId, attemptId },
          'Review persistence failed',
        );

        return reportFailure(500, 'Unable to save reviews.', counts);
      }

      if (!savedReviews) {
        return reportFailure(
          404,
          'AnalysisTarget no longer available.',
          counts,
        );
      }

      // Ensure every accepted review was persisted.
      if (savedReviews.length !== result.reviews.length) {
        request.log.error(
          {
            targetId,
            attemptId,
            expected: result.reviews.length,
            actual: savedReviews.length,
          },
          'Review persistence count mismatch',
        );

        counts.savedCount = savedReviews.length;

        return reportFailure(
          500,
          'Unable to save all accepted reviews.',
          counts,
        );
      }

      counts.savedCount = savedReviews.length;

      // S1-023: Success only AFTER persistence.
      try {
        const completed = await finalizeIngestionAttemptForTargetOwner(
          db,
          authenticationContext,
          targetId,
          attemptId,
          {
            status: 'succeeded',
            counts,
          },
        );

        if (!completed) {
          request.log.error(
            { targetId, attemptId },
            'Could not finalize successful ingestion',
          );

          return reply.code(500).send({
            error: 'Unable to record ingestion outcome.',
          });
        }
      } catch (error) {
        request.log.error(
          { err: error, targetId, attemptId },
          'Failed to finalize successful ingestion',
        );

        return reply.code(500).send({
          error: 'Unable to record ingestion outcome.',
        });
      }

      return reply.code(200).send({
        analysisTargetId: targetId,
        attemptId,
        status: 'succeeded',
        ...counts,
      });
    },
  );
};
