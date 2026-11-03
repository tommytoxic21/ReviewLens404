export type AnalysisTargetInputField = 'entityName' | 'platform' | 'sourceUrl';

export interface AnalysisTargetValidationIssue {
  field: AnalysisTargetInputField;
  code: 'required';
  message: string;
}

export class AnalysisTargetValidationError extends Error {
  readonly issues: readonly AnalysisTargetValidationIssue[];

  constructor(issues: AnalysisTargetValidationIssue[]) {
    super('Analysis target input is invalid.');
    this.name = 'AnalysisTargetValidationError';
    this.issues = issues;
  }
}

function getEntityName(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }

  return Reflect.get(input, 'entityName');
}

export function validateAnalysisTargetInput(input: unknown): void {
  const entityName = getEntityName(input);
  const issues: AnalysisTargetValidationIssue[] = [];

  if (typeof entityName !== 'string' || entityName.trim().length === 0) {
    issues.push({
      field: 'entityName',
      code: 'required',
      message: 'Entity name is required.',
    });
  }

  if (issues.length > 0) {
    throw new AnalysisTargetValidationError(issues);
  }
}
