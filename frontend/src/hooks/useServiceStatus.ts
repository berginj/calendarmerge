import { useQuery } from '@tanstack/react-query';

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
  sourceStatuses: any[];
  feedChangeAlerts?: any[];
  suspectFeeds?: string[];
  potentialDuplicates?: any[];
  rescheduledEvents?: any[];
  cancelledEventsFiltered?: number;
  output: any;
  errorSummary: string[];
}

/**
 * Fetches service status from status.json
 * Polls every 30 seconds to keep UI updated
 */
export function useServiceStatus() {
  return useQuery({
    queryKey: ['serviceStatus'],
    queryFn: async (): Promise<ServiceStatus> => {
      // Fetch from public status.json (no auth needed)
      const publicBase = new URL('../', window.location.href);
      const statusUrl = new URL('status.json', publicBase);

      const response = await fetch(statusUrl.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.statusText}`);
      }

      return response.json();
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
