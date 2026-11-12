import { describe, expect, it } from 'vitest';
import { classifyCoverageDemoValue } from './coverageGateDemo';

describe('classifyCoverageDemoValue', () => {
  it('classifies invalid, negative, zero, and positive values', () => {
    expect(classifyCoverageDemoValue(Number.NaN)).toBe('invalid');
    expect(classifyCoverageDemoValue(-1)).toBe('negative');
    expect(classifyCoverageDemoValue(0)).toBe('zero');
    expect(classifyCoverageDemoValue(1)).toBe('positive');
  });
});
