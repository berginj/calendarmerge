import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';

export function DropdownMenu({ children }: { children: ReactNode }) {
  return <DropdownMenuPrimitive.Root>{children}</DropdownMenuPrimitive.Root>;
}

export function DropdownMenuTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  return (
    <DropdownMenuPrimitive.Trigger asChild={asChild}>
      {children}
    </DropdownMenuPrimitive.Trigger>
  );
}

export function DropdownMenuContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        className={clsx(
          'z-50 min-w-[12rem] overflow-hidden rounded-md bg-white p-1 shadow-lg border border-slate-200',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2',
          'data-[side=left]:slide-in-from-right-2',
          'data-[side=right]:slide-in-from-left-2',
          'data-[side=top]:slide-in-from-bottom-2',
          className
        )}
        sideOffset={5}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  disabled,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenuPrimitive.Item
      onSelect={onSelect}
      disabled={disabled}
      className={clsx(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none',
        'transition-colors',
        'focus:bg-slate-100 focus:text-slate-900',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
  className,
}: {
  children: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={clsx(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none',
        'transition-colors',
        'focus:bg-slate-100 focus:text-slate-900',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <DropdownMenuPrimitive.Separator
      className={clsx('my-1 h-px bg-slate-200', className)}
    />
  );
}

export function DropdownMenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DropdownMenuPrimitive.Label
      className={clsx('px-3 py-2 text-xs font-semibold text-slate-500', className)}
    >
      {children}
    </DropdownMenuPrimitive.Label>
  );
}
