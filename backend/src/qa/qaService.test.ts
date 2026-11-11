import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client.js';

const { contextMock } = vi.hoisted(() => ({ contextMock: vi.fn() }));
vi.mock('./reviewContext.js', () => ({ buildReviewContext: contextMock }));

import { answerQuestionForTarget } from './qaService.js';
import type { ReviewQaModel } from './openAiReviewQa.js';

const db = {} as Database;
const user = { userId: 'user-a' };
const targetId = '11111111-1111-4111-8111-111111111111';
const evidence = {
  targetId,
  targetName: 'Target A',
  totalReviewCount: 2,
  reviews: [
    { id: 'review-1', rating: 2, text: 'Slow service', reviewedAt: null },
  ],
};

describe('S2-010/011/012 review Q&A orchestration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contextMock.mockResolvedValue(evidence);
  });

  it('sends only the selected owned target context to the model', async () => {
    const answer = vi
      .fn()
      .mockResolvedValue({
        status: 'answered',
        answer: 'Several reviews mention slow service.',
      });
    const model: ReviewQaModel = { answer };
    await expect(
      answerQuestionForTarget(
        db,
        user,
        targetId,
        'What do customers dislike?',
        model,
      ),
    ).resolves.toEqual({
      status: 'answered',
      answer: 'Several reviews mention slow service.',
      reviewsUsed: 1,
      totalReviews: 2,
    });
    expect(contextMock).toHaveBeenCalledWith(db, user, targetId);
    expect(answer).toHaveBeenCalledWith('What do customers dislike?', evidence);
  });

  it('preserves the insufficient-evidence status and explanation', async () => {
    const model: ReviewQaModel = {
      answer: vi.fn().mockResolvedValue({
        status: 'insufficient_evidence',
        answer: 'None of these reviews describe parking safety at night.',
      }),
    };
    const result = await answerQuestionForTarget(
      db,
      user,
      targetId,
      'Is parking safe at night?',
      model,
    );
    expect(result.status).toBe('insufficient_evidence');
    expect(result.answer).toMatch(/parking safety/);
  });

  it('rejects empty target datasets without calling OpenAI', async () => {
    contextMock.mockResolvedValue({
      ...evidence,
      totalReviewCount: 0,
      reviews: [],
    });
    const answer = vi.fn();
    await expect(
      answerQuestionForTarget(db, user, targetId, 'Is it good?', { answer }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(answer).not.toHaveBeenCalled();
  });

  it('reports missing OpenAI configuration without pretending to answer', async () => {
    await expect(
      answerQuestionForTarget(db, user, targetId, 'Is it good?'),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
