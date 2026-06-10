import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { ReactNode } from 'react';
import { clsx } from 'clsx';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </AlertDialogPrimitive.Root>
  );
}

export function AlertDialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <AlertDialogPrimitive.Content
        className={clsx(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-slate-200 bg-white shadow-lg',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          className,
        )}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('px-6 py-4 border-b border-slate-200', className)}>
      {children}
    </div>
  );
}

export function AlertDialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AlertDialogPrimitive.Title className={clsx('text-lg font-semibold text-slate-900', className)}>
      {children}
    </AlertDialogPrimitive.Title>
  );
}

export function AlertDialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AlertDialogPrimitive.Description className={clsx('mt-2 text-sm text-slate-600', className)}>
      {children}
    </AlertDialogPrimitive.Description>
  );
}

export function AlertDialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4', className)}>
      {children}
    </div>
  );
}

export function AlertDialogCancel({
  children,
  className,
  asChild,
}: {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
}) {
  return (
    <AlertDialogPrimitive.Cancel asChild={asChild} className={clsx(className)}>
      {children}
    </AlertDialogPrimitive.Cancel>
  );
}

export function AlertDialogAction({
  children,
  className,
  onClick,
  asChild,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  asChild?: boolean;
}) {
  return (
    <AlertDialogPrimitive.Action asChild={asChild} className={clsx(className)} onClick={onClick}>
      {children}
    </AlertDialogPrimitive.Action>
  );
}
