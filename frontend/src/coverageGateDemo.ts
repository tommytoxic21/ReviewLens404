export function classifyCoverageDemoValue(value: number): string {
  if (!Number.isFinite(value)) return 'invalid';
  if (value < 0) return 'negative';
  if (value === 0) return 'zero';
  return 'positive';
}
