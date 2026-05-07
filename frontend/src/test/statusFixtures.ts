import type { ServiceStatus } from '../hooks/useServiceStatus';

export function publicStatus(overrides: Partial<ServiceStatus> = {}): ServiceStatus {
  return {
    serviceName: 'calendarmerge',
    refreshId: 'refresh-1',
    operationalState: 'healthy',
    state: 'success',
    healthy: true,
    lastAttemptedRefresh: '2026-05-07T12:00:00.000Z',
    lastSuccessfulCheck: {
      fullCalendar: '2026-05-07T12:00:00.000Z',
      gamesCalendar: '2026-05-07T12:00:00.000Z',
      combined: '2026-05-07T12:00:00.000Z',
    },
    checkAgeHours: {
      fullCalendar: 0.5,
      gamesCalendar: 0.5,
    },
    sourceFeedCount: 1,
    mergedEventCount: 42,
    gamesOnlyMergedEventCount: 7,
    calendarPublished: true,
    gamesOnlyCalendarPublished: true,
    servedLastKnownGood: false,
    cancelledEventsFiltered: 2,
    output: {},
    errorSummary: [],
    adminInsightsAvailable: false,
    ...overrides,
  };
}

export function adminStatus(overrides: Partial<ServiceStatus> = {}): ServiceStatus {
  return publicStatus({
    adminInsightsAvailable: true,
    sourceStatuses: [
      {
        id: 'school',
        name: 'School Calendar',
        ok: true,
        attemptedAt: '2026-05-07T12:00:00.000Z',
        durationMs: 250,
        eventCount: 35,
        previousEventCount: 30,
      },
      {
        id: 'sports',
        name: 'Sports Calendar',
        ok: false,
        attemptedAt: '2026-05-07T12:00:00.000Z',
        durationMs: 1000,
        eventCount: 0,
        error: 'HTTP 403',
        consecutiveFailures: 3,
      },
    ],
    feedChangeAlerts: [
      {
        feedId: 'sports',
        feedName: 'Sports Calendar',
        change: 'events-to-zero',
        previousCount: 10,
        currentCount: 0,
        percentChange: -100,
        timestamp: '2026-05-07T12:00:00.000Z',
        severity: 'error',
      },
    ],
    suspectFeeds: ['sports'],
    potentialDuplicates: [
      {
        summary: 'Practice',
        date: '2026-05-08',
        confidence: 'high',
        instances: [
          {
            feedId: 'school',
            feedName: 'School Calendar',
            time: '2026-05-08T13:00:00.000Z',
            location: 'Field 1',
            uid: 'event-1',
          },
          {
            feedId: 'sports',
            feedName: 'Sports Calendar',
            time: '2026-05-08T13:05:00.000Z',
            location: 'Field 1',
            uid: 'event-2',
          },
        ],
      },
    ],
    rescheduledEvents: [
      {
        uid: 'event-3',
        summary: 'Game vs Tigers',
        feedId: 'sports',
        feedName: 'Sports Calendar',
        changes: {
          time: {
            from: '2026-05-08T14:00:00.000Z',
            to: '2026-05-08T15:00:00.000Z',
          },
        },
        detectedAt: '2026-05-07T12:00:00.000Z',
      },
    ],
    ...overrides,
  });
}

