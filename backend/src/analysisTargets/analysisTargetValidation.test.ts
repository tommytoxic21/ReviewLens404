import { describe, expect, it } from 'vitest';
import {
  AnalysisTargetValidationError,
  validateAnalysisTargetInput,
} from './analysisTargetValidation.js';

function captureValidationError(input: unknown): AnalysisTargetValidationError {
  try {
    validateAnalysisTargetInput(input);
  } catch (error) {
    expect(error).toBeInstanceOf(AnalysisTargetValidationError);
    return error as AnalysisTargetValidationError;
  }

  throw new Error('Expected analysis target validation to fail.');
}

describe('validateAnalysisTargetInput', () => {
  it('rejects input with a missing entity name', () => {
    const error = captureValidationError({
      platform: 'google',
      sourceUrl: 'https://example.com/reviewlens-coffee',
    });

    expect(error.issues).toEqual([
      {
        field: 'entityName',
        code: 'required',
        message: 'Entity name is required.',
      },
    ]);
  });

  it('rejects an entity name containing only whitespace', () => {
    const error = captureValidationError({
      entityName: '   ',
      platform: 'google',
      sourceUrl: 'https://example.com/reviewlens-coffee',
    });

    expect(error.issues).toEqual([
      {
        field: 'entityName',
        code: 'required',
        message: 'Entity name is required.',
      },
    ]);
  });

  it('accepts a nonempty entity name', () => {
    expect(() =>
      validateAnalysisTargetInput({
        entityName: 'ReviewLens Coffee',
        platform: 'google',
        sourceUrl: 'https://example.com/reviewlens-coffee',
      }),
    ).not.toThrow();
  });
});
