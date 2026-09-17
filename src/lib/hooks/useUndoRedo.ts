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
  /** Human label for debugging / future toast surfacing. Not user-facing yet. */
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
  // useRef rather than useState — undo/redo doesn't need to drive
  // re-renders. The DOM update happens via the action closures
  // themselves (they touch the store, which subscribes its consumers).
  const stateRef = useRef<UndoState>({ past: [], future: [] });
  const sceneRef = useRef<string | null>(null);
  const sceneEpoch = useRef(0);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // v2.358.0 — Reactive flag + label so the parent can render a
  // visible "Undo last <action>" button. The ref above is still the
  // source of truth for forward/backward closures (they need the full
  // stack); the state below is just for UI presence.
  const [canUndo, setCanUndo] = useState(false);
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);

  // Reset history when the active scene changes. Comparing against a
  // ref so we don't reset on every re-render — only on actual scene
  // switch.
  useEffect(() => {
    if (sceneRef.current !== sceneId) {
      sceneRef.current = sceneId;
      sceneEpoch.current++;
      stateRef.current = { past: [], future: [] };
      setCanUndo(false);
      setLastActionLabel(null);
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
    setCanUndo(true);
    setLastActionLabel(action.label);
    setError(null);
  }, []);

  const undo = useCallback(async () => {
    const snapshot = stateRef.current;
    const scene = sceneEpoch.current;
    const { past } = snapshot;
    if (busyRef.current || past.length === 0) return false;
    const action = past[past.length - 1];
    busyRef.current = true;
    try {
      await action.backward();
      if (sceneEpoch.current !== scene) return false;
      // v2.699 — only consume a successful action. Preserve any newer records
      // created while the request was in flight; they invalidate redo.
      const current = stateRef.current;
      const newPast = current.past.filter(entry => entry !== action);
      stateRef.current = { past: newPast, future: current === snapshot ? [...current.future, action] : [] };
      setCanUndo(newPast.length > 0);
      setLastActionLabel(newPast[newPast.length - 1]?.label ?? null);
      setError(null);
    } catch (err) {
      log.error('Map undo failed', err, { action: action.label });
      if (sceneEpoch.current === scene) setError('Undo could not be saved. Try again.');
      return false;
    } finally { busyRef.current = false; }
    return true;
  }, []);

  const redo = useCallback(async () => {
    const snapshot = stateRef.current;
    const scene = sceneEpoch.current;
    const { past, future } = snapshot;
    if (busyRef.current || future.length === 0) return false;
    const action = future[future.length - 1];
    busyRef.current = true;
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
      setCanUndo(true);
      setLastActionLabel(newPast[newPast.length - 1]?.label ?? null);
      setError(null);
    } catch (err) {
      log.error('Map redo failed', err, { action: action.label });
      if (sceneEpoch.current === scene) setError('Redo could not be saved. Try again.');
      return false;
    } finally { busyRef.current = false; }
    return true;
  }, []);

  // Bind keyboard shortcuts. Match the OS convention: Cmd on Mac,
  // Ctrl elsewhere. Bail when the user is typing in an input/
  // textarea/contenteditable so undo doesn't fight the browser's
  // built-in text undo.
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { record, undo, redo, canUndo, lastActionLabel, error };
}
