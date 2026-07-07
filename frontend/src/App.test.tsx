import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServiceStatus } from './hooks/useServiceStatus';
import type { SourceFeedConfig } from './types';
import App from './App';

const apiMock = vi.hoisted(() => ({
  createFeed: vi.fn(),
  deleteFeed: vi.fn(),
  getAdminSession: vi.fn(),
  listFeeds: vi.fn(),
  loginAdminSession: vi.fn(),
  logoutAdminSession: vi.fn(),
  onSessionExpired: vi.fn(),
  updateFeed: vi.fn(),
}));

const statusMock = vi.hoisted(() => ({
  status: {
    serviceName: 'calendarmerge',
    state: 'success',
    healthy: true,
    sourceFeedCount: 0,
    mergedEventCount: 0,
    gamesOnlyMergedEventCount: 0,
    calendarPublished: false,
    gamesOnlyCalendarPublished: false,
    servedLastKnownGood: false,
    sourceStatuses: [],
    suspectFeeds: [],
    output: {},
    errorSummary: [],
    adminInsightsAvailable: true,
  } as ServiceStatus,
}));

const baseStatus = (): ServiceStatus => ({
  serviceName: 'calendarmerge',
  state: 'success',
  healthy: true,
  sourceFeedCount: 0,
  mergedEventCount: 0,
  gamesOnlyMergedEventCount: 0,
  calendarPublished: false,
  gamesOnlyCalendarPublished: false,
  servedLastKnownGood: false,
  sourceStatuses: [],
  suspectFeeds: [],
  output: {},
  errorSummary: [],
  adminInsightsAvailable: true,
});

vi.mock('./api/feedsApi', () => ({
  createFeed: apiMock.createFeed,
  deleteFeed: apiMock.deleteFeed,
  getAdminSession: apiMock.getAdminSession,
  listFeeds: apiMock.listFeeds,
  loginAdminSession: apiMock.loginAdminSession,
  logoutAdminSession: apiMock.logoutAdminSession,
  onSessionExpired: apiMock.onSessionExpired,
  updateFeed: apiMock.updateFeed,
}));

vi.mock('./hooks/useServiceStatus', async () => {
  const actual = await vi.importActual<typeof import('./hooks/useServiceStatus')>('./hooks/useServiceStatus');
  return {
    ...actual,
    useServiceStatus: vi.fn(() => ({
      data: statusMock.status,
      isLoading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue({ data: statusMock.status }),
    })),
  };
});

vi.mock('./hooks/useManualRefresh', () => ({
  useManualRefresh: () => ({
    refresh: vi.fn().mockResolvedValue(undefined),
    isRefreshing: false,
    result: undefined,
    error: null,
  }),
}));

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>,
  );
}

const feeds: SourceFeedConfig[] = [
  {
    id: 'school',
    name: 'School Calendar',
    url: 'https://example.com/school.ics',
  },
  {
    id: 'sports',
    name: 'Sports Calendar',
    url: 'https://example.com/sports.ics',
  },
];

describe('App setup flow', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    statusMock.status = baseStatus();
    vi.clearAllMocks();
  });

  it('opens the setup panel after signing in when no feeds exist', async () => {
    const user = userEvent.setup();
    apiMock.onSessionExpired.mockReturnValue(vi.fn());
    apiMock.getAdminSession.mockResolvedValue({ authenticated: false, configured: true });
    apiMock.loginAdminSession.mockResolvedValue({ authenticated: true });
    apiMock.listFeeds.mockResolvedValue([]);

    renderWithClient(<App />);

    await user.type(await screen.findByLabelText(/admin access code/i), 'family-code');
    await user.click(screen.getAllByRole('button', { name: /sign in/i })[0]);

    expect(await screen.findByRole('heading', { name: /add calendar feeds/i })).toBeInTheDocument();
    expect(screen.getByText('Setup checklist')).toBeInTheDocument();
    expect(screen.getByText(/get subscription links/i)).toBeInTheDocument();
  });

  it('uses a setup landing on the setup URL before sign-in', async () => {
    window.history.pushState({}, '', '/manage/?setup=1');
    apiMock.onSessionExpired.mockReturnValue(vi.fn());
    apiMock.getAdminSession.mockResolvedValue({ authenticated: false, configured: true });
    statusMock.status = {
      ...statusMock.status,
      sourceFeedCount: 3,
      mergedEventCount: 123,
      gamesOnlyMergedEventCount: 50,
    };

    renderWithClient(<App />);

    expect(await screen.findByRole('heading', { name: /build one family calendar/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in above to view existing feeds and continue setup/i)).toBeInTheDocument();
    expect(screen.getByText('GameChanger')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add calendars/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search feeds/i)).not.toBeInTheDocument();
  });

  it('reloads feeds once after a bulk enable or disable action', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/manage/?setup=1');
    apiMock.onSessionExpired.mockReturnValue(vi.fn());
    apiMock.getAdminSession.mockResolvedValue({ authenticated: true, configured: true });
    apiMock.listFeeds.mockResolvedValue(feeds);
    apiMock.updateFeed.mockResolvedValue(feeds[0]);
    statusMock.status = {
      ...statusMock.status,
      sourceFeedCount: feeds.length,
      sourceStatuses: feeds.map((feed) => ({
        id: feed.id,
        name: feed.name,
        ok: true,
        attemptedAt: '2026-06-10T12:00:00.000Z',
        durationMs: 100,
        eventCount: 4,
      })),
    };

    renderWithClient(<App />);

    await screen.findByText('School Calendar');
    expect(apiMock.listFeeds).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('checkbox', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /turn off selected/i }));

    await waitFor(() => {
      expect(apiMock.updateFeed).toHaveBeenCalledTimes(2);
      expect(apiMock.listFeeds).toHaveBeenCalledTimes(2);
    });
    expect(apiMock.updateFeed).toHaveBeenCalledWith('school', { enabled: false });
    expect(apiMock.updateFeed).toHaveBeenCalledWith('sports', { enabled: false });
  });
});
