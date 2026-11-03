import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthenticationContext } from '../authentication.js';
import { requireAuthentication } from '../authentication.js';
import {
  createAnalysisTarget,
  deleteAnalysisTargetForOwner,
  listAnalysisTargetsForOwner,
  requireAnalysisTargetForOwner,
  type CreateAnalysisTargetInput,
} from '../analysisTargets/analysisTargetRepository.js';
import type { Database } from '../db/client.js';
import { getLatestIngestionAttemptForOwnedTarget } from '../ingestion/ingestionRepository.js';
import { ingestReviewsForOwnedTarget } from '../ingestion/ingestionService.js';
import { listReviewsForOwnedTarget } from '../reviews/reviewRepository.js';
import type { ReviewSource } from '../reviews/reviewSource.js';

interface TargetParameters {
  targetId: string;
}

export class RequestValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export interface ApiDependencies {
  database: Database;
  reviewSource: ReviewSource;
}

function authenticationContext(request: FastifyRequest): AuthenticationContext {
  if (!request.authenticationContext) {
    throw new Error('Authenticated request context is unavailable.');
  }

  return request.authenticationContext;
}

function validateTargetId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new RequestValidationError('Analysis target ID is invalid.');
  }

  return value;
}

function targetResponse(target: {
  id: string;
  entityName: string;
  platform: string;
  sourceUrl: string;
  createdAt: Date;
}) {
  return {
    id: target.id,
    entityName: target.entityName,
    platform: target.platform,
    sourceUrl: target.sourceUrl,
    createdAt: target.createdAt,
  };
}

function reviewResponse(review: {
  id: string;
  analysisTargetId: string;
  sourceReviewId: string | null;
  text: string;
  rating: number;
  reviewerName: string | null;
  reviewDate: string | null;
  reviewUrl: string | null;
  sourceMetadata: Record<string, unknown> | null;
  createdAt: Date;
}) {
  return {
    id: review.id,
    analysisTargetId: review.analysisTargetId,
    sourceReviewId: review.sourceReviewId,
    reviewText: review.text,
    rating: review.rating,
    reviewerName: review.reviewerName,
    reviewedAt: review.reviewDate,
    reviewUrl: review.reviewUrl,
    sourceMetadata: review.sourceMetadata,
    createdAt: review.createdAt,
  };
}

export async function registerApiRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies,
) {
  const { database, reviewSource } = dependencies;

  app.addHook('preHandler', requireAuthentication);

  app.get('/analysis-targets', async (request) => {
    const targets = await listAnalysisTargetsForOwner(
      database,
      authenticationContext(request),
    );

    return { targets: targets.map(targetResponse) };
  });

  app.post('/analysis-targets', async (request, reply) => {
    const target = await createAnalysisTarget(
      database,
      authenticationContext(request),
      request.body as CreateAnalysisTargetInput,
    );

    return reply.code(201).send({ target: targetResponse(target) });
  });

  app.get<{ Params: TargetParameters }>(
    '/analysis-targets/:targetId',
    async (request) => {
      const targetId = validateTargetId(request.params.targetId);
      const context = authenticationContext(request);
      const target = await requireAnalysisTargetForOwner(
        database,
        context,
        targetId,
      );
      const [targetReviews, latestIngestion] = await Promise.all([
        listReviewsForOwnedTarget(database, context, targetId),
        getLatestIngestionAttemptForOwnedTarget(database, context, targetId),
      ]);

      return {
        target: targetResponse(target),
        reviews: targetReviews.map(reviewResponse),
        latestIngestion: latestIngestion ?? null,
      };
    },
  );

  app.delete<{ Params: TargetParameters }>(
    '/analysis-targets/:targetId',
    async (request, reply) => {
      const targetId = validateTargetId(request.params.targetId);
      const context = authenticationContext(request);
      const deleted = await deleteAnalysisTargetForOwner(
        database,
        context,
        targetId,
      );

      if (!deleted) {
        await requireAnalysisTargetForOwner(database, context, targetId);
      }

      return reply.code(204).send();
    },
  );

  app.post<{ Params: TargetParameters }>(
    '/analysis-targets/:targetId/ingestions',
    async (request, reply) => {
      const result = await ingestReviewsForOwnedTarget(
        database,
        reviewSource,
        authenticationContext(request),
        validateTargetId(request.params.targetId),
      );

      return reply.code(201).send(result);
    },
  );
}
