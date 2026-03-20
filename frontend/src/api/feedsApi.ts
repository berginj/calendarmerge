import { SourceFeedConfig } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function listFeeds(): Promise<SourceFeedConfig[]> {
  try {
    const res = await fetch(`${API_BASE}/feeds`);

    if (!res.ok) {
      // Try to get error details from response
      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const error = await res.json();
        throw new Error(error.details || error.error || `API Error: ${res.status} ${res.statusText}`);
      } else {
        // Non-JSON response (HTML error page)
        const text = await res.text();
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          throw new Error(`Server returned HTML error page (${res.status}). The backend API may not be deployed correctly. Check: ${API_BASE}/feeds`);
        }
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
      }
    }

    const data = await res.json();
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
  const res = await fetch(`${API_BASE}/feeds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feed),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create feed');
  }

  const data = await res.json();
  return data.feed;
}

export async function updateFeed(
  feedId: string,
  updates: { name?: string; url?: string; enabled?: boolean }
): Promise<SourceFeedConfig> {
  const res = await fetch(`${API_BASE}/feeds/${feedId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update feed');
  }

  const data = await res.json();
  return data.feed;
}

export async function deleteFeed(feedId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/feeds/${feedId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete feed');
  }
}

// Settings API

export interface AppSettings {
  refreshSchedule: 'every-15-min' | 'hourly' | 'every-2-hours' | 'business-hours' | 'manual-only';
  lastUpdated: string;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const res = await fetch(`${API_BASE}/settings`);

    if (!res.ok) {
      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const error = await res.json();
        throw new Error(error.details || error.error || `API Error: ${res.status}`);
      } else {
        throw new Error(`Settings API returned error (${res.status}). Backend may be initializing. Try refreshing in a moment.`);
      }
    }

    const data = await res.json();
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
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update settings');
  }

  const data = await res.json();
  return data.settings;
}
