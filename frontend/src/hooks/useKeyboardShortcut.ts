import { useEffect } from 'react';

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  deps: any[] = []
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for modifier keys
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      // Parse shortcut (e.g., "cmd+k" or "?")
      const parts = key.toLowerCase().split('+');
      const mainKey = parts[parts.length - 1];
      const needsModifier = parts.includes('cmd') || parts.includes('ctrl');

      // Check if shortcut matches
      if (needsModifier && !modifierKey) return;
      if (event.key.toLowerCase() !== mainKey) return;

      // Don't trigger if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        // Exception: allow '?' for help even in inputs if it's just '?'
        if (mainKey !== '?') return;
      }

      event.preventDefault();
      callback();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, deps);
}
