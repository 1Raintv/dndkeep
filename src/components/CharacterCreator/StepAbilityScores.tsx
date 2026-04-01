import { useState, useEffect } from 'react';
import type { AbilityKey, AbilityScoreMethod } from '../../types';
import {
  abilityModifier, formatModifier, STANDARD_ARRAY,
  pointBuyCost, POINT_BUY_BUDGET, isValidPointBuyScore,
  generateAbilityScores, roll4d6DropLowest,
} from '../../lib/gameUtils';
import { BACKGROUND_MAP } from '../../data/backgrounds';
import { calcMaxHP } from '../../data/levelProgression';
import { CLASS_MAP } from '../../data/classes';

const ABILITIES: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABBREV: Record<AbilityKey, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };
const FULL_NAME: Record<AbilityKey, string> = { strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma' };

// Recommended assignment order per class — primary first, CON always high
const CLASS_PRIORITY: Record<string, AbilityKey[]> = {
  Barbarian: ['strength','constitution','dexterity','wisdom','charisma','intelligence'],
  Bard:      ['charisma','dexterity','constitution','wisdom','intelligence','strength'],
  Cleric:    ['wisdom','constitution','strength','charisma','dexterity','intelligence'],
  Druid:     ['wisdom','constitution','dexterity','intelligence','charisma','strength'],
  Fighter:   ['strength','constitution','dexterity','wisdom','charisma','intelligence'],
  Monk:      ['dexterity','wisdom','constitution','strength','charisma','intelligence'],
  Paladin:   ['strength','charisma','constitution','wisdom','dexterity','intelligence'],
  Ranger:    ['dexterity','wisdom','constitution','strength','intelligence','charisma'],
  Rogue:     ['dexterity','charisma','constitution','wisdom','intelligence','strength'],
  Sorcerer:  ['charisma','constitution','dexterity','wisdom','intelligence','strength'],
  Warlock:   ['charisma','constitution','dexterity','wisdom','intelligence','strength'],
  Wizard:    ['intelligence','constitution','dexterity','wisdom','charisma','strength'],
  Psion:     ['intelligence','constitution','wisdom','dexterity','charisma','strength'],
  Artificer: ['intelligence','constitution','dexterity','wisdom','charisma','strength'],
};

interface StepAbilityScoresProps {
  scores: Record<AbilityKey, number>;
  method: AbilityScoreMethod;
  backgroundName: string;
  className?: string;
  level?: number;
  onScoresChange: (scores: Record<AbilityKey, number>) => void;
  onMethodChange: (method: AbilityScoreMethod) => void;
}

export default function StepAbilityScores({ scores, method, backgroundName, className, level = 1, onScoresChange, onMethodChange }: StepAbilityScoresProps) {
  const bg = BACKGROUND_MAP[backgroundName];
  const priority = className ? (CLASS_PRIORITY[className] ?? ABILITIES) : ABILITIES;

  // Standard array assignments — index into STANDARD_ARRAY for each ability
  const [arrayAssignments, setArrayAssignments] = useState<(number | null)[]>(() => {
    // Auto-assign based on class priority on first load
    if (className) {
      const assignments: (number | null)[] = Array(6).fill(null);
      priority.forEach((ab, rank) => {
        const abilityIdx = ABILITIES.indexOf(ab);
        if (abilityIdx !== -1) assignments[abilityIdx] = rank; // rank maps to STANDARD_ARRAY index
      });
      return assignments;
    }
    return Array(6).fill(null);
  });

  const [rolledScores, setRolledScores] = useState<number[]>([]);

  // When class changes, re-apply smart defaults
  useEffect(() => {
    if (method !== 'standard_array') return;
    const assignments: (number | null)[] = Array(6).fill(null);
    priority.forEach((ab, rank) => {
      const abilityIdx = ABILITIES.indexOf(ab);
      if (abilityIdx !== -1) assignments[abilityIdx] = rank;
    });
    setArrayAssignments(assignments);
    const newScores = {} as Record<AbilityKey, number>;
    ABILITIES.forEach((ab, i) => {
      const arrayIdx = assignments[i];
      newScores[ab] = arrayIdx !== null ? STANDARD_ARRAY[arrayIdx] : 8;
    });
    onScoresChange(newScores);
  }, [className]);

  function applyStandardArray(assignments: (number | null)[]) {
    const newScores = {} as Record<AbilityKey, number>;
    ABILITIES.forEach((ab, i) => {
      const arrayIdx = assignments[i];
      newScores[ab] = arrayIdx !== null ? STANDARD_ARRAY[arrayIdx] : 8;
    });
    onScoresChange(newScores);
  }

  function assignAbility(abilityIdx: number, arrayIdx: number) {
    const newAssignments = [...arrayAssignments];
    const prevAbilityIdx = newAssignments.indexOf(arrayIdx);
    if (prevAbilityIdx !== -1) newAssignments[prevAbilityIdx] = null;
    newAssignments[abilityIdx] = arrayIdx;
    setArrayAssignments(newAssignments);
    applyStandardArray(newAssignments);
  }

  function setScore(ability: AbilityKey, value: number) {
    onScoresChange({ ...scores, [ability]: Math.max(1, Math.min(30, value)) });
  }

  function rollAllScores() {
    const rolled = generateAbilityScores();
    setRolledScores(rolled);
    const newScores = {} as Record<AbilityKey, number>;
    ABILITIES.forEach((ab, i) => { newScores[ab] = rolled[i]; });
    onScoresChange(newScores);
  }

  function rerollOne(idx: number) {
    const newRolled = [...rolledScores];
    newRolled[idx] = roll4d6DropLowest();
    setRolledScores(newRolled);
    const newScores = {} as Record<AbilityKey, number>;
    ABILITIES.forEach((ab, i) => { newScores[ab] = newRolled[i]; });
    onScoresChange(newScores);
  }

  const totalPointBuy = ABILITIES.reduce((sum, ab) => sum + pointBuyCost(scores[ab]), 0);
  const remainingPoints = POINT_BUY_BUDGET - totalPointBuy;
  const cls = className ? CLASS_MAP[className] : null;

  const finalScores = { ...scores };
  if (bg) {
    finalScores[bg.asi_primary] = (finalScores[bg.asi_primary] || 0) + 2;
    finalScores[bg.asi_secondary] = (finalScores[bg.asi_secondary] || 0) + 1;
  }

  const METHODS: { id: AbilityScoreMethod; label: string }[] = [
    { id: 'standard_array', label: 'Standard Array' },
    { id: 'point_buy',      label: 'Point Buy' },
    { id: 'manual',         label: 'Manual' },
    { id: 'dice_roll',      label: 'Roll 4d6' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Method tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {METHODS.map(m => (
          <button key={m.id} onClick={() => onMethodChange(m.id)}
            style={{ padding: '7px 16px', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)', fontWeight: 500, cursor: 'pointer', minHeight: 0,
              border: method === m.id ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
              background: method === m.id ? 'var(--c-gold-bg)' : 'var(--c-raised)',
              color: method === m.id ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-6)' }}>
        {/* Input side */}
        <div>
          {method === 'standard_array' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {className && (
                <div style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)', marginBottom: 4 }}>
                  ✦ Smart defaults applied for <strong>{className}</strong>. Drag values to adjust.
                </div>
              )}
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginBottom: 4 }}>
                Values: {STANDARD_ARRAY.map((v, i) => <span key={i} style={{ margin: '0 3px', fontWeight: 600, color: 'var(--t-2)' }}>{v}</span>)}
              </div>
              {ABILITIES.map((ab, abilityIdx) => {
                const isPrimary = priority.indexOf(ab) === 0;
                const isSecondary = priority.indexOf(ab) === 1;
                return (
                  <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                    <div style={{ width: 38, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: isPrimary ? 'var(--c-gold-l)' : isSecondary ? 'var(--t-2)' : 'var(--t-3)' }}>{ABBREV[ab]}</span>
                      {isPrimary && <span style={{ fontSize: 8, color: 'var(--c-gold-l)' }}>★</span>}
                    </div>
                    <select value={arrayAssignments[abilityIdx] ?? ''} onChange={e => assignAbility(abilityIdx, Number(e.target.value))}
                      style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: arrayAssignments[abilityIdx] !== null ? 600 : 400 }}>
                      <option value="">— pick —</option>
                      {STANDARD_ARRAY.map((val, arrayIdx) => (
                        <option key={arrayIdx} value={arrayIdx}
                          disabled={arrayAssignments.includes(arrayIdx) && arrayAssignments[abilityIdx] !== arrayIdx}>
                          {val}{priority[arrayIdx] === ab ? ' ★' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          {method === 'point_buy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 'var(--fs-sm)' }}>
                <span style={{ color: 'var(--t-2)' }}>Points remaining</span>
                <span style={{ fontWeight: 700, color: remainingPoints < 0 ? 'var(--c-red-l)' : 'var(--c-gold-l)' }}>{remainingPoints}/{POINT_BUY_BUDGET}</span>
              </div>
              {ABILITIES.map(ab => (
                <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--t-2)', width: 36 }}>{ABBREV[ab]}</span>
                  <button className="btn-secondary btn-sm" onClick={() => setScore(ab, scores[ab] - 1)} disabled={scores[ab] <= 8} style={{ width: 28, padding: 0, minHeight: 28 }}>−</button>
                  <span style={{ fontWeight: 700, color: 'var(--t-1)', minWidth: 24, textAlign: 'center', fontSize: 'var(--fs-md)' }}>{scores[ab]}</span>
                  <button className="btn-secondary btn-sm" onClick={() => setScore(ab, scores[ab] + 1)} disabled={scores[ab] >= 15 || !isValidPointBuyScore(scores[ab] + 1) || remainingPoints <= 0} style={{ width: 28, padding: 0, minHeight: 28 }}>+</button>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>{pointBuyCost(scores[ab])} pts</span>
                </div>
              ))}
            </div>
          )}

          {method === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 4 }}>Enter scores directly (1–30).</p>
              {ABILITIES.map(ab => (
                <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--t-2)', width: 36 }}>{ABBREV[ab]}</span>
                  <input type="number" min={1} max={30} value={scores[ab]} onChange={e => setScore(ab, parseInt(e.target.value, 10) || 10)} style={{ width: 72 }} />
                </div>
              ))}
            </div>
          )}

          {method === 'dice_roll' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 4 }}>Roll 4d6, drop lowest. Click a result to reroll.</p>
              <button className="btn-gold" onClick={rollAllScores}>🎲 Roll All Six Scores</button>
              {rolledScores.length > 0 && ABILITIES.map((ab, i) => (
                <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--t-2)', width: 36 }}>{ABBREV[ab]}</span>
                  <span style={{ fontWeight: 800, fontSize: 'var(--fs-xl)', color: 'var(--t-1)', minWidth: 32 }}>{rolledScores[i]}</span>
                  <button className="btn-ghost btn-sm" onClick={() => rerollOne(i)}>Reroll</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview side */}
        <div>
          <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4)' }}>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--sp-3)' }}>
              Final Scores{bg ? ` (after ${bg.name} ASI)` : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)' }}>
              {ABILITIES.map(ab => {
                const base = scores[ab];
                const final = finalScores[ab];
                const mod = abilityModifier(final);
                const bump = final !== base;
                const isPrimary = priority.indexOf(ab) === 0;
                return (
                  <div key={ab} style={{ background: 'var(--c-raised)', border: `1px solid ${isPrimary ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`, borderRadius: 'var(--r-md)', padding: 'var(--sp-2)', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: isPrimary ? 'var(--c-gold-l)' : 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                      {ABBREV[ab]}{isPrimary ? ' ★' : ''}
                    </div>
                    <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, color: bump ? 'var(--c-amber-l)' : 'var(--t-1)', lineHeight: 1 }}>{final}</div>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: mod >= 0 ? 'var(--c-green-l)' : 'var(--c-red-l)' }}>{formatModifier(mod)}</div>
                    {bump && <div style={{ fontSize: 8, color: 'var(--c-gold-l)', marginTop: 1 }}>base {base}</div>}
                  </div>
                );
              })}
            </div>
            {bg && (
              <div style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-xs)', color: 'var(--t-3)', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-2)' }}>
                {bg.name}: +2 {bg.asi_primary}, +1 {bg.asi_secondary}
              </div>
            )}

            {/* Live HP / AC / Proficiency preview */}
            {cls && (
              <div style={{ marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 4 }}>
                  At Level {level}
                </div>
                {[
                  { label: 'Max HP', value: calcMaxHP(cls.hit_die, finalScores.constitution, level), color: 'var(--c-green-l)' },
                  { label: 'AC (unarmored)', value: 10 + abilityModifier(finalScores.dexterity), color: 'var(--c-gold-l)' },
                  { label: 'Prof Bonus', value: `+${level < 5 ? 2 : level < 9 ? 3 : level < 13 ? 4 : level < 17 ? 5 : 6}`, color: 'var(--c-purple-l)' },
                  { label: 'Initiative', value: formatModifier(abilityModifier(finalScores.dexterity)), color: '#60a5fa' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{label}</span>
                    <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color }}>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
