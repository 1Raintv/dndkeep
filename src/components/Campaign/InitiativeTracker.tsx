import { useState } from 'react';
import type { SessionState, Combatant, ConditionName, OngoingDamage } from '../../types';
import ConditionTooltip from '../shared/ConditionTooltip';
import { rollDiceExpression, concentrationDC } from '../../lib/gameUtils';


interface InitiativeTrackerProps {
  sessionState: SessionState | null;
  isOwner: boolean;
  playerCharacters: { id: string; name: string; current_hp: number; max_hp: number; armor_class: number; initiative_bonus: number }[];
  onUpdateSession: (updates: Partial<SessionState>) => void;
  onToggleCombat: () => void;
}

const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'];

function rollD20() { return Math.floor(Math.random() * 20) + 1; }

export default function InitiativeTracker({ sessionState, isOwner, playerCharacters, onUpdateSession, onToggleCombat }: InitiativeTrackerProps) {
  const [newName, setNewName] = useState('');
  const [newInit, setNewInit] = useState('');
  const [newHP, setNewHP] = useState('');
  const [newAC, setNewAC] = useState('');
  const [hpDeltas, setHpDeltas] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attackResult, setAttackResult] = useState<{ hit: boolean; roll: number; total: number; damage?: number; damageRoll?: number } | null>(null);
  const [attackTarget, setAttackTarget] = useState<string>('');
  const [ongoingPrompts, setOngoingPrompts] = useState<{ id: string; name: string; od: OngoingDamage }[]>([]);
  const [concSavePrompt, setConcSavePrompt] = useState<{ combatantId: string; dc: number; damageTaken: number } | null>(null);
  // v2.382.0 — Drag-to-reorder state. draggedId is the combatant
  // currently being dragged; dropTargetId is the row hovered over.
  // Both clear on drop / dragend.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const combatants: Combatant[] = sessionState?.initiative_order ?? [];
  const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);
  const activeTurn = sessionState ? sessionState.current_turn % Math.max(combatants.length, 1) : 0;
  const activeId = sorted[activeTurn]?.id;

  // v2.382.0 — Drag-drop reorder. Adjusts the dragged combatant's
  // initiative to land it above the drop target in the auto-sort.
  // We don't store an explicit manual order — instead the initiative
  // value is mutated to fit between the new neighbors, so the
  // existing sort-by-initiative-desc logic just works. Decimal
  // initiatives are allowed (D&D RAW doesn't forbid them and they
  // serve as natural tiebreakers).
  function reorderCombatant(fromId: string, toId: string) {
    if (fromId === toId) return;
    const dragged = combatants.find(c => c.id === fromId);
    if (!dragged) return;
    const filtered = sorted.filter(c => c.id !== fromId);
    const dropIdx = filtered.findIndex(c => c.id === toId);
    if (dropIdx < 0) return;
    // The dragged item lands at filtered[dropIdx]'s position — i.e.
    // ABOVE the drop target. Neighbors after insertion:
    //   above = filtered[dropIdx - 1] (the one that pushes us down)
    //   below = filtered[dropIdx]     (the drop target itself)
    const above = filtered[dropIdx - 1];
    const below = filtered[dropIdx];
    let newInit: number;
    if (!above && !below) newInit = dragged.initiative;
    else if (!above) newInit = below.initiative + 1;
    else if (!below) newInit = above.initiative - 1;
    else newInit = (above.initiative + below.initiative) / 2;
    const newOrder = combatants.map(c =>
      c.id === fromId ? { ...c, initiative: newInit } : c
    );
    onUpdateSession({ initiative_order: newOrder });
  }

  function addCombatant(name: string, initiative: number, hp: number, ac: number, isPlayer = false) {
    const newCombatant: Combatant = {
      id: `${Date.now()}-${Math.random()}`,
      name, initiative, current_hp: hp, max_hp: hp, ac,
      conditions: [], is_monster: !isPlayer,
    };
    onUpdateSession({ initiative_order: [...combatants, newCombatant] });
  }

  function addMonster() {
    if (!newName.trim()) return;
    const init = parseInt(newInit) || rollD20();
    const hp = parseInt(newHP) || 10;
    const ac = parseInt(newAC) || 12;
    addCombatant(newName.trim(), init, hp, ac, false);
    setNewName(''); setNewInit(''); setNewHP(''); setNewAC('');
  }

  function addPlayer(pc: typeof playerCharacters[0]) {
    if (combatants.some(c => c.id === pc.id)) return;
    const init = rollD20() + Math.floor(0); // DM rolls for now
    addCombatant(pc.name, init, pc.current_hp, pc.armor_class, true);
  }

  function removeCombatant(id: string) {
    onUpdateSession({ initiative_order: combatants.filter(c => c.id !== id) });
  }

  function nextTurn() {
    if (!sessionState) return;
    const next = (sessionState.current_turn + 1) % Math.max(combatants.length, 1);
    const newRound = next === 0 ? sessionState.round + 1 : sessionState.round;
    onUpdateSession({ current_turn: next, round: newRound });

    // Fire push notification for the next combatant
    const nextCombatant = combatants[next];
    if (nextCombatant && !nextCombatant.is_monster && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(`Your Turn! — ${nextCombatant.name}`, {
          body: `Round ${newRound} · ${nextCombatant.current_hp}/${nextCombatant.max_hp} HP`,
          icon: '/icon-192.png',
          tag: 'dndkeep-turn',
        });
      }).catch(() => {});
    }
  }

  function applyHP(id: string, mode: 'damage' | 'heal') {
    const delta = parseInt(hpDeltas[id] || '0');
    if (!delta || delta <= 0) return;
    const updated = combatants.map(c => {
      if (c.id !== id) return c;
      const newHP = mode === 'damage'
        ? Math.max(0, c.current_hp - delta)
        : Math.min(c.max_hp, c.current_hp + delta);
      return { ...c, current_hp: newHP };
    });
    onUpdateSession({ initiative_order: updated });
    setHpDeltas(prev => ({ ...prev, [id]: '' }));
  }

  function toggleCondition(id: string, condition: ConditionName) {
    const updated = combatants.map(c => {
      if (c.id !== id) return c;
      const has = c.conditions.includes(condition);
      return { ...c, conditions: has ? c.conditions.filter(x => x !== condition) : [...c.conditions, condition as ConditionName] };
    });
    onUpdateSession({ initiative_order: updated });
  }

  function setInitiative(id: string, value: number) {
    onUpdateSession({ initiative_order: combatants.map(c => c.id === id ? { ...c, initiative: value } : c) });
  }

  function resolveAttack(attackerId: string, targetId: string, attackIdx: number) {
    const attacker = combatants.find(c => c.id === attackerId);
    const target = combatants.find(c => c.id === targetId);
    if (!attacker || !target || !attacker.attacks) return;
    const atk = attacker.attacks[attackIdx];
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + atk.bonus;
    const hit = roll === 20 || (roll !== 1 && total >= target.ac);
    let damage = 0;
    let damageRoll = 0;
    if (hit) {
      const result = rollDiceExpression(atk.damage);
      damage = roll === 20 ? result.total + result.rolls.reduce((a,b) => a+b, 0) : result.total; // crit doubles dice
      damageRoll = result.total;
    }
    setAttackResult({ hit, roll, total, damage, damageRoll });
    // If target is a PC concentrating and damage was dealt, prompt conc save
    if (hit && damage > 0 && !target.is_monster && target.concentration_spell) {
      setConcSavePrompt({ combatantId: targetId, dc: concentrationDC(damage), damageTaken: damage });
    }
    // Apply damage to target
    if (hit && damage > 0) {
      const updated = combatants.map(c => c.id === targetId ? { ...c, current_hp: Math.max(0, c.current_hp - damage) } : c);
      onUpdateSession({ initiative_order: updated });
    }
  }

  function advanceTurnWithOngoingDamage() {
    if (!sessionState) return;
    const sorted2 = [...combatants].sort((a, b) => b.initiative - a.initiative);
    const next = (sessionState.current_turn + 1) % Math.max(combatants.length, 1);
    const newRound = next === 0 ? sessionState.round + 1 : sessionState.round;
    const nextCombatant = sorted2[next];
    // Collect ongoing damage for next combatant
    const prompts = (nextCombatant?.ongoing_damage ?? []).map(od => ({
      id: nextCombatant.id,
      name: nextCombatant.name,
      od,
    }));
    if (prompts.length > 0) {
      setOngoingPrompts(prompts);
    }
    onUpdateSession({ current_turn: next, round: newRound });
    if (nextCombatant && !nextCombatant.is_monster && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(`Your Turn! — ${nextCombatant.name}`, {
          body: `Round ${newRound} · ${nextCombatant.current_hp}/${nextCombatant.max_hp} HP`,
          icon: '/icon-192.png', tag: 'dndkeep-turn',
        });
      }).catch(() => {});
    }
  }

  function addOngoingDamage(id: string, od: OngoingDamage) {
    const updated = combatants.map(c => c.id === id ? { ...c, ongoing_damage: [...(c.ongoing_damage ?? []), od] } : c);
    onUpdateSession({ initiative_order: updated });
  }

  function removeOngoingDamage(combatantId: string, odId: string) {
    const updated = combatants.map(c => c.id === combatantId ? { ...c, ongoing_damage: (c.ongoing_damage ?? []).filter(od => od.id !== odId) } : c);
    onUpdateSession({ initiative_order: updated });
  }

  const hpColor = (c: Combatant) => {
    const pct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
    return pct > 0.5 ? 'var(--hp-full)' : pct > 0.25 ? 'var(--hp-mid)' : c.current_hp > 0 ? 'var(--hp-low)' : 'var(--hp-dead)';
  };

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <div className="stat-box" style={{ minWidth: 80, padding: 'var(--sp-2)' }}>
            <div className="stat-box-label">Round</div>
            <div className="stat-box-value">{sessionState?.round ?? 1}</div>
          </div>
          <div className="stat-box" style={{ minWidth: 80, padding: 'var(--sp-2)' }}>
            <div className="stat-box-label">Turn</div>
            <div className="stat-box-value" style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
              {sorted[activeTurn]?.name?.slice(0, 10) ?? '—'}
            </div>
          </div>
        </div>
        {isOwner && (
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginLeft: 'auto' }}>
            {combatants.length > 0 && (
              <button className="btn-gold btn-sm" onClick={advanceTurnWithOngoingDamage}>Next Turn ▶</button>
            )}
            <button
              className={sessionState?.combat_active ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
              onClick={onToggleCombat}
            >
              {sessionState?.combat_active ? 'End Combat' : 'Start Combat'}
            </button>
          </div>
        )}
      </div>

      {/* Initiative list */}
      {sorted.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--sp-6)' }}>
          <p style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
            No combatants yet. Add players and monsters below.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
          {sorted.map(c => {
            const isActive = c.id === activeId;
            const isExpanded = expandedId === c.id;
            const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
            // v2.382.0 — Dead state. When HP hits 0 the row dims and
            // the conditions area swaps for a DEFEATED badge. Only
            // applies to monsters (PCs at 0 HP go unconscious — the
            // existing concentration / death save flow handles them).
            const isDead = c.is_monster && c.current_hp <= 0;
            const isDropTarget = dropTargetId === c.id && draggedId !== null && draggedId !== c.id;
            return (
              <div
                key={c.id}
                draggable={isOwner}
                onDragStart={isOwner ? (e) => {
                  setDraggedId(c.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', c.id);
                } : undefined}
                onDragEnd={isOwner ? () => {
                  setDraggedId(null);
                  setDropTargetId(null);
                } : undefined}
                onDragOver={isOwner ? (e) => {
                  if (!draggedId || draggedId === c.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropTargetId !== c.id) setDropTargetId(c.id);
                } : undefined}
                onDragLeave={isOwner ? () => {
                  if (dropTargetId === c.id) setDropTargetId(null);
                } : undefined}
                onDrop={isOwner ? (e) => {
                  e.preventDefault();
                  if (draggedId && draggedId !== c.id) {
                    reorderCombatant(draggedId, c.id);
                  }
                  setDraggedId(null);
                  setDropTargetId(null);
                } : undefined}
                style={{
                  borderRadius: 'var(--r-md)',
                  border: isActive ? '2px solid var(--c-gold)'
                       : isDropTarget ? '2px dashed var(--c-gold-l)'
                       : '1px solid var(--c-border)',
                  background: isActive ? 'rgba(201,146,42,0.07)'
                           : isDropTarget ? 'rgba(201,146,42,0.04)'
                           : 'var(--c-surface)',
                  overflow: 'hidden',
                  // v2.382.0 — dead-creature dim
                  opacity: isDead ? 0.45 : draggedId === c.id ? 0.5 : 1,
                  cursor: isOwner ? (draggedId === c.id ? 'grabbing' : 'grab') : 'default',
                  transition: 'opacity 0.15s, border-color 0.15s, background 0.15s',
                }}
              >
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)' }}>
                  {/* Initiative badge */}
                  {isOwner ? (
                    <input
                      type="number"
                      value={c.initiative}
                      onChange={e => setInitiative(c.id, parseInt(e.target.value) || 0)}
                      onMouseDown={e => e.stopPropagation()}
                      onDragStart={e => e.preventDefault()}
                      style={{ width: 44, textAlign: 'center', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--c-gold-l)', background: 'transparent', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-sm)', padding: '2px 0' }}
                    />
                  ) : (
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, color: 'var(--c-gold-l)', minWidth: 44, textAlign: 'center' }}>{c.initiative}</span>
                  )}

                  {/* Name + type badge */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                      <span style={{
                        fontFamily: 'var(--ff-body)', fontWeight: isActive ? 700 : 600,
                        color: isActive ? 'var(--c-gold-l)' : 'var(--t-1)',
                        fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        // v2.382.0 — strikethrough dead names
                        textDecoration: isDead ? 'line-through' : 'none',
                      }}>
                        {c.name}
                      </span>
                      {!c.is_monster && <span className="badge badge-muted" style={{ fontSize: 9 }}>PC</span>}
                      {/* v2.382.0 — DEFEATED badge for dead monsters */}
                      {isDead && (
                        <span style={{
                          fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
                          color: '#fca5a5', background: 'rgba(239,68,68,0.12)',
                          border: '1px solid rgba(239,68,68,0.4)',
                          padding: '1px 6px', borderRadius: 3,
                          textTransform: 'uppercase' as const,
                        }}>
                          Defeated
                        </span>
                      )}
                    </div>
                    {/* HP bar */}
                    <div style={{ width: '100%', height: 3, background: '#080d14', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${hpPct * 100}%`, background: hpColor(c), transition: 'width var(--tr-slow)' }} />
                    </div>
                  </div>

                  {/* HP */}
                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: hpColor(c), minWidth: 60, textAlign: 'right' }}>
                    {c.current_hp}/{c.max_hp}
                  </span>

                  {/* AC */}
                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', minWidth: 40, textAlign: 'center' }}>
                    AC {c.ac}
                  </span>

                  {/* v2.382.0 — Condition pills (replaces the count badge).
                      Up to 3 short condition labels render inline; overflow
                      becomes a "+N" chip with the rest in its title. Hidden
                      entirely when no conditions or when the creature is
                      defeated (DEFEATED badge already serves as status). */}
                  {!isDead && c.conditions.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' as const, alignItems: 'center', maxWidth: 200 }}>
                      {c.conditions.slice(0, 3).map(cond => (
                        <span
                          key={cond}
                          title={cond}
                          style={{
                            fontSize: 8, fontWeight: 700,
                            color: '#fbbf24', background: 'rgba(251,191,36,0.1)',
                            border: '1px solid rgba(251,191,36,0.35)',
                            padding: '1px 5px', borderRadius: 3,
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap' as const,
                          }}
                        >
                          {cond.length > 6 ? cond.slice(0, 4) + '…' : cond}
                        </span>
                      ))}
                      {c.conditions.length > 3 && (
                        <span
                          title={c.conditions.slice(3).join(', ')}
                          style={{
                            fontSize: 8, fontWeight: 700,
                            color: '#fbbf24', background: 'rgba(251,191,36,0.1)',
                            border: '1px solid rgba(251,191,36,0.35)',
                            padding: '1px 5px', borderRadius: 3,
                          }}
                        >
                          +{c.conditions.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Expand / remove */}
                  {isOwner && (
                    <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        onMouseDown={e => e.stopPropagation()}
                        onDragStart={e => e.preventDefault()}
                        style={{ fontSize: 'var(--fs-xs)', padding: '2px 6px' }}
                      >
                        {isExpanded ? 'Less' : 'More'}
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => removeCombatant(c.id)}
                        onMouseDown={e => e.stopPropagation()}
                        onDragStart={e => e.preventDefault()}
                        style={{ color: 'var(--t-2)', fontSize: 'var(--fs-xs)', padding: '2px 6px' }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded controls */}
                {isExpanded && isOwner && (
                  <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--c-border)', background: '#080d14', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                    {/* HP controls */}
                    <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="number"
                        min="1"
                        placeholder="Amount"
                        value={hpDeltas[c.id] || ''}
                        onChange={e => setHpDeltas(prev => ({ ...prev, [c.id]: e.target.value }))}
                        style={{ width: 80, textAlign: 'center', fontSize: 'var(--fs-sm)' }}
                      />
                      <button className="btn-danger btn-sm" onClick={() => applyHP(c.id, 'damage')} disabled={!hpDeltas[c.id]}>Damage</button>
                      <button className="btn-gold btn-sm" onClick={() => applyHP(c.id, 'heal')} disabled={!hpDeltas[c.id]}>Heal</button>
                    </div>

                    {/* NPC Attack panel */}
                    {c.is_monster && c.attacks && c.attacks.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Roll Attack vs Target</div>
                        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={attackTarget}
                            onChange={e => setAttackTarget(e.target.value)}
                            style={{ fontSize: 'var(--fs-xs)', flex: 1, minWidth: 120 }}
                          >
                            <option value="">— choose target —</option>
                            {combatants.filter(t => t.id !== c.id && t.current_hp > 0).map(t => (
                              <option key={t.id} value={t.id}>{t.name} (AC {t.ac})</option>
                            ))}
                          </select>
                          {c.attacks.map((atk, idx) => (
                            <button key={idx} className="btn-danger btn-sm"
                              disabled={!attackTarget}
                              onClick={() => {
                                resolveAttack(c.id, attackTarget, idx);
                                setAttackTarget('');
                              }}
                              style={{ fontSize: 'var(--fs-xs)' }}>
                              {atk.name} (+{atk.bonus})
                            </button>
                          ))}
                        </div>
                        {attackResult && (
                          <div style={{ fontSize: 'var(--fs-xs)', color: attackResult.crit ? 'var(--c-gold-l)' : 'var(--t-2)', padding: '4px 8px', background: 'var(--c-raised)', borderRadius: 'var(--r-sm)' }}>
                            {attackResult.crit ? '⭐ CRIT! ' : ''}d20={attackResult.nat} → To hit: {attackResult.hit} · Damage: {attackResult.damage}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Conditions */}
                    <div>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-2)' }}>CONDITIONS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
                        {CONDITIONS.map(cond => {
                          const active = c.conditions.includes(cond as ConditionName);
                          return (
                            <ConditionTooltip key={cond} name={cond}>
                              <button
                                onClick={() => toggleCondition(c.id, cond as ConditionName)}
                                style={{
                                  fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 9,
                                  padding: '2px 6px', borderRadius: 'var(--r-sm)',
                                  border: active ? '1px solid var(--c-red-l)' : '1px solid var(--c-border)',
                                  background: active ? 'rgba(220,38,38,0.15)' : 'var(--c-raised)',
                                  color: active ? '#fca5a5' : 'var(--t-2)',
                                  cursor: 'pointer',
                                }}
                              >
                                {cond}
                              </button>
                            </ConditionTooltip>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add combatants — DM only */}
      {isOwner && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {/* Add monster / NPC */}
          <div className="panel">
            <div className="section-header">Add Monster / NPC</div>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 2, minWidth: 120 }}>
                <label style={{ fontSize: 'var(--fs-xs)' }}>Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMonster()} placeholder="Goblin, Dragon..." />
              </div>
              <div style={{ flex: 0.5, minWidth: 60 }}>
                <label style={{ fontSize: 'var(--fs-xs)' }}>Initiative</label>
                <input type="number" value={newInit} onChange={e => setNewInit(e.target.value)} placeholder="d20" style={{ textAlign: 'center' }} />
              </div>
              <div style={{ flex: 0.5, minWidth: 60 }}>
                <label style={{ fontSize: 'var(--fs-xs)' }}>HP</label>
                <input type="number" value={newHP} onChange={e => setNewHP(e.target.value)} placeholder="10" style={{ textAlign: 'center' }} />
              </div>
              <div style={{ flex: 0.5, minWidth: 60 }}>
                <label style={{ fontSize: 'var(--fs-xs)' }}>AC</label>
                <input type="number" value={newAC} onChange={e => setNewAC(e.target.value)} placeholder="12" style={{ textAlign: 'center' }} />
              </div>
              <button className="btn-primary btn-sm" onClick={addMonster} disabled={!newName.trim()}>Add</button>
            </div>
          </div>

          {/* Add player characters */}
          {playerCharacters.length > 0 && (
            <div className="panel">
              <div className="section-header">Add Player Characters</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                {playerCharacters.map(pc => {
                  const alreadyAdded = combatants.some(c => c.id === pc.id);
                  return (
                    <button
                      key={pc.id}
                      className="btn-secondary btn-sm"
                      onClick={() => addPlayer(pc)}
                      disabled={alreadyAdded}
                      style={{ opacity: alreadyAdded ? 0.5 : 1 }}
                    >
                      {pc.name} {alreadyAdded ? '(added)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!isOwner && combatants.length > 0 && (
        <p style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
          Syncing in real-time. Your DM controls the tracker.
        </p>
      )}
    </div>
  );
}
