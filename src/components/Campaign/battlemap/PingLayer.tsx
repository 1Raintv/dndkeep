// v2.653.0 — PingLayer. "Look here."
//
// Alt+click anywhere on the map drops an expanding ring that every
// client viewing the scene sees for about a second. Alt+Shift+click
// additionally pulls everyone's viewport to the spot — the move a DM
// makes when half the table is scrolled somewhere else.
//
// Structure is deliberately the same as FxLayer (v2.236): effects in a
// ref so the rAF loop never re-renders React, one reused Graphics, and
// a scene-scoped Supabase broadcast channel with no schema behind it.
// Pings are ephemeral by definition, so there is nothing to persist.
//
// Unlike FX, this is NOT DM-gated. Pointing at something is what
// players need it for ("the lever is *there*"), and it writes nothing.

import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';

/** How long one ping animates, in ms. */
const PING_LIFE = 1300;
/** Rings per ping, staggered so they read as a pulse rather than a blob. */
const PING_RINGS = 3;
const RING_STAGGER = 160;

export interface Ping {
  id: number;
  x: number;
  y: number;
  /** Ring colour — the pinger's token colour when we can find one. */
  color: number;
  age: number;
}

export function spawnPing(x: number, y: number, color: number): Ping {
  return { id: Date.now() + Math.random(), x, y, color, age: 0 };
}

/** Advance a ping; false once it has outlived its animation. */
export function updatePing(ping: Ping, dt: number): boolean {
  ping.age += dt;
  return ping.age < PING_LIFE + RING_STAGGER * (PING_RINGS - 1);
}

/**
 * Draw one ping: concentric rings expanding outward and fading. The
 * `maxRadius` scales with the grid so a ping reads the same relative
 * size whatever the scene's cell size is.
 */
export function drawPing(gfx: Graphics, ping: Ping, maxRadius: number): void {
  for (let i = 0; i < PING_RINGS; i++) {
    const age = ping.age - i * RING_STAGGER;
    if (age <= 0 || age >= PING_LIFE) continue;
    const t = age / PING_LIFE;              // 0 → 1
    const radius = maxRadius * t;
    const alpha = (1 - t) * 0.85;
    gfx.circle(ping.x, ping.y, radius);
    gfx.stroke({ color: ping.color, width: 3, alpha });
  }
  // A small solid dot at the origin for the first beat, so a ping on a
  // busy map still has a precise "here" and not just a vague halo.
  if (ping.age < PING_LIFE * 0.5) {
    const t = ping.age / (PING_LIFE * 0.5);
    gfx.circle(ping.x, ping.y, 5);
    gfx.fill({ color: ping.color, alpha: (1 - t) * 0.9 });
  }
}

export function PingLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  currentSceneId: string | null;
  gridSizePx: number;
  /** Colour for this client's own pings. */
  myColor?: number;
}) {
  const { viewport, canvasEl, currentSceneId, gridSizePx, myColor = 0xfbbf24 } = props;
  const gfxRef = useRef<Graphics | null>(null);
  const pingsRef = useRef<Ping[]>([]);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Mirrored into refs so the canvas listener, bound once, always reads
  // current values without re-binding (the FxLayer intensity pattern).
  const gridRef = useRef(gridSizePx);
  useEffect(() => { gridRef.current = gridSizePx; }, [gridSizePx]);
  const colorRef = useRef(myColor);
  useEffect(() => { colorRef.current = myColor; }, [myColor]);

  // Graphics + animation loop, one per viewport.
  useEffect(() => {
    if (!viewport) return;
    const g = new Graphics();
    gfxRef.current = g;
    viewport.addChild(g);

    function tick(now: number) {
      const last = lastTimeRef.current || now;
      const dt = Math.min(64, now - last);   // clamp: tab refocus can hand us seconds
      lastTimeRef.current = now;
      const gfx = gfxRef.current;
      // v2.665.0 — see the matching note in FxLayer: a destroyed
      // Graphics is non-null with a null context, and the ticker can
      // run one more frame after teardown.
      if (gfx && !gfx.destroyed) {
        gfx.clear();
        const live: Ping[] = [];
        const maxRadius = gridRef.current * 1.8;
        for (const p of pingsRef.current) {
          if (updatePing(p, dt)) {
            drawPing(gfx, p, maxRadius);
            live.push(p);
          }
        }
        pingsRef.current = live;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      try { viewport.removeChild(g); } catch { /* viewport gone */ }
      try { g.destroy(); } catch { /* already destroyed */ }
      gfxRef.current = null;
      pingsRef.current = [];
      lastTimeRef.current = 0;
    };
  }, [viewport]);

  // Scene-scoped broadcast channel: subscribe for other people's pings,
  // send our own. Supabase broadcast does not echo to the sender, so
  // local spawn + send is the whole story and there's no loop to guard.
  useEffect(() => {
    if (!currentSceneId) return;
    const channel = supabase
      .channel(`battle_map:ping:${currentSceneId}`)
      .on('broadcast', { event: 'ping' }, (msg: any) => {
        const payload = msg?.payload ?? {};
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const color = Number.isFinite(Number(payload.color))
          ? Number(payload.color) : 0xfbbf24;
        pingsRef.current.push(spawnPing(x, y, color));
        // `focus` means the sender asked everyone to look — move the
        // viewport too. Reuses requestPan, the same nudge the
        // initiative strip uses to jump to the active token (v2.457).
        if (payload.focus) {
          useBattleMapStore.getState().requestPan(x, y);
        }
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      channelRef.current = null;
    };
  }, [currentSceneId]);

  // Alt+click to ping. Alt is used rather than a toolbar tool on
  // purpose: pinging is a thing you do *while* doing something else,
  // and a modal tool you have to enter and leave would never get used
  // mid-conversation. It also can't collide with the drawing/wall/FX
  // tools, which all own a plain left click.
  useEffect(() => {
    if (!canvasEl || !viewport || !currentSceneId) return;
    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 || !e.altKey) return;
      if (!canvasEl || !viewport) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = canvasEl.getBoundingClientRect();
      const wp = viewport.toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const focus = e.shiftKey;
      const color = colorRef.current;
      pingsRef.current.push(spawnPing(wp.x, wp.y, color));
      if (focus) useBattleMapStore.getState().requestPan(wp.x, wp.y);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'ping',
        payload: { x: wp.x, y: wp.y, color, focus },
      }).catch(() => { /* fire-and-forget; a dropped ping is not worth a toast */ });
    }
    // Capture phase: tokens and the drawing tools listen on the same
    // canvas, and an alt+click over a token should ping rather than
    // start a drag.
    canvasEl.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [canvasEl, viewport, currentSceneId]);

  return null;
}
