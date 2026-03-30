import type { SubclassData } from '../../types';
import { CLASS_MAP } from '../../data/classes';

interface StepSubclassProps {
  className: string;
  selected: string;
  onSelect: (subclass: string) => void;
  level: number;
}

export default function StepSubclass({ className, selected, onSelect, level }: StepSubclassProps) {
  const cls = CLASS_MAP[className];
  if (!cls) return null;

  // 2024 PHB: all classes get subclass at level 3
  const SUBCLASS_LEVEL = 3;
  const availableSubclasses = cls.subclasses.filter(sc => sc.unlock_level <= Math.max(level, SUBCLASS_LEVEL));

  // Character level is below 3 — subclass not yet unlocked
  if (level < SUBCLASS_LEVEL) {
    return (
      <div className="card" style={{ maxWidth: 540 }}>
        <h3 style={{ marginBottom: 'var(--space-2)' }}>{className} Subclass</h3>
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
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
          {className}s choose their subclass at level {SUBCLASS_LEVEL}.
          When you reach that level on the character sheet, you'll be prompted to choose.
          Here's a preview of what's available:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {cls.subclasses.map(sc => (
            <SubclassCard key={sc.name} subclass={sc} selected={false} onSelect={() => {}} disabled />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', fontFamily: 'var(--font-heading)', lineHeight: 1.5 }}>
        {className}s choose their subclass at level {SUBCLASS_LEVEL}.
        Your character is level {level}, so this choice is available now.
        The subclass you pick grants unique features as you continue to level up.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {availableSubclasses.map(sc => (
          <SubclassCard key={sc.name} subclass={sc} selected={selected === sc.name} onSelect={onSelect} disabled={false} />
        ))}
      </div>
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
        transition: 'all var(--transition-fast)',
        textAlign: 'left', opacity: disabled ? 0.6 : 1,
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
