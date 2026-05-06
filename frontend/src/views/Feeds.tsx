import { useState } from 'react';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useManualRefresh } from '../hooks/useManualRefresh';
import { Card, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Switch from '../components/ui/Switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/DropdownMenu';
import { RefreshCw, Plus, MoreVertical, Edit, Trash, Search, CheckCircle, AlertTriangle, XCircle, Calendar } from 'lucide-react';
import { SourceFeedConfig } from '../types';
import FeedForm from '../components/FeedForm';
import { clsx } from 'clsx';

interface EnhancedFeedsProps {
  feeds: SourceFeedConfig[];
  loading: boolean;
  error: string | null;
  hasConfiguredAdminKey: boolean;
  onUpdate: (feedId: string, updates: { name?: string; url?: string; enabled?: boolean }) => Promise<void>;
  onDelete: (feedId: string) => Promise<void>;
  onCreate: (feed: { name: string; url: string }) => Promise<void>;
  setError: (error: string | null) => void;
}

export default function Feeds({
  feeds,
  loading,
  error,
  hasConfiguredAdminKey,
  onUpdate,
  onDelete,
  onCreate,
  setError,
}: EnhancedFeedsProps) {
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'healthy' | 'suspect' | 'failed' | 'disabled'>('all');
  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(new Set());
  const { data: status } = useServiceStatus();
  const { refresh, isRefreshing } = useManualRefresh();

  const handleCreate = async (feed: { name: string; url: string }) => {
    try {
      await onCreate(feed);
      setShowForm(false);
    } catch (err) {
      // Error already handled by parent
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
    for (const feedId of Array.from(selectedFeeds)) {
      try {
        await onUpdate(feedId, { enabled: true });
      } catch (err) {
        console.error(`Failed to enable ${feedId}`, err);
      }
    }
    setSelectedFeeds(new Set());
  };

  const handleBulkDisable = async () => {
    for (const feedId of Array.from(selectedFeeds)) {
      try {
        await onUpdate(feedId, { enabled: false });
      } catch (err) {
        console.error(`Failed to disable ${feedId}`, err);
      }
    }
    setSelectedFeeds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedFeeds.size} feed(s)?`)) {
      return;
    }

    for (const feedId of Array.from(selectedFeeds)) {
      try {
        await onDelete(feedId);
      } catch (err) {
        console.error(`Failed to delete ${feedId}`, err);
      }
    }
    setSelectedFeeds(new Set());
  };

  // Get feed health from status
  const getFeedHealth = (feedId: string) => {
    const feedStatus = status?.sourceStatuses?.find(f => f.id === feedId);
    const isSuspect = status?.suspectFeeds?.includes(feedId);

    return {
      ok: feedStatus?.ok ?? false,
      eventCount: feedStatus?.eventCount ?? 0,
      previousEventCount: feedStatus?.previousEventCount,
      suspect: isSuspect ?? false,
      consecutiveFailures: feedStatus?.consecutiveFailures ?? 0,
      error: feedStatus?.error,
    };
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

      if (filter === 'healthy' && (!health.ok || health.suspect)) return false;
      if (filter === 'suspect' && !health.suspect) return false;
      if (filter === 'failed' && health.ok) return false;
      if (filter === 'disabled' && feed.enabled !== false) return false;
    }

    return true;
  });

  const healthyCount = feeds.filter(f => {
    const h = getFeedHealth(f.id);
    return h.ok && !h.suspect;
  }).length;
  const suspectCount = status?.suspectFeeds?.length ?? 0;
  const failedCount = status?.sourceStatuses?.filter(f => !f.ok).length ?? 0;
  const disabledCount = feeds.filter(f => f.enabled === false).length;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
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

        <div className="flex gap-2">
          <Button
            onClick={() => refresh()}
            disabled={isRefreshing || !hasConfiguredAdminKey}
            variant="secondary"
            size="md"
          >
            <RefreshCw className={clsx('h-4 w-4', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
          </Button>

          <Button
            onClick={() => setShowForm(!showForm)}
            disabled={!hasConfiguredAdminKey}
            variant="primary"
            size="md"
          >
            <Plus className="h-4 w-4" />
            Add Feed
          </Button>
        </div>
      </div>

      {/* Bulk selection and actions */}
      {filteredFeeds.length > 0 && hasConfiguredAdminKey && (
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
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
            <div className="flex gap-2 ml-auto">
              <Button onClick={handleBulkEnable} variant="secondary" size="sm">
                <CheckCircle className="h-4 w-4" />
                Enable
              </Button>
              <Button onClick={handleBulkDisable} variant="secondary" size="sm">
                <XCircle className="h-4 w-4" />
                Disable
              </Button>
              <Button onClick={handleBulkDelete} variant="danger" size="sm">
                <Trash className="h-4 w-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Filter chips */}
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

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            ×
          </button>
        </div>
      )}

      {/* Feed form */}
      {showForm && hasConfiguredAdminKey && (
        <Card>
          <CardContent className="p-6">
            <FeedForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Feed list */}
      {!hasConfiguredAdminKey ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-600">A Function key is required to load feed URLs.</p>
            <p className="text-slate-600 mt-2">Save the admin key above to manage feeds.</p>
          </CardContent>
        </Card>
      ) : loading ? (
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
      ) : filteredFeeds.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            {feeds.length === 0 ? (
              <>
                <Calendar className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                <p className="text-slate-600">No calendar feeds configured yet.</p>
                <p className="text-slate-600 mt-2">Click "Add Feed" to get started.</p>
              </>
            ) : (
              <>
                <Search className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                <p className="text-slate-600">No feeds match your search or filter.</p>
              </>
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
              onDelete={onDelete}
              onToggleEnabled={handleToggleEnabled}
              selected={selectedFeeds.has(feed.id)}
              onSelectChange={toggleSelectFeed}
            />
          ))}
        </div>
      )}
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
  feedHealth: any;
  onUpdate: (feedId: string, updates: any) => Promise<void>;
  onDelete: (feedId: string) => Promise<void>;
  onToggleEnabled: (feedId: string, enabled: boolean) => Promise<void>;
  selected: boolean;
  onSelectChange: (feedId: string) => void;
}) {
  const [editing, setEditing] = useState(false);

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
    if (!feedHealth.ok) return <XCircle className="h-5 w-5 text-red-600" />;
    if (feedHealth.suspect) return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    return <CheckCircle className="h-5 w-5 text-green-600" />;
  };

  const getHealthBadge = () => {
    if (!feedHealth.ok) {
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

  return (
    <Card className={clsx(selected && 'ring-2 ring-primary-500')}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1">
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

              <p className="text-sm text-slate-600 truncate mb-1">{feed.url}</p>
              <p className="text-xs text-slate-500">ID: {feed.id}</p>

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
          <div className="flex items-center gap-3 ml-4">
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
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
