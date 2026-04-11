import { supabase } from '../../lib/supabase';
import type { Character, ComputedStats, AbilityKey } from '../../types';
import { formatModifier, rollDie } from '../../lib/gameUtils';
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
    const d20 = hasDisadvantage ? Math.min(roll1, rollDie(20)) : roll1;
    const label = `${ability.charAt(0).toUpperCase() + ability.slice(1)} Check${hasDisadvantage ? ' (Disadvantage)' : ''}`;
    triggerRoll({ result: 0, dieType: 20, modifier: mod, label,
      onResult: (_dice, physTotal) => {
        const physRoll = physTotal - mod;
        supabase.from('roll_logs').insert({ user_id: character.user_id, character_id: character.id, campaign_id: character.campaign_id ?? null, label, dice_expression: '1d20', individual_results: [physRoll], total: physTotal, modifier: mod }).then(({error}) => { if (error) console.error(error); });
      },
    });
  }

  function rollSave(ability: AbilityKey) {
    const isProficient = character.saving_throw_proficiencies?.includes(ability);
    const abilityMod = computed.modifiers[ability];
    const saveMod = abilityMod + (isProficient ? computed.proficiency_bonus : 0);
    const hasAutoFail = (character.active_conditions ?? []).some(c => CONDITION_MAP[c]?.autoFailSaves?.includes(ability));
    if (hasAutoFail) {
      triggerRoll({ result: 1, dieType: 20, modifier: saveMod, total: 1 + saveMod, label: `${ability.charAt(0).toUpperCase() + ability.slice(1)} Save (Auto-Fail)` });
      return;
    }
    const label = `${ability.charAt(0).toUpperCase() + ability.slice(1)} Save`;
    triggerRoll({ result: 0, dieType: 20, modifier: saveMod, label,
      onResult: (_dice, physTotal) => {
        const physRoll = physTotal - saveMod;
        supabase.from('roll_logs').insert({ user_id: character.user_id, character_id: character.id, campaign_id: character.campaign_id ?? null, label, dice_expression: '1d20', individual_results: [physRoll], total: physTotal, modifier: saveMod }).then(({error}) => { if (error) console.error(error); });
      },
    });
  }

  return (
    <section className="ability-scores-section">

      {/* ── Ability Checks — compact strip ── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase' as const,
          color: 'var(--t-3)', marginBottom: 5,
        }}>
          Ability Checks
        </div>
        <div className="ability-scores-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {ABILITY_ORDER.map(ability => {
            const meta = STAT_META[ability];
            const score = character[ability as keyof Character] as number;
            const mod = computed.modifiers[ability];
            return (
              <div
                key={ability}
                className="stagger-item"
                role="button"
                tabIndex={0}
                onClick={() => rollAbility(ability)}
                onKeyDown={e => e.key === 'Enter' && rollAbility(ability)}
                title={`Roll ${ability} check (d20${mod >= 0 ? '+' : ''}${mod})`}
                style={{
                  background: 'var(--c-card)',
                  border: `1px solid var(--c-border)`,
                  borderTop: `2px solid ${meta.color}`,
                  borderRadius: 'var(--r-md)',
                  padding: '5px 4px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all var(--tr-fast)',
                  display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1,
                }}
              >
                {/* Abbrev */}
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: meta.color, lineHeight: 1 }}>
                  {meta.abbrev}
                </div>
                {/* Modifier — compact */}
                <div style={{ fontFamily: 'var(--ff-stat)', fontSize: '1.3rem', fontWeight: 900, color: 'var(--t-1)', lineHeight: 1 }}>
                  {formatModifier(mod)}
                </div>
                {/* Raw score */}
                <div style={{ fontFamily: 'var(--ff-stat)', fontSize: 9, color: 'var(--t-3)', lineHeight: 1 }}>{score}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section divider ── */}
      <div style={{ height: 1, background: 'var(--c-border)', margin: '8px 0' }} />

      {/* ── Saving Throws — prominent, full-size cards ── */}
      <div>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase' as const,
          color: 'var(--c-gold-l)', marginBottom: 5,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          Saving Throws
        </div>
        <div className="ability-scores-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {ABILITY_ORDER.map(ability => {
            const meta = STAT_META[ability];
            const isProficient = character.saving_throw_proficiencies?.includes(ability);
            const saveMod = computed.modifiers[ability] + (isProficient ? computed.proficiency_bonus : 0);
            return (
              <div
                key={ability}
                className="stat-box stagger-item"
                role="button"
                tabIndex={0}
                onClick={() => rollSave(ability)}
                onKeyDown={e => e.key === 'Enter' && rollSave(ability)}
                title={`Roll ${ability} saving throw (d20${saveMod >= 0 ? '+' : ''}${saveMod})${isProficient ? ' — Proficient' : ''}`}
                style={{
                  borderTopColor: meta.color,
                  background: isProficient ? meta.color + '0A' : undefined,
                  padding: '8px 6px',
                  cursor: 'pointer',
                }}
              >
                {/* Prof dot + abbrev inline */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 3 }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: isProficient ? meta.color : 'transparent',
                    border: `1px solid ${isProficient ? meta.color : 'var(--c-border-m)'}`,
                  }} />
                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: meta.color }}>
                    {meta.abbrev}
                  </span>
                </div>
                {/* Modifier — big, same weight as DDB */}
                <div style={{ fontFamily: 'var(--ff-stat)', fontSize: '1.3rem', fontWeight: 900, color: 'var(--t-1)', lineHeight: 1 }}>
                  {formatModifier(saveMod)}
                </div>
                {/* Save label */}

              </div>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: 9, color: 'var(--t-3)', fontFamily: 'var(--ff-body)', letterSpacing: '0.03em', marginBottom: 0, marginTop: 6 }}>
        Top = ability check · Bottom = saving throw · filled dot = proficient
      </p>
    </section>
  );
}
