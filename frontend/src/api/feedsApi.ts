import { SourceFeedConfig } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const FUNCTIONS_KEY_STORAGE_KEY = 'calendarmerge_functions_key';

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

// SECURITY: Use sessionStorage instead of localStorage to reduce XSS exposure
// sessionStorage clears when browser/tab closes, limiting credential lifetime
function getStoredFunctionsKey(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.sessionStorage.getItem(FUNCTIONS_KEY_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

function getFunctionsKey(): string {
  return getStoredFunctionsKey();
}

export function loadSavedFunctionsKey(): string {
  return getStoredFunctionsKey();
}

export function saveFunctionsKey(value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    window.sessionStorage.removeItem(FUNCTIONS_KEY_STORAGE_KEY);
    return;
  }

  // SECURITY: Keys now stored in sessionStorage (cleared on browser close)
  window.sessionStorage.setItem(FUNCTIONS_KEY_STORAGE_KEY, trimmed);
}

export function clearFunctionsKey(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(FUNCTIONS_KEY_STORAGE_KEY);
}

async function parseApiError(response: Response, requiresAdmin: boolean): Promise<Error> {
  if ((response.status === 401 || response.status === 403) && requiresAdmin) {
    return new Error('Admin function key is missing or invalid. Update it in the UI and try again.');
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
  const functionsKey = requiresAdmin ? getFunctionsKey() : '';
  if (functionsKey) {
    headers.set('x-functions-key', functionsKey);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
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

export interface AppSettings {
  refreshSchedule: 'every-15-min' | 'hourly' | 'every-2-hours' | 'business-hours' | 'manual-only';
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
