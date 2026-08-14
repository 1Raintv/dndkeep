// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 2).
// See that file's header changelog for this code's full history.

import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useApplication } from '@pixi/react';
import { useEffect, useMemo, useRef } from 'react';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import { computeVisibilityPolygon, type WallSegment } from '../../../lib/vision/visibilityPolygon';
import { wallMaterialBlocksSight } from '../../../rules/cover';
import { sightBandsPx, visibleLightSources, lightBandsFt, feetToPx } from '../../../rules/vision';
import {
  parseRevealedCells, cellsInPolygon, fogCellKey, serialiseRevealedCells,
} from '../../../rules/manualFog';
import * as scenesApi from '../../../lib/api/scenes';

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
   *  the cells in `revealedCells` and ignores tokens entirely.
   *
   *  v2.669.0 — 'remembered' renders the dynamic tiers exactly as
   *  'dynamic' does, and additionally draws the WALL LAYOUT of anywhere
   *  the party has been over otherwise-solid fog. */
  fogMode: 'dynamic' | 'manual' | 'remembered';
  /** v2.664.0 — [row, col] pairs the DM has painted as revealed. Read
   *  in manual mode, and in remembered mode as cells the DM has decided
   *  the party knows about. */
  revealedCells: Array<[number, number]>;
  /** v2.669.0 — [row, col] pairs the party has ever been able to see.
   *  Read only in remembered mode. */
  exploredCells: Array<[number, number]>;
  /** v2.669.0 — needed to record newly-explored cells. Null disables
   *  accumulation (the memory still renders from what is already
   *  stored). */
  sceneId: string | null;
  /** v2.669.0 — cells wide/high, to bound the cell scan. */
  widthCells: number;
  heightCells: number;
}) {
  const { viewport, worldWidth, worldHeight, gridSizePx, isDM, visionOriginCharacterIds, darkvisionByCharacterId, dmPreviewFog, ambientLight, fogMode, revealedCells, exploredCells, sceneId, widthCells, heightCells } = props;
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
  // v2.666.0 — a second, off-screen RenderTexture holding the union of
  // every DIM region before it is composited onto the fog. See the
  // compositing comment in the recompute effect for why the dim tier
  // cannot be drawn straight onto the fog like the bright tier can.
  const dimRtRef = useRef<RenderTexture | null>(null);
  // v2.668.0 — coloured light. A separate container UNDER the fog sprite
  // holding one additive polygon per tinted light. It cannot live in the
  // fog texture: that texture is an alpha mask being erased, so colour
  // painted where alpha reached 0 would be invisible by construction.
  //
  // Under the fog rather than over it is what makes this safe without a
  // second visibility gate: a tint that falls in an unseen region is
  // simply covered by opaque fog, and one in a dim region shows through
  // at the dim tier's residual alpha. The tint grades itself.
  const tintContainerRef = useRef<Container | null>(null);
  const tintRootRef = useRef<Container | null>(null);
  // v2.669.0 — remembered terrain. This container sits ABOVE the fog
  // sprite, and the fog under a remembered cell is never erased. That
  // ordering is the whole safety argument: tokens render BENEATH the
  // fog, so a remembered room shows its wall layout and cannot show the
  // goblin that wandered into it after the party left.
  const memoryRootRef = useRef<Container | null>(null);
  const memoryMaskRef = useRef<Graphics | null>(null);
  const memoryWallsRef = useRef<Graphics | null>(null);
  /** What THIS client has observed since the last scene change, which is
   *  ahead of the server between a sighting and its write landing. Kept
   *  separate from the props rather than merged into one growing set, so
   *  that a DM un-painting a manual reveal actually takes effect instead
   *  of being remembered forever by whoever had it in memory. */
  const localSeenRef = useRef<Set<string>>(new Set());
  /** Newly-seen cells waiting to be written, and the timer that will
   *  write them. Batched because the recompute fires on every token
   *  move and a write per step would be a write per footfall. */
  const pendingExploreRef = useRef<Set<string>>(new Set());
  const exploreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // v2.666.0 — same dimensions, never added to the display tree: it is
    // a scratch surface the dim-tier union is flattened into.
    const dimRt = RenderTexture.create({
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
    // v2.668.0 — ORDER MATTERS. addChild appends, so the tint container
    // added first sits BELOW the fog sprite. Reverse these two and every
    // coloured light glows straight through solid fog.
    //
    // MASKED TO THE WORLD RECT. A light near the map edge throws a
    // polygon past it, and past it there is no fog to attenuate the
    // tint — a torch by the west wall painted a bright orange smear
    // across the empty page outside the map. The fog covers exactly the
    // world rect, so the tint has to as well.
    //
    // Two containers because the mask must stay in the display tree
    // while the tinted polygons are cleared and rebuilt every recompute:
    // `tintRoot` owns the mask, `tintLayer` is the part that gets wiped.
    const tintRoot = new Container();
    tintRoot.eventMode = 'none';
    const tintMask = new Graphics();
    tintMask.rect(0, 0, worldWidth, worldHeight);
    tintMask.fill({ color: 0xffffff, alpha: 1 });
    tintRoot.addChild(tintMask);
    tintRoot.mask = tintMask;
    const tintLayer = new Container();
    tintRoot.addChild(tintLayer);
    viewport.addChild(tintRoot);
    viewport.addChild(sprite);

    // v2.669.0 — memory overlay, ABOVE the fog sprite (see the ref's
    // comment for why that ordering is what keeps tokens hidden). Masked
    // to the remembered cells, which are rebuilt each recompute.
    const memoryRoot = new Container();
    memoryRoot.eventMode = 'none';
    memoryRoot.visible = false;
    const memoryMask = new Graphics();
    const memoryWalls = new Graphics();
    memoryRoot.addChild(memoryMask);
    memoryRoot.addChild(memoryWalls);
    memoryRoot.mask = memoryMask;
    viewport.addChild(memoryRoot);

    rtRef.current = rt;
    dimRtRef.current = dimRt;
    tintContainerRef.current = tintLayer;
    tintRootRef.current = tintRoot;
    memoryRootRef.current = memoryRoot;
    memoryMaskRef.current = memoryMask;
    memoryWallsRef.current = memoryWalls;
    fogSpriteRef.current = sprite;
    scratchContainerRef.current = new Container();

    return () => {
      if (sprite && !sprite.destroyed) {
        if (!viewport.destroyed) viewport.removeChild(sprite);
        sprite.destroy({ children: false });
      }
      if (tintRoot && !tintRoot.destroyed) {
        if (!viewport.destroyed) viewport.removeChild(tintRoot);
        // Drop the mask reference before destroying, or Pixi keeps a
        // handle to a destroyed Graphics on the next render pass.
        tintRoot.mask = null;
        tintRoot.destroy({ children: true });
      }
      if (memoryRoot && !memoryRoot.destroyed) {
        if (!viewport.destroyed) viewport.removeChild(memoryRoot);
        memoryRoot.mask = null;
        memoryRoot.destroy({ children: true });
      }
      if (rt && !rt.destroyed) rt.destroy(true);
      if (dimRt && !dimRt.destroyed) dimRt.destroy(true);
      if (scratchContainerRef.current && !scratchContainerRef.current.destroyed) {
        scratchContainerRef.current.destroy({ children: true });
      }
      rtRef.current = null;
      dimRtRef.current = null;
      tintContainerRef.current = null;
      tintRootRef.current = null;
      memoryRootRef.current = null;
      memoryMaskRef.current = null;
      memoryWallsRef.current = null;
      fogSpriteRef.current = null;
      scratchContainerRef.current = null;
    };
  }, [viewport, worldWidth, worldHeight, fogActive]);

  // v2.669.0 — one scene's exploration must not bleed into the next.
  // The refs outlive a scene switch (the layer itself does not remount
  // for it), so they are cleared explicitly. Any pending batch is
  // dropped rather than flushed: it belongs to the scene being left, and
  // writing it against the new sceneId would explore the wrong map.
  useEffect(() => {
    localSeenRef.current = new Set();
    pendingExploreRef.current = new Set();
    if (exploreTimerRef.current) {
      clearTimeout(exploreTimerRef.current);
      exploreTimerRef.current = null;
    }
  }, [sceneId]);

  // Never leave a timer behind on unmount — it would fire against a
  // scene the user has navigated away from.
  useEffect(() => () => {
    if (exploreTimerRef.current) {
      clearTimeout(exploreTimerRef.current);
      exploreTimerRef.current = null;
    }
  }, []);

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
    const dimRt = dimRtRef.current;
    const scratch = scratchContainerRef.current;
    if (!rt || !scratch || !app?.renderer) return;

    // Clear scratch and rebuild from scratch every recompute. For
    // scene/world scale this is cheap (a few Graphics instances).
    scratch.removeChildren().forEach(child => {
      if (!(child as any).destroyed) (child as any).destroy({ children: true });
    });

    // v2.668.0 — clear the tint HERE, above the early returns, not beside
    // the code that refills it. Manual mode and the DM-preview escape
    // hatch both bail out before the dynamic pass, and a clear that lived
    // down there would leave a deleted brazier's glow burning on the map
    // the moment the DM switched the scene to manual fog.
    const tintContainer = tintContainerRef.current;
    if (tintContainer && !tintContainer.destroyed) {
      tintContainer.removeChildren().forEach(child => {
        if (!(child as Container).destroyed) (child as Container).destroy({ children: true });
      });
    }
    // v2.669.0 — and hide the memory overlay for the same reason. Only
    // the remembered branch below turns it back on, so switching a scene
    // to dynamic or manual cannot leave an automap stranded on top.
    const memoryRoot = memoryRootRef.current;
    if (memoryRoot && !memoryRoot.destroyed) memoryRoot.visible = false;

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
    //
    // v2.666.0 — TWO TIERS. Polygons are collected into `brightPolys`
    // and `dimPolys` rather than erased as they are computed, because
    // the two tiers composite differently (see step 4).
    //   bright — fog erased completely. You see normally.
    //   dim    — fog erased most of the way, leaving a murk. You can
    //            navigate and fight; you are lightly obscured.
    // Only a DARK scene grades sight this way. In a dim-ambient scene
    // sight is unlimited and the 0.55 ambient veil already carries the
    // gloom, so everything visible lands in the bright tier and the
    // scene looks exactly as it did before this ship.
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

    const brightPolys: number[][] = [];
    const dimPolys: number[][] = [];
    // v2.668.0 — polygons that carry a colour, paired with the alpha
    // their tier tints at. Collected alongside the fog work so a light's
    // shape is ray-cast ONCE and reused, rather than recomputed by a
    // separate tint pass.
    const tintPolys: Array<{ polygon: number[]; color: number; alpha: number }> = [];
    /** Cast a visibility polygon and file it under a tier. Polygons with
     *  fewer than 3 points cannot be filled, so they are dropped here
     *  once rather than checked at every call site. Returns the polygon
     *  so callers can also tint it. */
    const collect = (
      into: number[][],
      x: number, y: number, radiusPx: number,
      tint?: { color: number | null | undefined; alpha: number },
    ): number[] | null => {
      if (!(radiusPx > 0)) return null;
      const polygon = computeVisibilityPolygon(x, y, sightWalls, radiusPx, 180);
      if (polygon.length < 6) return null;
      into.push(polygon);
      if (tint && tint.color != null) {
        tintPolys.push({ polygon, color: tint.color, alpha: tint.alpha });
      }
      return polygon;
    };
    // Additive, so overlapping lights genuinely add up — which is how
    // light behaves and the opposite of the dim tier's union (where
    // overlap must NOT compound; see the compositing note below).
    // The bright polygon is drawn ON TOP of the dim one, so the core
    // ends up at the sum (~0.16). Kept low deliberately: the first pass
    // at 0.16/0.09 stacked to 0.25 and the map art underneath stopped
    // being readable, which defeats the point of lighting it at all.
    const TINT_BRIGHT_ALPHA = 0.10;
    const TINT_DIM_ALPHA = 0.06;

    for (const tokenId of visionOriginTokenIds) {
      const t = tokens[tokenId];
      if (!t) continue;
      const darkvisionFt = t.characterId
        ? (darkvisionByCharacterId[t.characterId] ?? 0)
        : 0;
      const bands = sightBandsPx(
        ambientLight, darkvisionFt, t.lightRadiusFt ?? 0, gridSizePx,
      );
      if (bands === null) {
        // Unlimited (bright or dim ambient), clamped to the world
        // diagonal: that is the furthest two points on the map can be,
        // so it bounds the ray cast without ever cutting the polygon
        // short. All of it is bright-tier.
        collect(brightPolys, t.x, t.y, unlimitedPx);
        // A carried lamp still tints its own radius here — the sight is
        // unlimited because the room is lit, but the lantern is orange
        // regardless. Tinting the unlimited SIGHT polygon instead would
        // wash the entire map in one torch's colour.
        collect(
          [], t.x, t.y, feetToPx(lightBandsFt(t.lightRadiusFt ?? 0).dimFt, gridSizePx),
          { color: t.lightColor, alpha: TINT_DIM_ALPHA },
        );
        continue;
      }
      // dimPx 0 = genuinely blind (dark scene, no darkvision, no light).
      // Skip rather than drawing a zero-radius polygon: this creature
      // contributes nothing to what the party can see, which is the
      // point. Someone else's torch still reveals the room for everyone,
      // since the fog is a union over all origins.
      collect(dimPolys, t.x, t.y, bands.dimPx);
      // A Dwarf's own torch is genuinely bright out to 20 ft even though
      // darkvision carries the outer edge to 60 — the two tiers are
      // independent radii, not a subdivision of one.
      collect(brightPolys, t.x, t.y, bands.brightPx,
        { color: t.lightColor, alpha: TINT_BRIGHT_ALPHA });
      // v2.668.0 — the dim TINT follows the lamp, not the sight radius.
      // A Dwarf with a green lantern sees 60 ft by darkvision, but only
      // the lantern's 40 ft is green; darkvision has no colour.
      collect(
        [], t.x, t.y, feetToPx(lightBandsFt(t.lightRadiusFt ?? 0).dimFt, gridSizePx),
        { color: t.lightColor, alpha: TINT_DIM_ALPHA },
      );
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
      .map(t => ({
        id: t.id, x: t.x, y: t.y, radiusFt: t.lightRadiusFt ?? 0,
        color: t.lightColor,
      }));

    for (const src of visibleLightSources(viewers, emitters, sightWalls)) {
      const bands = lightBandsFt(src.radiusFt);
      const color = src.color;
      if (ambientLight === 'dark') {
        collect(dimPolys, src.x, src.y, feetToPx(bands.dimFt, gridSizePx),
          { color, alpha: TINT_DIM_ALPHA });
        collect(brightPolys, src.x, src.y, feetToPx(bands.brightFt, gridSizePx),
          { color, alpha: TINT_BRIGHT_ALPHA });
      } else {
        // Dim ambient: there is no darkness for the outer band to grade
        // against, so the brazier simply lights its full radius.
        collect(brightPolys, src.x, src.y, feetToPx(bands.dimFt, gridSizePx),
          { color, alpha: TINT_DIM_ALPHA });
      }
    }

    // v2.668.0 — refill the tint container (cleared at the top of this
    // effect). Rebuilt wholesale each recompute, same as the fog
    // scratch: a light can move, change colour, be hidden or be deleted,
    // and diffing a handful of Graphics is not worth the bug surface.
    if (tintContainer && !tintContainer.destroyed) {
      for (const { polygon, color, alpha } of tintPolys) {
        const g = new Graphics();
        g.poly(polygon);
        g.fill({ color, alpha });
        // 'add' rather than 'normal': light adds to what is under it, so
        // two lamps overlapping genuinely brighten, and the map art
        // stays legible through the wash instead of being painted over.
        g.blendMode = 'add';
        g.eventMode = 'none';
        tintContainer.addChild(g);
      }
    }

    // 3. Composite the DIM tier — through its own RenderTexture, as one
    //    sprite.
    //
    // 'erase' is destination-out: it MULTIPLIES the destination alpha by
    // (1 - source alpha). Drawing each dim polygon straight onto the fog
    // would therefore compound where they overlap — a party of four
    // Dwarves standing together would erase 0.55 four times over and
    // their shared murk would read brighter than a torch. Flattening the
    // union into `dimRt` first makes overlap idempotent, which is what
    // dim light actually means: two candles do not make bright light.
    //
    // The sprite is rebuilt each recompute and destroyed by the scratch
    // sweep at the top of this effect. That sweep passes `{children:
    // true}` and NOT `{texture: true}`, so `dimRt` survives — do not add
    // texture destruction there without giving this sprite its own
    // lifetime.
    const DIM_TIER_ERASE = 0.55;
    if (dimPolys.length > 0 && dimRt) {
      const dimScratch = new Container();
      for (const polygon of dimPolys) {
        const g = new Graphics();
        g.poly(polygon);
        g.fill({ color: 0xffffff, alpha: 1 });
        dimScratch.addChild(g);
      }
      app.renderer.render({ container: dimScratch, target: dimRt, clear: true });
      dimScratch.destroy({ children: true });
      const dimSprite = new Sprite(dimRt);
      dimSprite.alpha = DIM_TIER_ERASE;
      dimSprite.blendMode = 'erase';
      scratch.addChild(dimSprite);
    }

    // 4. Composite the BRIGHT tier. Alpha 1 erases completely, so
    //    overlap is already idempotent and these go on directly.
    for (const polygon of brightPolys) {
      const lightGfx = new Graphics();
      lightGfx.poly(polygon);
      lightGfx.fill({ color: 0xffffff, alpha: 1 });
      // 'erase' blend = destination-out. The white polygon erases
      // alpha from the fog beneath it, leaving a transparent hole.
      lightGfx.blendMode = 'erase';
      scratch.addChild(lightGfx);
    }

    // 5. Render the scratch container to our RenderTexture.
    app.renderer.render({ container: scratch, target: rt, clear: true });

    // 6. v2.669.0 — REMEMBERED TERRAIN.
    //
    // Everything above is unchanged dynamic fog. This adds the memory:
    // cells the party has ever been able to see, minus the ones they can
    // see right now, get their wall layout drawn over solid fog.
    //
    // Note what is NOT done here: the fog over a remembered cell is not
    // erased even slightly. Tokens render beneath the fog, so any erase
    // at all would leak a monster standing in a room the party walked
    // out of. Structure is drawn ON TOP instead — the party remembers
    // the shape of the room, not its current occupants.
    if (fogMode !== 'remembered' || !memoryRoot || memoryRoot.destroyed) return;

    const visibleKeys = new Set<string>();
    for (const polygon of [...brightPolys, ...dimPolys]) {
      for (const c of cellsInPolygon(polygon, gridSizePx, widthCells, heightCells)) {
        visibleKeys.add(fogCellKey(c.row, c.col));
      }
    }

    // What the party knows: the stored memory, plus anything the DM has
    // painted in by hand (remembered mode keeps the ☁ brush working, so
    // "they were told about this wing" is expressible), plus whatever
    // this client has seen since its last write landed.
    const known = new Set<string>();
    for (const key of parseRevealedCells(exploredCells)) known.add(key);
    for (const key of parseRevealedCells(revealedCells)) known.add(key);
    for (const key of localSeenRef.current) known.add(key);

    // Accumulate anything genuinely new into the pending batch.
    for (const key of visibleKeys) {
      if (known.has(key)) continue;
      known.add(key);
      localSeenRef.current.add(key);
      pendingExploreRef.current.add(key);
    }
    if (pendingExploreRef.current.size > 0 && sceneId && !exploreTimerRef.current) {
      // Batched: the recompute fires on every token move, and a write
      // per step would be a write per footfall. Memory is cumulative and
      // add-only, so a dropped batch costs nothing permanent — the next
      // recompute simply sends those cells again.
      exploreTimerRef.current = setTimeout(() => {
        exploreTimerRef.current = null;
        const batch = pendingExploreRef.current;
        if (batch.size === 0) return;
        pendingExploreRef.current = new Set();
        void scenesApi.exploreCells(sceneId, serialiseRevealedCells(batch));
      }, 1200);
    }

    // Remembered = everything known, minus what is visible right now
    // (which the fog tiers above are already showing properly).
    const mask = memoryMaskRef.current;
    const wallsGfx = memoryWallsRef.current;
    if (!mask || mask.destroyed || !wallsGfx || wallsGfx.destroyed) return;
    mask.clear();
    let remembered = 0;
    for (const key of known) {
      if (visibleKeys.has(key)) continue;
      const [row, col] = key.split(',').map(Number);
      mask.rect(col * gridSizePx, row * gridSizePx, gridSizePx, gridSizePx);
      remembered++;
    }
    if (remembered === 0) {
      memoryRoot.visible = false;
      return;
    }
    mask.fill({ color: 0xffffff, alpha: 1 });

    wallsGfx.clear();
    // A faint floor tone so "explored but dark" reads as different from
    // "never been here", which is otherwise identical black.
    wallsGfx.rect(0, 0, worldWidth, worldHeight);
    wallsGfx.fill({ color: 0x8fa3c8, alpha: 0.07 });
    // Every wall, not just the sight-blocking ones: a remembered map is
    // about layout, and a window or a low wall is part of the layout
    // even though it does not stop you seeing through it.
    wallsGfx.setStrokeStyle({ color: 0x9db4dd, width: 2, alpha: 0.5 });
    for (const w of Object.values(walls)) {
      wallsGfx.moveTo(w.x1, w.y1);
      wallsGfx.lineTo(w.x2, w.y2);
    }
    wallsGfx.stroke();
    memoryRoot.visible = true;
  }, [tokens, walls, visionOriginKey, visionOriginTokenIds, darkvisionByCharacterId, worldWidth, worldHeight, gridSizePx, fogActive, isDM, dmPreviewFog, ambientLight, fogMode, revealedCells, exploredCells, sceneId, widthCells, heightCells, app]);

  return null;
}
