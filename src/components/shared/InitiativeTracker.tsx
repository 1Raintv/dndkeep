import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

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

const CONDITION_ICONS: Record<string, string> = {
  blinded: '👁️', charmed: '💕', deafened: '🔇', exhaustion: '😴',
  frightened: '😱', grappled: '🤝', incapacitated: '💫', invisible: '👻',
  paralyzed: '🧊', petrified: '🪨', poisoned: '🤢', prone: '⬇️',
  restrained: '⛓️', stunned: '⭐', unconscious: '💤', concentrating: '🎯',
};

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

            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 8, border: `1.5px solid ${isActive ? '#f59e0b' : isMyChar ? 'var(--c-border-strong, #2d3748)' : 'var(--c-border)'}`,
                background: isActive ? 'rgba(245,158,11,0.08)' : isMyChar ? 'rgba(255,255,255,0.03)' : 'transparent',
                transition: 'all .15s',
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
                  <div style={{ fontWeight: 700, fontSize: 12, color: isActive ? 'var(--t-1)' : 'var(--t-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name} {isMyChar && <span style={{ fontSize: 9, color: 'var(--c-gold-l)', fontWeight: 400 }}>(you)</span>}
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
                  {/* Conditions */}
                  {c.conditions && c.conditions.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 2, flexWrap: 'wrap' }}>
                      {c.conditions.map(cond => (
                        <span key={cond} title={cond} style={{ fontSize: 10, cursor: isDM ? 'pointer' : 'default' }}
                          onClick={() => isDM && toggleCondition(c.id, cond)}>
                          {CONDITION_ICONS[cond] ?? cond.slice(0, 3)}
                        </span>
                      ))}
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
                    <button onClick={() => updateHp(c.id, -1)} style={{ width: 18, height: 18, background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: '#f87171', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</button>
                    <button onClick={() => updateHp(c.id, 1)} style={{ width: 18, height: 18, background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: '#4ade80', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
                  </div>
                )}

                {/* DM remove */}
                {isDM && (
                  <button onClick={() => removeCombatant(c.id)} style={{ width: 16, height: 16, background: 'none', border: 'none', color: 'var(--t-3)', fontSize: 11, cursor: 'pointer', flexShrink: 0, opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove">✕</button>
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
    </div>
  );
}
