import type { AbilityKey, Alignment, AbilityScoreMethod } from '../../types';
import { abilityModifier, formatModifier } from '../../lib/gameUtils';
import { CLASS_MAP } from '../../data/classes';
import { BACKGROUND_MAP } from '../../data/backgrounds';
import { calcMaxHP } from '../../data/levelProgression';
import LevelProgressionPanel from './LevelProgressionPanel';

const ALIGNMENTS: Alignment[] = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];

const ABILITIES: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABBREV: Record<AbilityKey, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

interface StepReviewProps {
  name: string;
  alignment: Alignment;
  species: string;
  className: string;
  subclass: string;
  background: string;
  scores: Record<AbilityKey, number>;
  method: AbilityScoreMethod;
  selectedSkills: string[];
  level: number;
  onNameChange: (v: string) => void;
  onAlignmentChange: (v: Alignment) => void;
  onSkillToggle: (skill: string) => void;
  onLevelChange: (level: number) => void;
}

export default function StepReview({
  name, alignment, species, className, subclass, background,
  scores, selectedSkills, level,
  onNameChange, onAlignmentChange, onSkillToggle, onLevelChange,
}: StepReviewProps) {
  const cls = CLASS_MAP[className];
  const bg = BACKGROUND_MAP[background];

  const finalScores = { ...scores };
  if (bg) {
    finalScores[bg.asi_primary] = (finalScores[bg.asi_primary] || 0) + 2;
    finalScores[bg.asi_secondary] = (finalScores[bg.asi_secondary] || 0) + 1;
  }

  const maxHP = cls
    ? calcMaxHP(cls.hit_die, finalScores.constitution, level)
    : 10;

  const skillsNeeded = cls?.skill_count ?? 2;
  const bgSkills = bg?.skill_proficiencies ?? [];
  const availableClassSkills = (cls?.skill_choices ?? []).filter(s => !bgSkills.includes(s));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {/* Left column — inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label>Character Name</label>
            <input
              type="text"
              value={name}
              onChange={e => onNameChange(e.target.value)}
              placeholder="What do they call you?"
              autoFocus
            />
          </div>

          {/* Starting Level */}
          <div>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Starting Level</span>
              <span style={{
                fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-lg)',
                color: 'var(--text-gold)',
              }}>
                {level}
              </span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 4 }}>
              <input
                type="range"
                min={1} max={20}
                value={level}
                onChange={e => onLevelChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--color-gold)', cursor: 'pointer' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              <span>1</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                {level >= 3 ? 'Subclass unlocked' : level === 2 ? 'Subclass at level 3' : 'Subclass at level 3'}
              </span>
              <span>20</span>
            </div>
            {level > 1 && (
              <p style={{ marginTop: 4, fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                HP uses average per level ({cls ? `d${cls.hit_die}` : ''}). You can adjust on the character sheet.
              </p>
            )}
          </div>

          <div>
            <label>Alignment</label>
            <select value={alignment} onChange={e => onAlignmentChange(e.target.value as Alignment)}>
              {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Skill selection */}
          {cls && (
            <div>
              <div className="section-header">
                Choose {skillsNeeded} Class Skills
                <span style={{ color: selectedSkills.length === skillsNeeded ? 'var(--hp-full)' : 'var(--color-crimson-bright)', marginLeft: 'var(--space-2)' }}>
                  ({selectedSkills.length}/{skillsNeeded})
                </span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-2)' }}>
                Background grants: {bgSkills.join(', ')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {availableClassSkills.map(skill => {
                  const chosen = selectedSkills.includes(skill);
                  const atMax = selectedSkills.length >= skillsNeeded && !chosen;
                  return (
                    <button
                      key={skill}
                      onClick={() => !atMax && onSkillToggle(skill)}
                      disabled={atMax}
                      style={{
                        fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 600,
                        padding: '3px var(--space-3)', borderRadius: '999px',
                        border: chosen ? '1px solid var(--color-gold)' : '1px solid var(--border-subtle)',
                        background: chosen ? 'rgba(201,146,42,0.15)' : 'var(--bg-sunken)',
                        color: chosen ? 'var(--text-gold)' : atMax ? 'var(--text-muted)' : 'var(--text-secondary)',
                        cursor: atMax ? 'not-allowed' : 'pointer',
                        opacity: atMax ? 0.5 : 1,
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column — summary card */}
        <div className="card card-gold">
          <div className="section-header">Character Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SummaryRow label="Name"       value={name || '—'} />
            <SummaryRow label="Species"    value={species} />
            <SummaryRow label="Class"      value={`${className}${subclass ? ` (${subclass})` : ''}`} />
            <SummaryRow label="Background" value={background} />
            <SummaryRow label="Alignment"  value={alignment} />
            <SummaryRow label="Level"      value={String(level)} highlight />
            <SummaryRow label="Max HP"     value={String(maxHP)} highlight />
            <SummaryRow label="Hit Die"    value={`d${cls?.hit_die ?? '?'}`} />
            {bg && <SummaryRow label="ASI" value={`+2 ${bg.asi_primary}, +1 ${bg.asi_secondary}`} />}
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div className="section-header">Ability Scores</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
              {ABILITIES.map(ab => (
                <div key={ab} className="stat-box" style={{ padding: 'var(--space-2)' }}>
                  <div className="stat-box-label">{ABBREV[ab]}</div>
                  <div className="stat-box-modifier">{formatModifier(abilityModifier(finalScores[ab]))}</div>
                  <div className="stat-box-value" style={{ fontSize: 'var(--text-lg)' }}>{finalScores[ab]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full-width level progression panel */}
      {className && (
        <LevelProgressionPanel className={className} subclass={subclass} level={level} />
      )}
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-2)' }}>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: highlight ? 'var(--text-gold)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
