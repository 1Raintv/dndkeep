import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import MonsterAddModal from '../Campaign/MonsterAddModal';

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp?: number;
  maxHp?: number;
  ac?: number;
  isPlayer: boolean;
  characterId?: string;
  conditions?: string[];
  emoji?: string;
  color?: string;
}

interface SessionState {
  initiative_order: Combatant[];
  current_turn: number;
  round: number;
  combat_active: boolean;
}

interface Props {
  campaignId: string;
  isDM: boolean;
  characterName?: string;
  characterId?: string;
}

export default function InitiativeTracker({ campaignId, isDM, characterName, characterId }: Props) {
  const [state, setState] = useState<SessionState>({ initiative_order: [], current_turn: 0, round: 1, combat_active: false });
  const [stateId, setStateId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addInit, setAddInit] = useState('');
  const [addHp, setAddHp] = useState('');
  const [addAc, setAddAc] = useState('');
  const [addEmoji, setAddEmoji] = useState('👹');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  // v2.383.0 — Drag-to-reorder state ported from the (now deleted) Campaign
  // copy. draggedId is the combatant being dragged; dropTargetId is the
  // row it's hovered over. Both clear on drop / dragend.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // v2.383.0 — Quick-add NPC picker (MonsterAddModal) toggle.
  const [showPicker, setShowPicker] = useState(false);

  const push = useCallback(async (next: SessionState) => {
    setState(next);
    if (stateId) {
      await supabase.from('session_states').update({ ...next, updated_at: new Date().toISOString() }).eq('id', stateId);
    } else {
      const { data } = await supabase.from('session_states').insert({ campaign_id: campaignId, ...next }).select('id').single();
      if (data) setStateId(data.id);
    }
  }, [campaignId, stateId]);

  useEffect(() => {
    // Load initial state
    supabase.from('session_states').select('*').eq('campaign_id', campaignId).maybeSingle()
      .then(({ data }) => {
        if (data) { setState(data); setStateId(data.id); }
        setLoading(false);
      });

    // Realtime subscription for initiative state
    const ch = supabase.channel(`initiative-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_states', filter: `campaign_id=eq.${campaignId}` },
        ({ new: d }) => { if (d) setState(d as SessionState); }
      ).subscribe();

    // Listen for turn notifications (players get their own)
    const notifyCh = supabase.channel(`turn-notify-${campaignId}`)
      .on('broadcast', { event: 'your_turn' }, ({ payload }) => {
        if (payload.characterId === characterId) {
          // Show local notification
          if ('Notification' in window && Notification.permission === 'granted') {
            navigator.serviceWorker?.ready.then(reg => {
              reg.showNotification("⚔️ Your Turn!", {
                body: `Round ${payload.round} — it's your move, ${payload.name}!`,
                icon: '/icon-192.png',
                tag: 'dndkeep-initiative',
              });
            });
          }
        }
      }).subscribe();

    return () => { supabase.removeChannel(ch); supabase.removeChannel(notifyCh); };
  }, [campaignId]);

  function sorted(order: Combatant[]) {
    return [...order].sort((a, b) => b.initiative - a.initiative);
  }

  // v2.383.0 — Drag-drop reorder. Mutates the dragged combatant's initiative
  // value to land it ABOVE the drop target after re-sort. Decimal initiatives
  // are allowed and serve as natural tiebreakers; D&D 5e RAW doesn't forbid
  // them. The stored array is kept sorted-by-initiative-desc so render-as-is
  // continues to work (matches the addCombatant invariant).
  function reorderCombatant(fromId: string, toId: string) {
    if (fromId === toId) return;
    const order = state.initiative_order;
    const dragged = order.find(c => c.id === fromId);
    if (!dragged) return;
    const ordered = [...order].sort((a, b) => b.initiative - a.initiative);
    const filtered = ordered.filter(c => c.id !== fromId);
    const dropIdx = filtered.findIndex(c => c.id === toId);
    if (dropIdx < 0) return;
    // Dragged lands at filtered[dropIdx]'s slot (ABOVE the drop target).
    //   above = filtered[dropIdx - 1]
    //   below = filtered[dropIdx]
    const above = filtered[dropIdx - 1];
    const below = filtered[dropIdx];
    let newInit: number;
    if (!above && !below) newInit = dragged.initiative;
    else if (!above) newInit = below.initiative + 1;
    else if (!below) newInit = above.initiative - 1;
    else newInit = (above.initiative + below.initiative) / 2;
    const updated = order.map(c =>
      c.id === fromId ? { ...c, initiative: newInit } : c
    );
    push({ ...state, initiative_order: sorted(updated) });
  }

  // v2.383.0 — Bulk add for the creature picker. Rolls happen in the modal
  // (each combatant brings its own pre-rolled initiative); we just merge,
  // sort, and persist.
  function addCombatants(newOnes: Combatant[]) {
    if (newOnes.length === 0) return;
    push({ ...state, initiative_order: sorted([...state.initiative_order, ...newOnes]) });
  }

  function addCombatant() {
    if (!addName.trim() || !addInit.trim()) return;
    const c: Combatant = {
      id: crypto.randomUUID(), name: addName.trim(),
      initiative: parseInt(addInit) || 0,
      hp: addHp ? parseInt(addHp) : undefined,
      maxHp: addHp ? parseInt(addHp) : undefined,
      ac: addAc ? parseInt(addAc) : undefined,
      isPlayer: false, emoji: addEmoji, color: '#ef4444', conditions: [],
    };
    push({ ...state, initiative_order: sorted([...state.initiative_order, c]) });
    setAddName(''); setAddInit(''); setAddHp(''); setAddAc(''); setShowAdd(false);
  }

  function removeCombatant(id: string) {
    const next = state.initiative_order.filter(c => c.id !== id);
    push({ ...state, initiative_order: next, current_turn: Math.min(state.current_turn, Math.max(0, next.length - 1)) });
  }

  function nextTurn() {
    const len = state.initiative_order.length;
    if (len === 0) return;
    let next = state.current_turn + 1;
    let round = state.round;
    if (next >= len) { next = 0; round++; }
    const nextCombatant = state.initiative_order[next];
    push({ ...state, current_turn: next, round });
    // Send local push notification to the player whose turn it is
    if (nextCombatant?.isPlayer && nextCombatant?.characterId) {
      // Broadcast via realtime — each client handles their own notification
      supabase.channel(`turn-notify-${campaignId}`).send({
        type: 'broadcast', event: 'your_turn',
        payload: { characterId: nextCombatant.characterId, name: nextCombatant.name, round }
      });
    }
  }

  function prevTurn() {
    const len = state.initiative_order.length;
    if (len === 0) return;
    let prev = state.current_turn - 1;
    let round = state.round;
    if (prev < 0) { prev = len - 1; round = Math.max(1, round - 1); }
    push({ ...state, current_turn: prev, round });
  }

  function startCombat() { push({ ...state, combat_active: true, current_turn: 0, round: 1 }); }
  function endCombat() { push({ initiative_order: [], current_turn: 0, round: 1, combat_active: false }); }

  function updateHp(id: string, delta: number) {
    const order = state.initiative_order.map(c => c.id === id && c.hp !== undefined
      ? { ...c, hp: Math.max(0, c.hp + delta) } : c);
    push({ ...state, initiative_order: order });
  }

  function toggleCondition(id: string, cond: string) {
    const order = state.initiative_order.map(c => {
      if (c.id !== id) return c;
      const conds = c.conditions ?? [];
      return { ...c, conditions: conds.includes(cond) ? conds.filter(x => x !== cond) : [...conds, cond] };
    });
    push({ ...state, initiative_order: order });
  }

  const combatants = state.initiative_order;
  const current = combatants[state.current_turn];

  if (loading) return <div style={{ padding: 12, color: 'var(--t-3)', fontFamily: 'var(--ff-body)', fontSize: 12 }}>Loading initiative...</div>;

  return (
    <div style={{ fontFamily: 'var(--ff-body)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: state.combat_active ? '#f87171' : 'var(--t-3)' }}>
            {state.combat_active ? `⚔️ Round ${state.round}` : '⚔️ Initiative'}
          </span>
          {state.combat_active && (
            <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
              Turn {state.current_turn + 1}/{combatants.length}
            </span>
          )}
        </div>
        {isDM && (
          <div style={{ display: 'flex', gap: 4 }}>
            {!state.combat_active ? (
              <button className="btn-primary btn-sm" onClick={startCombat} disabled={combatants.length === 0}
                style={{ fontSize: 10, padding: '2px 8px' }}>
                Start Combat
              </button>
            ) : (
              <button className="btn-ghost btn-sm" onClick={endCombat} style={{ fontSize: 10, color: '#f87171', padding: '2px 8px' }}>
                End Combat
              </button>
            )}
            <button className="btn-ghost btn-sm" onClick={() => setShowPicker(true)} style={{ fontSize: 10, padding: '2px 8px' }} title="Pick from your creature library">
              + From Creatures
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setShowAdd(s => !s)} style={{ fontSize: 10, padding: '2px 8px' }}>
              + Add
            </button>
          </div>
        )}
      </div>

      {/* Add combatant form */}
      {isDM && showAdd && (
        <div style={{ background: '#0d1117', border: '1px solid var(--c-border)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={addEmoji} onChange={e => setAddEmoji(e.target.value)} placeholder="👹" style={{ width: 36, textAlign: 'center', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 4, color: 'var(--t-1)', fontSize: 16, padding: '4px 0' }} />
            <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Name" style={{ flex: 1, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 4, color: 'var(--t-1)', fontSize: 12, padding: '4px 8px', fontFamily: 'var(--ff-body)' }} />
            <input value={addInit} onChange={e => setAddInit(e.target.value)} placeholder="Init" type="number" style={{ width: 48, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 4, color: 'var(--t-1)', fontSize: 12, padding: '4px 6px', fontFamily: 'var(--ff-body)' }} />
            <input value={addHp} onChange={e => setAddHp(e.target.value)} placeholder="HP" type="number" style={{ width: 48, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 4, color: 'var(--t-1)', fontSize: 12, padding: '4px 6px', fontFamily: 'var(--ff-body)' }} />
            <input value={addAc} onChange={e => setAddAc(e.target.value)} placeholder="AC" type="number" style={{ width: 42, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 4, color: 'var(--t-1)', fontSize: 12, padding: '4px 6px', fontFamily: 'var(--ff-body)' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-primary btn-sm" onClick={addCombatant} style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>Add</button>
            <button className="btn-ghost btn-sm" onClick={() => setShowAdd(false)} style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Combatant list */}
      {combatants.length === 0 ? (
        <div style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--t-3)', fontSize: 11, border: '1px dashed var(--c-border)', borderRadius: 8 }}>
          {isDM ? 'Add combatants to start tracking initiative' : 'No combat active'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {combatants.map((c, i) => {
            const isActive = state.combat_active && i === state.current_turn;
            const isMyChar = c.characterId === characterId || c.name === characterName;
            const hpPct = c.maxHp ? (c.hp ?? 0) / c.maxHp : 1;
            const hpColor = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
            // v2.383.0 — Dead state. Monsters at 0 HP dim, get a strikethrough
            // name, and swap their conditions area for a DEFEATED badge. PCs
            // at 0 HP go unconscious — handled by the existing condition flow.
            const isDead = !c.isPlayer && (c.hp ?? 0) <= 0;
            const isDropTarget = dropTargetId === c.id && draggedId !== null && draggedId !== c.id;
            const isDragging = draggedId === c.id;
            // v2.383.0 — Condition pills. Up to 3 inline; >6-char names are
            // truncated to 4 chars + ellipsis. Overflow becomes "+N" with the
            // rest in the title attribute. Hidden when defeated.
            const conds = c.conditions ?? [];
            const showConds = !isDead && conds.length > 0;
            const visibleConds = conds.slice(0, 3);
            const overflowConds = conds.slice(3);

            return (
              <div
                key={c.id}
                draggable={isDM}
                onDragStart={isDM ? (e) => {
                  setDraggedId(c.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', c.id);
                } : undefined}
                onDragEnd={isDM ? () => {
                  setDraggedId(null);
                  setDropTargetId(null);
                } : undefined}
                onDragOver={isDM ? (e) => {
                  if (!draggedId || draggedId === c.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropTargetId !== c.id) setDropTargetId(c.id);
                } : undefined}
                onDragLeave={isDM ? () => {
                  if (dropTargetId === c.id) setDropTargetId(null);
                } : undefined}
                onDrop={isDM ? (e) => {
                  e.preventDefault();
                  if (draggedId && draggedId !== c.id) reorderCombatant(draggedId, c.id);
                  setDraggedId(null);
                  setDropTargetId(null);
                } : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderRadius: 8,
                  border: `1.5px solid ${
                    isActive ? '#f59e0b'
                    : isDropTarget ? 'var(--c-gold-l, #fbbf24)'
                    : isMyChar ? 'var(--c-border-strong, #2d3748)'
                    : 'var(--c-border)'
                  }`,
                  borderStyle: isDropTarget ? 'dashed' : 'solid',
                  background: isActive ? 'rgba(245,158,11,0.08)'
                    : isDropTarget ? 'rgba(251,191,36,0.05)'
                    : isMyChar ? 'rgba(255,255,255,0.03)'
                    : 'transparent',
                  opacity: isDead ? 0.45 : isDragging ? 0.5 : 1,
                  cursor: isDM ? (isDragging ? 'grabbing' : 'grab') : 'default',
                  transition: 'opacity .15s, border-color .15s, background .15s',
                }}>
                {/* Turn indicator */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? '#f59e0b' : 'transparent', border: `1px solid ${isActive ? '#f59e0b' : 'var(--c-border)'}`, flexShrink: 0 }} />

                {/* Initiative badge */}
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--c-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: isActive ? '#f59e0b' : 'var(--t-2)', flexShrink: 0 }}>
                  {c.initiative}
                </div>

                {/* Emoji + name */}
                <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{c.emoji ?? (c.isPlayer ? '🧙' : '👹')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: 12,
                    color: isActive ? 'var(--t-1)' : 'var(--t-2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: isDead ? 'line-through' : 'none',
                  }}>
                    {c.name} {isMyChar && <span style={{ fontSize: 9, color: 'var(--c-gold-l)', fontWeight: 400 }}>(you)</span>}
                    {isDead && (
                      <span style={{
                        marginLeft: 6, fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
                        color: '#fca5a5', background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.4)',
                        padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase',
                      }}>
                        Defeated
                      </span>
                    )}
                  </div>
                  {/* HP bar */}
                  {c.hp !== undefined && c.maxHp !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <div style={{ flex: 1, height: 3, background: 'var(--c-border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${hpPct * 100}%`, background: hpColor, borderRadius: 2, transition: 'width .2s' }} />
                      </div>
                      <span style={{ fontSize: 9, color: hpColor, flexShrink: 0 }}>{c.hp}/{c.maxHp}</span>
                    </div>
                  )}
                  {/* Condition pills (v2.383) */}
                  {showConds && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                      {visibleConds.map(cond => (
                        <span
                          key={cond}
                          title={cond}
                          onClick={() => isDM && toggleCondition(c.id, cond)}
                          onMouseDown={e => e.stopPropagation()}
                          onDragStart={e => e.preventDefault()}
                          style={{
                            fontSize: 8, fontWeight: 700,
                            color: '#fbbf24', background: 'rgba(251,191,36,0.1)',
                            border: '1px solid rgba(251,191,36,0.35)',
                            padding: '1px 5px', borderRadius: 3,
                            letterSpacing: '0.04em', whiteSpace: 'nowrap',
                            cursor: isDM ? 'pointer' : 'default',
                          }}
                        >
                          {cond.length > 6 ? cond.slice(0, 4) + '…' : cond}
                        </span>
                      ))}
                      {overflowConds.length > 0 && (
                        <span
                          title={overflowConds.join(', ')}
                          style={{
                            fontSize: 8, fontWeight: 700,
                            color: '#fbbf24', background: 'rgba(251,191,36,0.1)',
                            border: '1px solid rgba(251,191,36,0.35)',
                            padding: '1px 5px', borderRadius: 3,
                          }}
                        >
                          +{overflowConds.length}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* AC */}
                {c.ac !== undefined && (
                  <span style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0 }}>🛡{c.ac}</span>
                )}

                {/* DM HP controls */}
                {isDM && c.hp !== undefined && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => updateHp(c.id, -1)} onMouseDown={e => e.stopPropagation()} onDragStart={e => e.preventDefault()} style={{ width: 18, height: 18, background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: '#f87171', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</button>
                    <button onClick={() => updateHp(c.id, 1)} onMouseDown={e => e.stopPropagation()} onDragStart={e => e.preventDefault()} style={{ width: 18, height: 18, background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: '#4ade80', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
                  </div>
                )}

                {/* DM remove */}
                {isDM && (
                  <button onClick={() => removeCombatant(c.id)} onMouseDown={e => e.stopPropagation()} onDragStart={e => e.preventDefault()} style={{ width: 16, height: 16, background: 'none', border: 'none', color: 'var(--t-3)', fontSize: 11, cursor: 'pointer', flexShrink: 0, opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove">✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Turn controls (DM only) */}
      {isDM && state.combat_active && combatants.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button className="btn-ghost btn-sm" onClick={prevTurn} style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>← Prev</button>
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Current</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#f59e0b', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{current?.name ?? '—'}</span>
          </div>
          <button className="btn-primary btn-sm" onClick={nextTurn} style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>Next →</button>
        </div>
      )}

      {/* v2.383.0 — Quick-add NPC picker (DM only) */}
      {isDM && showPicker && (
        <MonsterAddModal
          campaignId={campaignId}
          onAdd={(combatants) => { addCombatants(combatants); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
