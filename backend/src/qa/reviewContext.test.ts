import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client.js';
import type { Review } from '../db/schema.js';

const { requireOwnedTarget, listOwnedReviews } = vi.hoisted(() => ({
  requireOwnedTarget: vi.fn(),
  listOwnedReviews: vi.fn(),
}));
vi.mock('../analysisTargets/analysisTargetRepository.js', () => ({
  requireAnalysisTargetForOwner: requireOwnedTarget,
}));
vi.mock('../reviews/reviewRepository.js', () => ({
  listReviewsForOwnedTarget: listOwnedReviews,
}));

import {
  buildReviewContext,
  MAX_CONTEXT_REVIEWS,
  MAX_CONTEXT_CHARACTERS,
} from './reviewContext.js';

const database = {} as Database;
const owner = { userId: 'authenticated-user' };
const targetId = '11111111-1111-4111-8111-111111111111';

function review(number: number, text: string): Review {
  return {
    id: `review-${number}`,
    analysisTargetId: targetId,
    text,
    rating: 4,
    sourceReviewId: null,
    reviewerName: `Sensitive name ${number}`,
    reviewDate: null,
    reviewUrl: null,
    sourceMetadata: { secret: 'must-not-leak' },
    createdAt: new Date(),
  };
}

describe('S2-010 owned review context', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireOwnedTarget.mockResolvedValue({
      id: targetId,
      entityName: 'Owner Coffee',
      platform: 'google',
    });
  });

  it('uses persisted reviews and the authenticated target identity, not client data', async () => {
    listOwnedReviews.mockResolvedValue([
      review(1, 'The espresso was excellent.'),
    ]);
    const context = await buildReviewContext(database, owner, targetId);

    expect(requireOwnedTarget).toHaveBeenCalledWith(database, owner, targetId);
    expect(listOwnedReviews).toHaveBeenCalledWith(database, owner, targetId);
    expect(context).toEqual({
      targetId,
      targetName: 'Owner Coffee',
      targetPlatform: 'google',
      totalReviewCount: 1,
      reviews: [
        {
          id: 'review-1',
          rating: 4,
          text: 'The espresso was excellent.',
          reviewedAt: null,
        },
      ],
    });
    expect(JSON.stringify(context)).not.toContain('Sensitive name');
    expect(JSON.stringify(context)).not.toContain('must-not-leak');
  });

  it('never reads reviews if the current user does not own the target', async () => {
    requireOwnedTarget.mockRejectedValue(new Error('Not owned'));
    await expect(buildReviewContext(database, owner, targetId)).rejects.toThrow(
      'Not owned',
    );
    expect(listOwnedReviews).not.toHaveBeenCalled();
  });

  it('limits both the number of reviews and prompt size', async () => {
    listOwnedReviews.mockResolvedValue(
      Array.from({ length: 120 }, (_, index) =>
        review(index, 'x'.repeat(2_000)),
      ),
    );
    const context = await buildReviewContext(database, owner, targetId);
    expect(context.totalReviewCount).toBe(120);
    expect(context.reviews.length).toBeLessThanOrEqual(MAX_CONTEXT_REVIEWS);
    expect(
      context.reviews.reduce((sum, item) => sum + item.text.length, 0),
    ).toBeLessThanOrEqual(MAX_CONTEXT_CHARACTERS);
    expect(context.reviews[0]?.id).toBe('review-119');
  });

  it('S2-018/S2-019: rebuilds persisted review context when switching A to B to A', async () => {
    const targetBId = '22222222-2222-4222-8222-222222222222';

    const reviewsA = [
      review(1, 'Battery life lasts all day.'),
      review(2, 'Battery life is excellent.'),
    ];

    const reviewsB = [
      {
        ...review(3, 'Customer service was slow.'),
        analysisTargetId: targetBId,
      },
      {
        ...review(4, 'Customer service needs improvement.'),
        analysisTargetId: targetBId,
      },
      {
        ...review(5, 'The staff helped with customer service.'),
        analysisTargetId: targetBId,
      },
    ];

    requireOwnedTarget.mockImplementation(
      async (_db: Database, _user: typeof owner, id: string) => {
        if (id === targetId) {
          return {
            id,
            entityName: 'Battery Store',
            platform: 'google',
          };
        }
        if (id === targetBId) {
          return {
            id,
            entityName: 'Service Desk',
            platform: 'google',
          };
        }
        throw new Error('Target not found.');
      },
    );

    listOwnedReviews.mockImplementation(
      async (_db: Database, _user: typeof owner, id: string) => {
        if (id === targetId) return reviewsA;
        if (id === targetBId) return reviewsB;
        throw new Error('Target not found.');
      },
    );

    const contextA1 = await buildReviewContext(database, owner, targetId);
    const contextB = await buildReviewContext(database, owner, targetBId);
    const contextA2 = await buildReviewContext(database, owner, targetId);

    expect(contextA1.targetId).toBe(targetId);
    expect(contextA1.targetName).toBe('Battery Store');
    expect(contextA1.totalReviewCount).toBe(2);

    expect(contextB.targetId).toBe(targetBId);
    expect(contextB.targetName).toBe('Service Desk');
    expect(contextB.totalReviewCount).toBe(3);

    expect(contextA2).toEqual(contextA1);

    expect(
      contextA1.reviews.every((item) => item.text.includes('Battery life')),
    ).toBe(true);

    expect(
      contextB.reviews.every(
        (item) =>
          item.text.includes('Customer service') ||
          item.text.includes('customer service'),
      ),
    ).toBe(true);

    expect(JSON.stringify(contextB)).not.toContain('Battery life');
    expect(JSON.stringify(contextA2)).not.toContain('Customer service');

    expect(requireOwnedTarget).toHaveBeenNthCalledWith(
      1,
      database,
      owner,
      targetId,
    );
    expect(requireOwnedTarget).toHaveBeenNthCalledWith(
      2,
      database,
      owner,
      targetBId,
    );
    expect(requireOwnedTarget).toHaveBeenNthCalledWith(
      3,
      database,
      owner,
      targetId,
    );

    expect(listOwnedReviews).toHaveBeenNthCalledWith(
      1,
      database,
      owner,
      targetId,
    );
    expect(listOwnedReviews).toHaveBeenNthCalledWith(
      2,
      database,
      owner,
      targetBId,
    );
    expect(listOwnedReviews).toHaveBeenNthCalledWith(
      3,
      database,
      owner,
      targetId,
    );
  });
});
