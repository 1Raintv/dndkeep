// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 2).
// See that file's header changelog for this code's full history.

import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

/**
 * v2.236.0 — FxLayer.
 *
 * Renders ephemeral particle effects (fire, lightning, sparkles,
 * smoke) on the map. Effects DO NOT persist — they animate for
 * 0.5–2.3 seconds and disappear. Cross-client visibility is achieved
 * via a Supabase Realtime broadcast channel; no schema involved.
 *
 * Architecture:
 *   - Effects live in a ref (not React state) so the rAF animation
 *     loop doesn't trigger re-renders on every frame.
 *   - One Graphics instance is reused for all effects per frame; we
 *     clear() and redraw each frame from the active effects list.
 *   - Each effect has a list of FxParticle objects with their own
 *     position, velocity, lifetime. update() advances ages; draw()
 *     renders shapes based on the effect kind.
 *   - Lightning is a special case: instead of N particles, it has
 *     one cached jagged-bolt path generated at spawn (so the bolt
 *     doesn't flicker frame-to-frame).
 *   - The trigger callback is exposed to the parent through a
 *     mutable ref. Parent calls triggerRef.current(kind, x, y) on
 *     a click to fire an effect locally + broadcast it. Realtime
 *     subscribers receive the broadcast and trigger locally too.
 */

export type FxKind = 'fire' | 'lightning' | 'sparkles' | 'smoke';

export interface FxParticle {
  x: number;
  y: number;
  /** velocity in px per ms */
  vx: number;
  vy: number;
  /** total lifetime in ms */
  life: number;
  /** current age in ms */
  age: number;
  color: number;
  size: number;
}

export interface FxEffect {
  id: number;
  kind: FxKind;
  originX: number;
  originY: number;
  particles: FxParticle[];
  /** For lightning: cached bolt vertices so they don't re-randomize per frame. */
  boltPath?: Array<{ x: number; y: number }>;
  /** Total time after which the effect is considered done (any particles
   *  past this are reaped). */
  totalLife: number;
}

// v2.256.0 — intensity is a multiplier (0.25–2.0) that scales the
// particle count for fire/sparkles/smoke. Lightning ignores it (one
// bolt is one bolt). Default 1.0 preserves the v2.236 behavior so
// existing callers don't need to thread the value through.
export function spawnFxEffect(kind: FxKind, x: number, y: number, intensity = 1): FxEffect {
  const id = Date.now() + Math.random();
  const particles: FxParticle[] = [];
  let totalLife = 1500;
  let boltPath: Array<{ x: number; y: number }> | undefined;
  // Clamp + round so a slider at 0.25 still spawns a few particles
  // (otherwise CR-low effects look broken). Floor of 4 per kind.
  const scaled = (base: number) => Math.max(4, Math.round(base * intensity));

  if (kind === 'fire') {
    // Orange/red embers rising upward with horizontal jitter.
    const palette = [0xfbbf24, 0xf97316, 0xef4444];
    for (let i = 0; i < scaled(30); i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
      const speed = 0.04 + Math.random() * 0.06;
      particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 900 + Math.random() * 600,
        age: 0,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 6 + Math.random() * 7,
      });
    }
    totalLife = 1600;
  } else if (kind === 'sparkles') {
    // Yellow/gold/white twinkles fanning outward.
    const palette = [0xfbbf24, 0xfde047, 0xffffff];
    for (let i = 0; i < scaled(22); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.05 + Math.random() * 0.08;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 600 + Math.random() * 400,
        age: 0,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 3 + Math.random() * 4,
      });
    }
    totalLife = 1100;
  } else if (kind === 'smoke') {
    // Gray puffs rising slowly, expanding.
    const palette = [0x6b7280, 0x9ca3af, 0x4b5563];
    for (let i = 0; i < scaled(16); i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      const speed = 0.018 + Math.random() * 0.025;
      particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1500 + Math.random() * 800,
        age: 0,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 9 + Math.random() * 8,
      });
    }
    totalLife = 2400;
  } else {
    // Lightning — one bolt with a flash. Single placeholder particle
    // owns the lifetime; rendering uses boltPath instead of particle xy.
    const startX = x + (Math.random() - 0.5) * 50;
    const startY = y - 220 - Math.random() * 80;
    const segments = 7;
    boltPath = [{ x: startX, y: startY }];
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const baseX = startX + (x - startX) * t;
      const baseY = startY + (y - startY) * t;
      // Jitter is largest mid-bolt, zero at endpoints.
      const fade = 1 - Math.abs(t - 0.5) * 2;
      const jitter = (Math.random() - 0.5) * 36 * fade;
      boltPath.push({ x: baseX + jitter, y: baseY });
    }
    particles.push({
      x, y, vx: 0, vy: 0,
      life: 500, age: 0, color: 0xffffff, size: 0,
    });
    totalLife = 500;
  }

  return { id, kind, originX: x, originY: y, particles, boltPath, totalLife };
}

/** Returns true if the effect still has any live particles. Mutates
 *  particle positions/ages in place. */
export function updateFxEffect(eff: FxEffect, dtMs: number): boolean {
  let alive = false;
  for (const p of eff.particles) {
    p.age += dtMs;
    if (p.age < p.life) {
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      // A tiny bit of upward drag for fire (counter-decelerate).
      if (eff.kind === 'fire') {
        p.vy *= 0.998;
      }
      // Sparkles drift slightly down over time.
      if (eff.kind === 'sparkles') {
        p.vy += 0.00006 * dtMs;
      }
      alive = true;
    }
  }
  return alive;
}

/** Render an effect into `g`. Caller is expected to have called
 *  g.clear() before iterating effects, and to call g.stroke()/fill()
 *  per-shape as we do here. */
export function drawFxEffect(g: Graphics, eff: FxEffect) {
  if (eff.kind === 'lightning') {
    const p = eff.particles[0];
    if (!p || p.age >= p.life || !eff.boltPath) return;
    const t = p.age / p.life;
    const alpha = 1 - t;
    // Outer glow stroke (wider, softer).
    g.setStrokeStyle({ width: 8, color: 0x60a5fa, alpha: alpha * 0.45, alignment: 0.5 });
    g.moveTo(eff.boltPath[0].x, eff.boltPath[0].y);
    for (let i = 1; i < eff.boltPath.length; i++) {
      g.lineTo(eff.boltPath[i].x, eff.boltPath[i].y);
    }
    g.stroke();
    // Core white stroke.
    g.setStrokeStyle({ width: 2.5, color: 0xffffff, alpha: alpha * 0.95, alignment: 0.5 });
    g.moveTo(eff.boltPath[0].x, eff.boltPath[0].y);
    for (let i = 1; i < eff.boltPath.length; i++) {
      g.lineTo(eff.boltPath[i].x, eff.boltPath[i].y);
    }
    g.stroke();
    // Impact flash circle.
    const flash = Math.max(0, 1 - t * 1.8);
    if (flash > 0) {
      g.circle(eff.originX, eff.originY, 60 * flash)
        .fill({ color: 0xffffff, alpha: flash * 0.35 });
    }
    return;
  }

  for (const p of eff.particles) {
    if (p.age >= p.life) continue;
    const t = p.age / p.life;
    const alpha = 1 - t;
    if (eff.kind === 'sparkles') {
      const twinkle = 0.55 + 0.45 * Math.sin(p.age * 0.045);
      g.circle(p.x, p.y, p.size * (1 - t * 0.4))
        .fill({ color: p.color, alpha: alpha * twinkle });
    } else if (eff.kind === 'smoke') {
      // Smoke expands as it ages.
      g.circle(p.x, p.y, p.size * (1 + t * 0.7))
        .fill({ color: p.color, alpha: alpha * 0.55 });
    } else {
      // Fire: shrinks slightly, fades.
      g.circle(p.x, p.y, p.size * (1 - t * 0.5))
        .fill({ color: p.color, alpha: alpha * 0.85 });
    }
  }
}

export function FxLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  /** Which FX kind is active, or null when no FX tool selected. */
  activeKind: FxKind | null;
  campaignId: string;
  currentSceneId: string | null;
  /** Parent sets a function on this ref so it can imperatively trigger
   *  effects from anywhere (currently used by the canvas click handler
   *  installed inside this component, but kept ref-shaped for future
   *  use — e.g. attack pipeline hits → spawn fire on impact). */
  triggerRef: React.MutableRefObject<((kind: FxKind, x: number, y: number) => void) | null>;
  /** v2.256.0 — particle-count multiplier (0.25–2.0). 1.0 = legacy
   *  v2.236 behavior. Lightning ignores this (one bolt is one bolt). */
  intensity?: number;
}) {
  const { viewport, canvasEl, activeKind, campaignId, currentSceneId, triggerRef, intensity = 1 } = props;
  const gfxRef = useRef<Graphics | null>(null);
  const effectsRef = useRef<FxEffect[]>([]);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeKindRef = useRef<FxKind | null>(null);
  useEffect(() => { activeKindRef.current = activeKind; }, [activeKind]);
  // v2.256.0 — mirror intensity into a ref so the click/realtime
  // handlers attached in the mount effect can read the latest value
  // without re-binding on every slider change.
  const intensityRef = useRef(intensity);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);

  // Mount Graphics + start animation loop once per viewport.
  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    gfxRef.current = g;
    viewport.addChild(g);

    function tick(now: number) {
      const last = lastTimeRef.current || now;
      const dt = Math.min(64, now - last); // clamp to avoid huge dt on tab refocus
      lastTimeRef.current = now;
      const gfx = gfxRef.current;
      // v2.665.0 — `destroyed` as well as null. A destroyed Graphics is
      // still a non-null object but its context is gone, so `.clear()`
      // throws "Cannot read properties of null (reading 'clear')". The
      // ticker can outlive teardown by a frame — switching scenes is the
      // reliable way to see it — and the null check alone let that
      // through.
      if (gfx && !gfx.destroyed) {
        gfx.clear();
        const live: FxEffect[] = [];
        for (const eff of effectsRef.current) {
          const alive = updateFxEffect(eff, dt);
          if (alive) {
            drawFxEffect(gfx, eff);
            live.push(eff);
          }
        }
        effectsRef.current = live;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      try { viewport.removeChild(g); } catch { /* viewport gone */ }
      try { g.destroy(); } catch { /* destroyed */ }
      gfxRef.current = null;
      effectsRef.current = [];
      lastTimeRef.current = 0;
    };
  }, [viewport]);

  // Realtime broadcast channel — both subscribe (for remote effects)
  // and send (for our own effects). Channel name is scene-scoped so
  // FX in one scene don't leak to viewers of another.
  useEffect(() => {
    if (!currentSceneId || !campaignId) return;
    const channel = supabase
      .channel(`battle_map:fx:${currentSceneId}`)
      .on('broadcast', { event: 'fx' }, (msg: any) => {
        const payload = msg?.payload ?? {};
        const kind = payload.kind as FxKind | undefined;
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!kind || !Number.isFinite(x) || !Number.isFinite(y)) return;
        if (kind !== 'fire' && kind !== 'lightning' && kind !== 'sparkles' && kind !== 'smoke') return;
        // v2.256.0 — accept intensity from the broadcast so remote
        // viewers see the same density the caster picked. Falls back
        // to 1.0 for messages from older clients (no schema bump).
        const remoteIntensity = Number.isFinite(Number(payload.intensity))
          ? Number(payload.intensity) : 1;
        // Spawn locally — no broadcast back (Supabase broadcast does
        // not echo to sender, and we don't want a loop anyway).
        effectsRef.current.push(spawnFxEffect(kind, x, y, remoteIntensity));
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      channelRef.current = null;
    };
  }, [currentSceneId, campaignId]);

  // Expose trigger to parent. Spawning an FX = local push + broadcast.
  useEffect(() => {
    triggerRef.current = (kind: FxKind, x: number, y: number) => {
      // v2.256.0 — read the live intensity from the ref so a slider
      // change between mount and click is honored without re-binding.
      const i = intensityRef.current;
      effectsRef.current.push(spawnFxEffect(kind, x, y, i));
      const ch = channelRef.current;
      if (ch) {
        ch.send({
          type: 'broadcast',
          event: 'fx',
          payload: { kind, x, y, intensity: i },
        }).catch(() => { /* fire-and-forget */ });
      }
    };
    return () => { triggerRef.current = null; };
  }, [triggerRef]);

  // Canvas click handler — only attached when an FX kind is active.
  useEffect(() => {
    if (!activeKind || !canvasEl || !viewport || !currentSceneId) return;
    function clientToWorld(e: MouseEvent): { x: number; y: number } | null {
      if (!canvasEl || !viewport) return null;
      const rect = canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = viewport.toWorld(sx, sy);
      return { x: wp.x, y: wp.y };
    }
    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      const w = clientToWorld(e);
      if (!w) return;
      const fn = triggerRef.current;
      const kind = activeKindRef.current;
      if (!fn || !kind) return;
      fn(kind, w.x, w.y);
    }
    canvasEl.addEventListener('click', onClick);
    return () => {
      canvasEl.removeEventListener('click', onClick);
    };
  }, [activeKind, canvasEl, viewport, currentSceneId, triggerRef]);

  return null;
}
