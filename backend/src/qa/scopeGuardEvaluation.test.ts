import { describe, expect, it, vi } from 'vitest';
import { OpenAiReviewQa, REVIEW_QA_INSTRUCTIONS } from './openAiReviewQa.js';
import type { ReviewContext } from './reviewContext.js';

const reviewEvidence: ReviewContext['reviews'] = [
  {
    id: 'evaluation-review-1',
    rating: 5,
    text: 'The espresso was rich, and the barista helped me choose a single-origin coffee.',
    reviewedAt: null,
  },
  {
    id: 'evaluation-review-2',
    rating: 3,
    text: 'Friendly staff, but I waited about 20 minutes for my drink.',
    reviewedAt: null,
  },
  {
    id: 'evaluation-review-3',
    rating: 4,
    text: "Good pastries. I haven't tried the patio yet.",
    reviewedAt: null,
  },
];

type ScopeGuardCase = {
  id: string;
  category:
    | 'in-scope-answerable'
    | 'in-scope-insufficient-evidence'
    | 'general-knowledge'
    | 'another-entity'
    | 'another-platform';
  activeTarget: { name: string; platform: string };
  reviewEvidence: ReviewContext['reviews'];
  question: string;
  expectedBehavior: {
    status: 'answered' | 'insufficient_evidence';
    requiredSignals: string[];
    forbiddenSignals: string[];
  };
  controlledAnswer: string;
  rationale: string;
};

const cases: ScopeGuardCase[] = [
  {
    id: 'supported-praise',
    category: 'in-scope-answerable',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question: 'What do customers praise about the coffee and staff?',
    expectedBehavior: {
      status: 'answered',
      requiredSignals: ['espresso', 'barista'],
      forbiddenSignals: ['parking is safe', 'wheelchair access'],
    },
    controlledAnswer:
      'The reviews praise the espresso as rich and mention the barista helping with a coffee choice.',
    rationale:
      'The supplied reviews directly support praise for the espresso and barista.',
  },
  {
    id: 'supported-wait-time',
    category: 'in-scope-answerable',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question:
      'Do the reviews give any indication of how long a drink can take?',
    expectedBehavior: {
      status: 'answered',
      requiredSignals: ['20 minutes'],
      forbiddenSignals: ['every customer', 'always takes'],
    },
    controlledAnswer:
      'One review mentions a wait of about 20 minutes; the reviews do not establish whether that is typical.',
    rationale:
      'One review reports a wait, while the evidence does not establish a general pattern.',
  },
  {
    id: 'missing-parking-safety',
    category: 'in-scope-insufficient-evidence',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question: 'Do customers think the parking lot is safe at night?',
    expectedBehavior: {
      status: 'insufficient_evidence',
      requiredSignals: ['do not mention', 'cannot assess'],
      forbiddenSignals: ['safe at night', 'unsafe at night'],
    },
    controlledAnswer:
      'The supplied reviews do not mention parking safety at night, so I cannot assess it from this dataset.',
    rationale:
      'Parking and nighttime safety are absent from the controlled review evidence.',
  },
  {
    id: 'missing-accessibility',
    category: 'in-scope-insufficient-evidence',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question: 'What do reviewers say about wheelchair access?',
    expectedBehavior: {
      status: 'insufficient_evidence',
      requiredSignals: ['do not describe', 'not enough review evidence'],
      forbiddenSignals: [
        'is wheelchair accessible',
        'is not wheelchair accessible',
      ],
    },
    controlledAnswer:
      'The supplied reviews do not describe wheelchair access, so there is not enough review evidence to assess it.',
    rationale:
      'The reviews discuss drinks, staff, and pastries but not accessibility.',
  },
  {
    id: 'general-weather',
    category: 'general-knowledge',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question: 'What is the weather today?',
    expectedBehavior: {
      status: 'insufficient_evidence',
      requiredSignals: ['active target', 'reviews'],
      forbiddenSignals: ['sunny', 'rainy', 'temperature'],
    },
    controlledAnswer:
      "I cannot provide today's weather from the active target's reviews; they contain no weather information.",
    rationale:
      'Current weather is unrelated to analysis of the active review dataset.',
  },
  {
    id: 'general-programming',
    category: 'general-knowledge',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question: 'Write a Python sorting algorithm.',
    expectedBehavior: {
      status: 'insufficient_evidence',
      requiredSignals: ['review', 'scope'],
      forbiddenSignals: ['def sort', 'quick sort'],
    },
    controlledAnswer:
      "I can analyze Northstar Coffee's supplied reviews, but writing a Python sorting algorithm is outside that review-analysis scope.",
    rationale:
      'The request is a general programming task, not a question answerable from reviews.',
  },
  {
    id: 'another-entity-direct',
    category: 'another-entity',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question: 'What do customers think about Harbor Cafe?',
    expectedBehavior: {
      status: 'insufficient_evidence',
      requiredSignals: ['not the active target', 'Northstar Coffee'],
      forbiddenSignals: ['Harbor Cafe is popular'],
    },
    controlledAnswer:
      "I cannot analyze Harbor Cafe from Northstar Coffee's reviews; Harbor Cafe is not the active target.",
    rationale:
      'The question directly requests information about an entity absent from the active dataset.',
  },
  {
    id: 'another-entity-comparison',
    category: 'another-entity',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question:
      'Does the cafe across the street have faster service than this one?',
    expectedBehavior: {
      status: 'insufficient_evidence',
      requiredSignals: ['these reviews', 'compare'],
      forbiddenSignals: ['faster than Northstar', 'slower than Northstar'],
    },
    controlledAnswer:
      'These reviews do not include evidence about the cafe across the street, so I cannot compare its service with Northstar Coffee.',
    rationale:
      'This phrasing implies another entity and a comparison for which no evidence is supplied.',
  },
  {
    id: 'another-platform-direct',
    category: 'another-platform',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question: "Summarize Northstar Coffee's Yelp reviews.",
    expectedBehavior: {
      status: 'insufficient_evidence',
      requiredSignals: ['Google', 'not Yelp'],
      forbiddenSignals: ['Yelp reviewers', 'Yelp rating'],
    },
    controlledAnswer:
      "The active dataset contains Northstar Coffee's Google reviews, not Yelp reviews, so I cannot summarize Yelp feedback.",
    rationale:
      'The active platform is Google; no Yelp review evidence is included.',
  },
  {
    id: 'another-platform-comparison',
    category: 'another-platform',
    activeTarget: { name: 'Northstar Coffee', platform: 'google' },
    reviewEvidence,
    question:
      "Would these customer opinions hold up against Northstar Coffee's TripAdvisor ratings?",
    expectedBehavior: {
      status: 'insufficient_evidence',
      requiredSignals: ['Google', 'TripAdvisor'],
      forbiddenSignals: [
        'TripAdvisor customers agree',
        'TripAdvisor rating is',
      ],
    },
    controlledAnswer:
      'These are Google reviews and do not include TripAdvisor ratings, so I cannot determine whether opinions there agree.',
    rationale:
      'The wording asks for a cross-platform comparison without TripAdvisor evidence.',
  },
];

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

function includesAny(text: string, signals: string[]): boolean {
  const normalized = text.toLowerCase();
  return signals.some((signal) => normalized.includes(signal.toLowerCase()));
}

describe('S2-004 deterministic scope-guard evaluation', () => {
  it('keeps at least two examples in every required category', () => {
    const categories: ScopeGuardCase['category'][] = [
      'in-scope-answerable',
      'in-scope-insufficient-evidence',
      'general-knowledge',
      'another-entity',
      'another-platform',
    ];

    for (const category of categories) {
      expect(
        cases.filter((evaluationCase) => evaluationCase.category === category),
      ).toHaveLength(2);
    }
  });

  it.each(cases)(
    '$id ($category): $question',
    async ({
      activeTarget,
      reviewEvidence: reviews,
      question,
      expectedBehavior,
      controlledAnswer,
      rationale,
    }) => {
      expect(rationale).not.toBe('');
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          openAiResponse(expectedBehavior.status, controlledAnswer),
        );
      const model = new OpenAiReviewQa('test-key', 'test-model', transport);
      const context: ReviewContext = {
        targetId: 'scope-evaluation-target',
        targetName: activeTarget.name,
        targetPlatform: activeTarget.platform,
        totalReviewCount: reviews.length,
        reviews,
      };

      const result = await model.answer(question, context);

      expect(result.status).toBe(expectedBehavior.status);
      expect(includesAny(result.answer, expectedBehavior.requiredSignals)).toBe(
        true,
      );
      for (const signal of expectedBehavior.forbiddenSignals) {
        expect(result.answer.toLowerCase()).not.toContain(signal.toLowerCase());
      }

      const [url, init] = transport.mock.calls[0]!;
      expect(String(url)).toBe('https://api.openai.com/v1/responses');
      const request = JSON.parse(String(init?.body));
      const promptInput = JSON.parse(request.input) as {
        target: { id: string; name: string; platform: string };
        includedReviews: number;
        totalStoredReviews: number;
        reviewSubset: ReviewContext['reviews'];
        question: string;
      };
      expect(request.store).toBe(false);
      expect(request.instructions).toBe(REVIEW_QA_INSTRUCTIONS);
      expect(request.instructions).toContain(
        'Answer only from the supplied review dataset',
      );
      expect(request.instructions).toContain(
        'Do not answer using general knowledge',
      );
      expect(request.instructions).toContain(
        'If the question is within the general review-analysis domain',
      );
      expect(request.instructions).toContain(
        'If the question is unrelated to the active target',
      );
      expect(promptInput).toEqual({
        target: {
          name: activeTarget.name,
          platform: activeTarget.platform,
          id: 'scope-evaluation-target',
        },
        includedReviews: reviews.length,
        totalStoredReviews: reviews.length,
        reviewSubset: reviews,
        question,
      });
    },
  );
});
