import { useState } from 'react';
import { CONDITIONS } from '../../data/conditions';
import type { ConditionData } from '../../types';

interface ConditionTooltipProps {
  name: string;
  children: React.ReactNode;
}

export default function ConditionTooltip({ name, children }: ConditionTooltipProps) {
  const [visible, setVisible] = useState(false);
  const condition = CONDITIONS.find(c => c.name === name);
  if (!condition) return <>{children}</>;

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onTouchStart={() => setVisible(v => !v)}
    >
      {children}
      {visible && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            width: 280,
            background: 'linear-gradient(160deg, var(--color-charcoal) 0%, var(--color-obsidian) 100%)',
            border: '1px solid var(--border-gold)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg), var(--shadow-gold)',
            padding: 'var(--space-3) var(--space-4)',
            pointerEvents: 'none',
          }}
        >
          {/* Arrow */}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%',
            width: 10, height: 10, background: 'var(--color-charcoal)',
            borderRight: '1px solid var(--color-gold-dim)', borderBottom: '1px solid var(--color-gold-dim)',
            transform: 'translateX(-50%) rotate(45deg)',
          }} />

          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-gold)', marginBottom: 'var(--space-2)' }}>
            {condition.name}
          </div>
          {condition.description && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-2)' }}>
              {condition.description}
            </p>
          )}
          {condition.effects && condition.effects.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 0 }}>
              {condition.effects.map((effect: string, i: number) => (
                <li key={i} style={{ display: 'flex', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--color-crimson-bright)', flexShrink: 0 }}>•</span>
                  {effect}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Standalone condition reference panel — shows all conditions */
export function ConditionReference() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = CONDITIONS.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <input
        placeholder="Search conditions..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ fontSize: 'var(--text-sm)' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {filtered.map(c => (
          <div
            key={c.name}
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setExpanded(expanded === c.name ? null : c.name)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                background: expanded === c.name ? 'rgba(155,28,28,0.1)' : 'var(--bg-sunken)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background var(--transition-fast)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: expanded === c.name ? '#fca5a5' : 'var(--text-secondary)' }}>
                {c.name}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded === c.name ? '▲' : '▼'}</span>
            </button>
            {expanded === c.name && (
              <div className="animate-fade-in" style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-raised)' }}>
                {c.description && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-2)' }}>
                    {c.description}
                  </p>
                )}
                {c.effects && (
                  <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {c.effects.map((e: string, i: number) => (
                      <li key={i} style={{ display: 'flex', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        <span style={{ color: 'var(--color-crimson-bright)', flexShrink: 0 }}>•</span>
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
