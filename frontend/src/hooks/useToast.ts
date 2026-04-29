import { useState, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: 'success' | 'warning' | 'error' | 'info';
  duration?: number;
}

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${++toastCounter}`;
    const newToast = { ...toast, id };

    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after duration
    const duration = toast.duration ?? (toast.variant === 'error' ? 0 : 5000);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (title: string, description?: string) =>
      addToast({ title, description, variant: 'success' }),

    error: (title: string, description?: string) =>
      addToast({ title, description, variant: 'error' }),

    warning: (title: string, description?: string) =>
      addToast({ title, description, variant: 'warning' }),

    info: (title: string, description?: string) =>
      addToast({ title, description, variant: 'info' }),
  };

  return {
    toast,
    toasts,
    removeToast,
  };
}
