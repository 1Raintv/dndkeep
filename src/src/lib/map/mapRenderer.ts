// src/lib/map/mapRenderer.ts
//
// Track 0, step 1 — the RENDERER INTERFACE.
//
// This is the seam that lets multiple renderers (the current lightweight
// PixiJS map, a future graphics-rich map, the DOM-based PlayerBattleMap)
// share ONE automation/geometry core instead of forking it.
//
// Design rule: this file has NO runtime dependencies and imports NO renderer
// library (no pixi, no react, no DOM). It is pure types + a documented contract.
// A renderer is any object that fulfills `MapRenderer`. The automation core
// (battleMapGeometry, movement, pathfinding, coneGeometry, lineGeometry,
// wallCollision, automations) already operates on the plain-data shapes below,
// so a conforming renderer inherits every automation for free.
//
// Coordinate systems (make these explicit — Track 0 step 3 will extract the
// conversions into pure functions):
//   - GRID space:  integer row/col cells.
//   - WORLD space:  map-local pixels. Tokens/walls/texts/drawings all live here.
//                   This is the shared space the automation core reasons about.
//   - SCREEN space: device pixels after pan/zoom. Renderer-specific. The ONLY
//                   space that differs between renderers. world→screen is the
//                   renderer's job; everything up to world is shared.

// ─────────────────────────────────────────────────────────────────────────
// Shared scene data (world-space). These mirror the existing store shapes in
// battleMapStore.ts and the automation shapes in battleMapGeometry.ts. They are
// re-declared here as the RENDERER-FACING contract so renderers depend on this
// interface, not on the store (which is how PlayerBattleMap ended up copying
// types "to avoid circular imports"). Keep these structurally compatible with
// battleMapStore's Token/Wall/SceneText/SceneDrawing.
// ─────────────────────────────────────────────────────────────────────────

export type TokenSize =
  | 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

export type DrawingKind = 'pencil' | 'line' | 'rect' | 'circle';

/** A point in world (map-local pixel) space. */
export interface WorldPoint {
  x: number;
  y: number;
}

/** Camera / viewport state the renderer owns. world→screen derives from this. */
export interface Viewport {
  /** World coord at the top-left of the visible area. */
  originX: number;
  originY: number;
  /** Pixels-per-world-unit. 1 = no zoom. */
  zoom: number;
  /** Visible area in screen pixels. */
  widthPx: number;
  heightPx: number;
}

/** Grid definition for the scene. */
export interface GridSpec {
  cols: number;
  rows: number;
  /** World pixels per cell. */
  cellSize: number;
  shape: 'square' | 'hex';
  /** Feet represented by one cell (RAW default 5). */
  feetPerCell: number;
}

/** Renderer-facing token. Structurally a subset of battleMapStore.Token. */
export interface RenderToken {
  id: string;
  /** World pixels (cell corner after snap). */
  x: number;
  y: number;
  size: TokenSize;
  rotation: number;
  name: string;
  color: number; // 0xRRGGBB
  imageStoragePath: string | null;
  /** Identity links — renderer treats as opaque; used to read live state. */
  characterId?: string | null;
  creatureId?: string | null;
  combatantId?: string | null;
  /** DM-only visibility. Renderer decides how to depict (fade / hide). */
  hidden?: boolean;
}

/** Renderer-facing wall. Structurally compatible with battleMapStore.Wall. */
export interface RenderWall {
  id: string;
  x1: number; y1: number; x2: number; y2: number;
  blocksSight: boolean;
  blocksMovement: boolean;
  doorState: 'closed' | 'open' | 'locked' | null;
}

export interface RenderText {
  id: string;
  x: number; y: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface RenderDrawing {
  id: string;
  kind: DrawingKind;
  points: WorldPoint[];
  color: string;
  lineWidth: number;
}

/** Everything a renderer needs to paint one frame. All world-space, plain data. */
export interface RenderScene {
  sceneId: string | null;
  grid: GridSpec;
  backgroundImagePath: string | null;
  tokens: RenderToken[];
  walls: RenderWall[];
  texts: RenderText[];
  drawings: RenderDrawing[];
  /** Optional precomputed vision polygon (world-space points) for fog/lighting. */
  visibilityPolygon?: WorldPoint[] | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Interaction events. Renderers translate raw device input (mouse/touch/pointer)
// into these SEMANTIC, world-space events. The host/controller handles them and
// calls back into the automation core + persistence. This keeps input handling
// renderer-specific while decisions stay shared.
// ─────────────────────────────────────────────────────────────────────────

export type MapInteractionEvent =
  | { type: 'tokenPointerDown'; tokenId: string; world: WorldPoint }
  | { type: 'tokenDragMove'; tokenId: string; world: WorldPoint }
  | { type: 'tokenDragEnd'; tokenId: string; world: WorldPoint }
  | { type: 'canvasPointerDown'; world: WorldPoint }
  | { type: 'canvasPointerMove'; world: WorldPoint }
  | { type: 'canvasPointerUp'; world: WorldPoint }
  | { type: 'viewportChanged'; viewport: Viewport };

/** The controller/host implements this; the renderer calls it. */
export type MapInteractionHandler = (e: MapInteractionEvent) => void;

// ─────────────────────────────────────────────────────────────────────────
// Transient overlays the automation core produces and the renderer must paint:
// AOE templates, reach rings, movement paths, targeting previews. These come
// straight from the pure geometry libs (coneGeometry/lineGeometry/
// battleMapGeometry) as world-space shapes — the renderer only draws them.
// ─────────────────────────────────────────────────────────────────────────

export type MapOverlay =
  | { kind: 'aoeSphere'; center: WorldPoint; radiusPx: number; color: number }
  | { kind: 'aoeCone'; apex: WorldPoint; polygon: WorldPoint[]; color: number }
  | { kind: 'aoeLine'; polygon: WorldPoint[]; color: number }
  | { kind: 'reachRing'; center: WorldPoint; radiusPx: number; color: number }
  | { kind: 'movementPath'; points: WorldPoint[]; color: number }
  | { kind: 'highlightCells'; cells: Array<{ row: number; col: number }>; color: number };

// ─────────────────────────────────────────────────────────────────────────
// THE CONTRACT. A renderer is any object fulfilling this. BattleMapV2's Pixi
// layers, a future WebGL/graphics-rich renderer, and PlayerBattleMap's DOM
// output can each implement it. None of these methods do rules logic — they
// only paint what they're given and report semantic input.
// ─────────────────────────────────────────────────────────────────────────

export interface MapRenderer {
  /** Attach to a host element and allocate rendering resources. */
  mount(container: HTMLElement): void;

  /** Paint (or diff-update to) the given scene. Called on every scene change. */
  renderScene(scene: RenderScene): void;

  /** Paint transient overlays above the scene. Called when overlays change. */
  renderOverlays(overlays: MapOverlay[]): void;

  /** Update camera/pan/zoom. Renderer recomputes world→screen. */
  setViewport(viewport: Viewport): void;

  /** Register the handler the renderer calls with semantic input events. */
  setInteractionHandler(handler: MapInteractionHandler): void;

  /** Convert a screen-space point to world space (renderer owns this math). */
  screenToWorld(screenX: number, screenY: number): WorldPoint;

  /** Convert a world-space point to screen space (renderer owns this math). */
  worldToScreen(world: WorldPoint): { x: number; y: number };

  /** Tear down resources. Called on unmount / renderer swap. */
  destroy(): void;
}

// ─────────────────────────────────────────────────────────────────────────
// What is DELIBERATELY NOT here (stays in the shared automation core, not the
// renderer): hit-testing (findParticipantsInArea), line-of-sight (hasLineOfSight),
// cover (deriveCoverFromWalls), distance (distanceBetweenTokensFt), pathfinding
// (findPath), movement legality (canMove), cone/line footprints. A renderer must
// never reimplement these — it requests them from the libs and paints the result
// as a MapOverlay. This is the rule that keeps both maps' automations identical.
// ─────────────────────────────────────────────────────────────────────────
