import { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export default function Badge({ className, variant = 'neutral', children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-green-100 text-green-800': variant === 'success',
          'bg-yellow-100 text-yellow-800': variant === 'warning',
          'bg-red-100 text-red-800': variant === 'error',
          'bg-blue-100 text-blue-800': variant === 'info',
          'bg-slate-100 text-slate-700': variant === 'neutral',
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
