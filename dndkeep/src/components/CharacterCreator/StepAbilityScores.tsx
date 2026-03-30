import { useState } from 'react';
import type { AbilityKey, AbilityScoreMethod } from '../../types';
import {
  abilityModifier, formatModifier, STANDARD_ARRAY,
  pointBuyCost, POINT_BUY_BUDGET, isValidPointBuyScore,
  generateAbilityScores, roll4d6DropLowest,
} from '../../lib/gameUtils';
import { BACKGROUND_MAP } from '../../data/backgrounds';

const ABILITIES: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABBREV: Record<AbilityKey, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

interface StepAbilityScoresProps {
  scores: Record<AbilityKey, number>;
  method: AbilityScoreMethod;
  backgroundName: string;
  onScoresChange: (scores: Record<AbilityKey, number>) => void;
  onMethodChange: (method: AbilityScoreMethod) => void;
}

export default function StepAbilityScores({ scores, method, backgroundName, onScoresChange, onMethodChange }: StepAbilityScoresProps) {
  const bg = BACKGROUND_MAP[backgroundName];
  const [arrayAssignments, setArrayAssignments] = useState<(number | null)[]>(Array(6).fill(null));
  const [rolledScores, setRolledScores] = useState<number[]>([]);

  const totalPointBuy = ABILITIES.reduce((sum, ab) => sum + pointBuyCost(scores[ab]), 0);
  const remainingPoints = POINT_BUY_BUDGET - totalPointBuy;

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

  function assignStandardArray(abilityIdx: number, arrayIdx: number) {
    const newAssignments = [...arrayAssignments];
    // Unassign previous use of this array value
    const prevAbilityIdx = newAssignments.indexOf(arrayIdx);
    if (prevAbilityIdx !== -1) newAssignments[prevAbilityIdx] = null;
    newAssignments[abilityIdx] = arrayIdx;
    setArrayAssignments(newAssignments);
    const newScores = { ...scores };
    newScores[ABILITIES[abilityIdx]] = STANDARD_ARRAY[arrayIdx];
    onScoresChange(newScores);
  }

  const finalScores = { ...scores };
  if (bg) {
    finalScores[bg.asi_primary] = (finalScores[bg.asi_primary] || 0) + 2;
    finalScores[bg.asi_secondary] = (finalScores[bg.asi_secondary] || 0) + 1;
  }

  const METHODS: { id: AbilityScoreMethod; label: string }[] = [
    { id: 'standard_array', label: 'Standard Array' },
    { id: 'point_buy', label: 'Point Buy' },
    { id: 'manual', label: 'Manual Entry' },
    { id: 'dice_roll', label: 'Dice Roll (4d6)' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      <div>
        {/* Method selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
          {METHODS.map(m => (
            <button key={m.id} onClick={() => onMethodChange(m.id)}
              className={method === m.id ? 'btn-gold btn-sm' : 'btn-secondary btn-sm'}>
              {m.label}
            </button>
          ))}
        </div>

        {method === 'standard_array' && (
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-heading)' }}>
              Assign each value to one ability. Values: {STANDARD_ARRAY.join(', ')}
            </p>
            {ABILITIES.map((ab, abilityIdx) => (
              <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', width: 36 }}>{ABBREV[ab]}</span>
                <select value={arrayAssignments[abilityIdx] ?? ''} onChange={e => assignStandardArray(abilityIdx, Number(e.target.value))} style={{ flex: 1 }}>
                  <option value="">— choose —</option>
                  {STANDARD_ARRAY.map((val, arrayIdx) => (
                    <option key={arrayIdx} value={arrayIdx} disabled={arrayAssignments.includes(arrayIdx) && arrayAssignments[abilityIdx] !== arrayIdx}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {method === 'point_buy' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Points remaining</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: remainingPoints < 0 ? 'var(--color-crimson-bright)' : 'var(--text-gold)' }}>
                {remainingPoints} / {POINT_BUY_BUDGET}
              </span>
            </div>
            {ABILITIES.map(ab => (
              <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', width: 36 }}>{ABBREV[ab]}</span>
                <button className="btn-secondary btn-sm btn-icon" onClick={() => setScore(ab, scores[ab] - 1)} disabled={scores[ab] <= 8}>-</button>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-primary)', minWidth: 24, textAlign: 'center' }}>{scores[ab]}</span>
                <button className="btn-secondary btn-sm btn-icon" onClick={() => setScore(ab, scores[ab] + 1)} disabled={scores[ab] >= 15 || !isValidPointBuyScore(scores[ab] + 1) || remainingPoints <= 0}>+</button>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>({pointBuyCost(scores[ab])} pts)</span>
              </div>
            ))}
          </div>
        )}

        {method === 'manual' && (
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-heading)' }}>Enter your ability scores directly (1–30).</p>
            {ABILITIES.map(ab => (
              <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', width: 36 }}>{ABBREV[ab]}</span>
                <input type="number" min={1} max={30} value={scores[ab]} onChange={e => setScore(ab, parseInt(e.target.value, 10) || 10)} style={{ width: 72 }} />
              </div>
            ))}
          </div>
        )}

        {method === 'dice_roll' && (
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-heading)' }}>Roll 4d6, drop the lowest. Click any result to reroll that score.</p>
            <button className="btn-gold" style={{ marginBottom: 'var(--space-4)' }} onClick={rollAllScores}>
              Roll All Six Scores
            </button>
            {rolledScores.length > 0 && ABILITIES.map((ab, i) => (
              <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', width: 36 }}>{ABBREV[ab]}</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--text-primary)', minWidth: 32 }}>{rolledScores[i]}</span>
                <button className="btn-ghost btn-sm" onClick={() => rerollOne(i)}>Reroll</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Final scores preview (with background ASIs applied) */}
      <div>
        <div className="card card-gold">
          <div className="section-header">Final Scores {bg ? `(+${bg.name} ASI)` : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
            {ABILITIES.map(ab => {
              const baseScore = scores[ab];
              const finalScore = finalScores[ab];
              const mod = abilityModifier(finalScore);
              const hasBump = finalScore !== baseScore;
              return (
                <div key={ab} className="stat-box">
                  <div className="stat-box-label">{ABBREV[ab]}</div>
                  <div className="stat-box-modifier">{formatModifier(mod)}</div>
                  <div className="stat-box-value" style={{ color: hasBump ? 'var(--color-amber)' : 'var(--text-primary)' }}>{finalScore}</div>
                  {hasBump && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontFamily: 'var(--font-heading)' }}>(base {baseScore})</div>}
                </div>
              );
            })}
          </div>
          {bg && (
            <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-3)' }}>
              {bg.name}: +2 {bg.asi_primary}, +1 {bg.asi_secondary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
