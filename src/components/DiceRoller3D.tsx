/**
 * DiceRoller3D — Canvas 2D physics-based dice rolling simulation.
 * Dice fly from the left, tumble, bounce off the table, and spin to a stop.
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

// Color per die type
const DIE_COLORS: Record<number, { fill: string; stroke: string; text: string }> = {
  4:   { fill: '#1e0a3c', stroke: '#a855f7', text: '#d8b4fe' },
  6:   { fill: '#1c1000', stroke: '#f59e0b', text: '#fcd34d' },
  8:   { fill: '#001c0a', stroke: '#22c55e', text: '#86efac' },
  10:  { fill: '#001020', stroke: '#60a5fa', text: '#bfdbfe' },
  12:  { fill: '#1c0010', stroke: '#ec4899', text: '#fbcfe8' },
  20:  { fill: '#1c1600', stroke: '#f0c040', text: '#fef08a' },
  100: { fill: '#1c0800', stroke: '#fb923c', text: '#fed7aa' },
};

function getColor(sides: number) {
  return DIE_COLORS[sides] ?? DIE_COLORS[20];
}

// Returns polygon vertices for a die shape, centered at 0,0 with given radius
function getDiePoints(sides: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  const shapes: Record<number, number> = { 4: 3, 6: 4, 8: 4, 10: 5, 12: 6, 20: 5, 100: 8 };
  const n = shapes[sides] ?? 5;
  const offset = sides === 6 ? Math.PI / 4 : sides === 4 ? -Math.PI / 2 : -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

interface Die {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  angVel: number;        // radians/sec angular velocity
  sides: number;
  finalValue: number;
  displayValue: number;
  radius: number;
  phase: 'air' | 'rolling' | 'done';
  bounces: number;
  startDelay: number;    // seconds before this die appears
  settled: boolean;
  settleTimer: number;
}

function drawDie(ctx: CanvasRenderingContext2D, die: Die) {
  const col = getColor(die.sides);
  const pts = getDiePoints(die.sides, die.radius);

  ctx.save();
  ctx.translate(die.x, die.y);
  ctx.rotate(die.rotation);

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  // Fill
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = col.fill;
  ctx.fill();

  // Stroke
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = col.stroke;
  ctx.lineWidth = die.phase === 'done' ? 2.5 : 2;
  ctx.stroke();

  // Glow when settled
  if (die.phase === 'done') {
    ctx.strokeStyle = col.stroke + '60';
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  // Number — reset rotation so it's always readable
  ctx.rotate(-die.rotation);
  const fontSize = die.radius * (die.displayValue >= 100 ? 0.55 : die.displayValue >= 10 ? 0.65 : 0.75);
  ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = die.phase === 'done' ? col.stroke : col.text;

  // While spinning fast, cycle numbers randomly
  ctx.fillText(String(die.displayValue), 0, 2);

  // Die type label
  ctx.font = `700 ${die.radius * 0.28}px system-ui`;
  ctx.fillStyle = col.stroke + '80';
  ctx.fillText(`d${die.sides}`, 0, die.radius * 0.55);

  ctx.restore();
}

export default function DiceRoller3D({ event, onDismiss }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const TABLE_Y = H * 0.62;   // "table surface" horizon line
    const GRAVITY = 1800;        // px/s²
    const FRICTION = 0.75;       // velocity multiplier on bounce
    const ANG_FRICTION = 0.82;   // angular velocity multiplier on bounce/frame
    const ROLL_FRICTION = 0.965; // rolling slowdown per frame

    const diceInput = event.allDice?.length
      ? event.allDice
      : [{ die: event.dieType, value: event.result }];

    // Build die states
    const dice: Die[] = diceInput.map((d, i) => {
      const r = Math.min(42, Math.max(32, 42 - diceInput.length * 2));
      return {
        x: -r - 20,
        y: TABLE_Y - 60 - Math.random() * 80,
        vx: 520 + Math.random() * 180,
        vy: -120 - Math.random() * 180,
        rotation: Math.random() * Math.PI * 2,
        angVel: (Math.random() > 0.5 ? 1 : -1) * (12 + Math.random() * 18), // rad/s
        sides: d.die,
        finalValue: d.value,
        displayValue: Math.ceil(Math.random() * d.die),
        radius: r,
        phase: 'air' as const,
        bounces: 0,
        startDelay: i * 0.14,
        settled: false,
        settleTimer: 0,
      };
    });

    let t = 0;
    let lastTime = performance.now();
    let allDone = false;
    let doneTimer = 0;
    let raf = 0;
    let dismissed = false;

    function update(dt: number) {
      for (const die of dice) {
        if (die.startDelay > 0) { die.startDelay -= dt; continue; }

        if (die.phase === 'air' || die.phase === 'rolling') {
          // Apply gravity
          die.vy += GRAVITY * dt;
          die.x += die.vx * dt;
          die.y += die.vy * dt;

          // Rotate while moving
          die.rotation += die.angVel * dt;

          // Cycle display value while spinning fast
          if (Math.abs(die.angVel) > 3) {
            if (Math.random() < 0.15) {
              die.displayValue = Math.ceil(Math.random() * die.sides);
            }
          }

          // Bounce off table surface
          if (die.y + die.radius > TABLE_Y && die.vy > 0) {
            die.y = TABLE_Y - die.radius;
            die.vy *= -FRICTION;
            die.vx *= FRICTION;
            die.angVel *= ANG_FRICTION;
            die.phase = 'rolling';
            die.bounces++;

            // Small bounces die off quickly
            if (Math.abs(die.vy) < 60) die.vy = 0;
          }

          // Rolling friction
          if (die.phase === 'rolling') {
            die.vx *= ROLL_FRICTION;
            die.angVel *= ROLL_FRICTION;
          }

          // Settled when barely moving
          const speed = Math.sqrt(die.vx * die.vx + die.vy * die.vy);
          if (die.phase === 'rolling' && speed < 18 && Math.abs(die.angVel) < 1.5 && die.y + die.radius >= TABLE_Y - 5) {
            die.phase = 'done';
            die.vx = 0; die.vy = 0; die.angVel = 0;
            die.y = TABLE_Y - die.radius;
            die.displayValue = die.finalValue;  // lock to final value
            die.rotation = 0;                    // snap to flat
          }

          // Keep on screen horizontally (bounce off right wall)
          if (die.x - die.radius < 0) { die.x = die.radius; die.vx = Math.abs(die.vx) * 0.6; }
          if (die.x + die.radius > W) { die.x = W - die.radius; die.vx = -Math.abs(die.vx) * 0.6; }
        }
      }
    }

    function drawTableLine(ctx: CanvasRenderingContext2D) {
      // Subtle table surface line
      ctx.save();
      const grad = ctx.createLinearGradient(0, TABLE_Y, W, TABLE_Y);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.2, 'rgba(255,255,255,0.06)');
      grad.addColorStop(0.8, 'rgba(255,255,255,0.06)');
      grad.addColorStop(1, 'transparent');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, TABLE_Y);
      ctx.lineTo(W, TABLE_Y);
      ctx.stroke();
      ctx.restore();
    }

    function drawTotal(ctx: CanvasRenderingContext2D) {
      if (!allDone) return;
      const finalTotal = event.total ?? (event.modifier !== undefined
        ? event.result + event.modifier : event.result);
      const isMulti = diceInput.length > 1;
      const hasModifier = !isMulti && event.modifier !== undefined && event.modifier !== 0;

      if (!isMulti && !hasModifier) return; // single die, no modifier — number on die is enough

      const alpha = Math.min(1, (doneTimer - 0.3) / 0.4);
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Position below table
      const ty = TABLE_Y + 60;

      if (hasModifier) {
        // Show: result + modifier = total
        ctx.font = '600 20px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText(`${event.result} ${(event.modifier ?? 0) >= 0 ? '+' : ''}${event.modifier} =`, W / 2, ty);

        ctx.font = '900 56px system-ui';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.4)';
        ctx.shadowBlur = 20;
        ctx.fillText(String(finalTotal), W / 2, ty + 46);
      } else if (isMulti) {
        ctx.font = '600 18px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign = 'center';
        ctx.fillText('TOTAL', W / 2, ty);

        ctx.font = '900 72px system-ui';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.3)';
        ctx.shadowBlur = 24;
        ctx.fillText(String(finalTotal), W / 2, ty + 56);
      }

      ctx.restore();
    }

    function frame(ts: number) {
      if (dismissed) return;
      const dt = Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;
      t += dt;

      update(dt);

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Draw table line
      drawTableLine(ctx);

      // Draw each die
      for (const die of dice) {
        if (die.startDelay > 0) continue;
        drawDie(ctx, die);
      }

      // Check if all done
      const readyDice = dice.filter(d => d.startDelay <= 0);
      if (readyDice.length > 0 && readyDice.every(d => d.phase === 'done')) {
        if (!allDone) { allDone = true; doneTimer = 0; }
        doneTimer += dt;
        drawTotal(ctx);

        if (doneTimer > 3.5) {
          dismissed = true;
          dismissRef.current();
          return;
        }
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      dismissed = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const finalTotal = event.total ?? (event.modifier !== undefined
    ? event.result + event.modifier : event.result);

  return createPortal(
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(6, 8, 16, 0.88)',
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
      }}
    >
      {/* Roll label */}
      {event.label && (
        <div style={{
          position: 'absolute', top: '8%', left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 18,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
          animation: 'labelFadeIn 0.4s ease both',
        }}>
          {event.label}
        </div>
      )}

      {/* Canvas layer */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          pointerEvents: 'none',
        }}
      />

      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none',
        fontFamily: 'var(--ff-body)', fontSize: 11,
        color: 'rgba(255,255,255,0.22)',
      }}>
        Click anywhere to dismiss
      </div>

      <style>{`
        @keyframes labelFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
