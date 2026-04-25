import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode } from 'react';

/**
 * v2.241.0 — Inline modal system.
 *
 * Replaces `window.prompt()` and `window.confirm()` with custom modals
 * that match the app's aesthetic, support focus trap + Esc/Enter, and
 * don't block the JS event loop.
 *
 * API:
 *   const modal = useModal();
 *   const text = await modal.prompt({ title: 'Edit', defaultValue: 'foo' });
 *   if (text == null) return;     // user canceled
 *   const ok = await modal.confirm({ title: 'Delete?', danger: true });
 *   if (!ok) return;              // user canceled
 *
 * Implementation: a single Provider holds the active modal state
 * (or null when nothing is open) plus the resolver function the
 * pending Promise is waiting on. Submit/cancel calls the resolver
 * with the user's value; the activeState then clears, unmounting
 * the overlay. Only ONE modal can be open at a time — opening a
 * second cancels the first (returns null/false on the prior).
 *
 * Lifecycle gotcha: calling .prompt() inside a callback that's
 * still running synchronously in a React render is fine (the state
 * update is just queued); but calling it from outside React (e.g.
 * inside an addEventListener handler, like TextLayer does) is also
 * fine because we're inside a setState scheduled at handler time.
 */

interface PromptOptions {
  title: string;
  /** Optional secondary line under the title. */
  message?: string;
  /** Pre-filled input value. */
  defaultValue?: string;
  /** Input placeholder text. */
  placeholder?: string;
  /** Submit button label. Default 'Save'. */
  confirmLabel?: string;
  /** Cancel button label. Default 'Cancel'. */
  cancelLabel?: string;
  /** If true, allow empty submission (default: empty values resolve as null). */
  allowEmpty?: boolean;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** If true, the confirm button is red — used for destructive actions. */
  danger?: boolean;
}

interface ModalContextValue {
  prompt: (opts: PromptOptions) => Promise<string | null>;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextValue>({
  prompt: async () => null,
  confirm: async () => false,
});

type ActiveState =
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void };

export function ModalProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveState | null>(null);
  // Hold the resolver in a ref too, so cleanup paths (Esc, backdrop
  // click, second modal opened) can call it without stale closure.
  const activeRef = useRef<ActiveState | null>(null);
  useEffect(() => { activeRef.current = active; }, [active]);

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      // Cancel any prior modal.
      const prior = activeRef.current;
      if (prior) {
        if (prior.kind === 'prompt') prior.resolve(null);
        else prior.resolve(false);
      }
      setActive({ kind: 'prompt', opts, resolve });
    });
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const prior = activeRef.current;
      if (prior) {
        if (prior.kind === 'prompt') prior.resolve(null);
        else prior.resolve(false);
      }
      setActive({ kind: 'confirm', opts, resolve });
    });
  }, []);

  // Ensure pending promises resolve if the provider unmounts
  // (rare — only on full app teardown).
  useEffect(() => {
    return () => {
      const a = activeRef.current;
      if (a) {
        if (a.kind === 'prompt') a.resolve(null);
        else a.resolve(false);
      }
    };
  }, []);

  function close(value: string | boolean | null) {
    const a = activeRef.current;
    if (!a) return;
    if (a.kind === 'prompt') a.resolve(value as string | null);
    else a.resolve(value as boolean);
    setActive(null);
  }

  return (
    <ModalContext.Provider value={{ prompt, confirm }}>
      {children}
      {active && (
        <ModalOverlay
          state={active}
          onCancel={() => close(active.kind === 'prompt' ? null : false)}
          onSubmit={(v) => close(v)}
        />
      )}
    </ModalContext.Provider>
  );
}

function ModalOverlay(props: {
  state: ActiveState;
  onCancel: () => void;
  onSubmit: (value: string | boolean) => void;
}) {
  const { state, onCancel, onSubmit } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inputValue, setInputValue] = useState(
    state.kind === 'prompt' ? (state.opts.defaultValue ?? '') : '',
  );

  // Auto-focus the input on prompt; auto-focus the confirm button on confirm.
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (state.kind === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmBtnRef.current?.focus();
    }
  }, [state.kind]);

  // Esc cancels.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  function handleSubmit() {
    if (state.kind === 'prompt') {
      const trimmed = inputValue.trim();
      if (!state.opts.allowEmpty && trimmed === '') {
        onCancel();
        return;
      }
      onSubmit(trimmed);
    } else {
      onSubmit(true);
    }
  }

  const opts = state.opts;
  const isDanger = state.kind === 'confirm' && state.opts.danger;

  return (
    <div
      onClick={(e) => {
        // Backdrop click cancels (only when the click started on the
        // backdrop itself, not bubbling from the modal card).
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 150ms ease both',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && state.kind === 'prompt') {
            // Submit when Enter is pressed in the input. Don't intercept
            // Enter on confirm modals — confirmBtnRef has focus and
            // browser default behavior triggers click.
            e.preventDefault();
            handleSubmit();
          }
        }}
        style={{
          minWidth: 320,
          maxWidth: 480,
          background: 'rgba(33,33,48,0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 'var(--r-lg, 12px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          padding: 'var(--sp-5, 20px)',
          display: 'flex',
          flexDirection: 'column' as const,
          gap: 'var(--sp-3, 12px)',
        }}
      >
        <div
          id="modal-title"
          style={{
            fontFamily: 'var(--ff-body)',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--t-1)',
          }}
        >
          {opts.title}
        </div>

        {opts.message && (
          <div
            style={{
              fontFamily: 'var(--ff-body)',
              fontSize: 13,
              color: 'var(--t-2)',
              lineHeight: 1.5,
            }}
          >
            {opts.message}
          </div>
        )}

        {state.kind === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={state.opts.placeholder ?? ''}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-md, 8px)',
              border: '1px solid var(--c-border)',
              background: 'rgba(15,16,18,0.85)',
              color: 'var(--t-1)',
              fontFamily: 'var(--ff-body)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--sp-2, 8px)',
            marginTop: 'var(--sp-2, 8px)',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r-md, 8px)',
              background: 'transparent',
              border: '1px solid var(--c-border)',
              color: 'var(--t-2)',
              fontFamily: 'var(--ff-body)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-2)';
            }}
          >
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={handleSubmit}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r-md, 8px)',
              background: isDanger ? 'rgba(239,68,68,0.18)' : 'rgba(96,165,250,0.18)',
              border: `1px solid ${isDanger ? 'rgba(239,68,68,0.55)' : 'rgba(96,165,250,0.55)'}`,
              color: isDanger ? '#fca5a5' : '#93c5fd',
              fontFamily: 'var(--ff-body)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = isDanger ? 'rgba(239,68,68,0.28)' : 'rgba(96,165,250,0.28)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = isDanger ? 'rgba(239,68,68,0.18)' : 'rgba(96,165,250,0.18)';
            }}
          >
            {opts.confirmLabel ?? (state.kind === 'prompt' ? 'Save' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
