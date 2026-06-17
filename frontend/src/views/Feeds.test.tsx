import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockStatus, resetStatusMock } from '../test/mockServiceStatus';
import type { ServiceStatus } from '../hooks/useServiceStatus';
import type { SourceFeedConfig } from '../types';
import Feeds from './Feeds';

const manualRefreshMock = vi.hoisted(() => ({
  refresh: vi.fn(),
  isRefreshing: false,
}));

vi.mock('../hooks/useManualRefresh', () => ({
  useManualRefresh: () => ({
    refresh: manualRefreshMock.refresh,
    isRefreshing: manualRefreshMock.isRefreshing,
    result: undefined,
    error: null,
  }),
}));

const feeds: SourceFeedConfig[] = [
  {
    id: 'school',
    name: 'School Calendar',
    url: 'https://example.com/school.ics',
  },
  {
    id: 'sports',
    name: 'Sports Calendar With A Very Long URL',
    url: 'https://example.com/very/long/calendar.ics?token=secret',
  },
];

const status: ServiceStatus = {
  serviceName: 'calendarmerge',
  state: 'success',
  healthy: true,
  sourceFeedCount: feeds.length,
  mergedEventCount: 12,
  gamesOnlyMergedEventCount: 4,
  calendarPublished: true,
  gamesOnlyCalendarPublished: true,
  servedLastKnownGood: false,
  sourceStatuses: feeds.map((feed, index) => ({
    id: feed.id,
    name: feed.name,
    url: feed.url,
    ok: true,
    attemptedAt: '2026-06-10T12:00:00.000Z',
    durationMs: 100 + index,
    eventCount: 6 + index,
  })),
  suspectFeeds: [],
  output: {},
  errorSummary: [],
};

function renderFeeds(overrides: Partial<ComponentProps<typeof Feeds>> = {}) {
  const props: ComponentProps<typeof Feeds> = {
    feeds,
    loading: false,
    error: null,
    hasAdminSession: true,
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onCreateMany: vi.fn().mockResolvedValue({ created: [], failed: [] }),
    setError: vi.fn(),
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    ...overrides,
  };

  return {
    user: userEvent.setup(),
    ...render(<Feeds {...props} />),
    props,
  };
}

describe('Feeds', () => {
  afterEach(() => {
    resetStatusMock();
    manualRefreshMock.refresh.mockReset();
    manualRefreshMock.isRefreshing = false;
    vi.restoreAllMocks();
  });

  it('wraps long feed URLs and exposes copy/open actions on feed cards', () => {
    mockStatus(status);
    renderFeeds();

    const url = screen.getByText('https://example.com/very/long/calendar.ics?token=secret');
    expect(url).toHaveClass('break-all');
    expect(url).toHaveClass('sm:truncate');

    expect(screen.getAllByRole('button', { name: /copy url/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /open/i })[1]).toHaveAttribute(
      'href',
      'https://example.com/very/long/calendar.ics?token=secret',
    );
  });

  it('uses plain-language bulk actions after selecting feeds', async () => {
    mockStatus(status);
    const { user } = renderFeeds();

    await user.click(screen.getByRole('checkbox', { name: /select all/i }));

    expect(screen.getByRole('button', { name: /turn on selected/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /turn off selected/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable for 15 days/i })).toBeInTheDocument();
  });

  it('surfaces refresh request failures with page error state and a toast', async () => {
    mockStatus(status);
    manualRefreshMock.refresh.mockRejectedValueOnce(new Error('API Error 404'));
    const { user, props } = renderFeeds();

    await user.click(screen.getByRole('button', { name: /refresh now/i }));

    await waitFor(() => {
      expect(props.setError).toHaveBeenCalledWith('API Error 404');
      expect(props.toast.error).toHaveBeenCalledWith('Refresh failed', 'API Error 404');
    });
  });

  it('confirms successful refresh requests with a toast', async () => {
    mockStatus(
      { ...status, lastAttemptedRefresh: '2026-06-10T12:00:00.000Z' },
      { ...status, lastAttemptedRefresh: '2026-06-10T12:05:00.000Z' },
    );
    manualRefreshMock.refresh.mockResolvedValueOnce(undefined);
    const { user, props } = renderFeeds();

    await user.click(screen.getByRole('button', { name: /refresh now/i }));

    await waitFor(() => {
      expect(props.toast.success).toHaveBeenCalledWith(
        'Refresh complete',
        'Calendar status is now up to date.',
      );
    });
  });
});
