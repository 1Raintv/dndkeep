import { useState } from 'react';
import type { Character, ComputedStats, AbilityKey } from '../../types';
import { abilityAbbrev, formatModifier, rollDie } from '../../lib/gameUtils';
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
    const d20 = rollDie(20);
    setLastRoll({ ability, d20, modifier: mod, total: d20 + mod, isCrit: d20 === 20, isFail: d20 === 1 });
    const label = ability.charAt(0).toUpperCase() + ability.slice(1) + ' Check';
    triggerRoll({ result: d20, dieType: 20, modifier: mod, total: d20 + mod, label });
  }

  return (
    <section>
      <div className="section-header">Ability Scores</div>

      {/* Roll result */}
      {lastRoll && (
        <div style={{
          marginBottom: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${lastRoll.isCrit ? 'var(--hp-full)' : lastRoll.isFail ? 'var(--color-blood)' : 'var(--border-gold)'}`,
          background: lastRoll.isCrit ? 'rgba(22,163,74,0.1)' : lastRoll.isFail ? 'rgba(127,29,29,0.1)' : 'rgba(201,146,42,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-gold)', textTransform: 'capitalize' }}>
              {lastRoll.ability} check
            </span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'var(--space-2)' }}>
              d20({lastRoll.d20}) {lastRoll.modifier >= 0 ? '+' : ''}{lastRoll.modifier}
            </span>
            {lastRoll.isCrit && <span style={{ marginLeft: 'var(--space-2)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--hp-full)' }}>Natural 20</span>}
            {lastRoll.isFail && <span style={{ marginLeft: 'var(--space-2)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: '#fca5a5' }}>Natural 1</span>}
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2rem', lineHeight: 1, color: lastRoll.isCrit ? 'var(--hp-full)' : lastRoll.isFail ? '#fca5a5' : 'var(--text-gold)' }}>
            {lastRoll.total}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
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
                gap: 'var(--space-2)',
                cursor: 'pointer',
                border: isActive ? '2px solid var(--color-gold)' : undefined,
                background: isActive ? 'rgba(201,146,42,0.08)' : undefined,
                transition: 'all var(--transition-fast)',
              }}
            >
              <div className="stat-box-label">{abilityAbbrev(ability)}</div>
              <div className="stat-box-modifier">{formatModifier(mod)}</div>
              <div className="stat-box-value">{score}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
                <span
                  className={`prof-dot ${save.proficient ? 'proficient' : ''}`}
                  title={save.proficient ? 'Saving throw proficiency' : 'No saving throw proficiency'}
                  style={{ pointerEvents: 'none' }}
                />
                <span style={{
                  fontSize: 'var(--text-xs)',
                  color: save.proficient ? 'var(--text-gold)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-heading)',
                }}>
                  Save {formatModifier(save.total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{
        marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)', fontFamily: 'var(--font-heading)',
        letterSpacing: '0.04em',
      }}>
        Click any score to roll an ability check. Edit scores in Character Settings.
      </p>
    </section>
  );
}
