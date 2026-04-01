import type { ClassData } from '../../types';
import { CLASSES } from '../../data/classes';
import { capitalize } from '../../lib/gameUtils';

interface StepClassProps {
  selected: string;
  level: number;
  onSelect: (name: string) => void;
  onLevelChange: (level: number) => void;
}

const CLASS_ICONS: Record<string, string> = {
  Barbarian:'⚔️', Bard:'🎵', Cleric:'✝️', Druid:'🌿', Fighter:'🛡️',
  Monk:'👊', Paladin:'⚡', Ranger:'🏹', Rogue:'🗡️', Sorcerer:'🔥',
  Warlock:'👁️', Wizard:'📖', Artificer:'⚙️', Psion:'🔮',
};

const COMPLEXITY: Record<string, { label: string; color: string }> = {
  Barbarian: { label: 'Beginner',    color: 'var(--c-green-l)' },
  Fighter:   { label: 'Beginner',    color: 'var(--c-green-l)' },
  Ranger:    { label: 'Easy',        color: 'var(--c-green-l)' },
  Rogue:     { label: 'Easy',        color: 'var(--c-green-l)' },
  Monk:      { label: 'Moderate',    color: 'var(--c-amber-l)' },
  Paladin:   { label: 'Moderate',    color: 'var(--c-amber-l)' },
  Warlock:   { label: 'Moderate',    color: 'var(--c-amber-l)' },
  Cleric:    { label: 'Moderate',    color: 'var(--c-amber-l)' },
  Druid:     { label: 'Complex',     color: 'var(--c-red-l)' },
  Bard:      { label: 'Complex',     color: 'var(--c-red-l)' },
  Sorcerer:  { label: 'Complex',     color: 'var(--c-red-l)' },
  Wizard:    { label: 'Advanced',    color: 'var(--c-red-l)' },
  Psion:     { label: 'Advanced',    color: 'var(--c-red-l)' },
};

export default function StepClass({ selected, level, onSelect, onLevelChange }: StepClassProps) {
  const preview = CLASSES.find(c => c.name === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Level selector — compact, inline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', padding: 'var(--sp-4) var(--sp-5)', background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Starting Level</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--c-gold-xl)', lineHeight: 1 }}>{level}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(l => (
            <button key={l} onClick={() => onLevelChange(l)}
              style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-xs)', fontWeight: 600, padding: 0, minHeight: 0, cursor: 'pointer',
                border: level === l ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                background: level === l ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                color: level === l ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Class grid — 4 columns, 3+ rows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-2)' }}>
        {CLASSES.map(cls => (
          <ClassCard key={cls.name} cls={cls} selected={selected === cls.name} onSelect={onSelect} level={level} />
        ))}
      </div>

      {/* Info panel — only when selected, at bottom */}
      {preview && (
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }} className="animate-fade-in">
          <div style={{ display: 'flex', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>

            {/* Primary abilities */}
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Primary Ability</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {preview.primary_abilities.map(a => (
                  <span key={a} style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '3px 10px', borderRadius: 999 }}>
                    {a.slice(0,3).toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            {/* Armor */}
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Armor</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
                {preview.armor_proficiencies.length ? preview.armor_proficiencies.join(', ') : 'None'}
              </div>
            </div>

            {/* Saving throws */}
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Saving Throws</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {preview.saving_throw_proficiencies.map(s => (
                  <span key={s} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--c-blue-l)', background: 'var(--c-blue-bg)', border: '1px solid rgba(59,130,246,0.3)', padding: '2px 7px', borderRadius: 999 }}>
                    {s.slice(0,3).toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            {/* Hit die */}
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Hit Die</div>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--t-1)' }}>d{preview.hit_die}</div>
            </div>

            {/* Spellcasting */}
            {preview.is_spellcaster && (
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Spellcasting</div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-purple-l)' }}>
                  {preview.spellcasting_ability ? capitalize(preview.spellcasting_ability) : '—'}
                  {preview.spellcaster_type === 'half' && ' · Half caster'}
                  {preview.spellcaster_type === 'warlock' && ' · Pact Magic'}
                </div>
              </div>
            )}
          </div>

          {/* Subclasses */}
          <div>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Subclasses (unlock at level {preview.subclasses[0]?.unlock_level ?? 3})
              {level >= (preview.subclasses[0]?.unlock_level ?? 3) && (
                <span style={{ marginLeft: 8, color: 'var(--c-purple-l)', background: 'var(--c-purple-bg)', border: '1px solid rgba(124,58,237,0.3)', padding: '1px 7px', borderRadius: 999 }}>
                  ✦ You'll choose on the next screen
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--sp-2)' }}>
              {preview.subclasses.map(sub => (
                <div key={sub.name} style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--c-raised)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }}>
                  <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--t-1)', marginBottom: 2 }}>{sub.name}</div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.4 }}>{sub.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClassCard({ cls, selected, onSelect, level }: { cls: ClassData; selected: boolean; onSelect: (n: string) => void; level: number }) {
  const icon = CLASS_ICONS[cls.name] ?? '🧙';
  const cx = COMPLEXITY[cls.name];
  return (
    <button onClick={() => onSelect(cls.name)} style={{
      padding: 'var(--sp-3)', borderRadius: 'var(--r-lg)', cursor: 'pointer', textAlign: 'center',
      border: selected ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
      background: selected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
      transition: 'all var(--tr-fast)', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
      position: 'relative',
    }}>

      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: selected ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{cls.name}</span>
      {cx && <span style={{ fontSize: 9, fontWeight: 600, color: cx.color, opacity: 0.8 }}>{cx.label}</span>}
    </button>
  );
}
