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

const CLASS_COMPLEXITY: Record<string, number> = {
  Barbarian: 1, Fighter: 1, Ranger: 2, Rogue: 2, Monk: 3,
  Paladin: 3, Warlock: 3, Cleric: 3, Druid: 4, Bard: 4,
  Sorcerer: 4, Artificer: 4, Wizard: 5, Psion: 5,
};
const COMPLEXITY_LABEL: Record<number, string> = {
  1: 'Beginner', 2: 'Easy', 3: 'Moderate', 4: 'Complex', 5: 'Advanced',
};
const CLASS_ICONS: Record<string, string> = {
  Barbarian:'⚔️', Bard:'🎵', Cleric:'✝️', Druid:'🌿', Fighter:'🛡️',
  Monk:'👊', Paladin:'⚡', Ranger:'🏹', Rogue:'🗡️', Sorcerer:'🔥',
  Warlock:'👁️', Wizard:'📖', Artificer:'⚙️', Psion:'🔮',
};

function ComplexityPips({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%',
          background: i <= rating ? 'var(--c-gold)' : 'transparent',
          border: i <= rating ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)' }} />
      ))}
    </div>
  );
}

export default function StepClass({ selected, level, selectedSkills, onSelect, onLevelChange, onSkillToggle }: StepClassProps) {
  const preview = CLASSES.find(c => c.name === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Class grid — 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--sp-2)' }}>
        {CLASSES.map(cls => {
          const complexity = CLASS_COMPLEXITY[cls.name] ?? 3;
          const icon = CLASS_ICONS[cls.name] ?? '🧙';
          const sel = selected === cls.name;
          return (
            <button key={cls.name} onClick={() => onSelect(cls.name)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px', borderRadius: 'var(--r-md)', textAlign: 'left',
              border: sel ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
              background: sel ? 'var(--c-gold-bg)' : 'var(--c-raised)',
              cursor: 'pointer', transition: 'all var(--tr-fast)',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: 600,
                color: sel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{cls.name}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {cls.is_spellcaster && (
                  <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--c-purple-l)',
                    background: 'var(--c-purple-bg)', border: '1px solid rgba(124,58,237,0.3)',
                    padding: '1px 5px', borderRadius: 999 }}>CAST</span>
                )}
                <ComplexityPips rating={complexity} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Class preview — below the grid */}
      {preview && (
        <div className="animate-fade-in" style={{
          background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
          borderRadius: 'var(--r-xl)', padding: 'var(--sp-4) var(--sp-5)',
          display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)',
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--t-1)' }}>{preview.name}</span>
            {preview.is_spellcaster && (
              <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-purple-l)',
                background: 'var(--c-purple-bg)', border: '1px solid rgba(124,58,237,0.3)',
                padding: '2px 10px', borderRadius: 999 }}>
                {capitalize(preview.spellcaster_type ?? 'full')} Caster · {capitalize(preview.spellcasting_ability ?? '')}
              </span>
            )}
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>
              {COMPLEXITY_LABEL[CLASS_COMPLEXITY[preview.name] ?? 3]}
            </span>
          </div>

          {/* Stat chips row */}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <InfoChip label="Hit Die" value={`d${preview.hit_die}`} />
            <InfoChip label="Primary" value={preview.primary_abilities.map(a => a.slice(0,3).toUpperCase()).join(', ')} />
            <InfoChip label="Saves" value={preview.saving_throw_proficiencies.map(a => a.slice(0,3).toUpperCase()).join(', ')} />
            <InfoChip label="Armor" value={preview.armor_proficiencies.join(', ') || 'None'} />
            <InfoChip label="Skills" value={`Choose ${preview.skill_count} of ${preview.skill_choices.length}`} />
          </div>

          {/* Subclasses */}
          <div>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 8 }}>
              Subclasses
              {level >= (preview.subclasses[0]?.unlock_level ?? 3)
                ? <span style={{ marginLeft: 8, color: 'var(--c-purple-l)', fontWeight: 600,
                    background: 'var(--c-purple-bg)', padding: '1px 8px', borderRadius: 999,
                    textTransform: 'none', letterSpacing: 0, fontSize: 'var(--fs-xs)' }}>
                    Choose on a following screen
                  </span>
                : <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--t-3)',
                    textTransform: 'none', letterSpacing: 0 }}>
                    — unlock at level {preview.subclasses[0]?.unlock_level ?? 3}
                  </span>
              }
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-2)' }}>
              {preview.subclasses.map(sc => (
                <div key={sc.name} style={{ padding: '8px 12px', background: 'var(--c-raised)',
                  borderRadius: 'var(--r-md)', borderLeft: '2px solid var(--c-gold)' }}>
                  <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)', marginBottom: 2 }}>
                    {sc.name}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {sc.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!preview && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-3)',
          background: 'var(--c-card)', border: '1px dashed var(--c-border-m)', borderRadius: 'var(--r-xl)' }}>
          
          <div style={{ fontSize: 'var(--fs-sm)' }}>Select a class to see details</div>
        </div>
      )}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '4px 12px', background: 'var(--c-raised)', border: '1px solid var(--c-border-m)',
      borderRadius: 999, display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-1)' }}>{value}</span>
    </div>
  );
}
