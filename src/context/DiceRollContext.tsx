import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export interface DiceRollEvent {
  result: number;      // the raw die result
  dieType: number;     // 4, 6, 8, 10, 12, 20, 100
  modifier?: number;   // + or - modifier added
  total?: number;      // result + modifier
  label?: string;      // "Stealth Check", "Attack Roll", etc.
  advantage?: boolean;
  disadvantage?: boolean;
}

interface DiceRollContextType {
  triggerRoll: (event: DiceRollEvent) => void;
  current: DiceRollEvent | null;
}

const DiceRollContext = createContext<DiceRollContextType>({
  triggerRoll: () => {},
  current: null,
});

export function useDiceRoll() {
  return useContext(DiceRollContext);
}

export function DiceRollProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DiceRollEvent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerRoll = useCallback((event: DiceRollEvent) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCurrent(event);
    timeoutRef.current = setTimeout(() => setCurrent(null), 2200);
  }, []);

  return (
    <DiceRollContext.Provider value={{ triggerRoll, current }}>
      {children}
      {current && <DiceRollOverlay event={current} onDismiss={() => setCurrent(null)} />}
    </DiceRollContext.Provider>
  );
}

// ── The Visual Overlay ──────────────────────────────────────────────

function DiceRollOverlay({ event, onDismiss }: { event: DiceRollEvent; onDismiss: () => void }) {
  const { result, dieType, modifier, total, label } = event;
  const isNat20 = dieType === 20 && result === 20;
  const isNat1  = dieType === 20 && result === 1;
  const finalTotal = total ?? (modifier !== undefined ? result + modifier : result);

  const accentColor = isNat20 ? '#f0c040' : isNat1 ? '#e53935' : '#eef2f7';
  const glowColor   = isNat20 ? 'rgba(240,192,64,0.6)' : isNat1 ? 'rgba(229,57,53,0.5)' : 'rgba(255,255,255,0.2)';

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'all',
        cursor: 'pointer',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)',
        animation: 'diceOverlayIn 150ms ease both',
      }}
    >
      <style>{`
        @keyframes diceOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes diceFlyIn {
          0% { transform: translateX(-100vw) rotate(-360deg) scale(0.3); opacity: 0; }
          50% { transform: translateX(30px) rotate(20deg) scale(1.1); opacity: 1; }
          70% { transform: translateX(-15px) rotate(-8deg) scale(0.98); }
          85% { transform: translateX(8px) rotate(3deg) scale(1.02); }
          100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
        }
        @keyframes resultPop {
          0% { transform: scale(0) rotate(-20deg); opacity: 0; }
          60% { transform: scale(1.3) rotate(5deg); opacity: 1; }
          80% { transform: scale(0.9) rotate(-2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes nat20Sparkle {
          0%, 100% { box-shadow: 0 0 30px rgba(240,192,64,0.8), 0 0 60px rgba(240,192,64,0.4); }
          50% { box-shadow: 0 0 60px rgba(240,192,64,1), 0 0 120px rgba(240,192,64,0.6); }
        }
        @keyframes labelSlideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        userSelect: 'none',
      }}>
        {/* Label */}
        {label && (
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-md)',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            animation: 'labelSlideUp 300ms 200ms ease both',
          }}>
            {label}
          </div>
        )}

        {/* Die shape */}
        <div style={{
          width: 160,
          height: 160,
          background: `linear-gradient(135deg, #1c2538 0%, #0c1018 100%)`,
          border: `3px solid ${accentColor}`,
          borderRadius: dieType === 20 ? '24px' : dieType === 6 ? '18px' : '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: `diceFlyIn 550ms cubic-bezier(0.34, 1.56, 0.64, 1) both, ${isNat20 ? 'nat20Sparkle 800ms 600ms ease infinite' : ''}`,
          boxShadow: `0 8px 40px rgba(0,0,0,0.8), 0 0 30px ${glowColor}`,
          position: 'relative',
          flexDirection: 'column',
          gap: 4,
        }}>
          {/* Die type label */}
          <div style={{
            position: 'absolute',
            top: 10,
            fontFamily: 'var(--font-heading)',
            fontSize: 11,
            fontWeight: 700,
            color: `${accentColor}80`,
            letterSpacing: '0.1em',
          }}>
            d{dieType}
          </div>

          {/* Result */}
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 900,
            fontSize: result >= 100 ? 36 : result >= 10 ? 56 : 72,
            color: accentColor,
            lineHeight: 1,
            animation: 'resultPop 400ms 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
            textShadow: `0 0 20px ${glowColor}`,
          }}>
            {result}
          </div>

          {/* Nat 20 / Nat 1 badge */}
          {(isNat20 || isNat1) && (
            <div style={{
              position: 'absolute',
              bottom: 10,
              fontFamily: 'var(--font-heading)',
              fontSize: 9,
              fontWeight: 900,
              color: accentColor,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              animation: 'labelSlideUp 300ms 700ms ease both',
            }}>
              {isNat20 ? '★ NATURAL 20 ★' : '✕ NATURAL 1 ✕'}
            </div>
          )}
        </div>

        {/* Total with modifier */}
        {modifier !== undefined && modifier !== 0 && (
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            animation: 'labelSlideUp 300ms 500ms ease both',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              {result} {modifier >= 0 ? '+' : ''}{modifier}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>=</span>
            <span style={{ color: accentColor, fontSize: 'var(--text-2xl)', fontWeight: 900 }}>
              {finalTotal}
            </span>
          </div>
        )}

        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          animation: 'labelSlideUp 300ms 700ms ease both',
        }}>
          Click to dismiss
        </div>
      </div>
    </div>
  );
}
