import { useState } from 'react';
import type { Character, ComputedStats, AbilityKey } from '../../types';
import { abilityAbbrev, formatModifier, rollDie } from '../../lib/gameUtils';
import { CONDITION_MAP } from '../../data/conditions';
import { useDiceRoll } from '../../context/DiceRollContext';

interface AbilityScoresProps {
  character: Character;
  computed: ComputedStats;
}

const ABILITY_ORDER: AbilityKey[] = [
  'strength', 'dexterity', 'constitution',
  'intelligence', 'wisdom', 'charisma',
];

interface AbilityRoll {
  ability: AbilityKey;
  d20: number;
  modifier: number;
  total: number;
  isCrit: boolean;
  isFail: boolean;
}

export default function AbilityScores({ character, computed }: AbilityScoresProps) {
  const [lastRoll, setLastRoll] = useState<AbilityRoll | null>(null);
  const { triggerRoll } = useDiceRoll();

  function rollAbility(ability: AbilityKey) {
    const mod = computed.modifiers[ability];
    const hasDisadvantage = (character.active_conditions ?? []).some(c => {
      const mech = CONDITION_MAP[c];
      return mech?.abilityCheckDisadvantage;
    });
    const hasAutoFail = (character.active_conditions ?? []).some(c => {
      const mech = CONDITION_MAP[c];
      return mech?.autoFailSaves?.includes(ability);
    });
    if (hasAutoFail) {
      setLastRoll({ ability, d20: 1, modifier: mod, total: 1 + mod, isCrit: false, isFail: true });
      triggerRoll({ result: 1, dieType: 20, modifier: mod, total: 1 + mod, label: ability.charAt(0).toUpperCase() + ability.slice(1) + ' (Auto-Fail)' });
      return;
    }
    const roll1 = rollDie(20);
    const roll2 = hasDisadvantage ? rollDie(20) : roll1;
    const d20 = hasDisadvantage ? Math.min(roll1, roll2) : roll1;
    setLastRoll({ ability, d20, modifier: mod, total: d20 + mod, isCrit: d20 === 20, isFail: d20 === 1 });
    const label = ability.charAt(0).toUpperCase() + ability.slice(1) + ' Check' + (hasDisadvantage ? ' (Disadvantage)' : '');
    triggerRoll({ result: d20, dieType: 20, modifier: mod, total: d20 + mod, label });
  }

  return (
    <section>
      <div className="section-header">Ability Scores</div>

      {/* Roll result */}
      {lastRoll && (
        <div style={{
          marginBottom: 'var(--sp-3)',
          padding: 'var(--sp-2) var(--sp-4)',
          borderRadius: 'var(--r-md)',
          border: `1px solid ${lastRoll.isCrit ? 'var(--hp-full)' : lastRoll.isFail ? 'rgba(107,20,20,1)' : 'var(--c-gold-bdr)'}`,
          background: lastRoll.isCrit ? 'rgba(22,163,74,0.1)' : lastRoll.isFail ? 'rgba(127,29,29,0.1)' : 'rgba(201,146,42,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)', textTransform: 'capitalize' }}>
              {lastRoll.ability} check
            </span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginLeft: 'var(--sp-2)' }}>
              d20({lastRoll.d20}) {lastRoll.modifier >= 0 ? '+' : ''}{lastRoll.modifier}
            </span>
            {lastRoll.isCrit && <span style={{ marginLeft: 'var(--sp-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--hp-full)' }}>Natural 20</span>}
            {lastRoll.isFail && <span style={{ marginLeft: 'var(--sp-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: '#fca5a5' }}>Natural 1</span>}
          </div>
          <span style={{ fontFamily: 'var(--ff-brand)', fontWeight: 900, fontSize: '2rem', lineHeight: 1, color: lastRoll.isCrit ? 'var(--hp-full)' : lastRoll.isFail ? '#fca5a5' : 'var(--c-gold-l)' }}>
            {lastRoll.total}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-3)' }}>
        {ABILITY_ORDER.map(ability => {
          const score = character[ability];
          const mod   = computed.modifiers[ability];
          const save  = computed.saving_throws[ability];
          const isActive = lastRoll?.ability === ability;

          return (
            <div
              key={ability}
              className="stat-box"
              role="button"
              tabIndex={0}
              onClick={() => rollAbility(ability)}
              onKeyDown={e => e.key === 'Enter' && rollAbility(ability)}
              title={`Roll ${ability} check (d20${mod >= 0 ? '+' : ''}${mod})`}
              style={{
                gap: 'var(--sp-2)',
                cursor: 'pointer',
                border: isActive ? '2px solid var(--c-gold)' : undefined,
                background: isActive ? 'rgba(201,146,42,0.08)' : undefined,
                transition: 'all var(--tr-fast)',
              }}
            >
              <div className="stat-box-label">{abilityAbbrev(ability)}</div>
              <div className="stat-box-modifier">{formatModifier(mod)}</div>
              <div className="stat-box-value">{score}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', marginTop: 'var(--sp-1)' }}>
                <span
                  className={`prof-dot ${save.proficient ? 'proficient' : ''}`}
                  title={save.proficient ? 'Saving throw proficiency' : 'No saving throw proficiency'}
                  style={{ pointerEvents: 'none' }}
                />
                <span style={{
                  fontSize: 'var(--fs-xs)',
                  color: save.proficient ? 'var(--c-gold-l)' : 'var(--t-2)',
                  fontFamily: 'var(--ff-body)',
                }}>
                  Save {formatModifier(save.total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{
        marginTop: 'var(--sp-2)', fontSize: 'var(--fs-xs)',
        color: 'var(--t-2)', fontFamily: 'var(--ff-body)',
        letterSpacing: '0.04em',
      }}>
        Click any score to roll an ability check. Edit scores in Character Settings.
      </p>
    </section>
  );
}
