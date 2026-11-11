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
});
