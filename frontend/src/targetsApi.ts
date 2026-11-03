export interface AnalysisTarget {
  id: string;
  name: string;
  platform: string;
  sourceReference: string;
  ingestionStatus?: string | null;
}

export interface NewAnalysisTarget {
  name: string;
  platform: 'google_maps';
  sourceReference: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

// These routes and payload names are a proposed contract, not yet confirmed backend routes.
export const targetsApi = {
  list: (token: string) => request<AnalysisTarget[]>('/api/targets', token),
  get: (token: string, id: string) =>
    request<AnalysisTarget>(`/api/targets/${encodeURIComponent(id)}`, token),
  create: (token: string, data: NewAnalysisTarget) =>
    request<AnalysisTarget>('/api/targets', token, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  ingest: (token: string, id: string) =>
    request<{ status: string }>(
      `/api/targets/${encodeURIComponent(id)}/ingest`,
      token,
      {
        method: 'POST',
      },
    ),
};
