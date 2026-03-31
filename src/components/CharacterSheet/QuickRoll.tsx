import { useState } from 'react';
import { rollDie } from '../../lib/gameUtils';

interface DiceResult {
  die: number;
  result: number;
  timestamp: number;
}

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

function diceLabel(d: number) {
  return `d${d}`;
}

function diceIcon(d: number) {
  // Simple polygon shapes via CSS/SVG
  const icons: Record<number, string> = {
    4:  '▲',
    6:  '⬡',
    8:  '◆',
    10: '⬟',
    12: '⬠',
    20: '⬡',
    100:'◎',
  };
  return icons[d] ?? '⬡';
}

function resultColor(die: number, result: number) {
  if (result === die) return 'var(--color-gold-bright)';   // max = crit
  if (result === 1)   return 'var(--color-crimson-bright)'; // 1 = fumble
  return 'var(--text-primary)';
}

export default function QuickRoll() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<DiceResult[]>([]);
  const [rolling, setRolling] = useState<number | null>(null);

  function roll(die: number) {
    setRolling(die);
    setTimeout(() => {
      const result = rollDie(die);
      setResults(prev => [{ die, result, timestamp: Date.now() }, ...prev].slice(0, 8));
      setRolling(null);
    }, 120);
  }

  const latest = results[0];

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Dice Roller"
        style={{
          position: 'fixed',
          bottom: 'var(--space-10)',
          right: 'var(--space-4)',
          zIndex: 90,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: open
            ? 'linear-gradient(160deg, var(--color-crimson) 0%, var(--color-blood) 100%)'
            : 'linear-gradient(160deg, #8a5e18 0%, var(--color-gold-dim) 50%, #7a5216 100%)',
          border: `2px solid ${open ? 'var(--color-crimson-bright)' : 'var(--color-gold)'}`,
          boxShadow: open
            ? 'var(--shadow-crimson), 0 4px 16px rgba(0,0,0,0.6)'
            : 'var(--shadow-gold), 0 4px 16px rgba(0,0,0,0.5)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: open ? 18 : 24,
          color: 'var(--color-bone)',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}
      >
        {open ? '✕' : '🎲'}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="animate-fade-in"
          style={{
            position: 'fixed',
            bottom: 76,
            right: 'var(--space-4)',
            zIndex: 89,
            width: 264,
            background: 'linear-gradient(160deg, var(--color-charcoal) 0%, var(--color-obsidian) 100%)',
            border: '1px solid var(--border-gold)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg), var(--shadow-gold)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
            fontFamily: 'var(--font-heading)', fontWeight: 700,
            fontSize: 'var(--text-xs)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--text-gold)',
          }}>
            Dice Roller
          </div>

          {/* Last result display */}
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            textAlign: 'center',
            borderBottom: '1px solid var(--border-subtle)',
            minHeight: 64,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 2,
          }}>
            {latest ? (
              <>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-3xl)',
                  fontWeight: 900,
                  lineHeight: 1,
                  color: resultColor(latest.die, latest.result),
                  textShadow: latest.result === latest.die
                    ? '0 0 16px rgba(201,146,42,0.8)'
                    : latest.result === 1
                    ? '0 0 12px rgba(220,38,38,0.6)'
                    : 'none',
                  transition: 'all 120ms ease',
                }}>
                  {latest.result === latest.die && '✨ '}
                  {latest.result === 1 && '💀 '}
                  {latest.result}
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {latest.result === latest.die
                    ? `Max! (d${latest.die})`
                    : latest.result === 1
                    ? `Fumble (d${latest.die})`
                    : `d${latest.die}`}
                </div>
              </>
            ) : (
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Pick a die to roll
              </span>
            )}
          </div>

          {/* Dice buttons */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
          }}>
            {DICE.map(d => (
              <button
                key={d}
                onClick={() => roll(d)}
                disabled={rolling !== null}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 2, padding: 'var(--space-2) var(--space-1)',
                  borderRadius: 'var(--radius-md)',
                  border: latest?.die === d && !rolling
                    ? '2px solid var(--color-gold)'
                    : rolling === d
                    ? '2px solid var(--color-crimson)'
                    : '1px solid var(--border-subtle)',
                  background: rolling === d
                    ? 'rgba(155,28,28,0.2)'
                    : latest?.die === d && !rolling
                    ? 'rgba(201,146,42,0.12)'
                    : 'var(--bg-sunken)',
                  cursor: rolling ? 'wait' : 'pointer',
                  transition: 'all var(--transition-fast)',
                  transform: rolling === d ? 'scale(0.92)' : 'scale(1)',
                  minWidth: 0,
                }}
              >
                <span style={{
                  fontSize: 20,
                  lineHeight: 1,
                  filter: rolling === d ? 'brightness(0.7)' : 'none',
                }}>
                  {diceIcon(d)}
                </span>
                <span style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  color: latest?.die === d ? 'var(--text-gold)' : 'var(--text-secondary)',
                }}>
                  {diceLabel(d)}
                </span>
              </button>
            ))}
          </div>

          {/* Roll history */}
          {results.length > 1 && (
            <div style={{
              padding: '0 var(--space-3) var(--space-3)',
              display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 2 }}>
                History:
              </span>
              {results.slice(1, 8).map((r, i) => (
                <span key={r.timestamp} style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 10, fontWeight: 700,
                  color: resultColor(r.die, r.result),
                  opacity: 1 - (i * 0.12),
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 3,
                  padding: '1px 5px',
                }}>
                  {r.result}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 9 }}> d{r.die}</span>
                </span>
              ))}
              <button
                onClick={() => setResults([])}
                style={{
                  fontFamily: 'var(--font-heading)', fontSize: 9,
                  color: 'var(--text-muted)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '1px 4px',
                  opacity: 0.6,
                }}
              >
                clear
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
