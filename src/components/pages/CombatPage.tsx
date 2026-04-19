import { useState, useMemo } from 'react';
import type { Combatant, ConditionName } from '../../types';
import { getMonsterById } from '../../lib/hooks/useMonsters';
import { abilityModifier, rollDie } from '../../lib/gameUtils';
import { CONDITIONS } from '../../data/conditions';
import { v4 as uuidv4 } from 'uuid';
import MonsterBrowser from '../shared/MonsterBrowser';
import { logAction } from '../shared/ActionLog';
import { useAuth } from '../../context/AuthContext';
import EncounterBuilder from '../Campaign/EncounterBuilder';

export default function CombatPage() {
  const { user, profile } = useAuth();
  const [combatants, setCombatants] = useState<Combatant[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [round, setRound] = useState(1);
  const [active, setActive] = useState(false);
  const [showMonsterPanel, setShowMonsterPanel] = useState(false);
  const [showEncounterBuilder, setShowEncounterBuilder] = useState(false);
  const [hpEdits, setHpEdits] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...combatants].sort((a, b) => b.initiative - a.initiative),
    [combatants]
  );

  const activeTurnIdx = active ? currentTurn % Math.max(1, sorted.length) : -1;

  function addMonster(monsterId: string) {
    const m = getMonsterById(monsterId);
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
    const target = combatants.find(c => c.id === id);
    setCombatants(prev => prev.map(c =>
      c.id === id
        ? { ...c, current_hp: Math.max(0, Math.min(c.max_hp, c.current_hp + delta)) }
        : c
    ));
    // Log damage/healing to action log
    if (user?.id && target) {
      const isDamage = delta < 0;
      logAction({
        campaignId: null,
        characterId: user.id,
        characterName: profile?.display_name ?? 'DM',
        actionType: isDamage ? 'damage' : 'heal',
        actionName: isDamage ? 'Damage' : 'Heal',
        targetName: target.name,
        total: Math.abs(delta),
        notes: `${isDamage ? '−' : '+'}${Math.abs(delta)} HP → ${Math.max(0, Math.min(target.max_hp, target.current_hp + delta))}/${target.max_hp}`,
      });
    }
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
    const m = getMonsterById(monsterId);
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
        const m = getMonsterById(c.monster_id ?? '');
        return { ...c, initiative: rollDie(20) + (m ? abilityModifier(m.dex) : 0) };
      }
      return { ...c, initiative: rollDie(20) };
    }));
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-6)', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <h1>Combat Tracker</h1>
          {active && (
            <span className="badge badge-crimson">Round {round}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <button className="btn-gold btn-sm" onClick={() => setShowEncounterBuilder(true)}>
            Encounter Builder
          </button>
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
          padding: 'var(--sp-3) var(--sp-5)',
          background: 'rgba(201,146,42,0.1)', border: '1px solid var(--c-gold-bdr)',
          borderRadius: 'var(--r-md)',
          animation: 'fadeIn 200ms ease both',
        }}>
          <div>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, color: 'var(--c-gold-l)', fontSize: 'var(--fs-md)' }}>
              {xpEarned.toLocaleString()} XP
            </span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginLeft: 'var(--sp-2)' }}>
              earned from defeated monsters
            </span>
          </div>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setXpEarned(0)}
            style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: showMonsterPanel ? '1fr 280px' : '1fr', gap: 'var(--sp-6)' }}>
        {/* Initiative order */}
        <div>
          {combatants.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--sp-12)' }}>
              <p style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', marginBottom: 'var(--sp-4)' }}>
                Add combatants to begin. Click "Monster Library" to add from the SRD list.
              </p>
              <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center' }}>
                <button className="btn-secondary" onClick={() => setShowMonsterPanel(true)}>Monster Library</button>
                <button className="btn-gold" onClick={addCustomCombatant}>Add Custom</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
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
                      border: isActive ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                      borderRadius: 'var(--r-md)',
                      background: isActive ? 'rgba(201,146,42,0.07)' : 'var(--c-surface)',
                      boxShadow: isActive ? 'var(--shadow-gold)' : 'none',
                      transition: 'all var(--tr-fast)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Main row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)' }}>
                      {/* Initiative input */}
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: isActive ? 'rgba(201,146,42,0.2)' : '#080d14',
                        border: `1px solid ${isActive ? 'var(--c-gold)' : 'var(--c-border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <input
                          type="number"
                          value={c.initiative}
                          onChange={e => updateCombatant(c.id, { initiative: Number(e.target.value) })}
                          style={{
                            width: '100%', background: 'transparent', border: 'none',
                            textAlign: 'center', fontFamily: 'var(--ff-body)', fontWeight: 700,
                            fontSize: 'var(--fs-sm)', color: isActive ? 'var(--c-gold-l)' : 'var(--t-1)',
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
                            fontFamily: 'var(--ff-body)', fontWeight: 700,
                            fontSize: 'var(--fs-md)', background: 'transparent', border: 'none',
                            color: isActive ? 'var(--c-gold-l)' : 'var(--t-1)',
                            width: '100%', padding: 0, marginBottom: 4,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: hpColor, minWidth: 70 }}>
                            {c.current_hp}/{c.max_hp} HP
                          </span>
                          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
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
                            style={{ width: 44, textAlign: 'center', fontSize: 'var(--fs-xs)', padding: '2px 4px' }}
                          />
                        ) : (
                          <button
                            onClick={() => setHpEdits(prev => ({ ...prev, [c.id]: String(c.current_hp) }))}
                            style={{
                              fontFamily: 'var(--ff-body)', fontWeight: 700,
                              fontSize: 'var(--fs-sm)', color: hpColor,
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
                        style={{ fontSize: 'var(--fs-xs)', padding: '2px 6px' }}
                        title="Expand"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => removeCombatant(c.id)}
                        style={{ color: 'var(--t-2)', fontSize: 'var(--fs-xs)', padding: '2px 6px' }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Expanded: fine-grained controls */}
                    {isExpanded && (
                      <div style={{
                        padding: 'var(--sp-3) var(--sp-4)',
                        background: '#080d14',
                        borderTop: '1px solid var(--c-border)',
                        display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)',
                        animation: 'fadeIn 120ms ease both',
                      }}>
                        {/* HP + AC + Max HP editing */}
                        <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
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
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 4 }}>
                            {(CONDITIONS.map(cd => cd.name) as ConditionName[]).map(cond => {
                              const has = c.conditions.includes(cond);
                              return (
                                <button
                                  key={cond}
                                  onClick={() => toggleCondition(c.id, cond)}
                                  style={{
                                    fontFamily: 'var(--ff-body)', fontSize: '10px', fontWeight: 600,
                                    padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                                    border: has ? '1px solid rgba(107,20,20,1)' : '1px solid var(--c-border)',
                                    background: has ? 'rgba(155,28,28,0.2)' : 'transparent',
                                    color: has ? '#fca5a5' : 'var(--t-2)',
                                    transition: 'all var(--tr-fast)',
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

      {/* Encounter Builder modal */}
      {showEncounterBuilder && (
        <EncounterBuilder
          partySize={Math.max(1, combatants.filter(c => !c.is_monster).length) || 4}
          partyLevel={5}
          onAddToCombat={newCombatants => setCombatants(prev => [...prev, ...newCombatants])}
          onClose={() => setShowEncounterBuilder(false)}
        />
      )}
    </div>
  );
}

function QuickHPPanel({ id, onApply }: { id: string; onApply: (id: string, delta: number) => void }) {
  const [amount, setAmount] = useState('');
  return (
    <div>
      <label>Quick Adjust</label>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', marginTop: 4 }}>
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
