import { describe, expect, it } from 'vitest';
import {
  AnalysisTargetValidationError,
  validateAnalysisTargetInput,
} from './analysisTargetValidation.js';

const VALID_SOURCE_URL =
  'https://www.google.com/maps/place/ReviewLens+Coffee/@40.748,-73.985,17z';

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
  it('returns validation failures as client errors', () => {
    const error = captureValidationError({});

    expect(error).toMatchObject({
      name: 'AnalysisTargetValidationError',
      message: 'Analysis target input is invalid.',
      statusCode: 400,
    });
    expect(error.issues).toEqual([
      {
        field: 'entityName',
        code: 'required',
        message: 'Entity name is required.',
      },
      {
        field: 'platform',
        code: 'required',
        message: 'Platform is required.',
      },
      {
        field: 'sourceUrl',
        code: 'required',
        message: 'Source URL is required.',
      },
    ]);
  });

  it('rejects input with a missing entity name', () => {
    const error = captureValidationError({
      platform: 'google',
      sourceUrl: VALID_SOURCE_URL,
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
      sourceUrl: VALID_SOURCE_URL,
    });

    expect(error.issues).toEqual([
      {
        field: 'entityName',
        code: 'required',
        message: 'Entity name is required.',
      },
    ]);
  });

  it('rejects a missing platform', () => {
    const error = captureValidationError({
      entityName: 'ReviewLens Coffee',
      sourceUrl: VALID_SOURCE_URL,
    });

    expect(error.issues).toEqual([
      {
        field: 'platform',
        code: 'required',
        message: 'Platform is required.',
      },
    ]);
  });

  it('rejects a malformed platform', () => {
    const error = captureValidationError({
      entityName: 'ReviewLens Coffee',
      platform: 'google maps!',
      sourceUrl: VALID_SOURCE_URL,
    });

    expect(error.issues).toEqual([
      {
        field: 'platform',
        code: 'invalid',
        message: 'Platform is malformed.',
      },
    ]);
  });

  it('rejects an unsupported platform', () => {
    const error = captureValidationError({
      entityName: 'ReviewLens Coffee',
      platform: 'yelp',
      sourceUrl: VALID_SOURCE_URL,
    });

    expect(error.issues).toEqual([
      {
        field: 'platform',
        code: 'unsupported',
        message: 'Only the google platform is supported.',
      },
    ]);
  });

  it('rejects a missing source URL', () => {
    const error = captureValidationError({
      entityName: 'ReviewLens Coffee',
      platform: 'google',
    });

    expect(error.issues).toEqual([
      {
        field: 'sourceUrl',
        code: 'required',
        message: 'Source URL is required.',
      },
    ]);
  });

  it.each([
    'not-a-url',
    'http://www.google.com/maps/place/ReviewLens+Coffee',
    ' https://www.google.com/maps/place/ReviewLens+Coffee ',
  ])('rejects the malformed source URL %s', (sourceUrl) => {
    const error = captureValidationError({
      entityName: 'ReviewLens Coffee',
      platform: 'google',
      sourceUrl,
    });

    expect(error.issues).toEqual([
      {
        field: 'sourceUrl',
        code: 'invalid',
        message: 'Source URL must be a valid HTTPS URL.',
      },
    ]);
  });

  it.each([
    'https://example.com/maps/place/ReviewLens+Coffee',
    'https://maps.app.goo.gl.evil.example/AbCdEf123456',
    'https://www.google.com.evil.example/maps/place/ReviewLens+Coffee',
    'https://www.google.com/search?q=ReviewLens+Coffee',
    'https://www.google.com/maps/place/',
    'https://www.google.com/maps/place/%20',
    'https://www.google.com/maps/search/?api=1',
    'https://maps.app.goo.gl/',
    'https://maps.app.goo.gl/not/a-token',
    'https://maps.app.goo.gl/not%20a%20token',
    'https://goo.gl/maps/',
  ])('rejects the unsupported source URL %s', (sourceUrl) => {
    const error = captureValidationError({
      entityName: 'ReviewLens Coffee',
      platform: 'google',
      sourceUrl,
    });

    expect(error.issues).toEqual([
      {
        field: 'sourceUrl',
        code: 'unsupported',
        message: 'Source URL must identify a Google Maps place.',
      },
    ]);
  });

  it('rejects a Google Maps URL longer than 2,048 characters', () => {
    const error = captureValidationError({
      entityName: 'ReviewLens Coffee',
      platform: 'google',
      sourceUrl: `https://www.google.com/maps/place/${'a'.repeat(2049)}`,
    });

    expect(error.issues).toEqual([
      {
        field: 'sourceUrl',
        code: 'invalid',
        message: 'Source URL must not exceed 2,048 characters.',
      },
    ]);
  });

  it.each([
    VALID_SOURCE_URL,
    'https://www.google.co.uk/maps/place/ReviewLens+Coffee',
    'https://www.google.com/maps/search/?api=1&query=ReviewLens+Coffee',
    'https://maps.google.com/?cid=1234567890',
    'https://maps.app.goo.gl/AbCdEf123456',
    'https://goo.gl/maps/AbCdEf123456',
  ])('accepts valid Google Maps input using %s', (sourceUrl) => {
    expect(() =>
      validateAnalysisTargetInput({
        entityName: 'ReviewLens Coffee',
        platform: 'google',
        sourceUrl,
      }),
    ).not.toThrow();
  });
});
