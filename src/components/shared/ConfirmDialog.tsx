// v2.485.0 — ConfirmDialog (in-app confirm replacement).
//
// Drop-in replacement for `window.confirm()`. The browser's native
// confirm renders an OS-level dialog that breaks the app's visual
// consistency and (on some Chrome configurations, particularly the
// Claude in Chrome extension) gets surfaced as a separate Chrome
// permission flow. The in-app version stays inside the dndkeep look,
// uses the same modal portal as every other dialog, and doesn't
// trigger extension interception.
//
// Two usage modes:
//
//   1. Component (state-driven, recommended for new code):
//        const [confirming, setConfirming] = useState(false);
//        ...
//        {confirming && (
//          <ConfirmDialog
//            title="End combat?"
//            confirmLabel="End Combat"
//            onConfirm={() => { actuallyEndCombat(); setConfirming(false); }}
//            onCancel={() => setConfirming(false)}
//          />
//        )}
//
//   2. Promise-based (closest to native confirm() ergonomics):
//        if (!(await confirmDialog({ title: 'End combat?' }))) return;
//      Resolves to true on confirm, false on cancel/dismiss. Mounts a
//      transient host into document.body, tears it down on resolution.
//      Slightly more allocation per call than the component version
//      but keeps the call site exactly as terse as `if (!confirm(…))`.

import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ModalPortal from './ModalPortal';

export interface ConfirmDialogProps {
  title: string;
  message?: string;
  /** Label for the destructive action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel action. Defaults to "Cancel". */
  cancelLabel?: string;
  /** When true, confirm button uses a destructive (red) style. Default false. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc dismisses, Enter confirms. Mirrors the keyboard behaviour of
  // native confirm() so muscle memory carries over.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={onCancel}>
        <div
          className="modal"
          onClick={e => e.stopPropagation()}
          style={{
            maxWidth: 420,
            padding: 'var(--sp-5) var(--sp-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-3)',
          }}
        >
          <div style={{
            fontSize: 'var(--fs-lg)',
            fontWeight: 800,
            color: 'var(--t-1)',
            lineHeight: 1.3,
          }}>
            {title}
          </div>
          {message && (
            <div style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--t-2)',
              lineHeight: 1.5,
            }}>
              {message}
            </div>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--sp-2)',
            marginTop: 'var(--sp-2)',
          }}>
            <button
              onClick={onCancel}
              style={{
                fontSize: 12, fontWeight: 700,
                padding: '7px 18px', borderRadius: 7,
                border: '1px solid var(--c-border)',
                background: 'var(--c-raised)',
                color: 'var(--t-2)',
                cursor: 'pointer',
                minHeight: 0,
              }}
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              autoFocus
              style={{
                fontSize: 12, fontWeight: 800,
                padding: '7px 18px', borderRadius: 7,
                border: destructive
                  ? '1px solid rgba(248,113,113,0.6)'
                  : '1px solid var(--c-gold-bdr)',
                background: destructive
                  ? 'rgba(248,113,113,0.15)'
                  : 'var(--c-gold-bg)',
                color: destructive ? '#fca5a5' : 'var(--c-gold-l)',
                cursor: 'pointer',
                minHeight: 0,
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * Promise-based confirm. Use when you want the call site to read
 * almost identically to `if (!window.confirm(...))`. Mounts a one-
 * shot dialog into a transient host attached to document.body and
 * tears it down on resolution.
 *
 * @example
 *   if (!(await confirmDialog({ title: 'End combat?', destructive: true }))) return;
 *   await actuallyEndCombat();
 */
export function confirmDialog(opts: Omit<ConfirmDialogProps, 'onConfirm' | 'onCancel'>): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    if (typeof document === 'undefined') {
      // SSR / non-browser context — degrade to "cancelled".
      resolve(false);
      return;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    function cleanup(result: boolean) {
      // Defer unmount to next tick so the click handler that
      // triggered resolution doesn't run inside an unmounted tree.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      resolve(result);
    }

    root.render(
      <ConfirmDialog
        {...opts}
        onConfirm={() => cleanup(true)}
        onCancel={() => cleanup(false)}
      />,
    );
  });
}
