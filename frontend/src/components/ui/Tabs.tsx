import * as TabsPrimitive from '@radix-ui/react-tabs';
import { ReactNode } from 'react';
import { clsx } from 'clsx';

export interface TabsProps {
  defaultValue: string;
  children: ReactNode;
  className?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({ defaultValue, children, className, onValueChange }: TabsProps) {
  return (
    <TabsPrimitive.Root
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      className={clsx('flex flex-col', className)}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg bg-slate-100 p-1',
        className
      )}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={clsx(
        'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm',
        'data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:text-slate-900',
        className
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={clsx(
        'mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2',
        className
      )}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
