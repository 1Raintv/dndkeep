// v2.653.0 — SelectionActionBar.
//
// Floats over the canvas whenever more than one token is selected and
// applies one edit to all of them. DM only; every action here is a
// write RLS refuses for players.
//
// v2.700 — group drag and arrow controls arrange tokens outside combat.
// Combat keeps the single-creature movement-budget and active-turn path.

import { useRef, useState } from 'react';
import { useBattleMapStore, type Token } from '../../../lib/stores/battleMapStore';
import * as tokensApi from '../../../lib/api/tokensApiRouter';
import { useModal } from '../../shared/Modal';
import { useToast } from '../../shared/Toast';
import './SelectionActionBar.css';

export function SelectionActionBar(props: {
  selectedIds: ReadonlySet<string>;
  campaignId: string;
  onClear: () => void;
  onMove: (dx:number,dy:number)=>Promise<void>;
  movementDisabled: boolean;
}) {
  const { selectedIds, campaignId, onClear } = props;
  const tokens = useBattleMapStore(s => s.tokens);
  const removeToken = useBattleMapStore(s => s.removeToken);
  const updateTokenFields = useBattleMapStore(s => s.updateTokenFields);
  const { confirm: confirmModal } = useModal();
  const {showToast}=useToast();
  const [busy, setBusy] = useState(false);
  const pending=useRef(false);
  const [error,setError]=useState('');

  const selected = [...selectedIds].map(id => tokens[id]).filter(Boolean) as Token[];
  if (selected.length < 2) return null;

  /** v2.710 — confirm each save before changing local state; false is a failure too. */
  async function patchAll(patch: Partial<Token>, targets=selected) {
    if(pending.current)return;
    if(patch.isLocked!==undefined && targets.some(t=>t.combatantId)) {
      setError('Locking is not available for this scene yet.');return;
    }
    pending.current=true;setError('');
    setBusy(true);
    try {
      const results=await Promise.all(targets.map(async t => {
        try {
          const saved=await tokensApi.updateToken(t.id, patch, { campaignId });
          if(saved)updateTokenFields(t.id, patch);
          return saved;
        } catch { return false; }
      }));
      const failed=results.filter(ok=>!ok).length;
      if(failed)setError(`${failed} of ${targets.length} token updates failed. ${failed<targets.length ? 'Successful changes were kept. ' : ''}Try again.`);
    } finally {
      pending.current=false;setBusy(false);
    }
  }

  async function deleteAll() {
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
    const ok = await confirmModal({
      title: `Delete ${selected.length} tokens?`,
      message: 'They are removed from this scene for everyone. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
      const results=await Promise.all(selected.map(async t => {
        try {
          const saved=await tokensApi.deleteToken(t.id, { campaignId });
          if(saved)removeToken(t.id);
          return saved;
        } catch { return false; }
      }));
      const failed=results.filter(ok=>!ok).length;
      if(failed) {
        const message=`${failed} token deletions failed. Those tokens were kept. Try again.`;
        setError(message);showToast(message,'error');
      }
      else onClear();
    } finally {
      pending.current=false;setBusy(false);
    }
  }

  // Character-linked tokens are skipped by the visibility actions for
  // the same reason the single-token menu skips them (v2.282): a PC
  // token hidden from players just vanishes from their RLS-filtered
  // SELECT and the owning player loses sight of themselves.
  const hideable = selected.filter(t => !t.characterId);

  const btn: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--c-border)',
    background: 'transparent',
    color: 'var(--t-2)',
    fontFamily: 'var(--ff-body)',
    fontSize: 11,
    fontWeight: 700,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.5 : 1,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      className="map-selection-actions"
      role="toolbar"
      aria-label="Selected tokens"
      style={{
        zIndex: 30, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '6px 10px',
        background: 'rgba(15,16,18,0.94)',
        border: '1px solid var(--c-border)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
        maxWidth: 'calc(100% - 24px)',
      }}
      // The canvas below listens for pointerdown to start a marquee;
      // without this a click on the bar would clear the very selection
      // the bar is acting on.
      onPointerDown={e => e.stopPropagation()}
    >
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800, color: '#60a5fa', padding: '0 4px' }}>
        {selected.length} selected
      </span>
      <span className="map-selection-move" role="group" aria-label="Move selected tokens">
        {([['←',-1,0,'left'],['↑',0,-1,'up'],['↓',0,1,'down'],['→',1,0,'right']] as const).map(([icon,dx,dy,direction]) =>
          <button key={direction} style={btn} disabled={busy || props.movementDisabled}
            aria-label={`Move selection ${direction}`} title={props.movementDisabled ? 'Group movement is unavailable during combat' : `Move selection ${direction} one cell`}
            onClick={()=>void props.onMove(dx,dy)}>{icon}</button>)}
      </span>
      <button style={btn} disabled={busy} onClick={() => patchAll({ isLocked: true })} title="Lock — refuse drags during combat">
        ⊘ Lock
      </button>
      <button style={btn} disabled={busy} onClick={() => patchAll({ isLocked: false })} title="Unlock">
        ⊙ Unlock
      </button>
      {hideable.length > 0 && (
        <>
          <button
            style={btn}
            disabled={busy}
            onClick={() => patchAll({ visibleToAll: false },hideable)}
            title={hideable.length === selected.length
              ? 'Hide from players'
              : `Hide from players (${hideable.length} of ${selected.length} — PC tokens can't be hidden)`}
          >
            ◉ Hide
          </button>
          <button style={btn} disabled={busy} onClick={() => patchAll({ visibleToAll: true },hideable)} title="Reveal to players">
            ◉ Reveal
          </button>
        </>
      )}
      <button
        style={{ ...btn, color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}
        disabled={busy}
        onClick={deleteAll}
        title="Delete all selected tokens"
      >
        ✕ Delete
      </button>
      <button style={{ ...btn, color: 'var(--t-3)' }} disabled={busy} onClick={onClear} title="Clear selection (Esc)">
        Clear
      </button>
      {error && <span role="alert" style={{flexBasis:'100%',color:'#fca5a5',fontSize:12,whiteSpace:'normal'}}>{error}</span>}
    </div>
  );
}
