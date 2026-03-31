import type { AbilityKey, AbilityScoreMethod } from '../../types';
import { abilityModifier, formatModifier } from '../../lib/gameUtils';
import { CLASS_MAP } from '../../data/classes';
import { BACKGROUND_MAP } from '../../data/backgrounds';
import { calcMaxHP } from '../../data/levelProgression';

const ABILITIES: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABBREV: Record<AbilityKey, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

interface StepReviewProps {
  name: string;
  alignment: string;  // kept in interface but no longer shown
  species: string;
  className: string;
  subclass: string;
  background: string;
  scores: Record<AbilityKey, number>;
  method: AbilityScoreMethod;
  selectedSkills: string[];
  level: number;
  onNameChange: (v: string) => void;
  onAlignmentChange: (v: string) => void;  // kept for compat
  onSkillToggle: (skill: string) => void;
}

export default function StepReview({
  name, species, className, subclass, background,
  scores, level, onNameChange,
}: StepReviewProps) {
  const cls = CLASS_MAP[className];
  const bg = BACKGROUND_MAP[background];

  const finalScores = { ...scores };
  if (bg) {
    finalScores[bg.asi_primary] = (finalScores[bg.asi_primary] || 0) + 2;
    finalScores[bg.asi_secondary] = (finalScores[bg.asi_secondary] || 0) + 1;
  }

  const maxHP = cls ? calcMaxHP(cls.hit_die, finalScores.constitution, level) : 10;
  const armorClass = 10 + abilityModifier(finalScores.dexterity);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)', maxWidth: 640, margin: '0 auto' }}>

      {/* Name input — prominent */}
      <div>
        <label style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--t-2)', marginBottom: 6 }}>Character Name</label>
        <input
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="What do they call you?"
          autoFocus
          style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, padding: '10px 14px' }}
        />
      </div>

      {/* Summary card — all info in one box */}
      <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
        {/* Identity row */}
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
          <SummaryChip label="Species" value={species} />
          <SummaryChip label="Class" value={`${className}${subclass ? ` · ${subclass}` : ''}`} highlight />
          <SummaryChip label="Background" value={background} />
          <SummaryChip label="Level" value={String(level)} highlight />
        </div>

        {/* Stats row */}
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)', display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-6)' }}>
          <SummaryChip label="Max HP" value={String(maxHP)} highlight />
          <SummaryChip label="Hit Die" value={`d${cls?.hit_die ?? '?'}`} />
          <SummaryChip label="Base AC" value={String(armorClass)} />
          {bg && <SummaryChip label="ASI" value={`+2 ${bg.asi_primary}, +1 ${bg.asi_secondary}`} />}
          {cls && <SummaryChip label="Saves" value={cls.saving_throw_proficiencies.map(s => s.slice(0,3).toUpperCase()).join(', ')} />}
        </div>

        {/* Ability scores grid */}
        <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--sp-3)' }}>Ability Scores</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--sp-2)' }}>
            {ABILITIES.map(ab => (
              <div key={ab} style={{ background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-2)', textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{ABBREV[ab]}</div>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 800, color: 'var(--t-1)', lineHeight: 1 }}>{finalScores[ab]}</div>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: abilityModifier(finalScores[ab]) >= 0 ? 'var(--c-green-l)' : 'var(--c-red-l)' }}>
                  {formatModifier(abilityModifier(finalScores[ab]))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!name.trim() && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-amber-l)', padding: 'var(--sp-2) var(--sp-3)', background: 'var(--c-amber-bg)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 'var(--r-md)' }}>
          ← Enter a character name to create your character
        </div>
      )}
    </div>
  );
}

function SummaryChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: highlight ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{value}</span>
    </div>
  );
}
