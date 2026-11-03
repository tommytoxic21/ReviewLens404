export type AnalysisTargetInputField = 'entityName' | 'platform' | 'sourceUrl';

export type AnalysisTargetValidationIssueCode =
  'required' | 'invalid' | 'unsupported';

export interface AnalysisTargetValidationIssue {
  field: AnalysisTargetInputField;
  code: AnalysisTargetValidationIssueCode;
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

function getInputField(
  input: unknown,
  field: AnalysisTargetInputField,
): unknown {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }

  return Reflect.get(input, field);
}

function isMissingString(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

function validateEntityName(
  entityName: unknown,
  issues: AnalysisTargetValidationIssue[],
): void {
  if (typeof entityName !== 'string' || entityName.trim().length === 0) {
    issues.push({
      field: 'entityName',
      code: 'required',
      message: 'Entity name is required.',
    });
  }
}

function validatePlatform(
  platform: unknown,
  issues: AnalysisTargetValidationIssue[],
): void {
  if (isMissingString(platform)) {
    issues.push({
      field: 'platform',
      code: 'required',
      message: 'Platform is required.',
    });
    return;
  }

  if (
    typeof platform !== 'string' ||
    platform !== platform.trim() ||
    !/^[a-z][a-z0-9_-]*$/.test(platform)
  ) {
    issues.push({
      field: 'platform',
      code: 'invalid',
      message: 'Platform is malformed.',
    });
    return;
  }

  if (platform !== 'google') {
    issues.push({
      field: 'platform',
      code: 'unsupported',
      message: 'Only the google platform is supported.',
    });
  }
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isGoogleDomain(hostname: string): boolean {
  return /^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(
    hostname,
  );
}

function hasPathValue(pathname: string, prefix: string): boolean {
  return (
    pathname.startsWith(prefix) && pathname.slice(prefix.length).length > 0
  );
}

function hasSearchParamValue(url: URL, name: string): boolean {
  const value = url.searchParams.get(name);
  return value !== null && value.trim().length > 0;
}

function isGoogleMapsUrl(url: URL): boolean {
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (url.hostname === 'maps.app.goo.gl') {
    return pathSegments.length > 0;
  }

  if (url.hostname === 'goo.gl') {
    return pathSegments[0] === 'maps' && pathSegments.length > 1;
  }

  if (!isGoogleDomain(url.hostname)) {
    return false;
  }

  if (hasPathValue(url.pathname, '/maps/place/')) {
    return true;
  }

  if (hasPathValue(url.pathname, '/maps/search/')) {
    return true;
  }

  if (
    (url.pathname === '/maps/search' || url.pathname === '/maps/search/') &&
    url.searchParams.get('api') === '1'
  ) {
    return hasSearchParamValue(url, 'query');
  }

  const isMapsRoot =
    url.pathname === '/maps' ||
    url.pathname === '/maps/' ||
    (url.hostname === 'maps.google.com' && url.pathname === '/');

  return (
    isMapsRoot &&
    ['cid', 'place_id', 'query_place_id', 'q'].some((name) =>
      hasSearchParamValue(url, name),
    )
  );
}

function validateSourceUrl(
  sourceUrl: unknown,
  issues: AnalysisTargetValidationIssue[],
): void {
  if (isMissingString(sourceUrl)) {
    issues.push({
      field: 'sourceUrl',
      code: 'required',
      message: 'Source URL is required.',
    });
    return;
  }

  if (typeof sourceUrl !== 'string' || sourceUrl !== sourceUrl.trim()) {
    issues.push({
      field: 'sourceUrl',
      code: 'invalid',
      message: 'Source URL must be a valid HTTPS URL.',
    });
    return;
  }

  const parsedUrl = parseUrl(sourceUrl);

  if (
    !parsedUrl ||
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.port.length > 0 ||
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0
  ) {
    issues.push({
      field: 'sourceUrl',
      code: 'invalid',
      message: 'Source URL must be a valid HTTPS URL.',
    });
    return;
  }

  if (!isGoogleMapsUrl(parsedUrl)) {
    issues.push({
      field: 'sourceUrl',
      code: 'unsupported',
      message: 'Source URL must identify a Google Maps place.',
    });
  }
}

export function validateAnalysisTargetInput(input: unknown): void {
  const issues: AnalysisTargetValidationIssue[] = [];

  validateEntityName(getInputField(input, 'entityName'), issues);
  validatePlatform(getInputField(input, 'platform'), issues);
  validateSourceUrl(getInputField(input, 'sourceUrl'), issues);

  if (issues.length > 0) {
    throw new AnalysisTargetValidationError(issues);
  }
}
