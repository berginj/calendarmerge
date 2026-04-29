import { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated';
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white rounded-lg overflow-hidden',
        {
          'shadow-sm border border-slate-200': variant === 'default',
          'border-2 border-slate-300': variant === 'outlined',
          'shadow-lg': variant === 'elevated',
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('px-6 py-4 border-b border-slate-200', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h3 className={clsx('text-lg font-semibold text-slate-900', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={clsx('text-sm text-slate-600 mt-1', className)}>
      {children}
    </p>
  );
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('px-6 py-4', className)}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('px-6 py-4 bg-slate-50 border-t border-slate-200', className)}>
      {children}
    </div>
  );
}
