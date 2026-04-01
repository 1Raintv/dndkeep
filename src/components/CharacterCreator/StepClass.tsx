import type { ClassData } from '../../types';
import { CLASSES } from '../../data/classes';
import { capitalize } from '../../lib/gameUtils';

interface StepClassProps {
  selected: string;
  level: number;
  selectedSkills: string[];
  onSelect: (name: string) => void;
  onLevelChange: (level: number) => void;
  onSkillToggle: (skill: string) => void;
}

// Complexity: 1–5 dots
const CLASS_COMPLEXITY: Record<string, number> = {
  Barbarian: 1, Fighter: 1, Ranger: 2, Rogue: 2, Monk: 3,
  Paladin: 3, Warlock: 3, Cleric: 3, Druid: 4, Bard: 4,
  Sorcerer: 4, Artificer: 4, Wizard: 5, Psion: 5,
};
const COMPLEXITY_LABEL: Record<number, string> = {
  1: 'Beginner friendly', 2: 'Easy', 3: 'Moderate', 4: 'Complex', 5: 'Advanced',
};

const CLASS_ICONS: Record<string, string> = {
  Barbarian:'⚔️', Bard:'🎵', Cleric:'✝️', Druid:'🌿', Fighter:'🛡️',
  Monk:'👊', Paladin:'⚡', Ranger:'🏹', Rogue:'🗡️', Sorcerer:'🔥',
  Warlock:'👁️', Wizard:'📖', Artificer:'⚙️', Psion:'🔮',
};

function ComplexityPips({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: i <= rating ? 'var(--c-gold)' : 'transparent',
          border: i <= rating ? '1.5px solid var(--c-gold)' : '1.5px solid var(--c-border-m)',
        }} />
      ))}
    </div>
  );
}

export default function StepClass({ selected, level, selectedSkills, onSelect, onLevelChange, onSkillToggle }: StepClassProps) {
  const preview = CLASSES.find(c => c.name === selected);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--sp-6)' }}>

      {/* ── Left: scrollable class list + level slider ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {CLASSES.map(cls => (
          <ClassRow
            key={cls.name}
            cls={cls}
            selected={selected === cls.name}
            onSelect={onSelect}
          />
        ))}


      </div>

      {/* ── Right: class preview + skills ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        {preview ? (
          <ClassPreview cls={preview} level={level} />
        ) : (
          <div style={{
            height: 300, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            background: 'var(--c-card)', border: '1px dashed var(--c-border-m)',
            borderRadius: 'var(--r-xl)', color: 'var(--t-3)',
          }}>
            <span style={{ fontSize: 40 }}>⚔️</span>
            <span style={{ fontSize: 'var(--fs-sm)' }}>Select a class to see details</span>
          </div>
        )}

        {/* Skill selector — shown once class is chosen */}
        {preview && (
          <div className="animate-fade-in" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border-m)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4)' }}>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 8 }}>
              Choose {preview.skill_count} Skills
              <span style={{ marginLeft: 8, color: selectedSkills.length === preview.skill_count ? 'var(--c-green-l)' : 'var(--c-amber-l)', fontWeight: 600 }}>
                {selectedSkills.length}/{preview.skill_count} chosen
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {preview.skill_choices.map(skill => {
                const sel = selectedSkills.includes(skill);
                const maxed = !sel && selectedSkills.length >= preview.skill_count;
                return (
                  <button key={skill}
                    onClick={() => !maxed && onSkillToggle(skill)}
                    disabled={maxed}
                    style={{
                      fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '4px 10px', borderRadius: 999,
                      cursor: maxed ? 'not-allowed' : 'pointer', minHeight: 0, opacity: maxed ? 0.4 : 1,
                      border: sel ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                      background: sel ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                      color: sel ? 'var(--c-gold-l)' : 'var(--t-2)',
                      transition: 'all var(--tr-fast)',
                    }}>
                    {sel ? '✓ ' : ''}{skill}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClassRow({ cls, selected, onSelect }: {
  cls: ClassData; selected: boolean; onSelect: (n: string) => void;
}) {
  const complexity = CLASS_COMPLEXITY[cls.name] ?? 3;
  const icon = CLASS_ICONS[cls.name] ?? '🧙';
  return (
    <button
      onClick={() => onSelect(cls.name)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 'var(--r-md)',
        border: selected ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
        background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
        cursor: 'pointer', transition: 'all var(--tr-fast)', textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 'var(--fs-sm)', fontWeight: 600,
        color: selected ? 'var(--c-gold-l)' : 'var(--t-1)',
      }}>{cls.name}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {cls.is_spellcaster && (
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-purple-l)', background: 'var(--c-purple-bg)', border: '1px solid rgba(124,58,237,0.3)', padding: '1px 5px', borderRadius: 999 }}>
            CASTER
          </span>
        )}
        <ComplexityPips rating={complexity} />
      </div>
    </button>
  );
}

function ClassPreview({ cls, level }: { cls: ClassData; level: number }) {
  const complexity = CLASS_COMPLEXITY[cls.name] ?? 3;
  const subclassLevel = cls.subclasses[0]?.unlock_level ?? 3;
  return (
    <div className="animate-fade-in" style={{
      background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
      borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)',
      display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)',
      maxHeight: '80vh', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--t-1)' }}>{cls.name}</h3>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginTop: 2 }}>
            {COMPLEXITY_LABEL[complexity]}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {cls.is_spellcaster && (
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-purple-l)', background: 'var(--c-purple-bg)', border: '1px solid rgba(124,58,237,0.3)', padding: '2px 8px', borderRadius: 999 }}>
              {capitalize(cls.spellcaster_type ?? 'full')} Caster
            </span>
          )}
          <ComplexityPips rating={complexity} />
        </div>
      </div>

      {/* Stat rows */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
        <InfoRow label="Hit Die" value={`d${cls.hit_die}`} />
        <InfoRow label="Primary Abilities" value={cls.primary_abilities.map(a => a.slice(0,3).toUpperCase()).join(', ')} />
        <InfoRow label="Saving Throws" value={cls.saving_throw_proficiencies.map(a => a.slice(0,3).toUpperCase()).join(', ')} />
        <InfoRow label="Armor" value={cls.armor_proficiencies.join(', ') || 'None'} />
        <InfoRow label="Weapons" value={cls.weapon_proficiencies.join(', ')} />
        <InfoRow label="Skills" value={`Choose ${cls.skill_count} from ${cls.skill_choices.length} options`} />
        {cls.spellcasting_ability && (
          <InfoRow label="Spellcasting Ability" value={capitalize(cls.spellcasting_ability)} />
        )}
      </div>

      {/* Subclasses */}
      <div>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 8 }}>
          Subclasses
          {level >= subclassLevel ? (
            <span style={{ marginLeft: 8, color: 'var(--c-purple-l)', fontWeight: 600, background: 'var(--c-purple-bg)', border: '1px solid rgba(124,58,237,0.3)', padding: '1px 7px', borderRadius: 999, textTransform: 'none', letterSpacing: 0 }}>
              ✦ Choose on a following screen
            </span>
          ) : (
            <span style={{ marginLeft: 8, color: 'var(--t-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              — unlock at level {subclassLevel}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cls.subclasses.map(sc => (
            <div key={sc.name} style={{
              padding: '8px 12px', background: 'var(--c-raised)', borderRadius: 'var(--r-md)',
              borderLeft: '2px solid var(--c-gold)',
            }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)', marginBottom: 2 }}>
                {sc.name}
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {sc.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{value}</div>
    </div>
  );
}
