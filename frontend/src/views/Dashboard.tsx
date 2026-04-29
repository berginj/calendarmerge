import { useServiceStatus, formatAge } from '../hooks/useServiceStatus';
import MetricCard from '../components/dashboard/MetricCard';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Calendar, Trophy, Rss, Clock, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export default function Dashboard() {
  const { data: status, isLoading, error } = useServiceStatus();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
        <span className="ml-3 text-slate-600">Loading dashboard...</span>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load dashboard data</p>
      </div>
    );
  }

  const failedCount = status.sourceStatuses.filter(f => !f.ok).length;

  return (
    <div className="space-y-8">
      {/* Hero Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Calendar className="h-6 w-6" />}
          label="Total Events"
          value={status.mergedEventCount}
          status="success"
        />

        <MetricCard
          icon={<Trophy className="h-6 w-6" />}
          label="Games Only"
          value={status.gamesOnlyMergedEventCount}
          status="neutral"
        />

        <MetricCard
          icon={<Rss className="h-6 w-6" />}
          label="Active Feeds"
          value={status.sourceFeedCount}
          sublabel={failedCount > 0 ? `${failedCount} failed` : 'All healthy'}
          status={failedCount > 0 ? 'error' : 'success'}
        />

        <MetricCard
          icon={<Clock className="h-6 w-6" />}
          label="Calendar Age"
          value={formatAge(status.checkAgeHours?.fullCalendar)}
          status={
            status.checkAgeHours?.fullCalendar === undefined ? 'neutral' :
            status.checkAgeHours.fullCalendar > 2 ? 'warning' : 'success'
          }
        />
      </div>

      {/* Calendar Freshness */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar Freshness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Full Calendar */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Full Calendar</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Status</span>
                  <span className={clsx(
                    'font-medium',
                    status.calendarPublished ? 'text-green-600' : 'text-red-600'
                  )}>
                    {status.calendarPublished ? 'Published' : 'Failed'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Age</span>
                  <span className="font-medium text-slate-900">
                    {formatAge(status.checkAgeHours?.fullCalendar)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Last Updated</span>
                  <span className="font-medium text-slate-900">
                    {status.lastSuccessfulCheck?.fullCalendar
                      ? new Date(status.lastSuccessfulCheck.fullCalendar).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full transition-all',
                        status.checkAgeHours?.fullCalendar === undefined ? 'w-0 bg-slate-400' :
                        status.checkAgeHours.fullCalendar < 1 ? 'w-full bg-green-500' :
                        status.checkAgeHours.fullCalendar < 2 ? 'w-3/4 bg-yellow-500' :
                        'w-1/2 bg-red-500'
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Games Calendar */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Games Calendar</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Status</span>
                  <span className={clsx(
                    'font-medium',
                    status.gamesOnlyCalendarPublished ? 'text-green-600' : 'text-red-600'
                  )}>
                    {status.gamesOnlyCalendarPublished ? 'Published' : 'Failed'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Age</span>
                  <span className="font-medium text-slate-900">
                    {formatAge(status.checkAgeHours?.gamesCalendar)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Last Updated</span>
                  <span className="font-medium text-slate-900">
                    {status.lastSuccessfulCheck?.gamesCalendar
                      ? new Date(status.lastSuccessfulCheck.gamesCalendar).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full transition-all',
                        status.checkAgeHours?.gamesCalendar === undefined ? 'w-0 bg-slate-400' :
                        status.checkAgeHours.gamesCalendar < 1 ? 'w-full bg-green-500' :
                        status.checkAgeHours.gamesCalendar < 2 ? 'w-3/4 bg-yellow-500' :
                        'w-1/2 bg-red-500'
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feed Health Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Feed Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {status.sourceStatuses.map((feed) => {
              const isSuspect = status.suspectFeeds?.includes(feed.id);
              const getHealthStatus = () => {
                if (!feed.ok) return 'failed';
                if (isSuspect) return 'suspect';
                return 'healthy';
              };

              const healthStatus = getHealthStatus();

              return (
                <div
                  key={feed.id}
                  className={clsx(
                    'p-4 rounded-lg border-2 transition-colors',
                    healthStatus === 'healthy' && 'bg-green-50 border-green-200',
                    healthStatus === 'suspect' && 'bg-yellow-50 border-yellow-200',
                    healthStatus === 'failed' && 'bg-red-50 border-red-200'
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-slate-900 text-sm">{feed.name}</h4>
                    <div className={clsx(
                      'h-2 w-2 rounded-full',
                      healthStatus === 'healthy' && 'bg-green-500',
                      healthStatus === 'suspect' && 'bg-yellow-500',
                      healthStatus === 'failed' && 'bg-red-500'
                    )} />
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-slate-600">
                      {feed.ok ? (
                        <>
                          <span className="font-medium text-slate-900">{feed.eventCount}</span> events
                          {feed.previousEventCount !== undefined &&
                            feed.previousEventCount !== feed.eventCount && (
                              <span className={clsx(
                                'ml-2 text-xs',
                                feed.eventCount > feed.previousEventCount ? 'text-green-600' : 'text-red-600'
                              )}>
                                {feed.eventCount > feed.previousEventCount ? '↑' : '↓'}
                                {Math.abs(feed.eventCount - feed.previousEventCount)}
                              </span>
                            )}
                        </>
                      ) : (
                        <span className="text-red-600">Failed</span>
                      )}
                    </p>

                    {!feed.ok && feed.error && (
                      <p className="text-xs text-red-600">{feed.error}</p>
                    )}

                    {isSuspect && (
                      <p className="text-xs text-yellow-600">
                        ⚠ 0 events (was {feed.previousEventCount})
                      </p>
                    )}

                    {feed.consecutiveFailures && feed.consecutiveFailures > 0 && (
                      <p className="text-xs text-red-600">
                        Failed {feed.consecutiveFailures}x in a row
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Additional stats if cancelled events filtered */}
      {status.cancelledEventsFiltered !== undefined && status.cancelledEventsFiltered > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100">
                <Calendar className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {status.cancelledEventsFiltered} cancelled event{status.cancelledEventsFiltered !== 1 ? 's' : ''} filtered
                </p>
                <p className="text-xs text-slate-600">
                  Cancelled events are automatically removed from your calendar
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
