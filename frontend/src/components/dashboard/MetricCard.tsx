import { ReactNode } from 'react';
import { Card, CardContent } from '../ui/Card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';

export interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  status?: 'success' | 'warning' | 'error' | 'neutral';
  sublabel?: string;
}

export default function MetricCard({ icon, label, value, trend, status, sublabel }: MetricCardProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'warning':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-primary-700';
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600">{label}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={clsx('text-3xl font-bold', getStatusColor())}>
                {value}
              </span>
              {trend && (
                <span className={clsx(
                  'flex items-center gap-1 text-sm font-medium',
                  trend.direction === 'up' ? 'text-green-600' : 'text-red-600'
                )}>
                  {trend.direction === 'up' ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  {Math.abs(trend.value)}
                </span>
              )}
            </div>
            {sublabel && (
              <p className="mt-1 text-xs text-slate-500">{sublabel}</p>
            )}
          </div>
          <div className={clsx('p-3 rounded-lg bg-slate-50', getStatusColor())}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
