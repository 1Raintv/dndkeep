import { useState } from 'react';
import type { Character, ConditionName } from '../../types';
import { CONDITIONS } from '../../data/conditions';
import ConditionTooltip from '../shared/ConditionTooltip';

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
          style={{ marginBottom: 'var(--sp-2)' }}
        >
          {showPicker ? 'Done' : 'Edit'}
        </button>
      </div>
      <div style={{ borderBottom: '1px solid var(--c-gold-bdr)', marginBottom: 'var(--sp-4)' }} />

      {/* Active conditions */}
      {active.length === 0 ? (
        <p style={{
          fontSize: 'var(--fs-sm)',
          color: 'var(--t-2)',
          fontStyle: 'italic',
          fontFamily: 'var(--ff-body)',
          letterSpacing: '0.04em',
        }}>
          No active conditions
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
          {active.map(name => (
            <ConditionTooltip key={name} name={name}>
              <button
                className="condition-pill"
                onClick={() => toggleCondition(name)}
                title="Hover for rules — click to remove"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <span className="condition-pill">
                  {name}
                  <span style={{ opacity: 0.7, fontSize: 'var(--fs-xs)', marginLeft: '2px' }}>x</span>
                </span>
              </button>
            </ConditionTooltip>
          ))}
        </div>
      )}

      {/* Condition picker */}
      {showPicker && (
        <div style={{
          background: '#080d14',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-md)',
          padding: 'var(--sp-3)',
          marginTop: 'var(--sp-2)',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
            {ALL_CONDITION_NAMES.map(name => {
              const isActive = active.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => toggleCondition(name)}
                  onMouseEnter={() => setHoveredCondition(name)}
                  onMouseLeave={() => setHoveredCondition(null)}
                  style={{
                    fontFamily: 'var(--ff-body)',
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    padding: '3px var(--sp-3)',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    transition: 'all var(--tr-fast)',
                    background: isActive ? 'rgba(155,28,28,0.2)' : 'var(--c-raised)',
                    border: isActive ? '1px solid rgba(107,20,20,1)' : '1px solid var(--c-border)',
                    color: isActive ? '#fca5a5' : 'var(--t-2)',
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
              background: 'var(--c-raised)',
              border: '1px solid var(--c-gold-bdr)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--sp-3)',
              fontSize: 'var(--fs-xs)',
              color: 'var(--t-2)',
              animation: 'fadeIn 120ms ease both',
            }}>
              <div style={{
                fontFamily: 'var(--ff-body)',
                fontWeight: 700,
                color: 'var(--c-gold-l)',
                marginBottom: 'var(--sp-1)',
              }}>
                {hoveredData.name}
              </div>
              <ul style={{ paddingLeft: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
