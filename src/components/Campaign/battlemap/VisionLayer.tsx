// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 2).
// See that file's header changelog for this code's full history.

import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useApplication } from '@pixi/react';
import { useEffect, useMemo, useRef } from 'react';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import { computeVisibilityPolygon, type WallSegment } from '../../../lib/vision/visibilityPolygon';
import { wallMaterialBlocksSight } from '../../../rules/cover';
import { sightRadiusPx, visibleLightSources, FEET_PER_SQUARE } from '../../../rules/vision';
import { parseRevealedCells } from '../../../rules/manualFog';

/**
 * v2.224 — VisionLayer.
 *
 * Renders fog of war over the scene: dark over everything that's
 * outside any token's visibility polygon, transparent inside.
 *
 * For DM (props.isDM=true): renders nothing at all (omniscient view).
 * For players: renders a Sprite displaying a RenderTexture sized to
 * the world, refreshed whenever vision-relevant inputs change:
 *   - origin tokens move (drag commits, realtime echoes)
 *   - walls added or deleted
 *   - vision range changes (fixed for v2.224)
 *
 * Render approach:
 *   1. Maintain a RenderTexture matching world dims
 *   2. On recompute: clear with dark fog fill
 *   3. For each origin token: compute polygon, render with blend
 *      mode 'erase' which carves a hole in the fog
 *   4. The Sprite displays the result over the world rect
 *
 * 'erase' blend mode (Pixi v8): destination-out — anything drawn
 * with this mode subtracts alpha from what's beneath it. So drawing
 * a white-filled vision polygon on top of dark fog produces a
 * transparent hole in the polygon's shape.
 *
 * Performance: recomputes synchronously on prop change. With a 6-token
 * party + 30 walls + 180 rays per polygon, total is ~10ms — well
 * within frame budget. Heavier scenes will need throttling (debounce
 * during active drag) which we'll add in a follow-up ship.
 *
 * v2.225 will add per-player fog: hide vision contributions of tokens
 * not owned by the current user. v2.224 just shares all party vision
 * with everyone (party-shared sight) which is how Roll20/Foundry
 * default behave anyway.
 */
export function VisionLayer(props: {
  viewport: Viewport | null;
  worldWidth: number;
  worldHeight: number;
  gridSizePx: number;
  isDM: boolean;
  /** Character IDs whose linked tokens should contribute vision
   *  polygons. v2.224: every PC in the campaign (party-shared sight).
   *  v2.225 will narrow this to the current user's own characters. */
  visionOriginCharacterIds: string[];
  /** v2.663.0 — darkvision in FEET keyed by character id. Resolved by
   *  CampaignDashboard from the species table so this layer stays clear
   *  of `src/data`. A character missing from the map has none, which is
   *  the correct default for anything non-PC. */
  darkvisionByCharacterId: Record<string, number>;
  /** v2.267.0 — when true, render fog for the DM too (Player View
   *  preview). Default false; only the DM toolbar's preview button
   *  flips this. Players never see this prop set. */
  dmPreviewFog?: boolean;
  /** v2.274.0 — scene ambient lighting. Drives whether the fog
   *  layer renders at all and at what alpha:
   *    'bright' → no fog rendering (skipped via fogActive gate);
   *    'dim'    → fog rendered at ~0.55 alpha (mood lighting);
   *    'dark'   → fog rendered at 1.0 alpha (the original behavior).
   *  Vision polygons still cut transparent holes through 'dim' fog so
   *  PCs see clearly within their range; the difference is the
   *  ambient layer outside their cones is partly transparent rather
   *  than fully opaque. */
  ambientLight: 'bright' | 'dim' | 'dark';
  /** v2.664.0 — how fog is decided. 'dynamic' derives it from line of
   *  sight (walls, darkvision, carried light); 'manual' shows exactly
   *  the cells in `revealedCells` and ignores tokens entirely. */
  fogMode: 'dynamic' | 'manual';
  /** v2.664.0 — [row, col] pairs the DM has painted as revealed. Read
   *  only in manual mode. */
  revealedCells: Array<[number, number]>;
}) {
  const { viewport, worldWidth, worldHeight, gridSizePx, isDM, visionOriginCharacterIds, darkvisionByCharacterId, dmPreviewFog, ambientLight, fogMode, revealedCells } = props;
  // v2.267.0 — effective "should this layer render fog" check. When
  // the DM has enabled Player View preview, treat them like a player
  // for the purposes of mounting + recomputing the fog texture. The
  // DM's own walls + tokens still render normally on top.
  // v2.274.0 — also gated by ambientLight: 'bright' means "no fog at
  // all" so the layer never mounts, regardless of player/DM identity.
  // This is the daylight/outdoor case — players see the whole map.
  const fogActive = ambientLight !== 'bright' && (!isDM || !!dmPreviewFog);
  const tokens = useBattleMapStore(s => s.tokens);
  const walls = useBattleMapStore(s => s.walls);
  const { app } = useApplication();

  // Derive matching token IDs from characterIds. Stable string for
  // useEffect dependency tracking — recomputes only when set changes.
  const visionOriginTokenIds = useMemo(() => {
    const want = new Set(visionOriginCharacterIds);
    const ids: string[] = [];
    for (const t of Object.values(tokens)) {
      if (t.characterId && want.has(t.characterId)) ids.push(t.id);
    }
    // Stable sort so the join key is deterministic.
    ids.sort();
    return ids;
  }, [tokens, visionOriginCharacterIds]);
  const visionOriginKey = visionOriginTokenIds.join('|');

  // RenderTexture + display Sprite + fog Container — all created once
  // and reused. The Container is a scratch space we render INTO the
  // RenderTexture every recompute; it never gets added to the viewport
  // tree directly.
  const rtRef = useRef<RenderTexture | null>(null);
  const fogSpriteRef = useRef<Sprite | null>(null);
  const scratchContainerRef = useRef<Container | null>(null);

  // Mount + teardown. v2.267.0 — was `if (!viewport || isDM) return`;
  // now respects dmPreviewFog so the DM's preview button can mount
  // the fog sprite. Effect re-runs when fogActive flips, so toggling
  // the preview tears down or rebuilds the fog texture cleanly.
  useEffect(() => {
    if (!viewport || !fogActive) return;
    // Create a RenderTexture. We rasterize at world resolution; for
    // very large scenes (4000x4000+) this is memory-heavy and we'd
    // want to downscale, but for typical 30x20 scenes (2100x1400) it
    // fits comfortably in GPU memory (~12MB).
    const rt = RenderTexture.create({
      width: worldWidth,
      height: worldHeight,
      antialias: true,
    });
    const sprite = new Sprite(rt);
    sprite.x = 0;
    sprite.y = 0;
    // v2.332.0 — B2 fix: pointer-transparent overlay.
    //
    // PIXI v8 sprites default to eventMode: 'auto', which means they
    // participate in hit-testing whenever their parent is interactive.
    // Because the fog sprite is a worldWidth × worldHeight rectangle
    // (i.e. it covers EVERY interactive coordinate on the canvas),
    // any pointer-down on a token was hit-testing against the fog
    // FIRST and never reaching the token's drag handler underneath.
    // Symptom: fog renders correctly, but tokens are un-draggable
    // whenever fog is active (DM with dmPreviewFog, or any player).
    //
    // Fog is purely visual — it should be invisible to the event
    // system in every mode. 'none' makes hit-testing skip it entirely
    // so events fall through to the token / wall / ruler layers below.
    sprite.eventMode = 'none';
    // The vision sprite must sit ABOVE walls and tokens (so it can
    // hide them) but NEVER above the ruler. Calling addChild adds it
    // last in the children array = top of stack relative to other
    // viewport children. RulerLayer's children are added on its own
    // mount and we ensure it mounts AFTER VisionLayer in JSX order
    // by render-tree placement.
    viewport.addChild(sprite);
    rtRef.current = rt;
    fogSpriteRef.current = sprite;
    scratchContainerRef.current = new Container();

    return () => {
      if (sprite && !sprite.destroyed) {
        if (!viewport.destroyed) viewport.removeChild(sprite);
        sprite.destroy({ children: false });
      }
      if (rt && !rt.destroyed) rt.destroy(true);
      if (scratchContainerRef.current && !scratchContainerRef.current.destroyed) {
        scratchContainerRef.current.destroy({ children: true });
      }
      rtRef.current = null;
      fogSpriteRef.current = null;
      scratchContainerRef.current = null;
    };
  }, [viewport, worldWidth, worldHeight, fogActive]);

  // v2.342.0 — AoE preview overlay.
  //
  // Subscribes to battleMapStore.aoePreview. When SpellTargetPickerModal
  // (or any future caster surface) sets a center + radius, we draw a
  // translucent ring at the spec'd world position. When it clears the
  // value, we hide the overlay. The single Graphics is mounted once
  // and toggled .visible — same lazy-mount-then-mutate pattern as the
  // turn ring + economy pips.
  //
  // Geometry today: sphere only. Cone/cube/cylinder/line all fall
  // back to the sphere ring at the same radius — matches what
  // findParticipantsInRadius selects, so the visual stays honest with
  // the actual auto-targeting math. When shaped AoE lands, both the
  // selector and this overlay upgrade together.
  //
  // Conversion: gridSizePx pixels = 5ft (D&D standard), so the world-
  // pixel radius for an N-ft sphere is `(N / 5) * gridSizePx`.
  const aoePreview = useBattleMapStore(s => s.aoePreview);
  const aoeRingRef = useRef<Graphics | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const ring = new Graphics();
    ring.eventMode = 'none';
    ring.visible = false;
    viewport.addChild(ring);
    aoeRingRef.current = ring;
    return () => {
      try {
        if (ring.parent && !viewport.destroyed) viewport.removeChild(ring);
        if (!ring.destroyed) ring.destroy();
      } catch { /* viewport torn down — safe to ignore */ }
      aoeRingRef.current = null;
    };
  }, [viewport]);

  useEffect(() => {
    const ring = aoeRingRef.current;
    if (!ring || ring.destroyed) return;
    if (!aoePreview) {
      ring.visible = false;
      return;
    }
    const radiusPx = (aoePreview.sizeFt / 5) * gridSizePx;
    ring.clear();

    const FILL_COLOR = 0xfde68a;
    const FILL_ALPHA = 0.10;
    const STROKE_COLOR = 0xfbbf24;
    const STROKE_WIDTH = 2;
    const STROKE_ALPHA = 0.95;
    const INNER_DOT_ALPHA = 0.8;

    const cx = aoePreview.centerWorldX;
    const cy = aoePreview.centerWorldY;
    const shape = aoePreview.shape;

    // v2.343.0 — shape-aware geometry. The selection logic in
    // findParticipantsInArea is the source of truth; we mirror its
    // shape model here so the visual matches the actual auto-target
    // result. Both upgrade together when shape definitions change.
    if (shape === 'sphere' || shape === 'cylinder') {
      // Circle. radiusPx = full radius of the AoE.
      ring.setFillStyle({ color: FILL_COLOR, alpha: FILL_ALPHA });
      ring.circle(cx, cy, radiusPx);
      ring.fill();
      ring.setStrokeStyle({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
      ring.circle(cx, cy, radiusPx);
      ring.stroke();
    } else if (shape === 'cube') {
      // Square centered on the origin cell. sizeFt is the edge length;
      // half each side from center. Snapping the rect to whole cells
      // would be slightly more accurate but the visual already lines
      // up well enough with the selection at typical zoom levels.
      const halfPx = radiusPx; // sizeFt/5 * gridSizePx — already half-edge in cells
      // Cube: full edge in feet. Selection uses Math.floor(sizeFt/5)
      // cells; reflect that exactly so visual = selection.
      const sizeCells = Math.floor(aoePreview.sizeFt / 5);
      const half = Math.floor(sizeCells / 2);
      const minX = (cx - (half + 0.5) * gridSizePx);
      const minY = (cy - (half + 0.5) * gridSizePx);
      const widthPx = sizeCells * gridSizePx;
      ring.setFillStyle({ color: FILL_COLOR, alpha: FILL_ALPHA });
      ring.rect(minX, minY, widthPx, widthPx);
      ring.fill();
      ring.setStrokeStyle({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
      ring.rect(minX, minY, widthPx, widthPx);
      ring.stroke();
      void halfPx; // silence: used only by sphere; kept readable above
    } else if (shape === 'cone') {
      // Triangular wedge from apex (caster's footprint center) toward
      // the target direction. v2.451.0 — RAW 5e cone: apex angle
      // 2 × atan(0.5) = 53.13°. Half-width at distance d = d / 2, so
      // at the far edge half-width = lengthPx / 2 (cone is as wide
      // as it is long at full reach). Pre-v2.451 used 90° (half-width
      // = forward), which over-selected by ~38% area; tightened here
      // and in coneGeometry.findParticipantsInCone together so visual
      // = selection still holds.
      const dx = (aoePreview.directionWorldX ?? cx) - cx;
      const dy = (aoePreview.directionWorldY ?? cy) - cy;
      const dirLen = Math.sqrt(dx * dx + dy * dy);
      if (dirLen > 1e-3) {
        const ndx = dx / dirLen;
        const ndy = dy / dirLen;
        // Perpendicular (rotated 90°)
        const px = -ndy;
        const py = ndx;
        // Far edge at distance = radiusPx (length in pixels).
        // Half-width at far edge = radiusPx / 2 (RAW 53.13°).
        const halfFarPx = radiusPx / 2;
        const farX = cx + ndx * radiusPx;
        const farY = cy + ndy * radiusPx;
        const cornerLeftX = farX + px * halfFarPx;
        const cornerLeftY = farY + py * halfFarPx;
        const cornerRightX = farX - px * halfFarPx;
        const cornerRightY = farY - py * halfFarPx;
        ring.setFillStyle({ color: FILL_COLOR, alpha: FILL_ALPHA });
        ring.poly([
          cx, cy,
          cornerLeftX, cornerLeftY,
          cornerRightX, cornerRightY,
        ]);
        ring.fill();
        ring.setStrokeStyle({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
        ring.poly([
          cx, cy,
          cornerLeftX, cornerLeftY,
          cornerRightX, cornerRightY,
        ]);
        ring.stroke();
      }
    } else if (shape === 'line') {
      // Thick rectangle from origin (caster) toward direction target,
      // length = radiusPx, width = aoePreview.widthFt (5ft default per
      // RAW for every dragon breath line). The line is drawn as a
      // 4-vertex polygon hugging both sides of the path. v2.450.0
      // upgraded width from a hardcoded 1 cell to data-driven so the
      // visual matches whatever lineGeometry.findParticipantsInLine
      // selects against — both read the same widthFt.
      const dx = (aoePreview.directionWorldX ?? cx) - cx;
      const dy = (aoePreview.directionWorldY ?? cy) - cy;
      const dirLen = Math.sqrt(dx * dx + dy * dy);
      if (dirLen > 1e-3) {
        const ndx = dx / dirLen;
        const ndy = dy / dirLen;
        const px = -ndy;
        const py = ndx;
        const widthFt = aoePreview.widthFt ?? 5;
        const halfWidthPx = (widthFt / 5) * gridSizePx / 2;
        const farX = cx + ndx * radiusPx;
        const farY = cy + ndy * radiusPx;
        ring.setFillStyle({ color: FILL_COLOR, alpha: FILL_ALPHA });
        ring.poly([
          cx + px * halfWidthPx,    cy + py * halfWidthPx,
          farX + px * halfWidthPx,  farY + py * halfWidthPx,
          farX - px * halfWidthPx,  farY - py * halfWidthPx,
          cx - px * halfWidthPx,    cy - py * halfWidthPx,
        ]);
        ring.fill();
        ring.setStrokeStyle({ color: STROKE_COLOR, width: STROKE_WIDTH, alpha: STROKE_ALPHA });
        ring.poly([
          cx + px * halfWidthPx,    cy + py * halfWidthPx,
          farX + px * halfWidthPx,  farY + py * halfWidthPx,
          farX - px * halfWidthPx,  farY - py * halfWidthPx,
          cx - px * halfWidthPx,    cy - py * halfWidthPx,
        ]);
        ring.stroke();
      }
    }

    // Inner small ring marks the precise origin cell — common to all
    // shapes so the player can locate the apex/center at a glance.
    ring.setStrokeStyle({ color: STROKE_COLOR, width: 1.5, alpha: INNER_DOT_ALPHA });
    ring.circle(cx, cy, gridSizePx * 0.5);
    ring.stroke();
    ring.visible = true;
  }, [aoePreview, gridSizePx]);

  // v2.469.0 — Reach visualization overlay extracted to a dedicated
  // ReachOverlayLayer component (defined below this function). It was
  // previously hosted here in VisionLayer, which conflated a melee-
  // hover preview with fog/vision rendering. The extracted layer is
  // mounted unconditionally in the JSX tree alongside VisionLayer so
  // its lifetime is independent of any vision/fog state.

  // v2.344.0 — single-target spell range overlay.
  //
  // Reads battleMapStore.rangePreview. When the spell picker is open
  // for a non-AoE spell with a numeric range, the picker writes the
  // caster's position + range to the store; this effect draws a
  // dashed cyan circle around the caster's token marking the reach
  // boundary. Distinct visually from the gold AoE ring (which uses
  // solid stroke + translucent fill) so the two read differently
  // when both are active simultaneously — e.g. Spirit Guardians
  // (Self emanation: AoE ring) cast with a 30ft range still shows
  // the caster's general targeting reach as a separate concept.
  //
  // Color: cyan (0x60a5fa) — the same hue used elsewhere for
  // informational/reach UI (cover indicators, etc.). Distinct from
  // the gold AoE ring (selection / damage area) and from the
  // green/amber/red drag preview (movement budget).
  //
  // Special-range spells (Self, Sight, Unlimited) skip the overlay —
  // the picker pushes null in those cases, so we just hide.
  const rangePreview = useBattleMapStore(s => s.rangePreview);
  const rangeRingRef = useRef<Graphics | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const ring = new Graphics();
    ring.eventMode = 'none';
    ring.visible = false;
    viewport.addChild(ring);
    rangeRingRef.current = ring;
    return () => {
      try {
        if (ring.parent && !viewport.destroyed) viewport.removeChild(ring);
        if (!ring.destroyed) ring.destroy();
      } catch { /* viewport torn down */ }
      rangeRingRef.current = null;
    };
  }, [viewport]);

  useEffect(() => {
    const ring = rangeRingRef.current;
    if (!ring || ring.destroyed) return;
    if (!rangePreview || rangePreview.rangeFt <= 0) {
      ring.visible = false;
      return;
    }
    const radiusPx = (rangePreview.rangeFt / 5) * gridSizePx;
    ring.clear();
    // Dashed cyan stroke. PIXI v8 has no native dashed-circle helper,
    // so we segment the perimeter into ~24 arcs with alternating
    // visibility — same trick as the v2.340 drag-preview path. At
    // typical zoom this reads as a tasteful broken ring.
    const SEGMENTS = 48;
    const ON = 2;   // arcs drawn
    const OFF = 1;  // arcs skipped
    ring.setStrokeStyle({ color: 0x60a5fa, width: 2, alpha: 0.75 });
    for (let i = 0; i < SEGMENTS; i++) {
      const cycle = i % (ON + OFF);
      if (cycle >= ON) continue;
      const a0 = (i / SEGMENTS) * Math.PI * 2;
      const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
      const x0 = rangePreview.centerWorldX + Math.cos(a0) * radiusPx;
      const y0 = rangePreview.centerWorldY + Math.sin(a0) * radiusPx;
      const x1 = rangePreview.centerWorldX + Math.cos(a1) * radiusPx;
      const y1 = rangePreview.centerWorldY + Math.sin(a1) * radiusPx;
      ring.moveTo(x0, y0);
      ring.lineTo(x1, y1);
    }
    ring.stroke();
    ring.visible = true;
  }, [rangePreview, gridSizePx]);

  // Recompute fog whenever inputs change. We rebuild the scratch
  // container, render it to the RT, and let the sprite redisplay.
  // v2.267.0 — gate is fogActive (was isDM) so the DM's preview also
  // recomputes when walls or tokens move while preview is on.
  useEffect(() => {
    if (!fogActive) return;
    const rt = rtRef.current;
    const scratch = scratchContainerRef.current;
    if (!rt || !scratch || !app?.renderer) return;

    // Clear scratch and rebuild from scratch every recompute. For
    // scene/world scale this is cheap (a few Graphics instances).
    scratch.removeChildren().forEach(child => {
      if (!(child as any).destroyed) (child as any).destroy({ children: true });
    });

    // v2.267.0 — guard for the DM-preview case: if the DM toggles
    // Player View on but no PC tokens exist on the scene, there's
    // no vision origin to compute from. Rendering a solid-black fog
    // would be misleading ("preview is broken!" / "the map turned
    // black"). For DM preview, render a clear texture so the DM can
    // see the map and understand they need PC tokens for the preview
    // to be meaningful. For real player views, keep the solid fog —
    // a player who can't see anything because their character isn't
    // placed is the correct semantic state, not a UX bug.
    // v2.664.0 — the DM-preview escape hatch below is a DYNAMIC-mode
    // concern only. In manual mode "no PC tokens" is irrelevant: the
    // reveals are painted, not derived, so there is something to show
    // either way and clearing the texture would wrongly reveal the map.
    if (fogMode === 'dynamic' && isDM && dmPreviewFog && visionOriginTokenIds.length === 0) {
      app.renderer.render({ container: scratch, target: rt, clear: true });
      return;
    }

    // 1. Dark fog fill covering the entire world.
    // v2.274.0 — alpha varies with ambientLight:
    //   - 'dark' (default, current behavior): full opaque (alpha 1).
    //     Outside vision polygons = pure black.
    //   - 'dim' : translucent (alpha ~0.55). The map shows through but
    //     muted, and the vision polygons still cut clear holes for the
    //     player's actual sight cone. Reads as "twilight / mood".
    //   - 'bright' : we'd never reach here because the fogActive gate
    //     already returned early. Defensive fallback to 'dark' alpha
    //     just in case the gate logic changes.
    const fogAlpha = ambientLight === 'dim' ? 0.55 : 1;
    const fog = new Graphics();
    fog.rect(0, 0, worldWidth, worldHeight);
    fog.fill({ color: 0x0a0c10, alpha: fogAlpha });
    scratch.addChild(fog);

    // v2.664.0 — MANUAL MODE. Reveals are painted, not derived: erase a
    // rectangle per revealed cell and stop. Tokens, walls, darkvision
    // and carried light are all deliberately ignored here — the whole
    // point of the mode is that the DM decides, and a cell stays
    // revealed once shown even after the party walks away.
    if (fogMode === 'manual') {
      const revealed = parseRevealedCells(revealedCells);
      if (revealed.size > 0) {
        const holes = new Graphics();
        for (const key of revealed) {
          const [row, col] = key.split(',').map(Number);
          holes.rect(col * gridSizePx, row * gridSizePx, gridSizePx, gridSizePx);
        }
        // One fill for every cell: the rects are batched into a single
        // draw, so a fully-painted 30x20 map costs one call, not 600.
        holes.fill({ color: 0xffffff, alpha: 1 });
        holes.blendMode = 'erase';
        scratch.addChild(holes);
      }
      app.renderer.render({ container: scratch, target: rt, clear: true });
      return;
    }

    // 2. For each origin token, compute polygon and draw with erase
    //    blend mode to cut a hole in the fog.
    // v2.271.0 — open doors ('open' doorState) don't block sight,
    // mirroring the same rule the movement-collision check uses. A
    // door that's been opened by the DM creates a vision corridor.
    // Closed doors (doorState === 'closed') and solid walls
    // (doorState === null) both block normally.
    const sightWalls: WallSegment[] = [];
    for (const w of Object.values(walls)) {
      if (!w.blocksSight) continue;
      if (w.doorState === 'open') continue;
      // v2.662.0 — material decides transparency. Before this every wall
      // was opaque to vision, so an arrow slit fogged the room exactly
      // like a stone wall. Windows and low walls now let sight through
      // while still contributing their cover (that path reads
      // `blocksSight` directly and is untouched — a window giving ¾
      // cover to someone you can plainly see is correct, not a bug).
      if (!wallMaterialBlocksSight(w.wallType)) continue;
      sightWalls.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
    }
    // v2.663.0 — per-token sight radius, closing the v2.226 TODO. This
    // was `12 * gridSizePx` — a flat 60 ft for every creature — which
    // made darkvision decorative.
    //
    // Unlimited (bright/dim) is clamped to the world diagonal: that is
    // the furthest two points on the map can be, so it bounds the ray
    // cast without ever cutting the polygon short.
    const unlimitedPx = Math.hypot(worldWidth, worldHeight);

    for (const tokenId of visionOriginTokenIds) {
      const t = tokens[tokenId];
      if (!t) continue;
      const darkvisionFt = t.characterId
        ? (darkvisionByCharacterId[t.characterId] ?? 0)
        : 0;
      const radiusPx = sightRadiusPx(
        ambientLight, darkvisionFt, t.lightRadiusFt ?? 0, gridSizePx,
      );
      // 0 = genuinely blind (dark scene, no darkvision, no light). Skip
      // it rather than drawing a zero-radius polygon: this creature
      // contributes nothing to what the party can see, which is the
      // point. Someone else's torch still reveals the room for everyone,
      // since the fog is a union over all origins.
      if (radiusPx === 0) continue;
      const polygon = computeVisibilityPolygon(
        t.x, t.y, sightWalls, radiusPx ?? unlimitedPx, 180,
      );
      if (polygon.length < 6) continue; // need at least 3 points to form a polygon
      const lightGfx = new Graphics();
      lightGfx.poly(polygon);
      lightGfx.fill({ color: 0xffffff, alpha: 1 });
      // 'erase' blend = destination-out. The white polygon erases
      // alpha from the fog beneath it, leaving a transparent hole.
      lightGfx.blendMode = 'erase';
      scratch.addChild(lightGfx);
    }

    // v2.665.0 — STANDALONE LIGHT SOURCES.
    //
    // Any token carrying a light illuminates its surroundings, not just
    // the PCs who set a torch on themselves. A DM drops a token, names
    // it "Brazier", sets Light → Torch, and the area lights up.
    //
    // Deliberately no `scene_lights` table: a light source is a thing at
    // a position on the map that can be placed, moved, hidden, deleted
    // and synced — which is the entire definition of a token. A parallel
    // entity would have meant duplicating placement, realtime, RLS and
    // the context menu to gain nothing.
    //
    // Gated on line of sight to the source, or a brazier anywhere would
    // light its room for the party permanently regardless of where they
    // stand. `visibleLightSources` documents the approximation.
    const viewers = visionOriginTokenIds
      .map(id => tokens[id])
      .filter(Boolean)
      .map(t => ({ x: t.x, y: t.y }));
    const emitters = Object.values(tokens)
      // A PC's own carried light already shaped their sight radius
      // above; re-emitting it here would double-draw the same disc.
      .filter(t => (t.lightRadiusFt ?? 0) > 0 && !visionOriginTokenIds.includes(t.id))
      .map(t => ({ id: t.id, x: t.x, y: t.y, radiusFt: t.lightRadiusFt ?? 0 }));

    for (const src of visibleLightSources(viewers, emitters, sightWalls)) {
      const radiusPx = (src.radiusFt / FEET_PER_SQUARE) * gridSizePx;
      const polygon = computeVisibilityPolygon(src.x, src.y, sightWalls, radiusPx, 180);
      if (polygon.length < 6) continue;
      const lit = new Graphics();
      lit.poly(polygon);
      lit.fill({ color: 0xffffff, alpha: 1 });
      lit.blendMode = 'erase';
      scratch.addChild(lit);
    }

    // 3. Render the scratch container to our RenderTexture.
    app.renderer.render({ container: scratch, target: rt, clear: true });
  }, [tokens, walls, visionOriginKey, visionOriginTokenIds, darkvisionByCharacterId, worldWidth, worldHeight, gridSizePx, fogActive, isDM, dmPreviewFog, ambientLight, fogMode, revealedCells, app]);

  return null;
}
