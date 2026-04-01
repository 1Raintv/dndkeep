import { useState } from 'react';
import type { SubclassData } from '../../types';
import { CLASS_MAP } from '../../data/classes';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';

interface StepSubclassProps {
  className: string;
  selected: string;
  onSelect: (subclass: string) => void;
  level: number;
}

const SPELL_ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export default function StepSubclass({ className, selected, onSelect, level }: StepSubclassProps) {
  const cls = CLASS_MAP[className];
  if (!cls) return null;

  const subclassUnlockLevel = Math.min(...cls.subclasses.map(s => s.unlock_level));
  const needsSubclass = level >= subclassUnlockLevel;
  const progression = CLASS_LEVEL_PROGRESSION[className] ?? [];

  // Levels 1..level from progression, fill in gaps
  const allLevels = Array.from({ length: level }, (_, i) => {
    const prog = progression.find(p => p.level === i + 1);
    return { level: i + 1, features: prog?.features ?? [], choices: prog?.choices ?? [], newSpellLevel: prog?.newSpellLevel, subclassFeature: prog?.subclassFeature };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Subclass picker */}
      {needsSubclass ? (
        <div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)' }}>
            {className}s choose their subclass at level {subclassUnlockLevel}.
            Your character is level {level} — choose now.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {cls.subclasses.map(sc => (
              <SubclassCard key={sc.name} subclass={sc} selected={selected === sc.name} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-lg)', fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>
          <strong>Subclass unlocks at level {subclassUnlockLevel}.</strong> Your character is level {level} — no choice needed yet. Here's a preview of what's available:
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
            {cls.subclasses.map(sc => (
              <div key={sc.name} style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--c-raised)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>{sc.name}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 2 }}>{sc.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-level feature timeline */}
      <div>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--sp-3)' }}>
          Your character's features — levels 1 through {level}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {allLevels.map(({ level: lvl, features, choices, newSpellLevel, subclassFeature }) => (
            <LevelRow
              key={lvl}
              level={lvl}
              features={features}
              choices={choices ?? []}
              newSpellLevel={newSpellLevel}
              subclassFeature={subclassFeature}
              isSubclassLevel={lvl === subclassUnlockLevel}
              selectedSubclass={selected}
              subclassUnlocked={needsSubclass}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LevelRow({ level, features, choices, newSpellLevel, subclassFeature, isSubclassLevel, selectedSubclass, subclassUnlocked }: {
  level: number;
  features: string[];
  choices: { type: string; label: string }[];
  newSpellLevel?: number;
  subclassFeature?: boolean;
  isSubclassLevel: boolean;
  selectedSubclass: string;
  subclassUnlocked: boolean;
}) {
  const hasAnything = features.length > 0 || choices.length > 0 || newSpellLevel || subclassFeature || isSubclassLevel;
  const isASI = choices.some(c => c.type === 'asi');
  const isEpic = choices.some(c => c.type === 'epic_boon');
  const otherChoices = choices.filter(c => c.type !== 'asi' && c.type !== 'epic_boon');

  return (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', padding: 'var(--sp-2) 0', borderBottom: '1px solid var(--c-border)' }}>
      {/* Level number */}
      <div style={{ flexShrink: 0, width: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--fs-xs)', fontWeight: 700,
          background: isSubclassLevel ? 'var(--c-purple-bg)' : isASI ? 'var(--c-gold-bg)' : hasAnything ? 'var(--c-raised)' : 'transparent',
          border: isSubclassLevel ? '1.5px solid rgba(124,58,237,0.5)' : isASI ? '1.5px solid var(--c-gold-bdr)' : '1.5px solid var(--c-border-m)',
          color: isSubclassLevel ? 'var(--c-purple-l)' : isASI ? 'var(--c-gold-l)' : 'var(--t-3)',
        }}>{level}</div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {!hasAnything && (
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontStyle: 'italic' }}>No new features</span>
        )}

        {/* New spell level unlock */}
        {newSpellLevel && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-xs)', fontWeight: 600, color: '#fcd34d', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 999, padding: '2px 8px', width: 'fit-content' }}>
            ✦ {SPELL_ORDINAL[newSpellLevel]}-level spells unlocked
          </span>
        )}

        {/* Base class features */}
        {features.map((f, i) => (
          <span key={i} style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.5 }}>{f}</span>
        ))}

        {/* Subclass unlock */}
        {isSubclassLevel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-purple-l)', background: 'var(--c-purple-bg)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 999, padding: '2px 8px' }}>
              ✦ Choose Subclass
            </span>
            {subclassUnlocked && selectedSubclass && (
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)', fontWeight: 600 }}>→ {selectedSubclass}</span>
            )}
          </div>
        )}

        {/* Subclass feature (non-unlock levels) */}
        {subclassFeature && !isSubclassLevel && (
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--c-purple-l)', background: 'var(--c-purple-bg)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 999, padding: '2px 8px', width: 'fit-content' }}>
            {selectedSubclass ? `${selectedSubclass}: Subclass Feature` : 'Subclass Feature'}
          </span>
        )}

        {/* ASI / Feat choice */}
        {isASI && (
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 999, padding: '2px 8px', width: 'fit-content' }}>
            📈 Ability Score Improvement or Feat
          </span>
        )}

        {/* Epic Boon */}
        {isEpic && (
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-amber-l)', background: 'var(--c-amber-bg)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 999, padding: '2px 8px', width: 'fit-content' }}>
            ⭐ Epic Boon (Feat)
          </span>
        )}

        {/* Other choices */}
        {otherChoices.map((c, i) => (
          <span key={i} style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-blue-l)', background: 'var(--c-blue-bg)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 999, padding: '2px 8px', width: 'fit-content' }}>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SubclassCard({ subclass, selected, onSelect }: { subclass: SubclassData; selected: boolean; onSelect: (name: string) => void }) {
  return (
    <button onClick={() => onSelect(subclass.name)} style={{
      display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--sp-3) var(--sp-4)',
      borderRadius: 'var(--r-lg)', textAlign: 'left',
      border: selected ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
      background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
      cursor: 'pointer', transition: 'all var(--tr-fast)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: selected ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
        {selected ? '✓ ' : ''}{subclass.name}
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{subclass.description}</div>
    </button>
  );
}
