import { useEffect } from 'react';

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  deps: any[] = []
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }

      const tagName = target.tagName.toLowerCase();
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        target.isContentEditable ||
        target.getAttribute('role') === 'textbox' ||
        target.closest('[contenteditable], [role="textbox"]')
      ) {
        return;
      }

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

      event.preventDefault();
      callback();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, deps);
}
