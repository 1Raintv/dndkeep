import type { ClassData } from '../../types';
import { CLASSES } from '../../data/classes';
import { capitalize } from '../../lib/gameUtils';

interface StepClassProps {
  selected: string;
  onSelect: (name: string) => void;
}

/**
 * Complexity ratings 1–5 based on 2024 PHB.
 * 1 = pick up and play, 5 = many interacting systems to track.
 */
const CLASS_COMPLEXITY: Record<string, number> = {
  Barbarian: 1,
  Fighter:   1,
  Ranger:    2,
  Rogue:     2,
  Monk:      3,
  Paladin:   3,
  Warlock:   3,
  Cleric:    3,
  Druid:     4,
  Bard:      4,
  Sorcerer:  4,
  Wizard:    5,
};

const COMPLEXITY_LABEL: Record<number, string> = {
  1: 'Beginner friendly',
  2: 'Easy to learn',
  3: 'Moderate depth',
  4: 'Complex',
  5: 'Very complex',
};

function ComplexityPips({ rating, size = 10 }: { rating: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: i <= rating ? 'var(--color-gold)' : 'transparent',
            border: i <= rating ? '2px solid var(--color-gold)' : '2px solid var(--border-dim)',
            transition: 'all var(--transition-fast)',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

export default function StepClass({ selected, onSelect }: StepClassProps) {
  const preview = CLASSES.find(c => c.name === selected);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      {/* Class list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {CLASSES.map(cls => (
          <ClassRow key={cls.name} cls={cls} selected={selected === cls.name} onSelect={onSelect} />
        ))}
      </div>

      {/* Preview */}
      <div>
        {preview ? (
          <ClassPreview cls={preview} />
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: selected ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
        background: selected ? 'rgba(201,146,42,0.1)' : 'var(--bg-sunken)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        textAlign: 'left',
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

function ClassPreview({ cls }: { cls: ClassData }) {
  const complexity = CLASS_COMPLEXITY[cls.name] ?? 3;
  return (
    <div className="card card-gold animate-fade-in" style={{ overflowY: 'auto', maxHeight: '70vh' }}>
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
        <InfoRow label="Primary Abilities" value={cls.primary_abilities.map(a => a.toUpperCase().slice(0,3)).join(', ')} />
        <InfoRow label="Saving Throws" value={cls.saving_throw_proficiencies.map(a => a.toUpperCase().slice(0,3)).join(', ')} />
        <InfoRow label="Armor" value={cls.armor_proficiencies.join(', ') || 'None'} />
        <InfoRow label="Weapons" value={cls.weapon_proficiencies.join(', ')} />
        <InfoRow label="Skills" value={`Choose ${cls.skill_count} from: ${cls.skill_choices.join(', ')}`} />
        {cls.spellcasting_ability && (
          <InfoRow label="Spellcasting" value={capitalize(cls.spellcasting_ability)} />
        )}

        <div>
          <div className="section-header">Subclasses</div>
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
