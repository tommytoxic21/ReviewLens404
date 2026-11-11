export interface AnalysisTarget {
  id: string;
  name: string;
  platform: string;
  sourceReference: string;
  ingestionStatus?: string | null;
  ingestionError?: string | null;
}

interface ApiAnalysisTarget {
  id: string;
  entityName: string;
  platform: string;
  sourceUrl: string;
}

interface ApiIngestionAttempt {
  status: string;
  errorMessage: string | null;
}

interface ApiTargetWorkspace {
  target: ApiAnalysisTarget;
  latestIngestion: ApiIngestionAttempt | null;
}

export interface NewAnalysisTarget {
  name: string;
  platform: 'google_maps';
  sourceReference: string;
}

function toAnalysisTarget(
  target: ApiAnalysisTarget,
  ingestionAttempt?: ApiIngestionAttempt | null,
): AnalysisTarget {
  return {
    id: target.id,
    name: target.entityName,
    platform: target.platform,
    sourceReference: target.sourceUrl,
    ingestionStatus: ingestionAttempt?.status,
    ingestionError: ingestionAttempt?.errorMessage,
  };
}

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const bodyRecord =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>)
        : undefined;
    const issueMessage =
      bodyRecord && Array.isArray(bodyRecord.issues)
        ? bodyRecord.issues
            .flatMap((issue) =>
              issue &&
              typeof issue === 'object' &&
              'message' in issue &&
              typeof issue.message === 'string'
                ? [issue.message]
                : [],
            )
            .join(' ')
        : '';
    const message =
      issueMessage ||
      (bodyRecord && typeof bodyRecord.error === 'string'
        ? bodyRecord.error
        : `Request failed (${response.status}).`);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const targetsApi = {
  list: async (token: string) => {
    const response = await request<{ targets: ApiAnalysisTarget[] }>(
      '/api/analysis-targets',
      token,
    );
    return response.targets.map((target) => toAnalysisTarget(target));
  },
  get: async (token: string, id: string) => {
    const response = await request<ApiTargetWorkspace>(
      `/api/analysis-targets/${encodeURIComponent(id)}`,
      token,
    );
    return toAnalysisTarget(response.target, response.latestIngestion);
  },
  create: async (token: string, data: NewAnalysisTarget) => {
    const response = await request<{ target: ApiAnalysisTarget }>(
      '/api/analysis-targets',
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          entityName: data.name,
          platform: 'google',
          sourceUrl: data.sourceReference,
        }),
      },
    );
    return toAnalysisTarget(response.target);
  },
  ingest: (token: string, id: string) =>
    request<{ attempt: ApiIngestionAttempt }>(
      `/api/analysis-targets/${encodeURIComponent(id)}/ingestions`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),
  ask: async (token: string, targetId: string, question: string) => {
    const response = await request<{ answer: string }>(
      `/api/analysis-targets/${encodeURIComponent(targetId)}/questions`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ question }),
      },
    );

    return response.answer;
  },
};
