import { useEffect } from 'react';
import type { Character } from '../../types';
import { useDiceRoll } from '../../context/DiceRollContext';
import { logHistoryEvent } from '../../lib/characterHistory';

interface DeathSavesProps {
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}

// v2.162.0 — Phase Q.0 pt 3: death save UI overhaul.
//   • Boxes (rounded corners, 5px radius) instead of circles. The
//     prior `borderRadius: '50%'` produced flattened ovals because
//     the parent column constrained width but not height — they read
//     as deformed pills, not pips. Boxes match the dice-tray pattern.
//   • New Roll button. Triggers the floating 3D dice roller and
//     applies the result to the character per RAW: 10+ success,
//     <10 failure, nat 1 = 2 failures, nat 20 = revive at 1 HP.
//   • Manual click on a box still works (DM override / undo).

export default function DeathSaves({ character, onUpdate }: DeathSavesProps) {
  const { triggerRoll } = useDiceRoll();

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
    onUpdate({ current_hp: 1, death_saves_successes: 0, death_saves_failures: 0 });
  }

  function reset() {
    onUpdate({ death_saves_successes: 0, death_saves_failures: 0 });
  }

  // v2.162.0 — Phase Q.0 pt 3: roll a death save.
  // Triggers the 3D dice surface and resolves on the physics callback
  // so the result UI updates after the player sees the d20 land. Per
  // RAW: 10+ success, nat 20 wakes with 1 HP, nat 1 = 2 failures.
  // v2.273.0 — also writes a character_history row capturing the
  // outcome. Death saves are critical narrative beats and were
  // previously absent from the History tab. We use logHistoryEvent
  // directly inside onResult so the description carries the full
  // resolved outcome (vs. logHistory on triggerRoll which would only
  // capture "Death Save: d20 = X" without the success/fail
  // interpretation). eventType: 'save' so it sorts under the Rolls
  // filter chip alongside ability saves.
  function rollDeathSave() {
    if (isDead || isStabilized) return;
    triggerRoll({
      result: 0, // placeholder — physics callback overrides
      dieType: 20,
      label: `${character.name} — Death Save`,
      onResult: (_allDice, total) => {
        const d20 = total;
        let outcome: string;
        if (d20 === 20) {
          onUpdate({
            current_hp: 1,
            death_saves_successes: 0,
            death_saves_failures: 0,
          });
          outcome = 'NAT 20 — REVIVED at 1 HP';
        } else if (d20 === 1) {
          const newFailures = Math.min(3, failures + 2);
          onUpdate({ death_saves_failures: newFailures });
          outcome = `NAT 1 — 2 FAILURES (now ${newFailures}/3)`;
        } else if (d20 >= 10) {
          const newSuccesses = Math.min(3, successes + 1);
          onUpdate({ death_saves_successes: newSuccesses });
          outcome = `SUCCESS (${newSuccesses}/3${newSuccesses === 3 ? ' — STABILIZED' : ''})`;
        } else {
          const newFailures = Math.min(3, failures + 1);
          onUpdate({ death_saves_failures: newFailures });
          outcome = `FAILURE (${newFailures}/3${newFailures === 3 ? ' — DEAD' : ''})`;
        }
        // Fire-and-forget history write. Non-blocking; a failed log
        // must not interrupt the death save resolution.
        if (character.user_id) {
          logHistoryEvent({
            characterId: character.id,
            userId: character.user_id,
            eventType: 'save',
            description: `Death Save: d20 = ${d20} — ${outcome}`,
            newValue: d20,
          }).catch(() => { /* swallow */ });
        }
      },
    });
  }

  // Auto-stabilize at 3 successes (manual-click path safety; rollDeathSave
  // resolves its own state above).
  useEffect(() => {
    if (successes >= 3) {
      // Stable: don't change HP, just keep the success counter so the
      // panel renders the "Stable" branch. Player clicks Regain 1 HP
      // when they want to wake up.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successes]);

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
        gap: 'var(--sp-2)',
        flexWrap: 'wrap',
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
        {!isDead && !isStabilized && (
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
            <button
              onClick={rollDeathSave}
              style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: 700,
                padding: '6px 14px',
                background: 'var(--color-crimson)',
                color: '#fff',
                border: '1px solid var(--color-crimson)',
                borderRadius: 6,
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
              title="Roll 1d20 — 10+ success, nat 20 wakes with 1 HP, nat 1 = 2 failures"
            >
              🎲 Roll d20
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={reset}
              style={{ fontSize: 'var(--fs-xs)', opacity: 0.7 }}
              title="Reset death saves"
            >
              Reset
            </button>
          </div>
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
              activeColor="#22c55e"
              onChange={setSuccesses}
            />
            <SaveRow
              label="Failures"
              count={failures}
              max={3}
              activeColor="#ef4444"
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
            Click <strong style={{ color: 'var(--c-red-l)' }}>Roll d20</strong> to make a death save,
            or click a box to mark manually. 10+ is a success; 9 or lower is a failure.
            Rolling a 1 counts as two failures. Rolling a 20 wakes you with 1 HP.
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
          // v2.162.0 — Phase Q.0 pt 3: square boxes (5px radius)
          // instead of circles. Hollow when unfilled, solid color
          // with subtle glow when filled. Manual click toggles for
          // DM override / undo.
          return (
            <button
              key={i}
              onClick={() => onChange(filled ? i : i + 1)}
              title={filled ? `Undo ${label.slice(0, -1).toLowerCase()}` : `Mark ${label.slice(0, -1).toLowerCase()}`}
              style={{
                width: 26,
                height: 26,
                borderRadius: 5,
                border: `2px solid ${activeColor}`,
                background: filled ? activeColor : 'transparent',
                cursor: 'pointer',
                transition: 'all var(--tr-fast)',
                padding: 0,
                boxShadow: filled ? `0 0 6px ${activeColor}66` : 'none',
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
