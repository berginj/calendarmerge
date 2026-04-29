import * as SwitchPrimitive from '@radix-ui/react-switch';
import { clsx } from 'clsx';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export default function Switch({ checked, onCheckedChange, label, disabled, className }: SwitchProps) {
  return (
    <label className={clsx('flex items-center gap-3', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', className)}>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={clsx(
          'relative w-11 h-6 rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary-700' : 'bg-slate-300'
        )}
      >
        <SwitchPrimitive.Thumb
          className={clsx(
            'block w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
            'will-change-transform',
            checked ? 'translate-x-6' : 'translate-x-0.5'
          )}
        />
      </SwitchPrimitive.Root>
      {label && (
        <span className="text-sm font-medium text-slate-900 select-none">
          {label}
        </span>
      )}
    </label>
  );
}
