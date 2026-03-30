import { useState } from 'react';
import type { SessionState, Combatant, ConditionName } from '../../types';


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

  const combatants: Combatant[] = sessionState?.initiative_order ?? [];
  const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);
  const activeTurn = sessionState ? sessionState.current_turn % Math.max(combatants.length, 1) : 0;
  const activeId = sorted[activeTurn]?.id;

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

  const hpColor = (c: Combatant) => {
    const pct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
    return pct > 0.5 ? 'var(--hp-full)' : pct > 0.25 ? 'var(--hp-mid)' : c.current_hp > 0 ? 'var(--hp-low)' : 'var(--hp-dead)';
  };

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="stat-box" style={{ minWidth: 80, padding: 'var(--space-2)' }}>
            <div className="stat-box-label">Round</div>
            <div className="stat-box-value">{sessionState?.round ?? 1}</div>
          </div>
          <div className="stat-box" style={{ minWidth: 80, padding: 'var(--space-2)' }}>
            <div className="stat-box-label">Turn</div>
            <div className="stat-box-value" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {sorted[activeTurn]?.name?.slice(0, 10) ?? '—'}
            </div>
          </div>
        </div>
        {isOwner && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto' }}>
            {combatants.length > 0 && (
              <button className="btn-gold btn-sm" onClick={nextTurn}>Next Turn</button>
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
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>
            No combatants yet. Add players and monsters below.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {sorted.map(c => {
            const isActive = c.id === activeId;
            const isExpanded = expandedId === c.id;
            const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
            return (
              <div key={c.id} style={{
                borderRadius: 'var(--radius-md)',
                border: isActive ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
                background: isActive ? 'rgba(201,146,42,0.07)' : 'var(--bg-surface)',
                overflow: 'hidden',
              }}>
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' }}>
                  {/* Initiative badge */}
                  {isOwner ? (
                    <input
                      type="number"
                      value={c.initiative}
                      onChange={e => setInitiative(c.id, parseInt(e.target.value) || 0)}
                      style={{ width: 44, textAlign: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-gold)', background: 'transparent', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-sm)', padding: '2px 0' }}
                    />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-gold)', minWidth: 44, textAlign: 'center' }}>{c.initiative}</span>
                  )}

                  {/* Name + type badge */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--text-gold)' : 'var(--text-primary)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                      {!c.is_monster && <span className="badge badge-muted" style={{ fontSize: 9 }}>PC</span>}
                    </div>
                    {/* HP bar */}
                    <div style={{ width: '100%', height: 3, background: 'var(--bg-sunken)', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${hpPct * 100}%`, background: hpColor(c), transition: 'width var(--transition-slow)' }} />
                    </div>
                  </div>

                  {/* HP */}
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: hpColor(c), minWidth: 60, textAlign: 'right' }}>
                    {c.current_hp}/{c.max_hp}
                  </span>

                  {/* AC */}
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 40, textAlign: 'center' }}>
                    AC {c.ac}
                  </span>

                  {/* Conditions count */}
                  {c.conditions.length > 0 && (
                    <span className="badge badge-crimson">{c.conditions.length}</span>
                  )}

                  {/* Expand / remove */}
                  {isOwner && (
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
                      >
                        {isExpanded ? 'Less' : 'More'}
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => removeCombatant(c.id)}
                        style={{ color: 'var(--color-ash)', fontSize: 'var(--text-xs)', padding: '2px 6px' }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded controls */}
                {isExpanded && isOwner && (
                  <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {/* HP controls */}
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        placeholder="Amount"
                        value={hpDeltas[c.id] || ''}
                        onChange={e => setHpDeltas(prev => ({ ...prev, [c.id]: e.target.value }))}
                        style={{ width: 80, textAlign: 'center', fontSize: 'var(--text-sm)' }}
                      />
                      <button className="btn-danger btn-sm" onClick={() => applyHP(c.id, 'damage')} disabled={!hpDeltas[c.id]}>Damage</button>
                      <button className="btn-gold btn-sm" onClick={() => applyHP(c.id, 'heal')} disabled={!hpDeltas[c.id]}>Heal</button>
                    </div>
                    {/* Conditions */}
                    <div>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>CONDITIONS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                        {CONDITIONS.map(cond => {
                          const active = c.conditions.includes(cond);
                          return (
                            <button
                              key={cond}
                              onClick={() => toggleCondition(c.id, cond as ConditionName)}
                              style={{
                                fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 9,
                                padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                                border: active ? '1px solid var(--color-crimson-bright)' : '1px solid var(--border-subtle)',
                                background: active ? 'rgba(220,38,38,0.15)' : 'var(--bg-raised)',
                                color: active ? '#fca5a5' : 'var(--text-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              {cond}
                            </button>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Add monster / NPC */}
          <div className="panel">
            <div className="section-header">Add Monster / NPC</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 2, minWidth: 120 }}>
                <label style={{ fontSize: 'var(--text-xs)' }}>Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMonster()} placeholder="Goblin, Dragon..." />
              </div>
              <div style={{ flex: 0.5, minWidth: 60 }}>
                <label style={{ fontSize: 'var(--text-xs)' }}>Initiative</label>
                <input type="number" value={newInit} onChange={e => setNewInit(e.target.value)} placeholder="d20" style={{ textAlign: 'center' }} />
              </div>
              <div style={{ flex: 0.5, minWidth: 60 }}>
                <label style={{ fontSize: 'var(--text-xs)' }}>HP</label>
                <input type="number" value={newHP} onChange={e => setNewHP(e.target.value)} placeholder="10" style={{ textAlign: 'center' }} />
              </div>
              <div style={{ flex: 0.5, minWidth: 60 }}>
                <label style={{ fontSize: 'var(--text-xs)' }}>AC</label>
                <input type="number" value={newAC} onChange={e => setNewAC(e.target.value)} placeholder="12" style={{ textAlign: 'center' }} />
              </div>
              <button className="btn-primary btn-sm" onClick={addMonster} disabled={!newName.trim()}>Add</button>
            </div>
          </div>

          {/* Add player characters */}
          {playerCharacters.length > 0 && (
            <div className="panel">
              <div className="section-header">Add Player Characters</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
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
        <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
          Syncing in real-time. Your DM controls the tracker.
        </p>
      )}
    </div>
  );
}
