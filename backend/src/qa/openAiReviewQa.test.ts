import { describe, expect, it, vi } from 'vitest';
import { OpenAiReviewQa, REVIEW_QA_INSTRUCTIONS } from './openAiReviewQa.js';
import type { ReviewContext } from './reviewContext.js';

const evidence: ReviewContext = {
  targetId: 'target-a',
  targetName: 'Coffee Shop',
  totalReviewCount: 2,
  reviews: [
    { id: 'review-1', rating: 5, text: 'Excellent coffee', reviewedAt: null },
  ],
};

function openAiResponse(status: string, answer: string): Response {
  return new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: JSON.stringify({ status, answer }) },
          ],
        },
      ],
    }),
    { status: 200 },
  );
}

describe('S2-011/012 OpenAI Responses adapter', () => {
  it('calls OpenAI server-side with structured evidence-only instructions', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(openAiResponse('answered', 'The coffee was praised.'));
    const model = new OpenAiReviewQa('test-secret', 'test-model', transport);
    await expect(
      model.answer('What do customers like?', evidence),
    ).resolves.toEqual({
      status: 'answered',
      answer: 'The coffee was praised.',
    });

    const [url, init] = transport.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-secret' });
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('test-model');
    expect(body.store).toBe(false);
    expect(body.instructions).toBe(REVIEW_QA_INSTRUCTIONS);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    const prompt = JSON.parse(body.input);
    expect(prompt.target.id).toBe('target-a');
    expect(prompt.reviewSubset[0].text).toBe('Excellent coffee');
    expect(prompt.question).toBe('What do customers like?');
  });

  it('returns an insufficient-evidence explanation instead of fabricating an answer', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        openAiResponse('insufficient_evidence', 'No reviews mention parking.'),
      );
    const model = new OpenAiReviewQa('key', 'test-model', transport);
    await expect(model.answer('How is parking?', evidence)).resolves.toEqual({
      status: 'insufficient_evidence',
      answer: 'No reviews mention parking.',
    });
  });

  it('does not return a blank answer for insufficient evidence', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(openAiResponse('insufficient_evidence', ''));
    await expect(
      new OpenAiReviewQa('key', 'test-model', transport).answer(
        'Parking?',
        evidence,
      ),
    ).resolves.toMatchObject({
      status: 'insufficient_evidence',
      answer: expect.stringContaining('do not provide enough'),
    });
  });

  it('fails safely when the provider errors or returns an invalid response', async () => {
    const failed = vi
      .fn()
      .mockResolvedValue(new Response('invalid key', { status: 401 }));
    await expect(
      new OpenAiReviewQa('key', 'test-model', failed).answer(
        'Question?',
        evidence,
      ),
    ).rejects.toMatchObject({ statusCode: 502 });
    const invalid = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(
      new OpenAiReviewQa('key', 'test-model', invalid).answer(
        'Question?',
        evidence,
      ),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
