import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Copy,
  Filter,
  Loader2,
  RefreshCw,
  Rss,
  Search,
} from 'lucide-react';
import { clsx } from 'clsx';

import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { formatAge, useServiceStatus, type FeedStatus } from '../hooks/useServiceStatus';

type InsightType = 'feed' | 'reschedule' | 'duplicate' | 'alert';
type Severity = 'error' | 'warning' | 'info' | 'success';

interface InsightRow {
  id: string;
  type: InsightType;
  severity: Severity;
  feedName?: string;
  title: string;
  detail: string;
  timestamp?: string;
}

const typeLabels: Record<InsightType, string> = {
  feed: 'Feed',
  reschedule: 'Reschedule',
  duplicate: 'Duplicate',
  alert: 'Alert',
};

export default function Insights() {
  const { data: status, isLoading } = useServiceStatus();
  const [typeFilter, setTypeFilter] = useState<'all' | InsightType>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [feedFilter, setFeedFilter] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);

  const insights = useMemo<InsightRow[]>(() => {
    if (!status?.adminInsightsAvailable) {
      return [];
    }

    const feedRows = (status.sourceStatuses ?? [])
      .filter((feed) => !feed.ok || feed.suspect || (feed.consecutiveFailures ?? 0) > 0)
      .map((feed) => ({
        id: `feed-${feed.id}`,
        type: 'feed' as const,
        severity: feed.ok ? 'warning' as const : 'error' as const,
        feedName: feed.name,
        title: feed.ok ? `${feed.name} needs review` : `${feed.name} failed`,
        detail: feed.ok
          ? `${feed.eventCount} events; previous count was ${feed.previousEventCount ?? 'unknown'}`
          : feed.error ?? 'Feed fetch failed',
        timestamp: feed.attemptedAt,
      }));

    const rescheduleRows = (status.rescheduledEvents ?? []).map((event) => ({
      id: `reschedule-${event.uid}`,
      type: 'reschedule' as const,
      severity: 'warning' as const,
      feedName: event.feedName,
      title: event.summary,
      detail: describeReschedule(event.changes),
      timestamp: event.detectedAt,
    }));

    const duplicateRows = (status.potentialDuplicates ?? []).map((duplicate, index) => ({
      id: `duplicate-${index}`,
      type: 'duplicate' as const,
      severity: duplicate.confidence === 'high' ? 'warning' as const : 'info' as const,
      feedName: duplicate.instances.map((instance) => instance.feedName).join(', '),
      title: duplicate.summary,
      detail: `${duplicate.instances.length} instances on ${formatDate(duplicate.date)} with ${duplicate.confidence} confidence`,
    }));

    const alertRows = (status.feedChangeAlerts ?? []).map((alert, index) => ({
      id: `alert-${alert.feedId}-${index}`,
      type: 'alert' as const,
      severity: alert.severity,
      feedName: alert.feedName,
      title: describeAlert(alert.change),
      detail: `${alert.previousCount} to ${alert.currentCount} events (${alert.percentChange > 0 ? '+' : ''}${alert.percentChange}%)`,
      timestamp: alert.timestamp,
    }));

    return [...feedRows, ...rescheduleRows, ...duplicateRows, ...alertRows]
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }, [status]);

  const feeds = useMemo(() => {
    const names = new Set<string>();
    for (const insight of insights) {
      if (insight.feedName && !insight.feedName.includes(',')) {
        names.add(insight.feedName);
      }
    }

    for (const feed of status?.sourceStatuses ?? []) {
      names.add(feed.name);
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [insights, status?.sourceStatuses]);

  const filteredInsights = insights.filter((insight) => {
    const matchesType = typeFilter === 'all' || insight.type === typeFilter;
    const matchesSeverity = severityFilter === 'all' || insight.severity === severityFilter;
    const matchesFeed = feedFilter === 'all' || insight.feedName?.includes(feedFilter);

    return matchesType && matchesSeverity && matchesFeed;
  });

  if (isLoading || !status) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
        <span className="ml-3 text-slate-600">Loading insights...</span>
      </div>
    );
  }

  if (!status.adminInsightsAvailable) {
    return (
      <Card>
        <CardContent>
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Admin insights unavailable</h3>
            <p className="text-sm text-slate-600">
              Sign in with an admin access code to view feed health, schedule changes, duplicates, and alert details.
            </p>
            {status.adminInsightsError && (
              <p className="text-xs text-red-600 mt-2">{status.adminInsightsError}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const failedFeeds = (status.sourceStatuses ?? []).filter((feed) => !feed.ok).length;
  const warningFeeds = (status.sourceStatuses ?? []).filter((feed) => feed.ok && (feed.suspect || (feed.consecutiveFailures ?? 0) > 0)).length;
  const staleCalendars = [
    status.checkAgeHours?.fullCalendar !== undefined && status.checkAgeHours.fullCalendar > 2,
    status.checkAgeHours?.gamesCalendar !== undefined && status.checkAgeHours.gamesCalendar > 2,
  ].filter(Boolean).length;

  const copyValue = async (label: string, value: string | undefined) => {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard icon={<Rss className="h-5 w-5" />} label="Failed feeds" value={failedFeeds} severity={failedFeeds > 0 ? 'error' : 'success'} />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5" />} label="Feed warnings" value={warningFeeds} severity={warningFeeds > 0 ? 'warning' : 'success'} />
        <SummaryCard icon={<Bell className="h-5 w-5" />} label="Open insights" value={insights.length} severity={insights.length > 0 ? 'warning' : 'success'} />
        <SummaryCard icon={<Clock className="h-5 w-5" />} label="Stale calendars" value={staleCalendars} severity={staleCalendars > 0 ? 'warning' : 'success'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Refresh Metadata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetadataItem label="Refresh ID" value={status.refreshId} copied={copied === 'refreshId'} onCopy={() => copyValue('refreshId', status.refreshId)} />
            <MetadataItem label="Last attempted" value={formatDateTime(status.lastAttemptedRefresh)} />
            <MetadataItem label="State" value={status.operationalState ?? status.state} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calendar Staleness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StalenessRow label="Full calendar" age={status.checkAgeHours?.fullCalendar} timestamp={status.lastSuccessfulCheck?.fullCalendar} published={status.calendarPublished} />
            <StalenessRow label="Games calendar" age={status.checkAgeHours?.gamesCalendar} timestamp={status.lastSuccessfulCheck?.gamesCalendar} published={status.gamesOnlyCalendarPublished} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feed Health</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-4 font-medium">Feed</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Events</th>
                <th className="py-2 pr-4 font-medium">Failures</th>
                <th className="py-2 pr-4 font-medium">Last attempted</th>
                <th className="py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {(status.sourceStatuses ?? []).map((feed) => (
                <FeedHealthRow key={feed.id} feed={feed} />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Operator Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <FilterSelect label="Type" value={typeFilter} onChange={(value) => setTypeFilter(value as 'all' | InsightType)} options={['all', 'feed', 'reschedule', 'duplicate', 'alert']} />
            <FilterSelect label="Severity" value={severityFilter} onChange={(value) => setSeverityFilter(value as 'all' | Severity)} options={['all', 'error', 'warning', 'info', 'success']} />
            <FilterSelect label="Feed" value={feedFilter} onChange={setFeedFilter} options={['all', ...feeds]} />
          </div>

          {filteredInsights.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="font-medium text-slate-900">No matching insights</p>
              <p className="mt-1 text-sm text-slate-600">Adjust filters or check back after the next refresh.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInsights.map((insight) => (
                <div key={insight.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={badgeVariant(insight.severity)}>{insight.severity}</Badge>
                        <Badge variant="neutral">{typeLabels[insight.type]}</Badge>
                        {insight.feedName && <span className="text-xs text-slate-500">{insight.feedName}</span>}
                      </div>
                      <h4 className="mt-2 font-semibold text-slate-900">{insight.title}</h4>
                      <p className="mt-1 text-sm text-slate-600">{insight.detail}</p>
                    </div>
                    {insight.timestamp && (
                      <p className="text-xs text-slate-500 md:text-right">{formatDateTime(insight.timestamp)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value, severity }: { icon: ReactNode; label: string; value: number; severity: Severity }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={clsx('rounded-lg p-2', severityClass(severity))}>{icon}</div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-600">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetadataItem({ label, value, copied, onCopy }: { label: string; value?: string; copied?: boolean; onCopy?: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-slate-900">{value ?? 'Unavailable'}</p>
        {onCopy && value && (
          <Button type="button" variant="ghost" size="sm" onClick={onCopy} aria-label={`Copy ${label}`}>
            {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function StalenessRow({ label, age, timestamp, published }: { label: string; age?: number; timestamp?: string; published: boolean }) {
  const stale = age !== undefined && age > 2;

  return (
    <div className={clsx('rounded-lg border p-4', stale || !published ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{label}</p>
          <p className="mt-1 text-sm text-slate-600">Age: {formatAge(age)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(timestamp)}</p>
        </div>
        <Badge variant={published && !stale ? 'success' : 'warning'}>{published ? 'Published' : 'Not published'}</Badge>
      </div>
    </div>
  );
}

function FeedHealthRow({ feed }: { feed: FeedStatus }) {
  const statusVariant = !feed.ok ? 'error' : feed.suspect ? 'warning' : 'success';

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 pr-4 font-medium text-slate-900">{feed.name}</td>
      <td className="py-3 pr-4">
        <Badge variant={statusVariant}>{!feed.ok ? 'failed' : feed.suspect ? 'review' : 'healthy'}</Badge>
      </td>
      <td className="py-3 pr-4 text-slate-700">
        {feed.eventCount}
        {feed.previousEventCount !== undefined && feed.previousEventCount !== feed.eventCount && (
          <span className="ml-2 text-xs text-slate-500">was {feed.previousEventCount}</span>
        )}
      </td>
      <td className="py-3 pr-4 text-slate-700">{feed.consecutiveFailures ?? 0}</td>
      <td className="py-3 pr-4 text-slate-700">{formatDateTime(feed.attemptedAt)}</td>
      <td className="py-3 text-slate-600">{feed.error ?? (feed.suspect ? 'Event count needs review' : 'No issues')}</td>
    </tr>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>
        ))}
      </select>
    </label>
  );
}

function describeReschedule(changes: { time?: { from: string; to: string }; location?: { from: string; to: string } }) {
  const parts = [];
  if (changes.time) parts.push(`Time changed from ${formatDateTime(changes.time.from)} to ${formatDateTime(changes.time.to)}`);
  if (changes.location) parts.push(`Location changed from ${changes.location.from || 'none'} to ${changes.location.to || 'none'}`);
  return parts.join('; ') || 'Schedule details changed';
}

function describeAlert(change: string) {
  switch (change) {
    case 'events-to-zero':
      return 'Feed dropped to zero events';
    case 'zero-to-events':
      return 'Feed recovered events';
    case 'significant-drop':
      return 'Significant event count drop';
    case 'significant-increase':
      return 'Significant event count increase';
    default:
      return 'Feed count changed';
  }
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function formatDateTime(value?: string) {
  if (!value) return 'Unavailable';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function severityRank(severity: Severity) {
  return { success: 0, info: 1, warning: 2, error: 3 }[severity];
}

function badgeVariant(severity: Severity) {
  return severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : severity === 'success' ? 'success' : 'info';
}

function severityClass(severity: Severity) {
  return {
    error: 'bg-red-100 text-red-700',
    warning: 'bg-yellow-100 text-yellow-700',
    info: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
  }[severity];
}
