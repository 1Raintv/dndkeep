import { supabase } from '../../lib/supabase';
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

const STAT_META: Record<AbilityKey, { color: string; bg: string; bdr: string; abbrev: string }> = {
  strength:     { color: 'var(--stat-str)', bg: 'var(--stat-str-bg)', bdr: 'var(--stat-str-bdr)', abbrev: 'STR' },
  dexterity:    { color: 'var(--stat-dex)', bg: 'var(--stat-dex-bg)', bdr: 'var(--stat-dex-bdr)', abbrev: 'DEX' },
  constitution: { color: 'var(--stat-con)', bg: 'var(--stat-con-bg)', bdr: 'var(--stat-con-bdr)', abbrev: 'CON' },
  intelligence: { color: 'var(--stat-int)', bg: 'var(--stat-int-bg)', bdr: 'var(--stat-int-bdr)', abbrev: 'INT' },
  wisdom:       { color: 'var(--stat-wis)', bg: 'var(--stat-wis-bg)', bdr: 'var(--stat-wis-bdr)', abbrev: 'WIS' },
  charisma:     { color: 'var(--stat-cha)', bg: 'var(--stat-cha-bg)', bdr: 'var(--stat-cha-bdr)', abbrev: 'CHA' },
};

export default function AbilityScores({ character, computed }: AbilityScoresProps) {
  const { triggerRoll } = useDiceRoll();

  function rollAbility(ability: AbilityKey) {
    const mod = computed.modifiers[ability];
    const hasDisadvantage = (character.active_conditions ?? []).some(c => CONDITION_MAP[c]?.abilityCheckDisadvantage);
    const hasAutoFail = (character.active_conditions ?? []).some(c => CONDITION_MAP[c]?.autoFailSaves?.includes(ability));

    if (hasAutoFail) {
      triggerRoll({ result: 1, dieType: 20, modifier: mod, total: 1 + mod, label: `${ability.charAt(0).toUpperCase() + ability.slice(1)} (Auto-Fail)` });
      supabase.from('roll_logs').insert({ user_id: character.user_id, character_id: character.id, campaign_id: character.campaign_id ?? null, character_name: character.name, label: `${ability.charAt(0).toUpperCase() + ability.slice(1)} (Auto-Fail)`, dice_expression: '1d20', individual_results: [1], total: 1 + mod, modifier: mod });
      return;
    }

    const roll1 = rollDie(20);
    const roll2 = hasDisadvantage ? rollDie(20) : roll1;
    const d20 = hasDisadvantage ? Math.min(roll1, roll2) : roll1;
    const label = `${ability.charAt(0).toUpperCase() + ability.slice(1)} Check${hasDisadvantage ? ' (Disadvantage)' : ''}`;
    triggerRoll({ result: d20, dieType: 20, modifier: mod, total: d20 + mod, label });
    supabase.from('roll_logs').insert({ user_id: character.user_id, character_id: character.id, campaign_id: character.campaign_id ?? null, label, dice_expression: '1d20', individual_results: [d20], total: d20 + mod, modifier: mod }).then(({error}) => { if (error) console.error('roll_logs insert error:', error); });
  }

  return (
    <section>
      {/* Roll result flash banner */}
      {/* 6-column ability score strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 'var(--sp-2)' }}>
        {ABILITY_ORDER.map(ability => {
          const meta = STAT_META[ability];
          const score = character[ability];
          const mod = computed.modifiers[ability];
          const save = computed.saving_throws[ability];
          const isActive = false;

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
                borderTopColor: meta.color,
                background: isActive ? meta.bg : undefined,
                boxShadow: isActive ? `0 0 0 1px ${meta.bdr}, 0 4px 16px ${meta.color}20` : undefined,
              }}
            >
              {/* Abbrev label in stat color */}
              <div className="stat-box-label" style={{ color: meta.color }}>
                {meta.abbrev}
              </div>

              {/* Modifier — large, prominent */}
              <div className="stat-box-modifier" style={{ color: 'var(--t-1)', fontSize: '1.3rem' }}>
                {formatModifier(mod)}
              </div>

              {/* Score — small, secondary */}
              <div className="stat-box-value">{score}</div>

              {/* Save indicator */}
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: save.proficient ? meta.color : 'transparent',
                  border: `1px solid ${save.proficient ? meta.color : 'var(--c-border-m)'}`,
                }} />
                <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 9, color: save.proficient ? meta.color : 'var(--t-3)' }}>
                  {formatModifier(save.total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 10, color: 'var(--t-3)', fontFamily: 'var(--ff-body)', letterSpacing: '0.03em', marginBottom: 0 }}>
        Click any score to roll · bottom dot = save proficiency · edit scores in Settings
      </p>
    </section>
  );
}
