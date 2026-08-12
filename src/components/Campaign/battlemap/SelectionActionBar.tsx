// v2.653.0 — SelectionActionBar.
//
// Floats over the canvas whenever more than one token is selected and
// applies one edit to all of them. DM only; every action here is a
// write RLS refuses for players.
//
// Scope note — this bar deliberately carries no MOVE action. Moving
// tokens goes through the drag pipeline in TokenLayer, which enforces
// per-creature movement budgets, wall collision, remote drag locks and
// the active-turn gate. "Move six tokens at once" has no honest answer
// during combat (six separate budgets), and bolting a bulk path onto
// that pipeline is the kind of change that quietly breaks the
// single-token drag everyone already relies on. Arrow-key nudge in
// BattleMapV2 covers aligning a cluster out of combat; a real group
// drag is queued in docs/ROADMAP.md.

import { useState } from 'react';
import { useBattleMapStore, type Token } from '../../../lib/stores/battleMapStore';
import * as tokensApi from '../../../lib/api/tokensApiRouter';
import { useModal } from '../../shared/Modal';

export function SelectionActionBar(props: {
  selectedIds: ReadonlySet<string>;
  campaignId: string;
  onClear: () => void;
}) {
  const { selectedIds, campaignId, onClear } = props;
  const tokens = useBattleMapStore(s => s.tokens);
  const removeToken = useBattleMapStore(s => s.removeToken);
  const updateTokenFields = useBattleMapStore(s => s.updateTokenFields);
  const { confirm: confirmModal } = useModal();
  const [busy, setBusy] = useState(false);

  const selected = [...selectedIds].map(id => tokens[id]).filter(Boolean) as Token[];
  if (selected.length < 2) return null;

  /** Apply one patch to every selected token, optimistically then to the DB. */
  async function patchAll(patch: Partial<Token>) {
    setBusy(true);
    try {
      await Promise.all(selected.map(async t => {
        updateTokenFields(t.id, patch);
        try {
          await tokensApi.updateToken(t.id, patch, { campaignId });
        } catch (err) {
          console.error('[SelectionActionBar] bulk update failed', t.id, err);
        }
      }));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    const ok = await confirmModal({
      title: `Delete ${selected.length} tokens?`,
      message: 'They are removed from this scene for everyone. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await Promise.all(selected.map(async t => {
        removeToken(t.id);
        try {
          await tokensApi.deleteToken(t.id, { campaignId });
        } catch (err) {
          console.error('[SelectionActionBar] bulk delete failed', t.id, err);
        }
      }));
      onClear();
    } finally {
      setBusy(false);
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
      style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 30, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '6px 10px', borderRadius: 999,
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
            onClick={() => patchAll({ visibleToAll: false })}
            title={hideable.length === selected.length
              ? 'Hide from players'
              : `Hide from players (${hideable.length} of ${selected.length} — PC tokens can't be hidden)`}
          >
            ◉ Hide
          </button>
          <button style={btn} disabled={busy} onClick={() => patchAll({ visibleToAll: true })} title="Reveal to players">
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
      <button style={{ ...btn, color: 'var(--t-3)' }} onClick={onClear} title="Clear selection (Esc)">
        Clear
      </button>
    </div>
  );
}
