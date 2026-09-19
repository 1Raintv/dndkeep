// v2.255.0 — Battle map undo/redo for drawings and texts.
//
// Scene-scoped history stack. Each entry has forward/backward closures
// that re-perform or reverse the change. Closures capture the data
// they need (id, prior position, etc.) so we don't have to re-derive
// state at undo time.
//
// Bound to Cmd-Z / Ctrl-Z (undo) and Cmd-Shift-Z / Ctrl-Shift-Z (redo).
// Limited to 50 entries per scene (older entries drop off) — large
// enough that normal in-session work won't exhaust it, small enough
// that the per-scene memory footprint stays trivial.
//
// Drawings/texts and DM token moves use this history. Token actions check
// current positions and drag locks before saving, so stale history cannot
// knowingly overwrite a newer peer move (v2.699).
//
// History is *not* persisted across page reloads. Same contract as
// most desktop apps' undo stacks — a refresh is a clean slate.

import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from '../log';

export interface UndoableAction {
  /** Human label shown in the map's Undo and Redo controls. */
  label: string;
  /** Re-perform the action. Called on initial commit (no — see record() below)
   *  and on redo. Should be idempotent against the current state. */
  forward: () => Promise<void> | void;
  /** Reverse the action. Called on undo. */
  backward: () => Promise<void> | void;
}

interface UndoState {
  past: UndoableAction[];
  future: UndoableAction[];
}

const MAX_HISTORY = 50;

/**
 * Returns a record/undo/redo trio scoped to the given scene id.
 * Switching scenes resets the stack (history doesn't carry across
 * scenes — undoing a draw in Scene A while looking at Scene B would
 * be confusing).
 */
export function useUndoRedo(sceneId: string | null) {
  // The ref gives asynchronous actions the latest history without stale closures.
  const stateRef = useRef<UndoState>({ past: [], future: [] });
  const sceneRef = useRef<string | null>(null);
  const sceneEpoch = useRef(0);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // v2.701 — Mirror history and pending state for visible Undo/Redo controls.
  const [history, setHistory] = useState<UndoState>(stateRef.current);
  const [busy, setBusy] = useState(false);

  // Reset history when the active scene changes. Comparing against a
  // ref so we don't reset on every re-render — only on actual scene
  // switch.
  useEffect(() => {
    if (sceneRef.current !== sceneId) {
      sceneRef.current = sceneId;
      sceneEpoch.current++;
      stateRef.current = { past: [], future: [] };
      setHistory(stateRef.current);
      setError(null);
    }
  }, [sceneId]);

  /**
   * Push an action onto the history stack. Caller has already executed
   * the forward op — record() just stores the closures so undo can
   * reverse it later. Pushing a new action wipes the redo stack
   * (standard editor semantics — branching from a mid-history point).
   */
  const record = useCallback((action: UndoableAction) => {
    const past = [...stateRef.current.past, action];
    if (past.length > MAX_HISTORY) past.shift();
    stateRef.current = { past, future: [] };
    setHistory(stateRef.current);
    setError(null);
  }, []);

  const undo = useCallback(async () => {
    const snapshot = stateRef.current;
    const scene = sceneEpoch.current;
    const { past } = snapshot;
    if (busyRef.current || past.length === 0) return false;
    const action = past[past.length - 1];
    busyRef.current = true; setBusy(true);
    try {
      await action.backward();
      if (sceneEpoch.current !== scene) return false;
      // v2.699 — only consume a successful action. Preserve any newer records
      // created while the request was in flight; they invalidate redo.
      const current = stateRef.current;
      const newPast = current.past.filter(entry => entry !== action);
      stateRef.current = { past: newPast, future: current === snapshot ? [...current.future, action] : [] };
      setHistory(stateRef.current);
      setError(null);
    } catch (err) {
      log.error('Map undo failed', err, { action: action.label });
      if (sceneEpoch.current === scene) setError('Undo could not be saved. Try again.');
      return false;
    } finally { busyRef.current = false; setBusy(false); }
    return true;
  }, []);

  const redo = useCallback(async () => {
    const snapshot = stateRef.current;
    const scene = sceneEpoch.current;
    const { past, future } = snapshot;
    if (busyRef.current || future.length === 0) return false;
    const action = future[future.length - 1];
    busyRef.current = true; setBusy(true);
    try {
      await action.forward();
      if (sceneEpoch.current !== scene) return false;
      const current = stateRef.current;
      // History may have reached its cap while newer edits were recorded.
      // Find their boundary by identity, not the old array length.
      const firstNew = current.past.findIndex(entry => !past.includes(entry));
      const insertion = firstNew < 0 ? current.past.length : firstNew;
      const newPast = [...current.past.slice(0, insertion), action, ...current.past.slice(insertion)].slice(-MAX_HISTORY);
      stateRef.current = { past: newPast, future: current === snapshot ? future.slice(0, -1) : [] };
      setHistory(stateRef.current);
      setError(null);
    } catch (err) {
      log.error('Map redo failed', err, { action: action.label });
      if (sceneEpoch.current === scene) setError('Redo could not be saved. Try again.');
      return false;
    } finally { busyRef.current = false; setBusy(false); }
    return true;
  }, []);

  // Bind keyboard shortcuts. Match the OS convention: Cmd on Mac,
  // Ctrl elsewhere. Bail when the user is typing in an input/
  // textarea/contenteditable so undo doesn't fight the browser's
  // built-in text undo.
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      return t.isContentEditable || !!t.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[aria-modal="true"]');
    }
    function onKey(e: KeyboardEvent) {
      // v2.728 — leave form/dialog undo and already-handled shortcuts alone.
      if(e.defaultPrevented || e.isComposing || e.altKey)return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (isEditableTarget(e.target)) return;
      // A modal can retain focus outside itself briefly while mounting.
      if([...document.querySelectorAll('dialog[open],[aria-modal="true"]')].some(el=>el.getClientRects().length>0))return;
      const stack=e.shiftKey ? stateRef.current.future : stateRef.current.past;
      if(!stack.length)return;
      e.preventDefault();
      if(e.repeat)return;
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { record, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    lastActionLabel: history.past[history.past.length-1]?.label ?? null,
    nextActionLabel: history.future[history.future.length-1]?.label ?? null, busy, error };
}
