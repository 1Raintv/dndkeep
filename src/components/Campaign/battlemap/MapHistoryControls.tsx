import type { useUndoRedo } from '../../../lib/hooks/useUndoRedo';

/** v2.701 — keep both directions reachable by touch, and show which action
 * they affect. Disabling while saving mirrors the history request mutex. */
export function MapHistoryControls({history}:{history:ReturnType<typeof useUndoRedo>}) {
  if(!history.canUndo && !history.canRedo && !history.busy) return null;
  return <div className="map-history-controls" role="group" aria-label="Map history" aria-busy={history.busy}>
    <button type="button" disabled={!history.canUndo || history.busy}
      title={`Undo ${history.lastActionLabel ?? 'last action'} (Ctrl+Z / Cmd+Z)`}
      onClick={()=>void history.undo()}>↶ Undo{history.lastActionLabel ? ` ${history.lastActionLabel}` : ''}</button>
    <button type="button" disabled={!history.canRedo || history.busy}
      title={`Redo ${history.nextActionLabel ?? 'last action'} (Ctrl+Shift+Z / Cmd+Shift+Z)`}
      onClick={()=>void history.redo()}>↷ Redo{history.nextActionLabel ? ` ${history.nextActionLabel}` : ''}</button>
  </div>;
}
