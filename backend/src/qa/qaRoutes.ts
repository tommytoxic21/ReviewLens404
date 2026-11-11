import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import { ReviewQaError, answerQuestionForTarget } from './qaService.js';
import type { ReviewQaModel } from './openAiReviewQa.js';

interface QaRoutesDependencies {
  database: Database;
  model?: ReviewQaModel;
}

interface QaParameters {
  targetId: string;
}

function validateQuestion(body: unknown): string {
  if (
    !body ||
    typeof body !== 'object' ||
    !('question' in body) ||
    typeof body.question !== 'string'
  ) {
    throw new ReviewQaError('A question is required.', 400);
  }

  const question = body.question.trim();
  if (question.length === 0 || question.length > 500) {
    throw new ReviewQaError(
      'Question must contain between 1 and 500 characters.',
      400,
    );
  }
  return question;
}

function validateTargetId(id: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw new ReviewQaError('Analysis target ID is invalid.', 400);
  }
}

export function registerReviewQaRoutes(
  app: FastifyInstance,
  { database, model }: QaRoutesDependencies,
): void {
  // Called from registerApiRoutes, which enforces Clerk authentication via
  // its preHandler hook across all /api routes.
  app.post<{ Params: QaParameters; Body: unknown }>(
    '/analysis-targets/:targetId/questions',
    async (request) => {
      validateTargetId(request.params.targetId);
      const question = validateQuestion(request.body);
      if (!request.authenticationContext) {
        throw new ReviewQaError('Authentication required.', 401);
      }

      return answerQuestionForTarget(
        database,
        request.authenticationContext,
        request.params.targetId,
        question,
        model,
      );
    },
  );
}
