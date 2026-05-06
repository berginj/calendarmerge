import { useServiceStatus } from '../hooks/useServiceStatus';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import Badge from '../components/ui/Badge';
import { Calendar, Copy, Bell, Loader2, CheckCircle, Clock, MapPin, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';

export default function Changes() {
  const { data: status, isLoading } = useServiceStatus();

  if (isLoading || !status) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
      </div>
    );
  }

  if (!status.adminInsightsAvailable) {
    return (
      <Card>
        <CardContent>
          <div className="text-center py-12">
            <Bell className="h-12 w-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Admin insights unavailable</h3>
            <p className="text-sm text-slate-600">
              Save a Function key to view reschedules, duplicates, and feed alerts.
            </p>
            {status.adminInsightsError && (
              <p className="text-xs text-red-600 mt-2">{status.adminInsightsError}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const rescheduledEvents = status.rescheduledEvents ?? [];
  const potentialDuplicates = status.potentialDuplicates ?? [];
  const feedChangeAlerts = status.feedChangeAlerts ?? [];

  const formatTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const timeAgo = (isoString: string) => {
    try {
      const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-100">
                <Calendar className="h-6 w-6 text-yellow-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{rescheduledEvents.length}</p>
                <p className="text-sm text-slate-600">Reschedules</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100">
                <Copy className="h-6 w-6 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{potentialDuplicates.length}</p>
                <p className="text-sm text-slate-600">Potential Duplicates</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-orange-100">
                <Bell className="h-6 w-6 text-orange-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{feedChangeAlerts.length}</p>
                <p className="text-sm text-slate-600">Feed Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="reschedules">
        <TabsList>
          <TabsTrigger value="reschedules">
            Reschedules ({rescheduledEvents.length})
          </TabsTrigger>
          <TabsTrigger value="duplicates">
            Duplicates ({potentialDuplicates.length})
          </TabsTrigger>
          <TabsTrigger value="alerts">
            Feed Alerts ({feedChangeAlerts.length})
          </TabsTrigger>
        </TabsList>

        {/* Reschedules Tab */}
        <TabsContent value="reschedules">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Schedule Changes (7-Day Window)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rescheduledEvents.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">No Schedule Changes</h3>
                  <p className="text-sm text-slate-600">
                    When game times or locations change, they'll appear here.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    We're monitoring the next 7 days for changes
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rescheduledEvents.map((event: any) => (
                    <div key={event.uid} className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-slate-900">{event.summary}</h4>
                          <p className="text-sm text-slate-600 mt-1">{event.feedName}</p>
                        </div>
                        <Badge variant="warning">Rescheduled</Badge>
                      </div>

                      <div className="space-y-2">
                        {event.changes.time && (
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-slate-600" />
                            <span className="text-slate-600 line-through">
                              {formatTime(event.changes.time.from)}
                            </span>
                            <ArrowRight className="h-4 w-4 text-slate-400" />
                            <span className="font-medium text-slate-900">
                              {formatTime(event.changes.time.to)}
                            </span>
                          </div>
                        )}

                        {event.changes.location && (
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="h-4 w-4 text-slate-600" />
                            <span className="text-slate-600 line-through">
                              {event.changes.location.from || 'No location'}
                            </span>
                            <ArrowRight className="h-4 w-4 text-slate-400" />
                            <span className="font-medium text-slate-900">
                              {event.changes.location.to || 'No location'}
                            </span>
                          </div>
                        )}

                        <p className="text-xs text-slate-500 mt-2">
                          Detected {timeAgo(event.detectedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Duplicates Tab */}
        <TabsContent value="duplicates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5" />
                Potential Duplicates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {potentialDuplicates.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">No Duplicates Detected</h3>
                  <p className="text-sm text-slate-600">
                    Your calendar feeds are clean!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {potentialDuplicates.map((dup: any, index: number) => (
                    <div key={index} className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-slate-900">{dup.summary}</h4>
                          <p className="text-sm text-slate-600">{formatDate(dup.date)}</p>
                        </div>
                        <Badge variant={
                          dup.confidence === 'high' ? 'error' :
                          dup.confidence === 'medium' ? 'warning' : 'info'
                        }>
                          {dup.confidence} confidence
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        {dup.instances.map((instance: any) => (
                          <div key={instance.uid} className="bg-white rounded p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{instance.feedName}</span>
                              <span className="text-slate-600">{formatTime(instance.time)}</span>
                            </div>
                            {instance.location && (
                              <p className="text-slate-600 mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {instance.location}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      <p className="text-xs text-slate-500 mt-3">
                        These events have the same name on the same day. They may be duplicates or separate events.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feed Alerts Tab */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Feed Change Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {feedChangeAlerts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">No Feed Alerts</h3>
                  <p className="text-sm text-slate-600">
                    All feed event counts are stable
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {feedChangeAlerts.map((alert: any, index: number) => (
                    <div
                      key={index}
                      className={clsx(
                        'border rounded-lg p-4',
                        alert.severity === 'warning' && 'border-yellow-200 bg-yellow-50',
                        alert.severity === 'error' && 'border-red-200 bg-red-50',
                        alert.severity === 'info' && 'border-blue-200 bg-blue-50'
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-slate-900">{alert.feedName}</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            {alert.change === 'events-to-zero' && 'Feed went from events to 0'}
                            {alert.change === 'zero-to-events' && 'Feed recovered from 0 events'}
                            {alert.change === 'significant-drop' && 'Significant event count drop'}
                            {alert.change === 'significant-increase' && 'Event count increased significantly'}
                          </p>
                        </div>
                        <Badge variant={
                          alert.severity === 'warning' ? 'warning' :
                          alert.severity === 'error' ? 'error' : 'info'
                        }>
                          {alert.severity}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-slate-600">Previous: </span>
                          <span className="font-medium text-slate-900">{alert.previousCount}</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <div>
                          <span className="text-slate-600">Current: </span>
                          <span className="font-medium text-slate-900">{alert.currentCount}</span>
                        </div>
                        <div className={clsx(
                          'ml-auto font-medium',
                          alert.percentChange > 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                          {alert.percentChange > 0 ? '+' : ''}{alert.percentChange}%
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 mt-2">
                        Detected {timeAgo(alert.timestamp)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
