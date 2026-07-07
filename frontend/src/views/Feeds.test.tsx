import { render, screen, waitFor, within } from '@testing-library/react';
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
    setupOpen: false,
    mergedCalendarUrl: 'https://example.com/calendar.ics',
    gamesCalendarUrl: 'https://example.com/calendar-games.ics',
    publicCalendarUrl: 'https://example.com/index.html',
    gamesSubscribeUrl: 'https://example.com/games',
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onUpdateMany: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onDeleteMany: vi.fn().mockResolvedValue(undefined),
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

  it('opens the setup panel automatically for first-run setup', async () => {
    mockStatus({ ...status, sourceStatuses: [] });
    renderFeeds({ feeds: [], setupOpen: true });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add calendar feeds/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Setup checklist')).toBeInTheDocument();
  });

  it('shows a setup landing instead of disabled feed tools before sign-in', () => {
    mockStatus(status);
    renderFeeds({ hasAdminSession: false, feeds: [] });

    expect(screen.getByRole('heading', { name: /build one family calendar/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in above to view existing feeds and continue setup/i)).toBeInTheDocument();
    expect(screen.getByText('GameChanger')).toBeInTheDocument();
    expect(screen.getByText('SportsEngine')).toBeInTheDocument();
    expect(screen.getByText(/text or email the link to yourself/i)).toBeInTheDocument();
    const publishedCard = screen.getByText('Current published calendar').closest('div');
    expect(publishedCard).not.toBeNull();
    expect(within(publishedCard as HTMLElement).getByText('2')).toBeInTheDocument();
    expect(within(publishedCard as HTMLElement).getByText('12')).toBeInTheDocument();
    expect(within(publishedCard as HTMLElement).getByText('4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add calendars/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search feeds/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/an admin session is required to load feed urls/i)).not.toBeInTheDocument();
  });

  it('shows pending first refresh when a feed has no health result yet', () => {
    mockStatus({ ...status, sourceStatuses: [], suspectFeeds: [] });
    renderFeeds();

    expect(screen.getAllByText('Pending first refresh')).toHaveLength(2);
    expect(screen.queryByText(/failed \(0x\)/i)).not.toBeInTheDocument();
  });

  it('uses soft-delete for bulk disable-for-15-days actions', async () => {
    mockStatus(status);
    const onUpdateMany = vi.fn().mockResolvedValue(undefined);
    const onDeleteMany = vi.fn().mockResolvedValue(undefined);
    const { user } = renderFeeds({ onUpdateMany, onDeleteMany });

    await user.click(screen.getByRole('checkbox', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /disable for 15 days/i }));
    await user.click(screen.getByRole('button', { name: /^disable$/i }));

    expect(onDeleteMany).toHaveBeenCalledWith(['school', 'sports']);
    expect(onUpdateMany).not.toHaveBeenCalled();
  });

  it('keeps setup users oriented after adding feeds', async () => {
    mockStatus(status);
    const onCreateMany = vi.fn().mockResolvedValue({
      created: [feeds[0]],
      failed: [],
    });
    const { user } = renderFeeds({ setupOpen: true, onCreateMany });

    await user.type(
      await screen.findByLabelText(/calendar subscription links/i),
      'Parker GameChanger | webcal://example.gc.com/team-calendar.ics',
    );
    await user.click(screen.getByRole('button', { name: /add 1 calendar/i }));

    expect(await screen.findByText('Calendars added')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run first refresh/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy merged link/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open public calendar/i })).toHaveAttribute('href', 'https://example.com/index.html');
    expect(screen.getByRole('link', { name: /open games subscribe page/i })).toHaveAttribute('href', 'https://example.com/games');
    expect(screen.queryByRole('heading', { name: /add calendar feeds/i })).not.toBeInTheDocument();
    expect(screen.getByText('How to subscribe')).toBeInTheDocument();
    expect(screen.getAllByText('Google Calendar').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Apple Calendar')).toBeInTheDocument();
    expect(screen.getByText('Outlook')).toBeInTheDocument();
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
