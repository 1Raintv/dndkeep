/**
 * DiceRoller3D — Pure CSS 3D dice animation. No external dependencies.
 * Each die is a CSS polygon with perspective + keyframe animations.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface DiceRollEvent {
  result: number;
  dieType: number;
  modifier?: number;
  total?: number;
  label?: string;
  allDice?: { die: number; value: number }[];
  expression?: string;
  flatBonus?: number;
}

interface Props {
  event: DiceRollEvent;
  onDismiss: () => void;
}

const DIE_COLORS: Record<number, { bg: string; border: string; glow: string }> = {
  4:   { bg: '#2d1a4a', border: '#a855f7', glow: 'rgba(168,85,247,0.6)' },
  6:   { bg: '#2d2010', border: '#f59e0b', glow: 'rgba(245,158,11,0.6)' },
  8:   { bg: '#0f2d1a', border: '#22c55e', glow: 'rgba(34,197,94,0.6)' },
  10:  { bg: '#0f1f2d', border: '#60a5fa', glow: 'rgba(96,165,250,0.6)' },
  12:  { bg: '#2d0f1f', border: '#ec4899', glow: 'rgba(236,72,153,0.6)' },
  20:  { bg: '#2d2500', border: '#f0c040', glow: 'rgba(240,192,64,0.8)' },
  100: { bg: '#2d1a0f', border: '#fb923c', glow: 'rgba(251,146,60,0.6)' },
};

// SVG polygon paths for each die face shape
function DieFace({ sides, value, delay, isNat }: {
  sides: number; value: number; delay: number; isNat: boolean;
}) {
  const col = DIE_COLORS[sides] ?? DIE_COLORS[20];
  const size = 90;
  const half = size / 2;

  // Polygon shape per die type
  const shapes: Record<number, string> = {
    4:   `${half},4 ${size-4},${size-4} 4,${size-4}`,
    6:   `4,4 ${size-4},4 ${size-4},${size-4} 4,${size-4}`,       // square
    8:   `${half},4 ${size-4},${half} ${half},${size-4} 4,${half}`,
    10:  `${half},4 ${size-4},${size*0.4} ${size*0.8},${size-4} ${size*0.2},${size-4} 4,${size*0.4}`,
    12:  `${half},4 ${size-4},${size*0.3} ${size-4},${size*0.72} ${half},${size-4} 4,${size*0.72} 4,${size*0.3}`,
    20:  `${half},4 ${size-4},${size*0.35} ${size*0.8},${size-4} ${size*0.2},${size-4} 4,${size*0.35}`,
    100: `${half},4 ${size-4},${half} ${half},${size-4} 4,${half}`, // diamond
  };
  const pts = shapes[sides] ?? shapes[20];
  const numFontSize = value >= 100 ? 22 : value >= 10 ? 30 : 36;

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      flexShrink: 0,
      animation: `dieRoll ${0.55 + Math.random() * 0.1}s ${delay}s cubic-bezier(0.34,1.56,0.64,1) both`,
      filter: isNat ? `drop-shadow(0 0 12px ${col.glow})` : `drop-shadow(0 4px 8px rgba(0,0,0,0.6))`,
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }}>
        <polygon
          points={pts}
          fill={col.bg}
          stroke={col.border}
          strokeWidth={isNat ? 3 : 2}
          strokeLinejoin="round"
        />
        {/* Subtle inner highlight */}
        <polygon
          points={pts}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          strokeLinejoin="round"
          transform={`translate(1,1)`}
        />
      </svg>
      {/* Die type label */}
      <div style={{
        position: 'absolute', top: 6, left: 0, right: 0,
        textAlign: 'center',
        fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
        color: col.border, opacity: 0.7, letterSpacing: '0.05em',
      }}>d{sides}</div>
      {/* Value */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        paddingTop: 6,
        fontFamily: 'var(--ff-stat)', fontWeight: 900,
        fontSize: numFontSize,
        color: isNat ? col.border : 'var(--t-1)',
        lineHeight: 1,
        textShadow: isNat ? `0 0 16px ${col.glow}` : 'none',
        animation: `valuePop 0.35s ${delay + 0.35}s cubic-bezier(0.34,1.56,0.64,1) both`,
      }}>
        {value}
      </div>
      {/* Nat 20 / Nat 1 badge */}
      {isNat && (
        <div style={{
          position: 'absolute', bottom: 8, left: 0, right: 0,
          textAlign: 'center',
          fontFamily: 'var(--ff-body)', fontSize: 7, fontWeight: 900,
          color: col.border, letterSpacing: '0.1em', textTransform: 'uppercase',
          animation: `valuePop 0.3s ${delay + 0.5}s ease both`,
        }}>
          {value === 20 ? '★NAT 20' : '✕NAT 1'}
        </div>
      )}
    </div>
  );
}

export default function DiceRoller3D({ event, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 4200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const diceList = event.allDice?.length
    ? event.allDice
    : [{ die: event.dieType, value: event.result }];

  const isMulti = diceList.length > 1;
  const finalTotal = event.total ?? (event.modifier !== undefined
    ? event.result + event.modifier : event.result);

  const css = `
    @keyframes dieRoll {
      0%   { transform: translateX(-110vw) rotate(-540deg) scale(0.2); opacity: 0; }
      55%  { transform: translateX(20px) rotate(15deg) scale(1.12); opacity: 1; }
      72%  { transform: translateX(-8px) rotate(-5deg) scale(0.96); }
      85%  { transform: translateX(4px) rotate(2deg) scale(1.03); }
      100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
    }
    @keyframes valuePop {
      0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
      65%  { transform: scale(1.25) rotate(4deg); opacity: 1; }
      82%  { transform: scale(0.93) rotate(-1deg); }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }
    @keyframes totalSlide {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
    @keyframes labelFade {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes nat20Pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(240,192,64,0.4); }
      50%       { box-shadow: 0 0 50px rgba(240,192,64,0.8); }
    }
  `;

  const lastDelay = (diceList.length - 1) * 0.07;

  return createPortal(
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(8, 10, 18, 0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        gap: 20,
      }}
    >
      <style>{css}</style>

      {/* Roll label */}
      {event.label && (
        <div style={{
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 16,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.6)',
          animation: 'labelFade 0.3s 0.1s ease both',
        }}>
          {event.label}
        </div>
      )}

      {/* Dice row */}
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        gap: 16, justifyContent: 'center',
        maxWidth: '80vw',
      }}>
        {diceList.map((d, i) => {
          const isNat = d.die === 20 && (d.value === 20 || d.value === 1);
          return (
            <DieFace
              key={i}
              sides={d.die}
              value={d.value}
              delay={i * 0.07}
              isNat={isNat}
            />
          );
        })}
      </div>

      {/* Modifier + total for single die with modifier */}
      {!isMulti && event.modifier !== undefined && event.modifier !== 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          animation: `totalSlide 0.4s ${lastDelay + 0.5}s ease both`,
        }}>
          <span style={{ color: 'var(--t-3)', fontSize: 14 }}>
            {event.result} {event.modifier >= 0 ? '+' : ''}{event.modifier}
          </span>
          <span style={{ color: 'var(--t-3)' }}>=</span>
          <span style={{
            fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 52,
            color: 'var(--t-1)', lineHeight: 1,
          }}>
            {finalTotal}
          </span>
        </div>
      )}

      {/* Multi-dice total */}
      {isMulti && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          animation: `totalSlide 0.4s ${lastDelay + 0.5}s ease both`,
        }}>
          {event.expression && (
            <span style={{ color: 'var(--t-3)', fontSize: 13, fontFamily: 'var(--ff-mono)' }}>
              {event.expression} =
            </span>
          )}
          <span style={{
            fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 64,
            color: 'var(--t-1)', lineHeight: 1,
            textShadow: '0 0 30px rgba(255,255,255,0.2)',
          }}>
            {finalTotal}
          </span>
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 20,
        fontFamily: 'var(--ff-body)', fontSize: 11,
        color: 'rgba(255,255,255,0.25)',
      }}>
        Click anywhere to dismiss
      </div>
    </div>,
    document.body
  );
}
