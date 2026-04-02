import type { AbilityKey, AbilityScoreMethod } from '../../types';
import { abilityModifier, formatModifier } from '../../lib/gameUtils';
import { CLASS_MAP } from '../../data/classes';
import { BACKGROUND_MAP } from '../../data/backgrounds';
import { SPECIES_MAP } from '../../data/species';
import { calcMaxHP } from '../../data/levelProgression';
import type { BuildChoices } from './StepBuild';

const ABILITIES: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABBREV: Record<AbilityKey, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };
const FULL: Record<AbilityKey, string> = { strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma' };

interface StepReviewProps {
  name: string;
  species: string;
  className: string;
  subclass: string;
  background: string;
  level: number;
  scores: Record<AbilityKey, number>;
  method: AbilityScoreMethod;
  selectedSkills: string[];
  buildChoices: BuildChoices;
  originFeat: string;
}

export default function StepReview({ name, species, className, subclass, background, level, scores, selectedSkills, buildChoices, originFeat }: StepReviewProps) {
  const cls = CLASS_MAP[className];
  const bg = BACKGROUND_MAP[background];
  const sp = SPECIES_MAP[species];

  // Compute final scores with background ASI
  const finalScores = { ...scores };
  if (bg) {
    (finalScores[bg.asi_primary as AbilityKey] as number) += 2;
    (finalScores[bg.asi_secondary as AbilityKey] as number) += 1;
  }

  const profBonus = level < 5 ? 2 : level < 9 ? 3 : level < 13 ? 4 : level < 17 ? 5 : 6;
  const maxHP = cls ? calcMaxHP(cls.hit_die, finalScores.constitution, level) : 10;
  const ac = 10 + abilityModifier(finalScores.dexterity);
  const initMod = abilityModifier(finalScores.dexterity);
  const speed = sp?.speed ?? 30;

  const spellAbility = cls?.spellcasting_ability as AbilityKey | null;
  const spellMod = spellAbility ? abilityModifier(finalScores[spellAbility]) + profBonus : null;
  const spellDC = spellMod !== null ? 8 + spellMod : null;

  const allSkills = [...(bg?.skill_proficiencies ?? []), ...selectedSkills];

  // Validate — warn if anything is missing
  const warnings: string[] = [];
  if (!name.trim()) warnings.push('Character name is required');
  if (!species) warnings.push('No species selected');
  if (!className) warnings.push('No class selected');
  if (!background) warnings.push('No background selected');
  if (level >= 3 && !subclass && !buildChoices.subclass) warnings.push('Subclass not chosen (required at level 3+)');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)', maxWidth: 760 }}>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-red-bg)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 'var(--r-lg)' }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-red-l)', marginBottom: i < warnings.length - 1 ? 4 : 0 }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {/* Identity block */}
      <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)' }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--t-1)', marginBottom: 6 }}>
          {name || <span style={{ color: 'var(--t-3)' }}>Unnamed Character</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {species && <Tag label={species} color="var(--c-green-l)" bg="var(--c-green-bg)" />}
          {className && <Tag label={`${className} ${level}`} color="var(--c-gold-l)" bg="var(--c-gold-bg)" />}
          {(subclass || buildChoices.subclass) && <Tag label={subclass || buildChoices.subclass} color="var(--c-purple-l)" bg="var(--c-purple-bg)" />}
          {background && <Tag label={background} color="var(--c-blue-l)" bg="var(--c-blue-bg)" />}
        </div>
      </div>

      {/* Core stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-3)' }}>
        <StatBox label="Max HP" value={maxHP} color="var(--c-green-l)" big />
        <StatBox label="Armor Class" value={ac} color="var(--c-gold-l)" big />
        <StatBox label="Prof Bonus" value={`+${profBonus}`} color="var(--c-purple-l)" big />
        <StatBox label="Speed" value={`${speed}ft`} color="#60a5fa" big />
        <StatBox label="Initiative" value={formatModifier(initMod)} color="#60a5fa" />
        <StatBox label="Hit Die" value={`d${cls?.hit_die ?? 8}`} color="var(--t-2)" />
        {spellMod !== null && <StatBox label="Spell Attack" value={`+${spellMod}`} color="var(--c-purple-l)" />}
        {spellDC !== null && <StatBox label="Spell Save DC" value={spellDC} color="var(--c-purple-l)" />}
      </div>

      {/* Ability scores */}
      <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4)' }}>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 'var(--sp-3)' }}>
          Ability Scores
          {bg && <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--t-3)' }}>({bg.name}: +2 {FULL[bg.asi_primary as AbilityKey]}, +1 {FULL[bg.asi_secondary as AbilityKey]})</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--sp-2)' }}>
          {ABILITIES.map(ab => {
            const base = scores[ab];
            const final = finalScores[ab];
            const mod = abilityModifier(final);
            const bumped = final !== base;
            const isPrimary = cls?.primary_abilities.includes(ab);
            return (
              <div key={ab} style={{
                textAlign: 'center', padding: 'var(--sp-3) var(--sp-2)',
                background: 'var(--c-raised)', borderRadius: 'var(--r-lg)',
                border: `1px solid ${isPrimary ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: isPrimary ? 'var(--c-gold-l)' : 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  {ABBREV[ab]}{isPrimary ? ' ★' : ''}
                </div>
                <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: bumped ? 'var(--c-amber-l)' : 'var(--t-1)', lineHeight: 1, marginBottom: 2 }}>
                  {final}
                </div>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: mod >= 0 ? 'var(--c-green-l)' : 'var(--c-red-l)' }}>
                  {formatModifier(mod)}
                </div>
                {bumped && <div style={{ fontSize: 8, color: 'var(--c-gold-l)', marginTop: 2 }}>+{final - base}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Skills & Proficiencies */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 'var(--sp-2)' }}>
            Skill Proficiencies ({allSkills.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {allSkills.map(s => <Tag key={s} label={s} color="var(--t-2)" bg="var(--c-raised)" />)}
            {allSkills.length === 0 && <span style={{ color: 'var(--t-3)', fontSize: 'var(--fs-xs)' }}>None chosen</span>}
          </div>
        </div>
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 'var(--sp-2)' }}>
            Saving Throws
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {cls?.saving_throw_proficiencies.map(s => <Tag key={s} label={s.slice(0,3).toUpperCase()} color="var(--c-gold-l)" bg="var(--c-gold-bg)" />) ?? <span style={{ color: 'var(--t-3)', fontSize: 'var(--fs-xs)' }}>—</span>}
          </div>
          {originFeat && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--c-border)' }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>Origin Feat: </span>
              <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--c-gold-l)' }}>{originFeat}</span>
            </div>
          )}
        </div>
      </div>

      {/* Spells summary */}
      {(buildChoices.spells.length > 0 || buildChoices.cantrips.length > 0) && (
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 'var(--sp-2)' }}>
            Spells
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {buildChoices.cantrips.map(id => <Tag key={id} label={id} color="#fcd34d" bg="rgba(251,191,36,0.08)" />)}
            {buildChoices.spells.map(id => <Tag key={id} label={id} color="var(--c-purple-l)" bg="var(--c-purple-bg)" />)}
          </div>
        </div>
      )}

      <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-green-bg)', border: '1px solid rgba(5,150,105,0.3)', borderRadius: 'var(--r-lg)', fontSize: 'var(--fs-sm)', color: 'var(--c-green-l)', fontWeight: 600 }}>
        Looking good — click Create Character to save your build.
      </div>
    </div>
  );
}

function StatBox({ label, value, color, big }: { label: string; value: string | number; color: string; big?: boolean }) {
  return (
    <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-3)', textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 'var(--fs-2xl)' : 'var(--fs-lg)', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '3px 9px', borderRadius: 999, color, background: bg, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}
