import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client.js';
import { AnalysisTargetAccessError } from '../analysisTargets/analysisTargetRepository.js';

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
  targetPlatform: 'google',
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
    const answer = vi.fn().mockResolvedValue({
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

  it('S2-016: stops before the model when context authorization fails', async () => {
    const accessError = new AnalysisTargetAccessError();
    contextMock.mockRejectedValue(accessError);
    const answer = vi.fn();
    const otherUser = { userId: 'user-b' };

    await expect(
      answerQuestionForTarget(db, otherUser, targetId, 'What do reviews say?', {
        answer,
      }),
    ).rejects.toBe(accessError);
    expect(contextMock).toHaveBeenCalledWith(db, otherUser, targetId);
    expect(answer).not.toHaveBeenCalled();
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

  it('S2-018/S2-019: switches Q&A context from A to B and back to A', async () => {
    const targetBId = '22222222-2222-4222-8222-222222222222';

    const contextA = {
      targetId,
      targetName: 'Battery Store',
      targetPlatform: 'google',
      totalReviewCount: 1,
      reviews: [
        {
          id: 'battery-review',
          rating: 5,
          text: 'Battery life lasts all day.',
          reviewedAt: null,
        },
      ],
    };

    const contextB = {
      targetId: targetBId,
      targetName: 'Service Desk',
      targetPlatform: 'google',
      totalReviewCount: 2,
      reviews: [
        {
          id: 'service-review-1',
          rating: 2,
          text: 'Customer service was slow.',
          reviewedAt: null,
        },
        {
          id: 'service-review-2',
          rating: 3,
          text: 'Customer service needs improvement.',
          reviewedAt: null,
        },
      ],
    };

    contextMock.mockImplementation(
      async (_database: Database, _user: typeof user, id: string) => {
        if (id === targetId) return contextA;
        if (id === targetBId) return contextB;
        throw new Error('Unexpected target.');
      },
    );

    const answer = vi.fn().mockResolvedValue({
      status: 'answered',
      answer: 'Answer based on the selected target.',
    });
    const model: ReviewQaModel = { answer };

    const first = await answerQuestionForTarget(
      db,
      user,
      targetId,
      'What do reviews say?',
      model,
    );

    const second = await answerQuestionForTarget(
      db,
      user,
      targetBId,
      'What do reviews say?',
      model,
    );

    const third = await answerQuestionForTarget(
      db,
      user,
      targetId,
      'What do reviews say?',
      model,
    );

    expect(first).toMatchObject({
      reviewsUsed: 1,
      totalReviews: 1,
    });

    expect(second).toMatchObject({
      reviewsUsed: 2,
      totalReviews: 2,
    });

    expect(third).toMatchObject({
      reviewsUsed: 1,
      totalReviews: 1,
    });

    expect(contextMock).toHaveBeenNthCalledWith(1, db, user, targetId);
    expect(contextMock).toHaveBeenNthCalledWith(2, db, user, targetBId);
    expect(contextMock).toHaveBeenNthCalledWith(3, db, user, targetId);

    expect(answer).toHaveBeenCalledTimes(3);

    expect(answer).toHaveBeenNthCalledWith(1, 'What do reviews say?', contextA);

    expect(answer).toHaveBeenNthCalledWith(2, 'What do reviews say?', contextB);

    expect(answer).toHaveBeenNthCalledWith(3, 'What do reviews say?', contextA);

    expect(JSON.stringify(answer.mock.calls[1]?.[1])).toContain(
      'Customer service',
    );
    expect(JSON.stringify(answer.mock.calls[1]?.[1])).not.toContain(
      'Battery life',
    );
  });
});
