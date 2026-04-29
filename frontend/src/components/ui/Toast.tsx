import * as ToastPrimitive from '@radix-ui/react-toast';
import { ReactNode } from 'react';
import { clsx } from 'clsx';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'warning' | 'error' | 'info';
  duration?: number;
  onOpenChange?: (open: boolean) => void;
}

export function Toast({
  title,
  description,
  variant = 'info',
  duration = 5000,
  onOpenChange,
}: Omit<ToastProps, 'id'>) {
  const getIcon = () => {
    switch (variant) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getBgColor = () => {
    switch (variant) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <ToastPrimitive.Root
      className={clsx(
        'rounded-lg border shadow-lg p-4 flex items-start gap-3 min-w-[320px] max-w-md',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
        'data-[swipe=cancel]:translate-x-0',
        'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
        getBgColor()
      )}
      duration={duration}
      onOpenChange={onOpenChange}
    >
      <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

      <div className="flex-1">
        <ToastPrimitive.Title className="text-sm font-semibold text-slate-900">
          {title}
        </ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="text-sm text-slate-600 mt-1">
            {description}
          </ToastPrimitive.Description>
        )}
      </div>

      <ToastPrimitive.Close className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors">
        <X className="h-4 w-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {children}
      <ToastPrimitive.Viewport className="fixed top-0 right-0 p-6 flex flex-col gap-2 w-full max-w-md z-50" />
    </ToastPrimitive.Provider>
  );
}
