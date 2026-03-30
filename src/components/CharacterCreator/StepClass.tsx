import type { ClassData } from '../../types';
import { CLASSES } from '../../data/classes';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';
import type { ChoiceType } from '../../data/levelProgression';
import { capitalize } from '../../lib/gameUtils';

interface StepClassProps {
  selected: string;
  level: number;
  onSelect: (name: string) => void;
  onLevelChange: (level: number) => void;
}

const CLASS_COMPLEXITY: Record<string, number> = {
  Barbarian: 1, Fighter: 1, Ranger: 2, Rogue: 2, Monk: 3,
  Paladin: 3, Warlock: 3, Cleric: 3, Druid: 4, Bard: 4, Sorcerer: 4, Wizard: 5,
};
const COMPLEXITY_LABEL: Record<number, string> = {
  1: 'Beginner', 2: 'Easy', 3: 'Moderate', 4: 'Complex', 5: 'Very complex',
};

const CHOICE_COLORS: Record<ChoiceType, { bg: string; border: string; color: string }> = {
  asi:             { bg: 'rgba(201,146,42,0.15)',  border: 'var(--color-gold)',    color: 'var(--text-gold)' },
  subclass:        { bg: 'rgba(167,139,250,0.15)', border: '#a78bfa',             color: '#c4b5fd' },
  fighting_style:  { bg: 'rgba(96,165,250,0.12)',  border: '#60a5fa',             color: '#93c5fd' },
  expertise:       { bg: 'rgba(52,211,153,0.12)',  border: '#34d399',             color: '#6ee7b7' },
  spells:          { bg: 'rgba(251,191,36,0.1)',   border: '#fbbf24',             color: '#fcd34d' },
  cantrips:        { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.5)',color: '#fcd34d' },
  invocations:     { bg: 'rgba(248,113,113,0.1)',  border: '#f87171',             color: '#fca5a5' },
  metamagic:       { bg: 'rgba(217,70,239,0.1)',   border: '#d946ef',             color: '#e879f9' },
  mystic_arcanum:  { bg: 'rgba(248,113,113,0.12)', border: '#ef4444',             color: '#fca5a5' },
  magical_secrets: { bg: 'rgba(201,146,42,0.15)',  border: 'var(--color-gold)',   color: 'var(--text-gold)' },
  pact_boon:       { bg: 'rgba(248,113,113,0.12)', border: '#f87171',             color: '#fca5a5' },
  divine_order:    { bg: 'rgba(250,204,21,0.1)',   border: '#facc15',             color: '#fef08a' },
  primal_order:    { bg: 'rgba(52,211,153,0.1)',   border: '#34d399',             color: '#6ee7b7' },
  epic_boon:       { bg: 'rgba(201,146,42,0.2)',   border: 'var(--color-gold)',   color: 'var(--color-gold)' },
  other:           { bg: 'rgba(156,163,175,0.1)',  border: 'var(--border-dim)',   color: 'var(--text-secondary)' },
};

function ChoiceBadge({ type, label }: { type: ChoiceType; label: string }) {
  const s = CHOICE_COLORS[type];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: '999px', border: `1px solid ${s.border}`,
      background: s.bg, color: s.color,
      fontSize: 'var(--text-xs)', fontFamily: 'var(--font-heading)', fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function ComplexityPips({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: i <= rating ? 'var(--color-gold)' : 'transparent',
          border: i <= rating ? '2px solid var(--color-gold)' : '2px solid var(--border-dim)',
          flexShrink: 0,
        }} />
      ))}
    </div>
  );
}

export default function StepClass({ selected, level, onSelect, onLevelChange }: StepClassProps) {
  const preview = CLASSES.find(c => c.name === selected);
  const effectiveSubclassLevel = preview
    ? Math.min(...preview.subclasses.map(s => s.unlock_level))
    : 3;
  const hasSubclassAtLevel = preview && level >= effectiveSubclassLevel;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* ── LEVEL SELECTOR — always at top ─────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(201,146,42,0.08) 0%, rgba(201,146,42,0.03) 100%)',
        border: '1px solid var(--border-gold)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'var(--space-3)' }}>
          <div>
            <label style={{ marginBottom: 4 }}>Starting Level</label>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '3rem', lineHeight: 1,
              background: 'linear-gradient(160deg, var(--color-amber), var(--color-gold-bright), var(--color-gold))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              {level}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {selected ? (
              hasSubclassAtLevel ? (
                <span style={{
                  fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700,
                  color: '#c4b5fd', background: 'rgba(167,139,250,0.15)',
                  border: '1px solid #a78bfa', borderRadius: 'var(--radius-sm)', padding: '4px 12px',
                }}>
                  ✦ Subclass choice included — pick on next screen
                </span>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 600,
                  color: 'var(--text-muted)', background: 'var(--bg-raised)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '4px 12px',
                }}>
                  Subclass unlocks at level {effectiveSubclassLevel}
                </span>
              )
            ) : (
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Choose a class to see what level {level} unlocks
              </span>
            )}
          </div>
        </div>

        <input
          type="range" min={1} max={20} value={level}
          onChange={e => onLevelChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--color-gold)', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          {[1, 5, 10, 15, 20].map(n => (
            <span key={n} style={{
              fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)',
              color: level === n ? 'var(--text-gold)' : 'var(--text-muted)',
              fontWeight: level === n ? 700 : 400,
            }}>{n}</span>
          ))}
        </div>
      </div>

      {/* ── CLASS GRID + PREVIEW ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p style={{
            fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
          }}>
            Choose your class
          </p>
          {CLASSES.map(cls => (
            <ClassRow key={cls.name} cls={cls} selected={selected === cls.name} onSelect={onSelect} />
          ))}
        </div>

        <div>
          {preview ? (
            <ClassPreview cls={preview} level={level} />
          ) : (
            <div style={{
              height: '100%', minHeight: 240,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 'var(--space-3)', background: 'var(--bg-sunken)',
              borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-subtle)',
            }}>
              <div style={{ fontSize: 36, opacity: 0.25 }}>⚔️</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-heading)' }}>
                Select a class to preview
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassRow({ cls, selected, onSelect }: { cls: ClassData; selected: boolean; onSelect: (n: string) => void }) {
  const complexity = CLASS_COMPLEXITY[cls.name] ?? 3;
  return (
    <button
      onClick={() => onSelect(cls.name)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)',
        border: selected ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
        background: selected ? 'rgba(201,146,42,0.1)' : 'var(--bg-sunken)',
        cursor: 'pointer', transition: 'all var(--transition-fast)', textAlign: 'left',
        boxShadow: selected ? '0 0 12px rgba(201,146,42,0.15)' : 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)',
          color: selected ? 'var(--text-gold)' : 'var(--text-secondary)',
        }}>
          {cls.name}
        </span>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {COMPLEXITY_LABEL[complexity]}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexShrink: 0 }}>
        {cls.is_spellcaster && <span className="badge badge-gold" style={{ fontSize: 9 }}>Caster</span>}
        <ComplexityPips rating={complexity} />
      </div>
    </button>
  );
}

function ClassPreview({ cls, level }: { cls: ClassData; level: number }) {
  const complexity = CLASS_COMPLEXITY[cls.name] ?? 3;
  const progression = CLASS_LEVEL_PROGRESSION[cls.name] ?? [];
  const effectiveSubclassLevel = Math.min(...cls.subclasses.map(s => s.unlock_level));

  // All milestones earned at chosen level
  const earned = progression.filter(m => m.level <= level);
  const allFeatures = earned.flatMap(m => m.features.filter(Boolean));
  const allChoices = earned.flatMap(m => m.choices ?? []);
  const hasSubclass = level >= effectiveSubclassLevel;

  return (
    <div className="card card-gold animate-fade-in" style={{ overflowY: 'auto', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>{cls.name}</h3>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            d{cls.hit_die} Hit Die · {cls.saving_throw_proficiencies.map(a => a.slice(0,3).toUpperCase()).join(', ')} saves
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {cls.is_spellcaster && <span className="badge badge-gold">{capitalize(cls.spellcaster_type)} Caster</span>}
          <ComplexityPips rating={complexity} />
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {COMPLEXITY_LABEL[complexity]}
          </span>
        </div>
      </div>

      {/* What you HAVE at this level */}
      <div>
        <div className="section-header">At Level {level} you have</div>

        {allFeatures.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-3)' }}>
            {allFeatures.map((f, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 600,
                padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}>
                {f}
              </span>
            ))}
          </div>
        )}

        {allChoices.length > 0 && (
          <div>
            <div style={{
              fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
            }}>
              Choices to make
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allChoices.map((c, i) => <ChoiceBadge key={i} type={c.type} label={c.label} />)}
            </div>
          </div>
        )}

        {hasSubclass && (
          <div style={{
            marginTop: 'var(--space-3)', padding: 'var(--space-3)',
            background: 'rgba(167,139,250,0.08)', border: '1px solid #a78bfa40',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: '#c4b5fd',
          }}>
            ✦ Subclass choice included — you'll pick on the next screen
          </div>
        )}

        {allFeatures.length === 0 && allChoices.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-heading)' }}>
            No additional features unlocked yet.
          </p>
        )}
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
        <InfoBox label="Armor" value={cls.armor_proficiencies.join(', ') || 'None'} />
        <InfoBox label="Skills" value={`Choose ${cls.skill_count}`} />
        {cls.spellcasting_ability && <InfoBox label="Spellcasting" value={capitalize(cls.spellcasting_ability)} />}
        <InfoBox label="Primary" value={cls.primary_abilities.map(a => capitalize(a)).join(', ')} />
      </div>

      {/* Subclasses */}
      <div>
        <div className="section-header" style={{ marginBottom: 'var(--space-3)' }}>
          Subclasses <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
            (unlock at level {effectiveSubclassLevel})
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {cls.subclasses.map(sc => (
            <div key={sc.name} style={{
              padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-sunken)',
              borderRadius: 'var(--radius-sm)',
              borderLeft: `2px solid ${hasSubclass ? 'var(--color-gold-dim)' : 'var(--border-subtle)'}`,
            }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, color: hasSubclass ? 'var(--text-gold)' : 'var(--text-muted)' }}>
                {sc.name}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                {sc.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg-sunken)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2) var(--space-3)' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}
