import { SourceFeedConfig } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

interface ApiErrorBody {
  status?: 'error';
  error?: string | {
    code?: string;
    message?: string;
    details?: string;
    validationErrors?: Record<string, string[]>;
  };
  details?: string | string[];
}

async function parseApiError(response: Response, requiresAdmin: boolean): Promise<Error> {
  if ((response.status === 401 || response.status === 403) && requiresAdmin) {
    return new Error('Admin session is missing or expired. Sign in again and try again.');
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    const error = (await response.json()) as ApiErrorBody;
    if (error.error && typeof error.error === 'object') {
      const validationErrors = error.error.validationErrors
        ? Object.values(error.error.validationErrors).flat().join(', ')
        : '';
      return new Error(
        validationErrors ||
        error.error.details ||
        error.error.message ||
        `API Error: ${response.status} ${response.statusText}`,
      );
    }

    const details = Array.isArray(error.details) ? error.details.join(', ') : error.details;
    return new Error(details || error.error || `API Error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    return new Error(
      `Server returned HTML error page (${response.status}). The backend API may not be deployed correctly. Check: ${response.url}`,
    );
  }

  return new Error(text || `API Error: ${response.status} ${response.statusText}`);
}

interface ApiSuccessEnvelope<T> {
  requestId: string;
  status: 'success' | 'partial-success';
  data: T;
  message?: string;
  warnings?: string[];
}

export async function requestJson<T>(path: string, init?: RequestInit, requiresAdmin = false): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw await parseApiError(response, requiresAdmin);
  }

  const body = await response.json();
  if (
    body &&
    typeof body === 'object' &&
    ('status' in body) &&
    ((body as ApiSuccessEnvelope<T>).status === 'success' || (body as ApiSuccessEnvelope<T>).status === 'partial-success') &&
    'data' in body
  ) {
    return (body as ApiSuccessEnvelope<T>).data;
  }

  return body as T;
}

export async function listFeeds(): Promise<SourceFeedConfig[]> {
  try {
    const data = await requestJson<{ feeds: SourceFeedConfig[] }>('/feeds', undefined, true);
    return data.feeds;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to fetch feeds: ' + String(error));
  }
}

export async function createFeed(feed: {
  name: string;
  url: string;
  id?: string;
}): Promise<SourceFeedConfig> {
  const data = await requestJson<{ feed: SourceFeedConfig }>(
    '/feeds',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feed),
    },
    true,
  );

  return data.feed;
}

export async function updateFeed(
  feedId: string,
  updates: { name?: string; url?: string; enabled?: boolean }
): Promise<SourceFeedConfig> {
  const data = await requestJson<{ feed: SourceFeedConfig }>(
    `/feeds/${feedId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    },
    true,
  );

  return data.feed;
}

export async function deleteFeed(feedId: string): Promise<void> {
  await requestJson<Record<string, never>>(
    `/feeds/${feedId}`,
    {
      method: 'DELETE',
    },
    true,
  );
}

export async function triggerManualRefresh(): Promise<unknown> {
  return requestJson<unknown>(
    '/refresh',
    {
      method: 'POST',
    },
    true,
  );
}

export interface AdminSessionResponse {
  authenticated: boolean;
  configured?: boolean;
}

export async function loginAdminSession(accessCode: string): Promise<AdminSessionResponse> {
  const data = await requestJson<{ authenticated: boolean }>('/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode }),
  });

  return data;
}

export async function logoutAdminSession(): Promise<void> {
  await requestJson<Record<string, never>>('/admin/session', {
    method: 'DELETE',
  });
}

export async function getAdminSession(): Promise<AdminSessionResponse> {
  return requestJson<AdminSessionResponse>('/admin/session');
}

export interface GameFilterRules {
  forceIncludeFeedIds: string[];
  forceExcludeFeedIds: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  includeRegex: string[];
  excludeRegex: string[];
  teamAliases: string[];
}

export type RefreshSchedule =
  | 'every-15-min'
  | 'hourly'
  | 'every-2-hours'
  | 'every-4-hours'
  | 'business-hours'
  | 'manual-only';

export interface GameFilterPreview {
  sourceFeedCount: number;
  fetchedFeedCount: number;
  failedFeedCount: number;
  candidateEventCount: number;
  publicEventCount: number;
  matchedGameCount: number;
  excludedEventCount: number;
  cancelledEventsFiltered: number;
  failedFeeds: Array<{ id: string; name: string; error: string }>;
  matchedSamples: Array<{ title: string; start: string; sourceName: string; location?: string }>;
  excludedSamples: Array<{ title: string; start: string; sourceName: string; location?: string }>;
}

export interface AppSettings {
  refreshSchedule: RefreshSchedule;
  gameFilter: GameFilterRules;
  lastUpdated: string;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = await requestJson<{ settings: AppSettings }>('/settings');
    return data.settings;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to get settings: ' + String(error));
  }
}

export async function updateSettings(
  settings: Partial<AppSettings>
): Promise<AppSettings> {
  const data = await requestJson<{ settings: AppSettings }>(
    '/settings',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    },
    true,
  );

  return data.settings;
}

export async function previewGameFilter(gameFilter: GameFilterRules): Promise<GameFilterPreview> {
  const data = await requestJson<{ preview: GameFilterPreview }>(
    '/settings/game-filter/preview',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameFilter }),
    },
    true,
  );

  return data.preview;
}
