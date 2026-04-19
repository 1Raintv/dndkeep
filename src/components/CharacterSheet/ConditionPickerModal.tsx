import { CONDITIONS, CONDITION_MAP } from '../../data/conditions';
import type { ConditionName } from '../../types';

interface ConditionPickerModalProps {
  activeConditions: ConditionName[];
  exhaustionLevel: number;
  onUpdateConditions: (next: ConditionName[]) => void;
  onUpdateExhaustionLevel: (level: number) => void;
  onClose: () => void;
}

const EXHAUSTION_EFFECT_BY_LEVEL = [
  '',
  'Level 1: -2 to all d20 rolls, -5 ft speed.',
  'Level 2: -4 to all d20 rolls, -10 ft speed.',
  'Level 3: -6 to all d20 rolls, -15 ft speed.',
  'Level 4: -8 to all d20 rolls, -20 ft speed.',
  'Level 5: -10 to all d20 rolls, -25 ft speed.',
  'Level 6: Death.',
];

/**
 * Full-screen modal for picking and toggling conditions. Replaces the inline
 * chip picker. Exhaustion gets its own 0-6 level selector (2024 PHB rules).
 */
export default function ConditionPickerModal({
  activeConditions, exhaustionLevel, onUpdateConditions, onUpdateExhaustionLevel, onClose,
}: ConditionPickerModalProps) {
  const nonExhaustion = CONDITIONS.filter(c => c.name !== 'Exhaustion');

  function toggle(name: ConditionName) {
    if (activeConditions.includes(name)) {
      onUpdateConditions(activeConditions.filter(c => c !== name));
    } else {
      onUpdateConditions([...activeConditions, name]);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 900, padding: 'var(--sp-4)',
      }}
    >
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-xl)',
          padding: 'var(--sp-5) var(--sp-5) var(--sp-4)',
          maxWidth: 560, width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
          <h3 style={{ margin: 0, color: 'var(--c-gold-l)', fontFamily: 'var(--ff-brand)', fontSize: 'var(--fs-lg)', letterSpacing: '0.04em' }}>
            Conditions
          </h3>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>Tap a condition to toggle it</span>
          <button
            onClick={onClose}
            className="btn-ghost btn-sm"
            style={{ marginLeft: 'auto', fontSize: 14, padding: '2px 10px' }}
          >
            Close
          </button>
        </div>

        {/* Exhaustion — special numeric 0-6 */}
        <div style={{
          padding: 'var(--sp-3) var(--sp-4)',
          border: `1px solid ${exhaustionLevel > 0 ? 'rgba(245,158,11,0.5)' : 'var(--c-border)'}`,
          borderRadius: 'var(--r-md)',
          background: exhaustionLevel > 0 ? 'rgba(245,158,11,0.08)' : 'var(--c-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: exhaustionLevel > 0 ? '#f59e0b' : 'var(--t-1)' }}>
              Exhaustion
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>
              0 = none, 6 = death
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
            {[0, 1, 2, 3, 4, 5, 6].map(lvl => {
              const active = lvl === exhaustionLevel;
              return (
                <button
                  key={lvl}
                  onClick={() => onUpdateExhaustionLevel(lvl)}
                  style={{
                    flex: '1 1 50px',
                    padding: '6px 0',
                    borderRadius: 'var(--r-sm)',
                    border: active
                      ? (lvl === 6 ? '1px solid var(--c-red-l)' : lvl === 0 ? '1px solid var(--c-border-m)' : '1px solid #f59e0b')
                      : '1px solid var(--c-border)',
                    background: active
                      ? (lvl === 6 ? 'rgba(229,57,53,0.18)' : lvl === 0 ? 'var(--c-raised)' : 'rgba(245,158,11,0.18)')
                      : 'transparent',
                    color: active
                      ? (lvl === 6 ? 'var(--c-red-l)' : lvl === 0 ? 'var(--t-2)' : '#f59e0b')
                      : 'var(--t-3)',
                    fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', minHeight: 0,
                  }}
                >
                  {lvl}
                </button>
              );
            })}
          </div>
          {exhaustionLevel > 0 && (
            <div style={{
              marginTop: 'var(--sp-2)',
              fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5,
            }}>
              {EXHAUSTION_EFFECT_BY_LEVEL[exhaustionLevel]}
            </div>
          )}
        </div>

        {/* All other conditions */}
        <div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 'var(--sp-2)' }}>
            Other conditions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
            {nonExhaustion.map(c => {
              const active = activeConditions.includes(c.name as ConditionName);
              return (
                <button
                  key={c.name}
                  onClick={() => toggle(c.name as ConditionName)}
                  title={c.description}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 'var(--r-sm)',
                    border: active ? `1px solid ${c.color}aa` : '1px solid var(--c-border)',
                    background: active ? `${c.color}18` : 'transparent',
                    color: active ? c.color : 'var(--t-2)',
                    cursor: 'pointer',
                    fontFamily: 'var(--ff-body)',
                    fontSize: 'var(--fs-xs)', fontWeight: 700, lineHeight: 1.3,
                    minHeight: 0,
                  }}
                >
                  <div>{c.name}</div>
                  {active && <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--t-3)', marginTop: 2 }}>{c.description}</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export { EXHAUSTION_EFFECT_BY_LEVEL };
