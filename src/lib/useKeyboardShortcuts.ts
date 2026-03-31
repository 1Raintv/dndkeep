import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
  onDice?: () => void;
  onRest?: () => void;
  onInspiration?: () => void;
  onSearch?: () => void;
}

/**
 * Global keyboard shortcuts for the character sheet.
 * R = dice roller, T = rest, I = inspiration, Escape = close modals
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    
    // Don't fire shortcuts when typing in inputs
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.target as HTMLElement).isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key.toLowerCase()) {
      case 'r':
        e.preventDefault();
        handlers.onDice?.();
        break;
      case 't':
        e.preventDefault();
        handlers.onRest?.();
        break;
      case 'i':
        e.preventDefault();
        handlers.onInspiration?.();
        break;
      case '/':
        e.preventDefault();
        handlers.onSearch?.();
        break;
    }
  }, [handlers, enabled]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/** Toast that briefly shows a shortcut hint */
export const SHORTCUT_HINTS = [
  { key: 'R', label: 'Open Dice Roller' },
  { key: 'T', label: 'Rest Menu' },
  { key: 'I', label: 'Toggle Inspiration' },
];
