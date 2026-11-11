import type { AuthenticationContext } from '../authentication.js';
import type { Database } from '../db/client.js';
import { buildReviewContext } from './reviewContext.js';
import type { ReviewQaModel, ReviewQaResult } from './openAiReviewQa.js';

export class ReviewQaError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ReviewQaError';
  }
}

export async function answerQuestionForTarget(
  db: Database,
  authentication: AuthenticationContext,
  targetId: string,
  question: string,
  model?: ReviewQaModel,
): Promise<ReviewQaResult & { reviewsUsed: number; totalReviews: number }> {
  const context = await buildReviewContext(db, authentication, targetId);
  if (context.reviews.length === 0) {
    throw new ReviewQaError(
      'No reviews are available for this target. Ingest reviews before asking a question.',
      409,
    );
  }
  if (!model) {
    throw new ReviewQaError('Review Q&A is not configured on the server.', 503);
  }

  const answer = await model.answer(question, context);
  return {
    ...answer,
    reviewsUsed: context.reviews.length,
    totalReviews: context.totalReviewCount,
  };
}
