import { createPortal } from 'react-dom';
import { CONDITIONS } from '../../data/conditions';
import type { ConditionName } from '../../types';

interface ConditionPickerModalProps {
  activeConditions: ConditionName[];
  exhaustionLevel: number;
  onUpdateConditions: (next: ConditionName[]) => void;
  onUpdateExhaustionLevel: (level: number) => void;
  onClose: () => void;
}

/**
 * 2024 PHB Exhaustion ramifications per level.
 * D20 Tests reduced by 2 × level; Speed reduced by 5 ft × level.
 * Level 6 = death. Long Rest removes 1 level.
 */
const EXHAUSTION_PENALTIES = [
  { d20: 0,   speed: 0,  summary: 'No exhaustion.' },
  { d20: -2,  speed: -5,  summary: '-2 to D20 Tests, -5 ft Speed.' },
  { d20: -4,  speed: -10, summary: '-4 to D20 Tests, -10 ft Speed.' },
  { d20: -6,  speed: -15, summary: '-6 to D20 Tests, -15 ft Speed.' },
  { d20: -8,  speed: -20, summary: '-8 to D20 Tests, -20 ft Speed.' },
  { d20: -10, speed: -25, summary: '-10 to D20 Tests, -25 ft Speed.' },
  { d20: 0,   speed: 0,  summary: 'Death.' },
];

const EXHAUSTION_GENERAL_RULES = [
  { title: 'D20 Tests Affected', text: 'When you make a D20 Test, the roll is reduced by 2 times your Exhaustion level.' },
  { title: 'Speed Reduced',      text: 'Your Speed is reduced by a number of feet equal to 5 times your Exhaustion level.' },
  { title: 'Removing Levels',    text: 'Finishing a Long Rest removes 1 of your Exhaustion levels. When your Exhaustion level reaches 0, the condition ends.' },
  { title: 'Cumulative',         text: 'Each time you receive this condition, you gain 1 Exhaustion level. You die if your Exhaustion level reaches 6.' },
];

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

  const currentLvl = Math.max(0, Math.min(6, exhaustionLevel));
  const currentPenalty = EXHAUSTION_PENALTIES[currentLvl];

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-xl)',
          padding: 'var(--sp-5)',
          width: '100%', maxWidth: 640,
          maxHeight: '88vh',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', paddingBottom: 'var(--sp-2)', borderBottom: '1px solid var(--c-border)' }}>
          <h3 style={{ margin: 0, color: 'var(--c-gold-l)', fontFamily: 'var(--ff-brand)', fontSize: 'var(--fs-lg)', letterSpacing: '0.04em', flex: 1 }}>
            Conditions
          </h3>
          <button onClick={onClose} className="btn-ghost btn-sm" style={{ fontSize: 14, padding: '4px 14px' }}>
            Close
          </button>
        </div>

        {/* ────────── EXHAUSTION ────────── */}
        <div style={{
          padding: 'var(--sp-4)',
          border: `1px solid ${currentLvl > 0 ? 'rgba(245,158,11,0.5)' : 'var(--c-border)'}`,
          borderLeft: '4px solid #f59e0b',
          borderRadius: 'var(--r-md)',
          background: currentLvl > 0 ? 'rgba(245,158,11,0.06)' : 'var(--c-card)',
          display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 'var(--fs-md)', color: currentLvl === 6 ? 'var(--c-red-l)' : '#f59e0b', letterSpacing: '0.02em' }}>
              Exhaustion
            </span>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginLeft: 'auto' }}>
              2024 PHB rules
            </span>
          </div>

          {/* 0-6 level selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {[0, 1, 2, 3, 4, 5, 6].map(lvl => {
              const active = lvl === currentLvl;
              const isDeath = lvl === 6;
              return (
                <button
                  key={lvl}
                  onClick={() => onUpdateExhaustionLevel(lvl)}
                  style={{
                    padding: '8px 0',
                    borderRadius: 'var(--r-sm)',
                    border: active
                      ? (isDeath ? '1px solid var(--c-red-l)' : lvl === 0 ? '1px solid var(--c-border-m)' : '1px solid #f59e0b')
                      : '1px solid var(--c-border)',
                    background: active
                      ? (isDeath ? 'rgba(229,57,53,0.22)' : lvl === 0 ? 'var(--c-raised)' : 'rgba(245,158,11,0.22)')
                      : 'transparent',
                    color: active
                      ? (isDeath ? 'var(--c-red-l)' : lvl === 0 ? 'var(--t-2)' : '#f59e0b')
                      : 'var(--t-3)',
                    fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', minHeight: 0,
                  }}
                >
                  {lvl}
                </button>
              );
            })}
          </div>

          {/* Current level summary */}
          {currentLvl > 0 && (
            <div style={{
              padding: 'var(--sp-3)',
              borderRadius: 'var(--r-sm)',
              background: currentLvl === 6 ? 'rgba(229,57,53,0.12)' : 'rgba(245,158,11,0.12)',
              border: `1px solid ${currentLvl === 6 ? 'rgba(229,57,53,0.4)' : 'rgba(245,158,11,0.4)'}`,
            }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: currentLvl === 6 ? 'var(--c-red-l)' : '#f59e0b', marginBottom: 4 }}>
                Current: Level {currentLvl}
              </div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-1)', lineHeight: 1.5 }}>
                {currentPenalty.summary}
              </div>
            </div>
          )}

          {/* Per-level table */}
          <div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 6 }}>
              Penalties by level
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[1, 2, 3, 4, 5, 6].map(lvl => {
                const p = EXHAUSTION_PENALTIES[lvl];
                const isCurrent = lvl === currentLvl;
                return (
                  <div
                    key={lvl}
                    style={{
                      display: 'grid', gridTemplateColumns: '40px 1fr', gap: 'var(--sp-2)',
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: isCurrent ? (lvl === 6 ? 'rgba(229,57,53,0.12)' : 'rgba(245,158,11,0.12)') : 'transparent',
                      fontSize: 'var(--fs-xs)',
                      color: isCurrent ? 'var(--t-1)' : 'var(--t-2)',
                      fontWeight: isCurrent ? 700 : 500,
                    }}
                  >
                    <span style={{ fontFamily: 'var(--ff-stat)', color: lvl === 6 ? 'var(--c-red-l)' : isCurrent ? '#f59e0b' : 'var(--t-3)', fontWeight: 700 }}>
                      Lvl {lvl}
                    </span>
                    <span>{p.summary}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* General rules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 'var(--sp-2)', borderTop: '1px solid var(--c-border)' }}>
            {EXHAUSTION_GENERAL_RULES.map(r => (
              <div key={r.title} style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: 'var(--t-1)' }}>{r.title}.</span>{' '}{r.text}
              </div>
            ))}
          </div>
        </div>

        {/* ────────── OTHER CONDITIONS ────────── */}
        <div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 'var(--sp-2)' }}>
            Other conditions — tap to toggle
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {nonExhaustion.map(c => {
              const active = activeConditions.includes(c.name as ConditionName);
              return (
                <button
                  key={c.name}
                  onClick={() => toggle(c.name as ConditionName)}
                  style={{
                    textAlign: 'left',
                    padding: 'var(--sp-3)',
                    paddingLeft: 14,
                    borderRadius: 'var(--r-sm)',
                    border: active ? `1px solid ${c.color}aa` : '1px solid var(--c-border)',
                    borderLeft: `4px solid ${c.color}`,
                    background: active ? `${c.color}18` : 'var(--c-card)',
                    color: 'var(--t-1)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 4,
                    minHeight: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)' }}>
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 'var(--fs-md)', color: c.color, letterSpacing: '0.02em' }}>
                      {c.name}
                    </span>
                    {active && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: c.color, padding: '2px 8px', borderRadius: 999, background: `${c.color}22`, border: `1px solid ${c.color}55` }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5 }}>
                    {c.description}
                  </div>
                  {c.effects && c.effects.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
                      {c.effects.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  // Portal to document.body so positioning can't be broken by parent stacking contexts
  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
