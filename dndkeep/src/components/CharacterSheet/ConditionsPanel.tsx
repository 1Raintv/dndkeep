import { useState } from 'react';
import type { Character, ConditionName } from '../../types';
import { CONDITIONS } from '../../data/conditions';

interface ConditionsPanelProps {
  character: Character;
  onUpdateConditions: (conditions: ConditionName[]) => void;
}

const ALL_CONDITION_NAMES = CONDITIONS.map(c => c.name) as ConditionName[];

export default function ConditionsPanel({ character, onUpdateConditions }: ConditionsPanelProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [hoveredCondition, setHoveredCondition] = useState<ConditionName | null>(null);

  const active = character.active_conditions;

  function toggleCondition(name: ConditionName) {
    if (active.includes(name)) {
      onUpdateConditions(active.filter(c => c !== name));
    } else {
      onUpdateConditions([...active, name]);
    }
  }

  const hoveredData = hoveredCondition
    ? CONDITIONS.find(c => c.name === hoveredCondition)
    : null;

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none', flex: 1 }}>
          Conditions
        </div>
        <button
          className="btn-ghost btn-sm"
          onClick={() => setShowPicker(v => !v)}
          style={{ marginBottom: 'var(--space-2)' }}
        >
          {showPicker ? 'Done' : 'Edit'}
        </button>
      </div>
      <div style={{ borderBottom: '1px solid var(--border-gold)', marginBottom: 'var(--space-4)' }} />

      {/* Active conditions */}
      {active.length === 0 ? (
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          fontFamily: 'var(--font-heading)',
          letterSpacing: '0.04em',
        }}>
          No active conditions
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          {active.map(name => (
            <button
              key={name}
              className="condition-pill"
              onClick={() => toggleCondition(name)}
              title="Click to remove"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <span className="condition-pill">
                {name}
                <span style={{ opacity: 0.7, fontSize: 'var(--text-xs)', marginLeft: '2px' }}>x</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Condition picker */}
      {showPicker && (
        <div style={{
          background: 'var(--bg-sunken)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          marginTop: 'var(--space-2)',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            {ALL_CONDITION_NAMES.map(name => {
              const isActive = active.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => toggleCondition(name)}
                  onMouseEnter={() => setHoveredCondition(name)}
                  onMouseLeave={() => setHoveredCondition(null)}
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    padding: '3px var(--space-3)',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    background: isActive ? 'rgba(155,28,28,0.2)' : 'var(--bg-raised)',
                    border: isActive ? '1px solid var(--color-blood)' : '1px solid var(--border-subtle)',
                    color: isActive ? '#fca5a5' : 'var(--text-muted)',
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>

          {/* Tooltip */}
          {hoveredData && (
            <div style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-gold)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              animation: 'fadeIn 120ms ease both',
            }}>
              <div style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                color: 'var(--text-gold)',
                marginBottom: 'var(--space-1)',
              }}>
                {hoveredData.name}
              </div>
              <ul style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {hoveredData.effects.map((effect, i) => (
                  <li key={i}>{effect}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
