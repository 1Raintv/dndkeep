import { supabase } from '../../lib/supabase';
import type { Character, ComputedStats, AbilityKey } from '../../types';
import { formatModifier, rollDie } from '../../lib/gameUtils';
import { CONDITION_MAP } from '../../data/conditions';
import { SPECIES } from '../../data/species';
import { BACKGROUNDS } from '../../data/backgrounds';
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

      {/* ── Passive Scores ── */}
      <div style={{ height: 1, background: 'var(--c-border)', margin: '8px 0' }} />
      <div>
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 6 }}>
          Passive Scores
        </div>
        {[
          { label: 'Passive Perception', value: computed.passive_perception },
          { label: 'Passive Investigation', value: computed.passive_investigation },
          { label: 'Passive Insight', value: computed.passive_insight },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', borderRadius: 'var(--r-sm)', marginBottom: 2, background: 'var(--c-raised)' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 13, color: 'var(--t-1)' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Senses ── */}
      {(() => {
        const speciesData = SPECIES.find(s => s.name === character.species);
        const dv = character.darkvision ?? speciesData?.darkvision ?? 0;
        if (dv === 0) return null;
        return (
          <>
            <div style={{ height: 1, background: 'var(--c-border)', margin: '8px 0' }} />
            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 6 }}>
                Senses
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', borderRadius: 'var(--r-sm)', background: 'var(--c-raised)' }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>Darkvision</span>
                <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 12, color: '#60a5fa' }}>{dv} ft.</span>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Defenses ── */}
      {(() => {
        const speciesData = SPECIES.find(s => s.name === character.species);
        const resistances: string[] = [];
        const immunities: string[] = [];
        // Species resistances (e.g. Tiefling fire resistance)
        speciesData?.traits?.forEach((t: any) => {
          const d = t.description?.toLowerCase() ?? '';
          if (d.includes('resistance to')) {
            const m = d.match(/resistance to ([\w, ]+) damage/);
            if (m) m[1].split(/,\s*|\s+and\s+/).forEach((r: string) => resistances.push(r.trim()));
          }
          if (d.includes('immune') || d.includes('immunity to')) {
            const m = d.match(/immunity to ([\w, ]+) damage/);
            if (m) m[1].split(/,\s*|\s+and\s+/).forEach((r: string) => immunities.push(r.trim()));
          }
        });
        // Buffs
        const buffs: any[] = (character as any).active_buffs ?? [];
        buffs.forEach((b: any) => (b.resistances ?? []).forEach((r: string) => { if (!resistances.includes(r)) resistances.push(r); }));
        if (resistances.length === 0 && immunities.length === 0) return null;
        return (
          <>
            <div style={{ height: 1, background: 'var(--c-border)', margin: '8px 0' }} />
            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#4ade80', marginBottom: 6 }}>
                🛡 Defenses
              </div>
              {resistances.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 2 }}>Resistances</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {resistances.map(r => (
                      <span key={r} style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {immunities.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 2 }}>Immunities</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {immunities.map(r => (
                      <span key={r} style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Tools & Languages ── */}
      {(() => {
        const bgData = BACKGROUNDS.find((b: any) => b.name === character.background);
        const toolProf = bgData?.tool_proficiency ?? null;
        const speciesData = SPECIES.find(s => s.name === character.species);
        const langs = speciesData?.languages ?? [];
        const extraLangs = bgData?.languages ?? 0;
        if (!toolProf && langs.length === 0 && extraLangs === 0) return null;
        return (
          <>
            <div style={{ height: 1, background: 'var(--c-border)', margin: '8px 0' }} />
            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 6 }}>
                Tools &amp; Languages
              </div>
              {toolProf && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', borderRadius: 'var(--r-sm)', background: 'var(--c-raised)', marginBottom: 2 }}>
                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', fontWeight: 600 }}>Tool</span>
                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', fontWeight: 600 }}>{toolProf}</span>
                </div>
              )}
              {langs.length > 0 && (
                <div style={{ padding: '3px 8px', borderRadius: 'var(--r-sm)', background: 'var(--c-raised)', marginBottom: 2 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', fontWeight: 600, marginBottom: 2 }}>Languages</div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)' }}>
                    {langs.join(', ')}{extraLangs > 0 ? ` + ${extraLangs} choice` : ''}
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}
      {/* ── Section divider ── */}
      <div style={{ height: 1, background: 'var(--c-border)', margin: '8px 0' }} />

      {/* ── Ability Checks — compact strip ── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase' as const,
          color: 'var(--c-gold-l)', marginBottom: 5,
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


    </section>
  );
}
