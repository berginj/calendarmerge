import { useQuery } from '@tanstack/react-query';
import { loadSavedFunctionsKey, requestJson } from '../api/feedsApi';

export interface FeedStatus {
  id: string;
  name: string;
  url?: string;
  ok: boolean;
  attemptedAt: string;
  durationMs: number;
  eventCount: number;
  httpStatus?: number;
  error?: string;
  previousEventCount?: number;
  suspect?: boolean;
  consecutiveFailures?: number;
}

export interface FeedChangeAlert {
  feedId: string;
  feedName: string;
  change: 'events-to-zero' | 'zero-to-events' | 'significant-drop' | 'significant-increase';
  previousCount: number;
  currentCount: number;
  percentChange: number;
  timestamp: string;
  severity: 'info' | 'warning' | 'error';
}

export interface PotentialDuplicate {
  summary: string;
  date: string;
  confidence: 'high' | 'medium' | 'low';
  instances: Array<{
    feedId: string;
    feedName: string;
    time: string;
    location: string;
    uid: string;
  }>;
}

export interface RescheduledEvent {
  uid: string;
  summary: string;
  feedId: string;
  feedName: string;
  changes: {
    time?: { from: string; to: string };
    location?: { from: string; to: string };
  };
  detectedAt: string;
}

export interface ServiceStatus {
  serviceName: string;
  refreshId?: string;
  operationalState?: 'healthy' | 'degraded' | 'failed';
  degradationReasons?: string[];
  state: 'starting' | 'success' | 'partial' | 'failed';
  healthy: boolean;
  lastAttemptedRefresh?: string;
  lastSuccessfulCheck?: {
    fullCalendar?: string;
    gamesCalendar?: string;
    combined?: string;
  };
  checkAgeHours?: {
    fullCalendar?: number;
    gamesCalendar?: number;
  };
  sourceFeedCount: number;
  mergedEventCount: number;
  gamesOnlyMergedEventCount: number;
  calendarPublished: boolean;
  gamesOnlyCalendarPublished: boolean;
  servedLastKnownGood: boolean;
  sourceStatuses?: FeedStatus[];
  feedChangeAlerts?: FeedChangeAlert[];
  suspectFeeds?: string[];
  potentialDuplicates?: PotentialDuplicate[];
  rescheduledEvents?: RescheduledEvent[];
  cancelledEventsFiltered?: number;
  output: any;
  errorSummary: string[];
  adminInsightsAvailable?: boolean;
  adminInsightsError?: string;
}

interface AdminStatusResponse {
  status: ServiceStatus;
}

async function fetchPublicStatus(): Promise<ServiceStatus> {
  const publicBase = new URL('../', window.location.href);
  const statusUrl = new URL('status.json', publicBase);

  const response = await fetch(statusUrl.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch status: ${response.statusText}`);
  }

  return response.json();
}

async function fetchAdminStatus(publicStatus: ServiceStatus): Promise<ServiceStatus> {
  try {
    const data = await requestJson<AdminStatusResponse>('/status/internal', undefined, true);
    return {
      ...publicStatus,
      ...data.status,
      adminInsightsAvailable: true,
    };
  } catch (error) {
    return {
      ...publicStatus,
      adminInsightsAvailable: false,
      adminInsightsError: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetches public status and overlays protected admin diagnostics when a Function key exists.
 * Polls every 30 seconds to keep UI updated
 */
export function useServiceStatus() {
  const hasAdminKey = loadSavedFunctionsKey().length > 0;

  return useQuery({
    queryKey: ['serviceStatus', hasAdminKey],
    queryFn: async (): Promise<ServiceStatus> => {
      const publicStatus = await fetchPublicStatus();
      if (!hasAdminKey) {
        return {
          ...publicStatus,
          adminInsightsAvailable: false,
        };
      }

      return fetchAdminStatus(publicStatus);
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 25000, // Consider stale after 25 seconds
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Helper to format age in hours to human-readable string
 */
export function formatAge(hours: number | undefined): string {
  if (hours === undefined) return 'Unknown';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${Math.round(hours * 10) / 10} hrs`;
  return `${Math.round(hours / 24 * 10) / 10} days`;
}

/**
 * Helper to get status color class
 */
export function getStatusColor(state: 'healthy' | 'degraded' | 'failed' | undefined): string {
  switch (state) {
    case 'healthy':
      return 'text-green-600';
    case 'degraded':
      return 'text-yellow-600';
    case 'failed':
      return 'text-red-600';
    default:
      return 'text-slate-500';
  }
}

/**
 * Helper to get status background color class
 */
export function getStatusBgColor(state: 'healthy' | 'degraded' | 'failed' | undefined): string {
  switch (state) {
    case 'healthy':
      return 'bg-green-50';
    case 'degraded':
      return 'bg-yellow-50';
    case 'failed':
      return 'bg-red-50';
    default:
      return 'bg-slate-50';
  }
}
