import { useState, createContext, useContext, useCallback, useRef, useEffect, type ReactNode } from 'react';

/**
 * v2.240.0 — Toast adoption.
 *
 * The Provider + hook were stubbed out earlier (unused). v2.240 wires
 * them through the app, replacing the `window.alert()` calls in
 * BattleMapV2 + ClassAbilitiesSection with non-blocking toasts.
 *
 * API:
 *   const { showToast } = useToast();
 *   showToast('Saved.', 'success');
 *   showToast('Upload failed', 'error');
 *   showToast('Heads up.', 'warn');
 *   showToast('Did the thing.');                          // defaults to 'info'
 *   showToast('Sticky message', 'info', { duration: 0 }); // no auto-dismiss
 *
 * Toasts render bottom-right with the global `.toast` styling defined
 * in globals.css (success/error/info/warn left-border variants). A
 * small × dismisses manually; the auto-dismiss timer is cleared on
 * manual close so we don't double-fire setState.
 */

type ToastKind = 'success' | 'error' | 'info' | 'warn';

interface Toast {
  id: string;
  message: string;
  type: ToastKind;
}

interface ToastOptions {
  /** Auto-dismiss after this many ms. 0 = sticky (manual close only).
   *  Default 4000. */
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastKind, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track per-toast timeout handles so manual dismiss can clear them.
  // Cleaned on dismiss + on unmount.
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(x => x.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastKind = 'info', options?: ToastOptions) => {
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    const duration = options?.duration ?? 4000;
    if (duration > 0) {
      const timer = window.setTimeout(() => {
        timersRef.current.delete(id);
        setToasts(prev => prev.filter(x => x.id !== id));
      }, duration);
      timersRef.current.set(id, timer);
    }
  }, []);

  // Clean up any pending timers on unmount to avoid setState on unmounted.
  useEffect(() => {
    const map = timersRef.current;
    return () => {
      map.forEach(t => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast-${t.type} animate-fade-in`}
            role={t.type === 'error' ? 'alert' : 'status'}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--t-3)',
                cursor: 'pointer',
                padding: '0 4px',
                fontSize: 16,
                lineHeight: 1,
                minHeight: 0,
                minWidth: 0,
                flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-3)'; }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
