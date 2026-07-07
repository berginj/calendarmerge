import { useEffect, useState } from 'react';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useManualRefresh } from '../hooks/useManualRefresh';
import { Card, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Switch from '../components/ui/Switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/DropdownMenu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/AlertDialog';
import { RefreshCw, Plus, MoreVertical, Edit, Trash, Search, CheckCircle, AlertTriangle, XCircle, CircleOff, Rss, Copy, ExternalLink, Clock } from 'lucide-react';
import { BulkFeedCreateResult, NewSourceFeedInput, SourceFeedConfig } from '../types';
import FeedForm from '../components/FeedForm';
import BulkFeedForm from '../components/BulkFeedForm';
import { clsx } from 'clsx';

interface EnhancedFeedsProps {
  feeds: SourceFeedConfig[];
  loading: boolean;
  error: string | null;
  hasAdminSession: boolean;
  setupOpen?: boolean;
  mergedCalendarUrl: string;
  gamesCalendarUrl: string;
  publicCalendarUrl: string;
  gamesSubscribeUrl: string;
  onUpdate: (feedId: string, updates: { name?: string; url?: string; enabled?: boolean }) => Promise<void>;
  onUpdateMany: (updates: Array<{ feedId: string; updates: { name?: string; url?: string; enabled?: boolean } }>) => Promise<void>;
  onDelete: (feedId: string) => Promise<void>;
  onDeleteMany: (feedIds: string[]) => Promise<void>;
  onCreateMany: (feeds: NewSourceFeedInput[]) => Promise<BulkFeedCreateResult>;
  setError: (error: string | null) => void;
  toast: {
    success: (title: string, description?: string) => string;
    error: (title: string, description?: string) => string;
    warning: (title: string, description?: string) => string;
    info: (title: string, description?: string) => string;
  };
}

type ConfirmAction =
  | { type: 'single'; feedId: string; feedName: string }
  | { type: 'bulk'; feedIds: string[]; count: number }
  | null;

interface FeedHealth {
  status: 'pending' | 'healthy' | 'suspect' | 'failed';
  ok: boolean;
  eventCount: number;
  previousEventCount?: number;
  suspect: boolean;
  consecutiveFailures: number;
  error?: string;
}

export default function Feeds({
  feeds,
  loading,
  error,
  hasAdminSession,
  setupOpen = false,
  mergedCalendarUrl,
  gamesCalendarUrl,
  publicCalendarUrl,
  gamesSubscribeUrl,
  onUpdate,
  onUpdateMany,
  onDelete,
  onDeleteMany,
  onCreateMany,
  setError,
  toast,
}: EnhancedFeedsProps) {
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'healthy' | 'suspect' | 'failed' | 'disabled'>('all');
  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [copiedCalendar, setCopiedCalendar] = useState<'merged' | 'games' | null>(null);
  const { data: status, refetch: refetchStatus } = useServiceStatus(hasAdminSession);
  const { refresh, isRefreshing } = useManualRefresh();
  const [isPolling, setIsPolling] = useState(false);
  const refreshing = isRefreshing || isPolling;

  useEffect(() => {
    if (setupOpen) {
      setShowForm(true);
    }
  }, [setupOpen]);

  const waitForRefreshCompletion = async (previousTimestamp?: string) => {
    for (let attempt = 0; attempt < 15; attempt++) {
      const { data } = await refetchStatus();
      if (data?.lastAttemptedRefresh && data.lastAttemptedRefresh !== previousTimestamp) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    return false;
  };

  const handleRefreshNow = async () => {
    const previousTimestamp = status?.lastAttemptedRefresh;
    try {
      setError(null);
      await refresh();
      toast.info('Refresh started', 'Fetching the latest events from your feeds…');
      setIsPolling(true);
      const completed = await waitForRefreshCompletion(previousTimestamp);
      if (completed) {
        toast.success('Refresh complete', 'Calendar status is now up to date.');
      } else {
        toast.info('Still refreshing', 'This is taking longer than usual — status will update automatically.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request refresh';
      setError(message);
      toast.error('Refresh failed', message);
    } finally {
      setIsPolling(false);
    }
  };

  const handleCreateMany = async (newFeeds: NewSourceFeedInput[]) => {
    try {
      const result = await onCreateMany(newFeeds);
      if (result.created.length > 0) {
        setSetupCompleted(true);
        setShowForm(result.failed.length > 0);
      }
      return result;
    } catch (err) {
      // Error already handled by parent
      return {
        created: [],
        failed: newFeeds.map((feed) => ({
          feed,
          error: err instanceof Error ? err.message : 'Failed to create feed',
        })),
      };
    }
  };

  const handleToggleEnabled = async (feedId: string, enabled: boolean) => {
    try {
      setError(null);
      await onUpdate(feedId, { enabled });
    } catch (err) {
      // Error handled by parent
    }
  };

  // Bulk operations
  const toggleSelectAll = () => {
    if (selectedFeeds.size === filteredFeeds.length) {
      setSelectedFeeds(new Set());
    } else {
      setSelectedFeeds(new Set(filteredFeeds.map(f => f.id)));
    }
  };

  const toggleSelectFeed = (feedId: string) => {
    const newSelection = new Set(selectedFeeds);
    if (newSelection.has(feedId)) {
      newSelection.delete(feedId);
    } else {
      newSelection.add(feedId);
    }
    setSelectedFeeds(newSelection);
  };

  const handleBulkEnable = async () => {
    await onUpdateMany(Array.from(selectedFeeds).map((feedId) => ({ feedId, updates: { enabled: true } })));
    setSelectedFeeds(new Set());
  };

  const handleBulkDisable = async () => {
    await onUpdateMany(Array.from(selectedFeeds).map((feedId) => ({ feedId, updates: { enabled: false } })));
    setSelectedFeeds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedFeeds.size === 0) {
      return;
    }

    setConfirmAction({
      type: 'bulk',
      feedIds: Array.from(selectedFeeds),
      count: selectedFeeds.size,
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return;
    }

    setIsConfirmingAction(true);

    try {
      if (confirmAction.type === 'single') {
        await onDelete(confirmAction.feedId);
      } else {
        await onDeleteMany(confirmAction.feedIds);
        setSelectedFeeds(new Set());
      }
    } finally {
      setIsConfirmingAction(false);
      setConfirmAction(null);
    }
  };

  const getFeedHealth = (feedId: string) => {
    const feedStatus = status?.sourceStatuses?.find(f => f.id === feedId);
    const isSuspect = status?.suspectFeeds?.includes(feedId);

    if (!feedStatus?.attemptedAt) {
      return {
        status: 'pending',
        ok: false,
        eventCount: 0,
        suspect: false,
        consecutiveFailures: 0,
      } satisfies FeedHealth;
    }

    const healthStatus = !feedStatus.ok ? 'failed' : isSuspect ? 'suspect' : 'healthy';

    return {
      status: healthStatus,
      ok: feedStatus?.ok ?? false,
      eventCount: feedStatus?.eventCount ?? 0,
      previousEventCount: feedStatus?.previousEventCount,
      suspect: isSuspect ?? false,
      consecutiveFailures: feedStatus?.consecutiveFailures ?? 0,
      error: feedStatus?.error,
    } satisfies FeedHealth;
  };

  const copyCalendarLink = async (kind: 'merged' | 'games', url: string) => {
    try {
      await navigator.clipboard?.writeText(url);
      setCopiedCalendar(kind);
      window.setTimeout(() => setCopiedCalendar(null), 1500);
      toast.success(kind === 'merged' ? 'Merged calendar link copied' : 'Games calendar link copied');
    } catch {
      toast.error('Copy failed', 'Copy the calendar link from Settings instead.');
    }
  };

  // Filter feeds
  const filteredFeeds = feeds.filter(feed => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!feed.name.toLowerCase().includes(query) &&
          !feed.url.toLowerCase().includes(query) &&
          !feed.id.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Status filter
    if (filter !== 'all') {
      const health = getFeedHealth(feed.id);

      if (filter === 'healthy' && (feed.enabled === false || health.status !== 'healthy')) return false;
      if (filter === 'suspect' && !health.suspect) return false;
      if (filter === 'failed' && (feed.enabled === false || health.status !== 'failed')) return false;
      if (filter === 'disabled' && feed.enabled !== false) return false;
    }

    return true;
  });

  const healthyCount = feeds.filter(f => {
    const h = getFeedHealth(f.id);
    return f.enabled !== false && h.status === 'healthy';
  }).length;
  const suspectCount = status?.suspectFeeds?.length ?? 0;
  const activeFeedIds = new Set(feeds.filter(f => f.enabled !== false).map(f => f.id));
  const failedCount = status?.sourceStatuses?.filter(f => activeFeedIds.has(f.id) && f.attemptedAt && !f.ok).length ?? 0;
  const disabledCount = feeds.filter(f => f.enabled === false).length;
  const activeCount = feeds.length - disabledCount;
  const focusedSetup = setupOpen && feeds.length === 0 && !setupCompleted;

  if (!hasAdminSession) {
    return (
      <div className="space-y-6">
        <SignedOutSetupLanding
          sourceFeedCount={status?.sourceFeedCount}
          mergedEventCount={status?.mergedEventCount}
          gamesEventCount={status?.gamesOnlyMergedEventCount}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {focusedSetup ? (
        <SetupFocusHero />
      ) : (
        <Card className="border border-primary-100 bg-gradient-to-br from-white to-primary-50/70 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">
                  Feed Management
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Calendar feeds</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  Review {feeds.length} configured calendar feeds. {activeCount} active and {disabledCount} disabled.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/75 p-2 text-center shadow-inner">
                <div className="rounded-lg px-4 py-3">
                  <p className="text-2xl font-bold text-slate-950">{feeds.length}</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</p>
                </div>
                <div className="rounded-lg px-4 py-3">
                  <p className="text-2xl font-bold text-emerald-700">{activeCount}</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Active</p>
                </div>
                <div className="rounded-lg px-4 py-3">
                  <p className="text-2xl font-bold text-slate-600">{disabledCount}</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Disabled</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      {!focusedSetup && (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 w-full sm:max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search feeds..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            onClick={handleRefreshNow}
            disabled={refreshing || !hasAdminSession}
            variant="secondary"
            size="md"
          >
            <RefreshCw className={clsx('h-4 w-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Refresh Now'}
          </Button>

          <Button
            onClick={() => setShowForm(!showForm)}
            disabled={!hasAdminSession}
            variant="primary"
            size="md"
          >
            <Plus className="h-4 w-4" />
            Add Calendars
          </Button>
        </div>
      </div>
      )}

      {/* Bulk selection and actions */}
      {filteredFeeds.length > 0 && hasAdminSession && (
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedFeeds.size === filteredFeeds.length && filteredFeeds.length > 0}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-slate-300 text-primary-700 focus:ring-2 focus:ring-primary-700"
            />
            Select All ({selectedFeeds.size} selected)
          </label>

          {selectedFeeds.size > 0 && (
            <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
              <Button onClick={handleBulkEnable} variant="secondary" size="sm">
                <CheckCircle className="h-4 w-4" />
                Turn On Selected
              </Button>
              <Button onClick={handleBulkDisable} variant="secondary" size="sm">
                <XCircle className="h-4 w-4" />
                Turn Off Selected
              </Button>
              <Button onClick={handleBulkDelete} variant="danger" size="sm">
                <Trash className="h-4 w-4" />
                Disable for 15 Days
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Filter chips */}
      {!focusedSetup && (
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="All"
          count={feeds.length}
        />
        <FilterChip
          active={filter === 'healthy'}
          onClick={() => setFilter('healthy')}
          label="Healthy"
          count={healthyCount}
          variant="success"
        />
        {suspectCount > 0 && (
          <FilterChip
            active={filter === 'suspect'}
            onClick={() => setFilter('suspect')}
            label="Suspect"
            count={suspectCount}
            variant="warning"
          />
        )}
        {failedCount > 0 && (
          <FilterChip
            active={filter === 'failed'}
            onClick={() => setFilter('failed')}
            label="Failed"
            count={failedCount}
            variant="error"
          />
        )}
        {disabledCount > 0 && (
          <FilterChip
            active={filter === 'disabled'}
            onClick={() => setFilter('disabled')}
            label="Disabled"
            count={disabledCount}
            variant="neutral"
          />
        )}
      </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            ×
          </button>
        </div>
      )}

      {hasAdminSession && (setupOpen || showForm || setupCompleted) && (
        <SetupChecklist completed={setupCompleted} />
      )}

      {/* Feed setup form */}
      {showForm && hasAdminSession && (
        <Card>
          <CardContent className="p-6">
            <BulkFeedForm
              onSubmit={handleCreateMany}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      )}

      {setupCompleted && (
        <Card className="border border-green-200 bg-green-50">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-semibold text-green-950">Calendars added</h3>
                <p className="mt-1 text-sm text-green-900">
                  Run a refresh now, then copy the merged calendar link into Apple Calendar, Google Calendar, or Outlook.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="primary" size="sm" onClick={handleRefreshNow} disabled={refreshing}>
                  <RefreshCw className={clsx('h-4 w-4', refreshing && 'animate-spin')} />
                  {refreshing ? 'Refreshing...' : 'Run First Refresh'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => copyCalendarLink('merged', mergedCalendarUrl)}>
                  <Copy className="h-4 w-4" />
                  {copiedCalendar === 'merged' ? 'Copied' : 'Copy Merged Link'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => copyCalendarLink('games', gamesCalendarUrl)}>
                  <Copy className="h-4 w-4" />
                  {copiedCalendar === 'games' ? 'Copied' : 'Copy Games Link'}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-green-200 pt-4 sm:grid-cols-2">
              <a
                href={publicCalendarUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-white/80 px-3 py-2 text-sm font-medium text-green-950 hover:bg-white"
              >
                <ExternalLink className="h-4 w-4" />
                Open Public Calendar
              </a>
              <a
                href={gamesSubscribeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-white/80 px-3 py-2 text-sm font-medium text-green-950 hover:bg-white"
              >
                <ExternalLink className="h-4 w-4" />
                Open Games Subscribe Page
              </a>
            </div>
            <SubscriptionInstructions />
          </CardContent>
        </Card>
      )}

      {/* Feed list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                  <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : feeds.length === 0 && !error && !showForm ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-center py-12 px-4">
              <Rss className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No calendar feeds yet</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                Add your first calendar feed to start merging events from sports platforms,
                school calendars, or any ICS-compatible source.
              </p>
              <Button onClick={() => setShowForm(true)} variant="primary" size="md">
                <Plus className="h-4 w-4" />
                Add Calendars
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : feeds.length === 0 ? null : filteredFeeds.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="h-12 w-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600">No feeds match your search or filter.</p>
            {(searchQuery || filter !== 'all') && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredFeeds.map(feed => (
            <EnhancedFeedCard
              key={feed.id}
              feed={feed}
              feedHealth={getFeedHealth(feed.id)}
              onUpdate={onUpdate}
              onDelete={(feedId) => {
                setConfirmAction({
                  type: 'single',
                  feedId,
                  feedName: feed.name,
                });
                return Promise.resolve();
              }}
              onToggleEnabled={handleToggleEnabled}
              selected={selectedFeeds.has(feed.id)}
              onSelectChange={toggleSelectFeed}
            />
          ))}
        </div>
      )}

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'bulk' ? 'Disable selected feeds?' : 'Disable this feed?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'bulk'
                ? `Disable ${confirmAction.count} feed(s)? They will remain visible for restore for 15 days.`
                : `Disable ${confirmAction?.feedName ?? 'this feed'}? It will remain visible for restore for 15 days.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary" size="sm">
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction} asChild>
              <Button type="button" variant="danger" size="sm" disabled={isConfirmingAction}>
                {isConfirmingAction ? 'Disabling...' : 'Disable'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Filter chip component
function FilterChip({
  active,
  onClick,
  label,
  count,
  variant = 'neutral',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  variant?: 'success' | 'warning' | 'error' | 'neutral';
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
        active ? (
          variant === 'success' ? 'bg-green-100 text-green-800 ring-2 ring-green-300' :
          variant === 'warning' ? 'bg-yellow-100 text-yellow-800 ring-2 ring-yellow-300' :
          variant === 'error' ? 'bg-red-100 text-red-800 ring-2 ring-red-300' :
          'bg-primary-100 text-primary-800 ring-2 ring-primary-300'
        ) : (
          'bg-slate-100 text-slate-600 hover:bg-slate-200'
        )
      )}
    >
      {label}
      <span className={clsx(
        'px-1.5 py-0.5 rounded-full text-xs font-semibold',
        active ? 'bg-white/50' : 'bg-slate-200'
      )}>
        {count}
      </span>
    </button>
  );
}

function SignedOutSetupLanding({
  sourceFeedCount,
  mergedEventCount,
  gamesEventCount,
}: {
  sourceFeedCount?: number;
  mergedEventCount?: number;
  gamesEventCount?: number;
}) {
  const checklist = [
    'Sign in with the admin access code',
    'Get subscription links from team and calendar apps',
    'Paste links into Add Calendars',
    'Add feeds and run the first refresh',
    'Copy the merged calendar link',
    'Subscribe in Apple Calendar, Google Calendar, or Outlook',
  ];

  const providers = ['GameChanger', 'SportsEngine', 'TeamSnap', 'TeamSideline', 'Google Calendar'];
  const hasPublishedCounts = typeof sourceFeedCount === 'number' || typeof mergedEventCount === 'number';

  return (
    <>
      <Card className="border border-primary-100 bg-gradient-to-br from-white to-primary-50/70 shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Setup</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">Build one family calendar</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Sign in to add team, school, and personal calendar subscription links. CalendarMerge keeps the
                published family calendars updated after setup.
              </p>
              <p className="mt-4 rounded-lg border border-primary-100 bg-white/80 p-3 text-sm font-medium text-slate-800">
                Sign in above to view existing feeds and continue setup. Feed URLs stay hidden until you are authenticated.
              </p>
            </div>

            <div className="rounded-xl bg-white/80 p-4 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current published calendar</p>
              {hasPublishedCounts ? (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold text-slate-950">{sourceFeedCount ?? '-'}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Feeds</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary-700">{mergedEventCount ?? '-'}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Events</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-700">{gamesEventCount ?? '-'}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Games</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">Status will appear here when the public calendar is available.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-blue-200 bg-blue-50">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
            <div>
              <h3 className="font-semibold text-blue-950">Setup checklist</h3>
              <p className="mt-1 text-sm text-blue-900">
                You can collect links on a phone, then paste them here after signing in.
              </p>
              <ol className="mt-4 grid grid-cols-1 gap-2 text-sm text-blue-950 sm:grid-cols-2">
                {checklist.map((step, index) => (
                  <li key={step} className="rounded-lg bg-white/80 px-3 py-2">
                    <span className="mr-1 font-semibold text-blue-700">{index + 1}.</span>{' '}
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-lg border border-blue-200 bg-white/80 p-4">
              <h4 className="text-sm font-semibold text-blue-950">Calendar links commonly come from</h4>
              <ul className="mt-3 space-y-2 text-sm text-blue-900">
                {providers.map((provider) => (
                  <li key={provider} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 flex-shrink-0 text-blue-700" />
                    {provider}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-blue-900">
                GameChanger and SportsEngine often expose subscription links inside their mobile experience. Text or
                email the link to yourself, or open this setup page on the same phone.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function SetupFocusHero() {
  return (
    <Card className="border border-primary-100 bg-gradient-to-br from-white to-primary-50/70 shadow-sm">
      <CardContent className="p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">First setup</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Add your calendar links</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Paste the subscription links from your team, school, and personal calendars below. After saving them,
          run the first refresh and copy the merged family calendar link.
        </p>
      </CardContent>
    </Card>
  );
}

function SetupChecklist({ completed }: { completed: boolean }) {
  const steps = [
    'Sign in',
    'Get subscription links',
    'Paste links',
    'Add feeds',
    'Run first refresh',
    'Copy merged calendar link',
    'Subscribe to merged calendar',
  ];

  return (
    <Card className="border border-blue-200 bg-blue-50">
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-blue-950">Setup checklist</h3>
            <p className="mt-1 text-sm text-blue-900">
              Collect the calendar subscription links from each team app, paste them here, then subscribe to the merged family calendar.
            </p>
          </div>
          <ol className="grid grid-cols-2 gap-2 text-xs font-medium text-blue-950 sm:grid-cols-3 lg:grid-cols-7">
            {steps.map((step, index) => (
              <li key={step} className="rounded-lg bg-white/80 px-3 py-2">
            <span className="mr-1 text-blue-700">{index + 1}.</span>{' '}
            {step}
              </li>
            ))}
          </ol>
        </div>
        {completed && (
          <p className="mt-3 text-sm font-medium text-green-800">
            Calendar feeds are saved. Finish by running a refresh and copying one of the published calendar links.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SubscriptionInstructions() {
  const guides = [
    {
      title: 'Google Calendar',
      steps: [
        'Open Google Calendar in a browser.',
        'Next to Other calendars, choose From URL.',
        'Paste the merged calendar link and add the calendar.',
      ],
    },
    {
      title: 'Apple Calendar',
      steps: [
        'Open Calendar on a Mac, iPhone, or iPad.',
        'Choose New Calendar Subscription or Add Subscription Calendar.',
        'Paste the merged calendar link and subscribe.',
      ],
    },
    {
      title: 'Outlook',
      steps: [
        'Open Outlook Calendar.',
        'Choose Add calendar, then subscribe from web or from internet.',
        'Paste the merged calendar link and save.',
      ],
    },
  ];

  return (
    <div className="mt-4 border-t border-green-200 pt-4">
      <h4 className="text-sm font-semibold text-green-950">How to subscribe</h4>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        {guides.map((guide) => (
          <details key={guide.title} className="rounded-lg border border-green-200 bg-white/80 p-3">
            <summary className="cursor-pointer text-sm font-medium text-green-950">{guide.title}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-green-900">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </div>
  );
}

function formatRestoreDate(value?: string): string {
  if (!value) {
    return '15 days after disable';
  }

  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function formatRestoreCountdown(value?: string): string | null {
  if (!value) {
    return null;
  }

  const target = new Date(value).getTime();
  if (Number.isNaN(target)) {
    return null;
  }

  const msLeft = target - Date.now();
  if (msLeft <= 0) {
    return 'restore window closed';
  }

  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
}

// Enhanced feed card component
function EnhancedFeedCard({
  feed,
  feedHealth,
  onUpdate,
  onDelete,
  onToggleEnabled,
  selected,
  onSelectChange,
}: {
  feed: SourceFeedConfig;
  feedHealth: FeedHealth;
  onUpdate: (feedId: string, updates: any) => Promise<void>;
  onDelete: (feedId: string) => Promise<void>;
  onToggleEnabled: (feedId: string, enabled: boolean) => Promise<void>;
  selected: boolean;
  onSelectChange: (feedId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleUpdate = async (updates: { name: string; url: string }) => {
    await onUpdate(feed.id, updates);
    setEditing(false);
  };

  if (editing) {
    return (
      <Card>
        <CardContent className="p-6">
          <FeedForm
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
            initialValues={{ name: feed.name, url: feed.url }}
          />
        </CardContent>
      </Card>
    );
  }

  const getHealthIcon = () => {
    if (feed.enabled === false) return <CircleOff className="h-5 w-5 text-slate-500" aria-hidden="true" />;
    if (feedHealth.status === 'pending') return <Clock className="h-5 w-5 text-slate-500" aria-hidden="true" />;
    if (feedHealth.status === 'failed') return <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />;
    if (feedHealth.suspect) return <AlertTriangle className="h-5 w-5 text-yellow-600" aria-hidden="true" />;
    return <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />;
  };

  const getHealthBadge = () => {
    if (feed.enabled === false) {
      return <Badge variant="neutral">Disabled</Badge>;
    }

    if (feedHealth.status === 'pending') {
      return <Badge variant="neutral">Pending first refresh</Badge>;
    }

    if (feedHealth.status === 'failed') {
      return (
        <Badge variant="error">
          ✗ Failed ({feedHealth.consecutiveFailures}x)
        </Badge>
      );
    }
    if (feedHealth.suspect) {
      return <Badge variant="warning">⚠ 0 events (suspect)</Badge>;
    }
    return <Badge variant="success">✓ {feedHealth.eventCount} events</Badge>;
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard?.writeText(feed.url);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1500);
    } catch {
      setCopiedUrl(false);
    }
  };

  return (
    <Card className={clsx(selected && 'ring-2 ring-primary-500', feed.enabled === false && 'bg-slate-50')}>
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 items-start gap-4">
            {/* Selection checkbox */}
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelectChange(feed.id)}
              className="mt-1.5 h-4 w-4 rounded border-slate-300 text-primary-700 focus:ring-2 focus:ring-primary-700"
            />

            {/* Health icon */}
            <div className="mt-1">
              {getHealthIcon()}
            </div>

            {/* Feed info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-slate-900 truncate">{feed.name}</h3>
                {getHealthBadge()}
              </div>

              <p className="mb-2 break-all text-sm text-slate-600 sm:truncate">{feed.url}</p>
              <div className="mb-2 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleCopyUrl}>
                  <Copy className="h-4 w-4" />
                  {copiedUrl ? 'Copied' : 'Copy URL'}
                </Button>
                <a
                  href={feed.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open
                </a>
              </div>
              <p className="text-xs text-slate-500">ID: {feed.id}</p>
              {feed.enabled === false && (
                <p className="text-xs text-slate-500 mt-1">
                  Restore available until {formatRestoreDate(feed.restoreAvailableUntil)}
                  {formatRestoreCountdown(feed.restoreAvailableUntil) && (
                    <span className="text-slate-400"> ({formatRestoreCountdown(feed.restoreAvailableUntil)})</span>
                  )}
                </p>
              )}

              {/* Event count change indicator */}
              {feedHealth.previousEventCount !== undefined &&
                feedHealth.previousEventCount !== feedHealth.eventCount && (
                  <p className={clsx(
                    'text-xs mt-2',
                    feedHealth.eventCount > feedHealth.previousEventCount ? 'text-green-600' : 'text-red-600'
                  )}>
                    {feedHealth.eventCount > feedHealth.previousEventCount ? '↑' : '↓'}
                    {' '}
                    {Math.abs(feedHealth.eventCount - feedHealth.previousEventCount)} from last check
                  </p>
                )}

              {/* Error message */}
              {feedHealth.error && (
                <p className="text-sm text-red-600 mt-2">
                  Error: {feedHealth.error}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:ml-4 sm:flex-row sm:items-center">
            <Switch
              checked={feed.enabled !== false}
              onCheckedChange={(checked) => onToggleEnabled(feed.id, checked)}
              label={feed.enabled !== false ? 'Enabled' : 'Disabled'}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Edit className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDelete(feed.id)}>
                  <Trash className="h-4 w-4" />
                  Disable for 15 days
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
