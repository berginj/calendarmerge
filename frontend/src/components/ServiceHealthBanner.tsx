import { useState } from 'react';
import { useServiceStatus, getStatusBgColor, getStatusColor } from '../hooks/useServiceStatus';
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export default function ServiceHealthBanner() {
  const { data: status, isLoading, error } = useServiceStatus();
  const [showAllReasons, setShowAllReasons] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading service status...</span>
        </div>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3 text-slate-600">
          <AlertTriangle className="h-5 w-5" />
          <span className="text-sm">Unable to load service status</span>
        </div>
      </div>
    );
  }

  const operationalState = status.operationalState || 'healthy';
  const bgColor = getStatusBgColor(operationalState);

  const getIcon = () => {
    switch (operationalState) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" aria-hidden="true" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />;
    }
  };

  const timeAgo = (timestamp: string | undefined) => {
    if (!timestamp) return 'Unknown';

    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const reasons = status.degradationReasons ?? [];
  const visibleReasons = showAllReasons ? reasons : reasons.slice(0, 2);

  return (
    <div className={clsx('border-b border-slate-200 px-6 py-4', bgColor)} role="status" aria-live="polite">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          {getIcon()}

          <div className="flex flex-col">
            <div className={clsx('text-sm font-semibold', getStatusColor(operationalState))}>
              Service {operationalState.charAt(0).toUpperCase() + operationalState.slice(1)}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>Last refresh: {timeAgo(status.lastAttemptedRefresh)}</span>
              <span>•</span>
              <span>{status.mergedEventCount} events</span>
              <span>•</span>
              <span>{status.sourceFeedCount} feeds</span>
            </div>
          </div>
        </div>

        {reasons.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            {visibleReasons.map((reason, index) => (
              <span key={index} className="text-xs text-slate-600">
                {reason}
              </span>
            ))}
            {reasons.length > 2 && (
              <button
                type="button"
                onClick={() => setShowAllReasons((value) => !value)}
                aria-expanded={showAllReasons}
                className="rounded text-xs font-medium text-slate-500 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {showAllReasons ? 'Show less' : `+${reasons.length - 2} more`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
