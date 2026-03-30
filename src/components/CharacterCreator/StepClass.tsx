import type { ClassData } from '../../types';
import { CLASSES } from '../../data/classes';
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
  1: 'Beginner friendly', 2: 'Easy to learn', 3: 'Moderate depth', 4: 'Complex', 5: 'Very complex',
};

function ComplexityPips({ rating, size = 10 }: { rating: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          width: size, height: size, borderRadius: '50%',
          background: i <= rating ? 'var(--color-gold)' : 'transparent',
          border: i <= rating ? '2px solid var(--color-gold)' : '2px solid var(--border-dim)',
          transition: 'all var(--transition-fast)', flexShrink: 0,
        }} />
      ))}
    </div>
  );
}

export default function StepClass({ selected, level, onSelect, onLevelChange }: StepClassProps) {
  const preview = CLASSES.find(c => c.name === selected);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      {/* Left column: class list + level selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {CLASSES.map(cls => (
            <ClassRow key={cls.name} cls={cls} selected={selected === cls.name} onSelect={onSelect} />
          ))}
        </div>

        {/* Level selector — shown once a class is chosen */}
        {selected && (
          <div className="card card-gold animate-fade-in" style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <label style={{ margin: 0 }}>Starting Level</label>
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.75rem',
                lineHeight: 1, color: 'var(--text-gold)',
              }}>
                {level}
              </span>
            </div>
            <input
              type="range"
              min={1} max={20} value={level}
              onChange={e => onLevelChange(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-gold)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>1</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {level >= 3 ? 'Subclass unlocks at 3' : level < 3 ? 'Subclass unlocks at 3' : ''}
              </span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>20</span>
            </div>
          </div>
        )}
      </div>

      {/* Right column: class preview */}
      <div>
        {preview ? (
          <ClassPreview cls={preview} level={level} />
        ) : (
          <div className="panel" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'var(--font-heading)' }}>
              Select a class to see details
            </p>
          </div>
        )}
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
      }}
    >
      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 'var(--text-sm)', color: selected ? 'var(--text-gold)' : 'var(--text-secondary)' }}>
        {cls.name}
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        {cls.is_spellcaster && <span className="badge badge-gold">Caster</span>}
        <ComplexityPips rating={complexity} size={9} />
      </div>
    </button>
  );
}

function ClassPreview({ cls, level }: { cls: ClassData; level: number }) {
  const complexity = CLASS_COMPLEXITY[cls.name] ?? 3;
  return (
    <div className="card card-gold animate-fade-in" style={{ overflowY: 'auto', maxHeight: '80vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
        <h3>{cls.name}</h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          {cls.is_spellcaster && <span className="badge badge-gold">{capitalize(cls.spellcaster_type)} Caster</span>}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <ComplexityPips rating={complexity} size={11} />
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {COMPLEXITY_LABEL[complexity]}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <InfoRow label="Hit Die" value={`d${cls.hit_die}`} />
        <InfoRow label="Primary Abilities" value={cls.primary_abilities.map(a => a.toUpperCase().slice(0,3)).join(', ')} />
        <InfoRow label="Saving Throws" value={cls.saving_throw_proficiencies.map(a => a.toUpperCase().slice(0,3)).join(', ')} />
        <InfoRow label="Armor" value={cls.armor_proficiencies.join(', ') || 'None'} />
        <InfoRow label="Weapons" value={cls.weapon_proficiencies.join(', ')} />
        <InfoRow label="Skills" value={`Choose ${cls.skill_count} from: ${cls.skill_choices.join(', ')}`} />
        {cls.spellcasting_ability && (
          <InfoRow label="Spellcasting" value={capitalize(cls.spellcasting_ability)} />
        )}

        {/* Subclass preview */}
        <div>
          <div className="section-header">
            Subclasses
            {level >= 3 && <span style={{ marginLeft: 'var(--space-2)', fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--text-gold)', textTransform: 'none', letterSpacing: 0 }}>
              — choose at level 3
            </span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {cls.subclasses.map(sc => (
              <div key={sc.name} style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid var(--color-gold-dim)' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-gold)' }}>{sc.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>{sc.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{value}</div>
    </div>
  );
}
