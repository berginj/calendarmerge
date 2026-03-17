import { SourceFeedConfig } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function listFeeds(): Promise<SourceFeedConfig[]> {
  const res = await fetch(`${API_BASE}/feeds`);
  if (!res.ok) {
    throw new Error('Failed to fetch feeds');
  }
  const data = await res.json();
  return data.feeds;
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
