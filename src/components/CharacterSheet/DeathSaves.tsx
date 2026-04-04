import { useEffect } from 'react';
import type { Character } from '../../types';

interface DeathSavesProps {
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}

export default function DeathSaves({ character, onUpdate }: DeathSavesProps) {
  if (character.current_hp > 0) return null;

  const successes = Math.min(3, Math.max(0, character.death_saves_successes ?? 0));
  const failures  = Math.min(3, Math.max(0, character.death_saves_failures  ?? 0));

  const isStabilized = successes >= 3;
  const isDead       = failures  >= 3;

  function setSuccesses(n: number) {
    onUpdate({ death_saves_successes: Math.min(3, Math.max(0, n)) });
  }

  function setFailures(n: number) {
    onUpdate({ death_saves_failures: Math.min(3, Math.max(0, n)) });
  }

  function stabilize() {
    // Three successes — character regains 1 HP and stabilizes
    onUpdate({ current_hp: 1, death_saves_successes: 0, death_saves_failures: 0 });
  }

  function reset() {
    onUpdate({ death_saves_successes: 0, death_saves_failures: 0 });
  }

  // Auto-stabilize at 3 successes
  useEffect(() => {
    if (successes >= 3 && !isStabilized) stabilize();
  }, [successes]);

  // Auto-trigger dead state is already handled visually via isDead flag

  const borderColor = isDead        ? 'rgba(107,20,20,1)'
                    : isStabilized  ? 'var(--hp-full)'
                                    : 'var(--color-crimson)';

  const bgColor = isDead        ? 'rgba(127,29,29,0.15)'
               : isStabilized  ? 'rgba(22,163,74,0.1)'
                               : 'rgba(155,28,28,0.08)';

  return (
    <div style={{
      border: `2px solid ${borderColor}`,
      borderRadius: 'var(--r-lg)',
      padding: 'var(--sp-4)',
      background: bgColor,
      transition: 'all var(--tr-normal)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--sp-3)',
      }}>
        <span style={{
          fontFamily: 'var(--ff-body)',
          fontWeight: 700,
          fontSize: 'var(--fs-sm)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: isDead ? '#fca5a5' : isStabilized ? '#86efac' : 'var(--c-red-l)',
        }}>
          {isDead ? 'Dead' : isStabilized ? 'Stable' : 'Dying — Death Saving Throws'}
        </span>
        {!isDead && (
          <button
            className="btn-ghost btn-sm"
            onClick={reset}
            style={{ fontSize: 'var(--fs-xs)', opacity: 0.7 }}
            title="Reset death saves"
          >
            Reset
          </button>
        )}
      </div>

      {/* Active death save tracking */}
      {!isDead && !isStabilized && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <SaveRow
              label="Successes"
              count={successes}
              max={3}
              activeColor="#86efac"
              onChange={setSuccesses}
            />
            <SaveRow
              label="Failures"
              count={failures}
              max={3}
              activeColor="#fca5a5"
              onChange={setFailures}
            />
          </div>
          <p style={{
            marginTop: 'var(--sp-3)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--t-2)',
            fontFamily: 'var(--ff-body)',
            lineHeight: 1.5,
          }}>
            Roll d20 at the start of your turn. 10+ is a success; 9 or lower is a failure.
            Rolling a 1 counts as two failures. Rolling a 20 causes you to regain 1 HP.
          </p>
        </>
      )}

      {/* Stable */}
      {isStabilized && !isDead && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <p style={{ fontSize: 'var(--fs-sm)', color: '#86efac', flex: 1 }}>
            Stable. Regains consciousness with 1 HP after 1d4 hours, or sooner with aid.
          </p>
          <button className="btn-gold btn-sm" onClick={stabilize}>
            Regain 1 HP
          </button>
        </div>
      )}

      {/* Dead */}
      {isDead && (
        <p style={{ fontSize: 'var(--fs-sm)', color: '#fca5a5', lineHeight: 1.5 }}>
          Three failed death saving throws. Only a <em>Revivify</em>, <em>Raise Dead</em>, or
          <em> Resurrection</em> spell can bring this character back.
        </p>
      )}
    </div>
  );
}

function SaveRow({
  label, count, max, activeColor, onChange,
}: {
  label: string;
  count: number;
  max: number;
  activeColor: string;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
      <span style={{
        fontFamily: 'var(--ff-body)',
        fontSize: 'var(--fs-xs)',
        fontWeight: 700,
        color: 'var(--t-2)',
        minWidth: 72,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        {Array.from({ length: max }, (_, i) => {
          const filled = i < count;
          return (
            <button
              key={i}
              onClick={() => onChange(filled ? i : i + 1)}
              title={filled ? `Undo ${label.slice(0, -1).toLowerCase()}` : `Mark ${label.slice(0, -1).toLowerCase()}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `2px solid ${filled ? activeColor : 'var(--c-border-m)'}`,
                background: filled ? activeColor : 'transparent',
                cursor: 'pointer',
                transition: 'all var(--tr-fast)',
                padding: 0,
              }}
            />
          );
        })}
      </div>
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
        {count}/{max}
      </span>
    </div>
  );
}
