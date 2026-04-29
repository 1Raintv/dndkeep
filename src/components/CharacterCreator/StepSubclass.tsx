import type { SubclassData } from '../../types';
import { CLASS_MAP } from '../../data/classes';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';
import { useAuth } from '../../context/AuthContext';

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
  // v2.329.0 — T7: filter UA subclasses out of the picker for accounts
  // without show_ua_content. Today only Psion has UA-flagged subclasses;
  // scaling to future UA additions is automatic.
  const { showUaContent } = useAuth();
  const visibleSubclasses = cls.subclasses.filter(
    (s: any) => showUaContent || s.source !== 'ua',
  );

  const subclassUnlockLevel = Math.min(...visibleSubclasses.map(s => s.unlock_level));
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
          {/* v2.366.0 — Compact tile grid (2 columns on desktop). Each
              tile is just name + UA badge + a one-line feature
              milestone summary, NOT the full description. The full
              description renders in the SubclassDetails panel below
              the grid so the layout doesn't shift when the user
              cycles between subclasses. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--sp-2)',
            }}
          >
            {visibleSubclasses.map(sc => (
              <SubclassTile
                key={sc.name}
                subclass={sc}
                selected={selected === sc.name}
                onSelect={onSelect}
              />
            ))}
          </div>
          {/* Details panel — only renders once a subclass is selected.
              Empty state nudges the user to pick one. */}
          {selected ? (
            <SubclassDetails subclass={visibleSubclasses.find(s => s.name === selected)} />
          ) : (
            <div
              style={{
                marginTop: 'var(--sp-3)',
                padding: 'var(--sp-4)',
                background: 'var(--c-surface)',
                border: '1px dashed var(--c-border-m)',
                borderRadius: 'var(--r-lg)',
                fontSize: 'var(--fs-sm)',
                color: 'var(--t-3)',
                textAlign: 'center' as const,
              }}
            >
              Select a subclass above to see its features and description.
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-lg)', fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>
          <strong>Subclass unlocks at level {subclassUnlockLevel}.</strong> Your character is level {level} — no choice needed yet. Here's a preview of what's available:
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
            {visibleSubclasses.map(sc => (
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

// v2.366.0 — Compact tile. No description, no expanded feature list
// inline — those move to the SubclassDetails panel below the grid.
// Tile shows name + optional UA badge + a single subtle line
// summarizing the count of feature levels the subclass adds.
function SubclassTile({ subclass, selected, onSelect }: { subclass: SubclassData; selected: boolean; onSelect: (name: string) => void }) {
  const featureLevels = (subclass.features ?? []).reduce<Set<number>>((acc, f) => {
    acc.add(f.level);
    return acc;
  }, new Set<number>());

  return (
    <button
      onClick={() => onSelect(subclass.name)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--sp-3) var(--sp-4)',
        borderRadius: 'var(--r-lg)', textAlign: 'left' as const,
        border: selected ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
        background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
        cursor: 'pointer', transition: 'all var(--tr-fast)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: selected ? 'var(--c-gold-l)' : 'var(--t-1)', flex: 1 }}>
          {selected ? '✓ ' : ''}{subclass.name}
        </div>
        {subclass.source === 'ua' && (
          <span
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              color: '#c084fc',
              background: 'rgba(192,132,252,0.12)',
              border: '1px solid rgba(192,132,252,0.3)',
              borderRadius: 999,
              padding: '1px 6px',
            }}
          >
            UA
          </span>
        )}
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: selected ? 'var(--c-gold-l)' : 'var(--t-3)', fontWeight: 500 }}>
        {featureLevels.size} feature{featureLevels.size === 1 ? '' : 's'}
      </div>
    </button>
  );
}

// v2.366.0 — Full details panel rendered ONCE, below the tile grid,
// for whichever subclass is currently selected. Description and
// feature milestones live here so switching tiles doesn't reflow
// the picker.
function SubclassDetails({ subclass }: { subclass: SubclassData | undefined }) {
  if (!subclass) return null;

  // Group features by level for the milestone display.
  const featuresByLevel: Record<number, string[]> = {};
  for (const f of subclass.features ?? []) {
    if (!featuresByLevel[f.level]) featuresByLevel[f.level] = [];
    featuresByLevel[f.level].push(f.name);
  }
  const featureLevels = Object.keys(featuresByLevel).map(Number).sort((a, b) => a - b);

  return (
    <div
      style={{
        marginTop: 'var(--sp-3)',
        padding: 'var(--sp-4)',
        background: 'var(--c-raised)',
        border: '1px solid var(--c-gold-bdr)',
        borderRadius: 'var(--r-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-3)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
            textTransform: 'uppercase' as const,
            color: 'var(--c-gold-l)',
            marginBottom: 4,
          }}
        >
          Subclass details
        </div>
        <div style={{ fontWeight: 700, fontSize: 'var(--fs-lg)', color: 'var(--t-1)' }}>
          {subclass.name}
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.5, marginTop: 6 }}>
          {subclass.description}
        </div>
      </div>

      {featureLevels.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--t-3)',
              textTransform: 'uppercase' as const, letterSpacing: '0.08em',
              marginBottom: 'var(--sp-2)',
            }}
          >
            Feature milestones
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {featureLevels.map(lvl => (
              <div key={lvl} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span
                  style={{
                    fontSize: 10, fontWeight: 700,
                    color: 'var(--c-gold-l)',
                    background: 'rgba(212,160,23,0.12)',
                    border: '1px solid var(--c-gold-bdr)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    minWidth: 36,
                    textAlign: 'center' as const,
                  }}
                >
                  Lv {lvl}
                </span>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>
                  {featuresByLevel[lvl].join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
