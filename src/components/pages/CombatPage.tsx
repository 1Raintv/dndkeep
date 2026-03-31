import { useState, useMemo } from 'react';
import type { Combatant, ConditionName } from '../../types';
import { MONSTERS, formatCR } from '../../data/monsters';
import { abilityModifier, rollDie } from '../../lib/gameUtils';
import { CONDITIONS } from '../../data/conditions';
import { v4 as uuidv4 } from 'uuid';
import MonsterBrowser from '../shared/MonsterBrowser';

export default function CombatPage() {
  const [combatants, setCombatants] = useState<Combatant[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [round, setRound] = useState(1);
  const [active, setActive] = useState(false);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [showMonsterPanel, setShowMonsterPanel] = useState(false);
  const [hpEdits, setHpEdits] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...combatants].sort((a, b) => b.initiative - a.initiative),
    [combatants]
  );

  const activeTurnIdx = active ? currentTurn % Math.max(1, sorted.length) : -1;

  function addMonster(monsterId: string) {
    const m = MONSTERS.find(x => x.id === monsterId);
    if (!m) return;
    const newC: Combatant = {
      id: uuidv4(),
      name: m.name,
      initiative: rollDie(20) + abilityModifier(m.dex),
      current_hp: m.hp,
      max_hp: m.hp,
      ac: m.ac,
      is_monster: true,
      monster_id: m.id,
      conditions: [],
    };
    setCombatants(prev => [...prev, newC]);
  }

  function addCustomCombatant() {
    setCombatants(prev => [...prev, {
      id: uuidv4(),
      name: 'Combatant',
      initiative: rollDie(20),
      current_hp: 10,
      max_hp: 10,
      ac: 10,
      is_monster: false,
      conditions: [],
    }]);
  }

  function updateCombatant(id: string, updates: Partial<Combatant>) {
    setCombatants(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  function applyHPDelta(id: string, delta: number) {
    setCombatants(prev => prev.map(c =>
      c.id === id
        ? { ...c, current_hp: Math.max(0, Math.min(c.max_hp, c.current_hp + delta)) }
        : c
    ));
  }

  function commitHPEdit(id: string) {
    const val = parseInt(hpEdits[id] ?? '', 10);
    if (!isNaN(val)) {
      setCombatants(prev => prev.map(c =>
        c.id === id ? { ...c, current_hp: Math.max(0, Math.min(c.max_hp, val)) } : c
      ));
    }
    setHpEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function toggleCondition(id: string, condition: ConditionName) {
    setCombatants(prev => prev.map(c => {
      if (c.id !== id) return c;
      const has = c.conditions.includes(condition);
      return { ...c, conditions: has ? c.conditions.filter(x => x !== condition) : [...c.conditions, condition] };
    }));
  }

  const [xpEarned, setXpEarned] = useState(0);

  function awardMonsterXP(monsterId: string) {
    const m = MONSTERS.find(x => x.id === monsterId);
    if (m) setXpEarned(prev => prev + m.xp);
  }

  function removeCombatant(id: string) {
    const c = combatants.find(x => x.id === id);
    if (c?.is_monster && c.current_hp <= 0 && c.monster_id) {
      awardMonsterXP(c.monster_id);
    }
    setCombatants(prev => prev.filter(x => x.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function startCombat() {
    setCurrentTurn(0);
    setRound(1);
    setActive(true);
  }

  function nextTurn() {
    const count = sorted.length;
    if (count === 0) return;
    const next = (currentTurn + 1) % count;
    if (next === 0) setRound(r => r + 1);
    setCurrentTurn(next);
  }

  function endCombat() {
    setActive(false);
    setCurrentTurn(0);
    setRound(1);
    // XP earned is kept visible until manually dismissed
  }

  function rollAllInitiative() {
    setCombatants(prev => prev.map(c => {
      if (c.is_monster) {
        const m = MONSTERS.find(x => x.id === c.monster_id);
        return { ...c, initiative: rollDie(20) + (m ? abilityModifier(m.dex) : 0) };
      }
      return { ...c, initiative: rollDie(20) };
    }));
  }

  const filteredMonsters = useMemo(
    () => MONSTERS.filter(m => !monsterSearch || m.name.toLowerCase().includes(monsterSearch.toLowerCase())),
    [monsterSearch]
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <h1>Combat Tracker</h1>
          {active && (
            <span className="badge badge-crimson">Round {round}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button className="btn-secondary btn-sm" onClick={() => setShowMonsterPanel(v => !v)}>
            {showMonsterPanel ? 'Hide Monsters' : 'Monster Library'}
          </button>
          <button className="btn-secondary btn-sm" onClick={addCustomCombatant}>Add Combatant</button>
          {combatants.length > 0 && !active && (
            <button className="btn-secondary btn-sm" onClick={rollAllInitiative}>Roll All Initiative</button>
          )}
          {!active ? (
            <button className="btn-primary" onClick={startCombat} disabled={combatants.length === 0}>
              Start Combat
            </button>
          ) : (
            <>
              <button className="btn-gold" onClick={nextTurn}>Next Turn</button>
              <button className="btn-danger btn-sm" onClick={endCombat}>End Combat</button>
            </>
          )}
        </div>
      </div>

      {/* XP earned banner */}
      {xpEarned > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-5)',
          background: 'rgba(201,146,42,0.1)', border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-md)',
          animation: 'fadeIn 200ms ease both',
        }}>
          <div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-gold)', fontSize: 'var(--text-md)' }}>
              {xpEarned.toLocaleString()} XP
            </span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'var(--space-2)' }}>
              earned from defeated monsters
            </span>
          </div>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setXpEarned(0)}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ash)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: showMonsterPanel ? '1fr 280px' : '1fr', gap: 'var(--space-6)' }}>
        {/* Initiative order */}
        <div>
          {combatants.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
              <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-4)' }}>
                Add combatants to begin. Click "Monster Library" to add from the SRD list.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
                <button className="btn-secondary" onClick={() => setShowMonsterPanel(true)}>Monster Library</button>
                <button className="btn-gold" onClick={addCustomCombatant}>Add Custom</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {sorted.map((c, idx) => {
                const isActive = active && idx === activeTurnIdx;
                const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
                const hpColor = hpPct > 0.5
                  ? 'var(--hp-full)'
                  : hpPct > 0.25
                  ? 'var(--hp-mid)'
                  : c.current_hp > 0
                  ? 'var(--hp-low)'
                  : 'var(--hp-dead)';
                const isExpanded = expandedId === c.id;

                return (
                  <div
                    key={c.id}
                    style={{
                      border: isActive ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      background: isActive ? 'rgba(201,146,42,0.07)' : 'var(--bg-surface)',
                      boxShadow: isActive ? 'var(--shadow-gold)' : 'none',
                      transition: 'all var(--transition-fast)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Main row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' }}>
                      {/* Initiative input */}
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: isActive ? 'rgba(201,146,42,0.2)' : 'var(--bg-sunken)',
                        border: `1px solid ${isActive ? 'var(--color-gold)' : 'var(--border-subtle)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <input
                          type="number"
                          value={c.initiative}
                          onChange={e => updateCombatant(c.id, { initiative: Number(e.target.value) })}
                          style={{
                            width: '100%', background: 'transparent', border: 'none',
                            textAlign: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700,
                            fontSize: 'var(--text-sm)', color: isActive ? 'var(--text-gold)' : 'var(--text-primary)',
                            padding: 0,
                          }}
                          title="Initiative"
                        />
                      </div>

                      {/* Name + HP bar */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          value={c.name}
                          onChange={e => updateCombatant(c.id, { name: e.target.value })}
                          style={{
                            fontFamily: 'var(--font-heading)', fontWeight: 700,
                            fontSize: 'var(--text-md)', background: 'transparent', border: 'none',
                            color: isActive ? 'var(--text-gold)' : 'var(--text-primary)',
                            width: '100%', padding: 0, marginBottom: 4,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: hpColor, minWidth: 70 }}>
                            {c.current_hp}/{c.max_hp} HP
                          </span>
                          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            AC {c.ac}
                          </span>
                          {c.conditions.map(cond => (
                            <span key={cond} className="condition-pill" style={{ fontSize: '10px', padding: '1px 5px' }}>
                              {cond}
                            </span>
                          ))}
                        </div>
                        <div className="hp-bar-container" style={{ height: 3, marginTop: 5 }}>
                          <div className="hp-bar-fill" style={{ width: `${hpPct * 100}%`, background: hpColor }} />
                        </div>
                      </div>

                      {/* HP controls */}
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button
                          className="btn-danger btn-sm btn-icon"
                          onClick={() => applyHPDelta(c.id, -1)}
                          title="Deal 1 damage"
                          style={{ width: 28, height: 28 }}
                        >
                          -
                        </button>
                        {hpEdits[c.id] !== undefined ? (
                          <input
                            type="number"
                            value={hpEdits[c.id]}
                            onChange={e => setHpEdits(prev => ({ ...prev, [c.id]: e.target.value }))}
                            onBlur={() => commitHPEdit(c.id)}
                            onKeyDown={e => { if (e.key === 'Enter') commitHPEdit(c.id); }}
                            autoFocus
                            style={{ width: 44, textAlign: 'center', fontSize: 'var(--text-xs)', padding: '2px 4px' }}
                          />
                        ) : (
                          <button
                            onClick={() => setHpEdits(prev => ({ ...prev, [c.id]: String(c.current_hp) }))}
                            style={{
                              fontFamily: 'var(--font-heading)', fontWeight: 700,
                              fontSize: 'var(--text-sm)', color: hpColor,
                              background: 'none', border: 'none', cursor: 'pointer',
                              minWidth: 44, textAlign: 'center',
                            }}
                            title="Click to edit HP"
                          >
                            {c.current_hp}
                          </button>
                        )}
                        <button
                          className="btn-gold btn-sm btn-icon"
                          onClick={() => applyHPDelta(c.id, 1)}
                          title="Heal 1 HP"
                          style={{ width: 28, height: 28 }}
                        >
                          +
                        </button>
                      </div>

                      {/* Expand / remove */}
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
                        title="Expand"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => removeCombatant(c.id)}
                        style={{ color: 'var(--color-ash)', fontSize: 'var(--text-xs)', padding: '2px 6px' }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Expanded: fine-grained controls */}
                    {isExpanded && (
                      <div style={{
                        padding: 'var(--space-3) var(--space-4)',
                        background: 'var(--bg-sunken)',
                        borderTop: '1px solid var(--border-subtle)',
                        display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
                        animation: 'fadeIn 120ms ease both',
                      }}>
                        {/* HP + AC + Max HP editing */}
                        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                          <div>
                            <label>Max HP</label>
                            <input type="number" value={c.max_hp} onChange={e => updateCombatant(c.id, { max_hp: Math.max(1, Number(e.target.value)) })} style={{ width: 70 }} />
                          </div>
                          <div>
                            <label>AC</label>
                            <input type="number" value={c.ac} onChange={e => updateCombatant(c.id, { ac: Math.max(0, Number(e.target.value)) })} style={{ width: 60 }} />
                          </div>
                        </div>

                        {/* Quick damage / heal */}
                        <QuickHPPanel id={c.id} onApply={applyHPDelta} />

                        {/* Conditions */}
                        <div>
                          <label>Conditions</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 4 }}>
                            {(CONDITIONS.map(cd => cd.name) as ConditionName[]).map(cond => {
                              const has = c.conditions.includes(cond);
                              return (
                                <button
                                  key={cond}
                                  onClick={() => toggleCondition(c.id, cond)}
                                  style={{
                                    fontFamily: 'var(--font-heading)', fontSize: '10px', fontWeight: 600,
                                    padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                                    border: has ? '1px solid var(--color-blood)' : '1px solid var(--border-subtle)',
                                    background: has ? 'rgba(155,28,28,0.2)' : 'transparent',
                                    color: has ? '#fca5a5' : 'var(--text-muted)',
                                    transition: 'all var(--transition-fast)',
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
        </div>

        {/* Monster library */}
        {showMonsterPanel && (
          <div className="card animate-fade-in" style={{ height: 'fit-content', position: 'sticky', top: 72 }}>
            <div className="section-header">Monster Library</div>
            <MonsterBrowser
              compact
              onAddToCombat={m => addMonster(m.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function QuickHPPanel({ id, onApply }: { id: string; onApply: (id: string, delta: number) => void }) {
  const [amount, setAmount] = useState('');
  return (
    <div>
      <label>Quick Adjust</label>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginTop: 4 }}>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount"
          style={{ width: 80 }}
          min={1}
        />
        <button
          className="btn-danger btn-sm"
          onClick={() => { const n = parseInt(amount, 10); if (n > 0) { onApply(id, -n); setAmount(''); } }}
        >
          Damage
        </button>
        <button
          className="btn-gold btn-sm"
          onClick={() => { const n = parseInt(amount, 10); if (n > 0) { onApply(id, n); setAmount(''); } }}
        >
          Heal
        </button>
      </div>
    </div>
  );
}
