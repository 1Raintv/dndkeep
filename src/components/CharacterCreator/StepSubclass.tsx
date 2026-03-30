import { useState } from 'react';
import type { SubclassData } from '../../types';
import { CLASS_MAP } from '../../data/classes';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';
import type { ChoiceType } from '../../data/levelProgression';

interface StepSubclassProps {
  className: string;
  selected: string;
  onSelect: (subclass: string) => void;
  level: number;
}

const SUBCLASS_LEVEL = 3;

// Color per choice type (matches LevelProgressionPanel)
const CHOICE_STYLES: Record<ChoiceType, { bg: string; border: string; color: string }> = {
  asi:             { bg: 'rgba(201,146,42,0.15)',  border: 'var(--color-gold)',         color: 'var(--text-gold)' },
  subclass:        { bg: 'rgba(167,139,250,0.15)', border: '#a78bfa',                   color: '#c4b5fd' },
  fighting_style:  { bg: 'rgba(96,165,250,0.12)',  border: '#60a5fa',                   color: '#93c5fd' },
  expertise:       { bg: 'rgba(52,211,153,0.12)',  border: '#34d399',                   color: '#6ee7b7' },
  spells:          { bg: 'rgba(251,191,36,0.1)',   border: '#fbbf24',                   color: '#fcd34d' },
  cantrips:        { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.5)',      color: '#fcd34d' },
  invocations:     { bg: 'rgba(248,113,113,0.1)',  border: '#f87171',                   color: '#fca5a5' },
  metamagic:       { bg: 'rgba(217,70,239,0.1)',   border: '#d946ef',                   color: '#e879f9' },
  mystic_arcanum:  { bg: 'rgba(248,113,113,0.12)', border: '#ef4444',                   color: '#fca5a5' },
  magical_secrets: { bg: 'rgba(201,146,42,0.15)',  border: 'var(--color-gold)',          color: 'var(--text-gold)' },
  pact_boon:       { bg: 'rgba(248,113,113,0.12)', border: '#f87171',                   color: '#fca5a5' },
  divine_order:    { bg: 'rgba(250,204,21,0.1)',   border: '#facc15',                   color: '#fef08a' },
  primal_order:    { bg: 'rgba(52,211,153,0.1)',   border: '#34d399',                   color: '#6ee7b7' },
  epic_boon:       { bg: 'rgba(201,146,42,0.2)',   border: 'var(--color-gold)',          color: 'var(--color-gold)' },
  other:           { bg: 'rgba(156,163,175,0.1)',  border: 'var(--border-dim)',          color: 'var(--text-secondary)' },
};

function ChoiceBadge({ type, label }: { type: ChoiceType; label: string }) {
  const s = CHOICE_STYLES[type];
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: '999px',
      border: `1px solid ${s.border}`, background: s.bg,
      fontSize: 'var(--text-xs)', fontFamily: 'var(--font-heading)',
      color: s.color, fontWeight: 600, letterSpacing: '0.03em',
    }}>
      {label}
    </div>
  );
}

export default function StepSubclass({ className, selected, onSelect, level }: StepSubclassProps) {
  const [showChecklist, setShowChecklist] = useState(true);
  const cls = CLASS_MAP[className];
  if (!cls) return null;

  const availableSubclasses = cls.subclasses.filter(sc => sc.unlock_level <= Math.max(level, SUBCLASS_LEVEL));

  // Build the level choices checklist (all choices made from level 1 up to chosen level)
  const progression = CLASS_LEVEL_PROGRESSION[className] ?? [];
  const checklistMilestones = progression.filter(m =>
    m.level <= level &&
    ((m.choices && m.choices.length > 0) || m.subclassFeature || m.newSpellLevel)
  );

  // Level < 3 — subclass not yet unlocked
  if (level < SUBCLASS_LEVEL) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
          background: 'rgba(201,146,42,0.1)', border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
        }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--text-gold)' }}>
            Unlocks at Level {SUBCLASS_LEVEL}
          </span>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Your character is level {level}
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', lineHeight: 1.6 }}>
          {className}s choose their subclass at level {SUBCLASS_LEVEL}.
          When you reach that level, you will be prompted to choose in the character sheet.
          Here is a preview of what is available:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {cls.subclasses.map(sc => (
            <SubclassCard key={sc.name} subclass={sc} selected={false} onSelect={() => {}} disabled />
          ))}
        </div>

        {/* Level 1-2 choices checklist */}
        {checklistMilestones.length > 0 && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <div className="section-header">Choices at Levels 1-{level}</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', lineHeight: 1.6 }}>
              Note these down — you will need to decide them during play.
            </p>
            <LevelChecklist milestones={checklistMilestones} subclassName="" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      {/* Left — subclass picker */}
      <div>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-heading)', lineHeight: 1.5 }}>
          {className}s choose their subclass at level {SUBCLASS_LEVEL}.
          Your character is level {level} — choose now.
          Your subclass grants unique features at specific levels.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {availableSubclasses.map(sc => (
            <SubclassCard key={sc.name} subclass={sc} selected={selected === sc.name} onSelect={onSelect} disabled={false} />
          ))}
        </div>
      </div>

      {/* Right — choices checklist */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none' }}>
            Choices to Record (Levels 1-{level})
          </div>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setShowChecklist(v => !v)}
            style={{ fontSize: 'var(--text-xs)' }}
          >
            {showChecklist ? 'Hide' : 'Show'}
          </button>
        </div>

        {showChecklist && (
          <>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>
              These are all the choices your character would have made by level {level}.
              They are tracked in your features text — note them down to decide later or record on the character sheet.
            </p>
            <LevelChecklist milestones={checklistMilestones} subclassName={selected} />
          </>
        )}
      </div>
    </div>
  );
}

function LevelChecklist({ milestones, subclassName }: { milestones: typeof CLASS_LEVEL_PROGRESSION[string]; subclassName: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {milestones.map(m => (
        <div key={m.level} style={{ display: 'flex', gap: 'var(--space-3)' }}>
          {/* Level dot */}
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)',
            border: '2px solid var(--border-gold)',
            background: 'rgba(201,146,42,0.1)', color: 'var(--text-gold)',
          }}>
            {m.level}
          </div>
          {/* Choices */}
          <div style={{ flex: 1, paddingTop: 4 }}>
            {m.newSpellLevel && (
              <div style={{ marginBottom: 4 }}>
                <span style={{
                  fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)',
                  color: '#fcd34d', background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: 'var(--radius-sm)', padding: '1px 8px',
                }}>
                  {['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][m.newSpellLevel]}-level spells unlocked
                </span>
              </div>
            )}
            {m.subclassFeature && m.level > 3 && (
              <div style={{ marginBottom: 4 }}>
                <ChoiceBadge type="other" label={subclassName ? `${subclassName}: subclass feature` : 'Subclass feature'} />
              </div>
            )}
            {m.choices && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {m.choices.map((c, i) => (
                  <ChoiceBadge key={i} type={c.type} label={c.label} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SubclassCard({ subclass, selected, onSelect, disabled }: {
  subclass: SubclassData;
  selected: boolean;
  onSelect: (name: string) => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onSelect(subclass.name)}
      disabled={disabled}
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
        padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
        border: selected ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
        background: selected ? 'rgba(201,146,42,0.1)' : 'var(--bg-sunken)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all var(--transition-fast)', textAlign: 'left', opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)', color: selected ? 'var(--text-gold)' : 'var(--text-primary)' }}>
        {subclass.name}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        {subclass.description}
      </div>
    </button>
  );
}
