// v2.211.0 — Phase Q.1 pt 4: Zustand store for BattleMap V2 token state.
// v2.213.0 — Phase Q.1 pt 6: scene-awareness (currentSceneId, loading,
// bulk hydrate) so BattleMapV2 can load/save tokens to Supabase.
// v2.216.0 — Phase Q.1 pt 9: remoteDragLocks for mid-drag exclusivity
// via Supabase Presence. When another user is dragging a token, we
// refuse to start a local drag on it AND render a visual indicator.
//
// Hydration flow: on scene change BattleMapV2 calls resetForScene(newId)
// → fetches tokens via lib/api/sceneTokens.listTokens → calls
// setTokensBulk with the results. Writes use optimistic local update
// first, then fire-and-forget API call (see BattleMapV2 commit helpers).
//
// Realtime (v2.214 Postgres Changes, v2.216 Broadcast + Presence):
//   - Postgres Changes sync committed token/scene state after drag release
//   - Broadcast streams mid-drag positions at ~20Hz (preview only, no DB)
//   - Presence tracks who's currently dragging what (drag-lock)
//
// Why Zustand over React Context:
//   - Subscribers can select slices without re-rendering on unrelated
//     state changes. Critical when a 30-token scene has one moving.
//   - No provider boilerplate; works as a singleton module import.
//   - <1KB runtime cost vs Redux/RTK, no reducer ceremony.
//
// Schema mirror note: the Token shape here intentionally uses the
// same field names as `scene_tokens` (x, y, size, name, etc.) so the
// future multiplayer layer can serialize in/out with minimal mapping.
// Fields the current renderer doesn't use yet (rotation, image_url,
// z_index) are present so v2.212-215 don't have to migrate the store.

import { create } from 'zustand';


// v2.646 (audit 4.6 slice 3): domain types moved to ../map/mapTypes (pure
// module — lib code imports THAT, not this UI store). Re-exported here so
// the many store-side consumers keep their import paths.
import type { Token, Wall, SceneText, SceneDrawing } from '../map/mapTypes';
export type { Token, TokenSize, Wall, SceneText, SceneDrawing, DrawingKind } from '../map/mapTypes';

interface BattleMapStore {
  tokens: Record<string, Token>;
  /** True iff a token is currently being dragged LOCALLY. Subscribed
   *  to by the viewport so it can temporarily disable plugins like
   *  decelerate during a drag (prevents rubber-band after a fast
   *  release). */
  dragging: string | null;
  /** v2.216: remote drag locks — map of tokenId → userId of whoever
   *  is currently dragging it (via Supabase Presence). Cleared
   *  automatically when the remote client disconnects (Phoenix
   *  Tracker CRDT semantics). Used to:
   *    (a) refuse to initiate a local drag on a remotely-locked token
   *    (b) render a visual "being dragged by someone" indicator
   *  Does NOT include the current user's own drags — those go in
   *  `dragging`. */
  remoteDragLocks: Record<string, string>;
  /** v2.223: wall segments for the current scene. Same hydration
   *  pattern as tokens — listWalls on scene change → setWallsBulk.
   *  Realtime channel echoes inserts/deletes. */
  walls: Record<string, Wall>;
  /** v2.234: text annotations for the current scene. Same hydration
   *  pattern as walls — listTexts on scene change → setTextsBulk.
   *  Realtime channel echoes inserts/updates/deletes. */
  texts: Record<string, SceneText>;
  /** v2.235: drawings (pencil/line/rect/circle) for the current scene.
   *  Drawings are immutable (delete + create, no update); the store
   *  reflects that with addDrawing / removeDrawing only. */
  drawings: Record<string, SceneDrawing>;
  /** v2.213: currently-hydrated scene id. Null means no scene selected. */
  currentSceneId: string | null;
  /** v2.213: true while tokens are being fetched for the current scene. */
  loading: boolean;
  /** v2.342.0 — AoE preview overlay signal (sphere/cone/cube/cylinder).
   *  Set by SpellTargetPickerModal whenever it has both a center
   *  participant + a sized AoE; read by BattleMapV2 which renders a
   *  semi-transparent radius ring at the matching world position so
   *  the caster (and DM) can see the area before confirming the spell.
   *  Cleared on modal close. Null when no preview is active.
   *
   *  centerWorldX/Y are pre-resolved to world pixel coords (the modal
   *  has the position lookup; the map shouldn't have to redo it).
   *  sizeFt is the AoE diameter in feet for sphere, cone length etc.
   *  shape: 'sphere' | 'cone' | 'cube' | 'cylinder' | 'line' — v2.343.0
   *  added cone/cube/line geometries; pre-v2.343 every shape rendered
   *  as a sphere ring of the same size.
   *
   *  v2.343.0 — directionWorldX/Y added for cone + line. Their preview
   *  needs an apex (caster) AND a direction (target). When set, the
   *  renderer draws the shape from `centerWorld*` (apex) toward
   *  `directionWorld*`. Sphere/cylinder/cube ignore the direction
   *  fields and use centerWorld* as the geometric center. */
  aoePreview: {
    centerWorldX: number;
    centerWorldY: number;
    sizeFt: number;
    shape: 'sphere' | 'cone' | 'cube' | 'cylinder' | 'line';
    directionWorldX?: number;
    directionWorldY?: number;
    /** v2.450.0 — Line-shape width in feet. Optional; defaults to 5ft
     *  in the renderer when absent (matches every dragon breath line
     *  in the SRD). Ignored by sphere/cube/cylinder/cone, which read
     *  sizeFt as their single dimension. Plumbing it here keeps the
     *  geometry source-of-truth aligned: data → preview → render →
     *  hit-test (lineGeometry.findParticipantsInLine consumes the
     *  same widthFt) — so a 10ft-wide line displays + selects
     *  identically. */
    widthFt?: number;
  } | null;
  /** v2.456.0 — TOKEN IDs of the would-be-hit tokens for the active
   *  AoE preview shape. Populated by the cone/line picker's hover
   *  subscriber in MonsterActionPanel after running the SAT hit-test;
   *  consumed by the renderer in BattleMapV2 to draw a red highlight
   *  ring around each matching token. Empty when no picker is open or
   *  no targets are in the cone/line. Token IDs (not participant IDs)
   *  because that's what the renderer keys by — the picker does the
   *  participant→token mapping before writing here. */
  aoePreviewTargetTokenIds: string[];
  /** v2.459.0 — Reach visualization. Set when the DM hovers a melee
   *  attack action button; cleared on mouse-leave. Renderer in
   *  BattleMapV2 draws a translucent rectangle covering every cell
   *  within Chebyshev reach of the active token's footprint
   *  (footprint cells are inside the rect; the visible "donut" of
   *  reach extends `reachFt` outward in every direction). Distinct
   *  from aoePreview because reach is a single-token attack envelope
   *  (informational, never targeted) — different visual treatment
   *  (orange/red danger zone, not yellow AOE). */
  reachPreview: {
    centerWorldX: number;     // footprint geometric center
    centerWorldY: number;
    footprintCells: number;   // 1 (Tiny–Medium), 2 (Large), 3 (Huge), 4 (Gargantuan)
    reachFt: number;          // 5, 10, 15, 20...
  } | null;
  /** v2.344.0 — Single-target spell range overlay. Set by the spell
   *  picker for non-AoE spells with a numeric range, drawn by the map
   *  as a faint circle around the caster's token. Distinct from
   *  aoePreview (which represents the spell's AREA OF EFFECT) — the
   *  range overlay represents how far the caster can REACH to apply
   *  the spell to a single target. Both can be active simultaneously
   *  in theory (Self-with-radius spells like Spirit Guardians), in
   *  which case the AoE ring sits inside / around the range ring.
   *
   *  centerWorldX/Y are pre-resolved to caster's token cell center.
   *  rangeFt is the spell's range from the SRD (60ft for Eldritch
   *  Blast, 30ft for Cure Wounds, 120ft for Fireball, etc.). When
   *  null, the renderer skips the overlay (Self / Sight / Special
   *  spells have no usable circle). */
  rangePreview: {
    centerWorldX: number;
    centerWorldY: number;
    rangeFt: number;
  } | null;
  /** v2.345.0 — Free-aim direction picker. When `active` is true, the
   *  map intercepts the next canvas click and writes the click's
   *  world-pixel coordinates to `result`. The spell picker reads the
   *  result, uses it as the direction toward-point for cone/line AoE
   *  shapes, then clears `active` (which also clears `result` on next
   *  set). Lets the player aim a cone or line at any cell — including
   *  empty corridors — instead of being forced to pick a target
   *  participant.
   *
   *  Single-shot: once `result` is non-null the map stops listening
   *  and goes back to normal click handling. The modal is responsible
   *  for clearing both flags after consuming `result`. If the player
   *  cancels (closes the modal mid-pick), the modal sets active=false
   *  with a null result so no stray click is captured later. */
  directionPick: {
    active: boolean;
    result: { worldX: number; worldY: number } | null;
  };
  /** v2.385.0 — Cross-component "center the viewport on this token"
   *  channel. The InitiativeStrip lives at the dashboard level, but
   *  the viewport lives inside BattleMapV2; rather than threading a
   *  ref or a callback through React, the strip writes a pan request
   *  here and BattleMapV2's effect consumes it (and sets it back to
   *  null after animating). The `nonce` field forces re-fires when
   *  the same token is clicked twice in a row — a plain value-equal
   *  Zustand subscription would skip the second click.
   *
   *  worldX/Y: viewport-center target in WORLD pixels (token.x/y).
   *  Consumer animates camera to that point. Null when nothing is
   *  pending.
   */
  panRequest: {
    worldX: number;
    worldY: number;
    nonce: number;
  } | null;

  addToken: (token: Token) => void;
  updateTokenPosition: (id: string, x: number, y: number) => void;
  updateTokenFields: (id: string, patch: Partial<Token>) => void;
  setDragging: (id: string | null) => void;
  removeToken: (id: string) => void;
  setTokensBulk: (tokens: Token[]) => void;
  setCurrentSceneId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  /** v2.216: bulk-replace the remote drag locks. Called from the
   *  Supabase Presence 'sync' event handler which rebuilds the map
   *  from the current presence state. */
  setRemoteDragLocks: (locks: Record<string, string>) => void;
  // v2.223 wall mutators — parallel to token mutators. Realtime adds
  // call addWall/removeWall; hydration calls setWallsBulk.
  // v2.271.0 — updateWall added for the door toggle. Walls were
  // previously immutable (delete+re-insert was the only edit); now
  // doorState mutates mid-session as the DM opens/closes doors.
  addWall: (wall: Wall) => void;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  removeWall: (id: string) => void;
  setWallsBulk: (walls: Wall[]) => void;
  /** v2.661.0 — material applied to the NEXT wall drawn. Authoring
   *  state, not scene state: it is never persisted, and it lives here
   *  rather than in WallLayer because the toolbar that sets it and the
   *  layer that consumes it are siblings. Existing walls are retyped
   *  with ctrl+click, which doesn't read this. */
  wallDrawType: 'wall' | 'low' | 'window';
  setWallDrawType: (t: 'wall' | 'low' | 'window') => void;
  // v2.234 text mutators — parallel to walls. updateText is exposed
  // because text rows mutate (rename, recolor, reposition); walls
  // are immutable except for delete+insert, so they don't have one.
  addText: (text: SceneText) => void;
  updateText: (id: string, patch: Partial<SceneText>) => void;
  removeText: (id: string) => void;
  setTextsBulk: (texts: SceneText[]) => void;
  // v2.235 drawing mutators. v2.255 added updateDrawing for the
  // drag-to-reposition flow — drawings can now be moved, recolored,
  // or rewidthed in place. The data shape (jsonb points + scalar
  // color/lineWidth) supports all of that without a schema change.
  addDrawing: (drawing: SceneDrawing) => void;
  updateDrawing: (id: string, patch: Partial<SceneDrawing>) => void;
  removeDrawing: (id: string) => void;
  setDrawingsBulk: (drawings: SceneDrawing[]) => void;
  resetForScene: (sceneId: string | null) => void;
  /** v2.342.0 — AoE preview overlay setter. Pass null to clear. */
  setAoePreview: (
    p: {
      centerWorldX: number;
      centerWorldY: number;
      sizeFt: number;
      shape: 'sphere' | 'cone' | 'cube' | 'cylinder' | 'line';
      directionWorldX?: number;
      directionWorldY?: number;
      widthFt?: number;
    } | null,
  ) => void;
  /** v2.344.0 — Single-target spell range setter. Pass null to clear. */
  setRangePreview: (
    p: {
      centerWorldX: number;
      centerWorldY: number;
      rangeFt: number;
    } | null,
  ) => void;
  /** v2.345.0 — Free-aim direction picker. Activate to capture next
   *  canvas click; clear (active=false) to abort or after consuming
   *  the result. */
  setDirectionPickActive: (active: boolean) => void;
  setDirectionPickResult: (result: { worldX: number; worldY: number } | null) => void;
  /** v2.444.0 — Live-update only the direction fields of the active
   *  AoE preview (cone or line). No-op if aoePreview is null. Used by
   *  BattleMapV2's direction-pick mousemove handler so cone overlays
   *  rotate continuously with the cursor before the player commits a
   *  direction with a click. Cheaper than setAoePreview() because we
   *  don't rebuild the whole object. */
  setAoePreviewDirection: (worldX: number, worldY: number) => void;
  /** v2.456.0 — Setter for the hover-highlight target list. Pass
   *  empty array to clear. */
  setAoePreviewTargetTokenIds: (ids: string[]) => void;
  /** v2.459.0 — Reach visualization setter. Pass null to clear. */
  setReachPreview: (
    p: {
      centerWorldX: number;
      centerWorldY: number;
      footprintCells: number;
      reachFt: number;
    } | null,
  ) => void;
  /** v2.385.0 — Setter for the pan-to-token channel. Pass world coords
   *  (token.x/y are already world pixels). Pass null to clear after
   *  consuming. */
  requestPan: (worldX: number, worldY: number) => void;
  clearPanRequest: () => void;
}

export const useBattleMapStore = create<BattleMapStore>((set) => ({
  tokens: {},
  dragging: null,
  remoteDragLocks: {},
  walls: {},
  texts: {},
  drawings: {},
  currentSceneId: null,
  loading: false,
  aoePreview: null,
  aoePreviewTargetTokenIds: [],
  reachPreview: null,
  rangePreview: null,
  directionPick: { active: false, result: null },
  panRequest: null,

  addToken: (token) =>
    set((s) => ({ tokens: { ...s.tokens, [token.id]: token } })),

  updateTokenPosition: (id, x, y) =>
    set((s) => {
      const t = s.tokens[id];
      if (!t) return s;
      return { tokens: { ...s.tokens, [id]: { ...t, x, y } } };
    }),

  updateTokenFields: (id, patch) =>
    set((s) => {
      const t = s.tokens[id];
      if (!t) return s;
      return { tokens: { ...s.tokens, [id]: { ...t, ...patch } } };
    }),

  setDragging: (id) => set({ dragging: id }),

  removeToken: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.tokens;
      return { tokens: rest };
    }),

  setTokensBulk: (tokens) =>
    set(() => {
      const map: Record<string, Token> = {};
      for (const t of tokens) map[t.id] = t;
      return { tokens: map };
    }),

  setCurrentSceneId: (id) => set({ currentSceneId: id }),

  setLoading: (loading) => set({ loading }),

  setRemoteDragLocks: (locks) => set({ remoteDragLocks: locks }),

  wallDrawType: 'wall',
  setWallDrawType: (t) => set({ wallDrawType: t }),

  addWall: (wall) =>
    set((s) => ({ walls: { ...s.walls, [wall.id]: wall } })),

  updateWall: (id, patch) =>
    set((s) => {
      const existing = s.walls[id];
      if (!existing) return s;
      return { walls: { ...s.walls, [id]: { ...existing, ...patch } } };
    }),

  removeWall: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.walls;
      return { walls: rest };
    }),

  setWallsBulk: (walls) =>
    set(() => {
      const map: Record<string, Wall> = {};
      for (const w of walls) map[w.id] = w;
      return { walls: map };
    }),

  addText: (text) =>
    set((s) => ({ texts: { ...s.texts, [text.id]: text } })),

  updateText: (id, patch) =>
    set((s) => {
      const existing = s.texts[id];
      if (!existing) return s;
      return { texts: { ...s.texts, [id]: { ...existing, ...patch } } };
    }),

  removeText: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.texts;
      return { texts: rest };
    }),

  setTextsBulk: (texts) =>
    set(() => {
      const map: Record<string, SceneText> = {};
      for (const t of texts) map[t.id] = t;
      return { texts: map };
    }),

  addDrawing: (drawing) =>
    set((s) => ({ drawings: { ...s.drawings, [drawing.id]: drawing } })),

  updateDrawing: (id, patch) =>
    set((s) => {
      const existing = s.drawings[id];
      if (!existing) return s;
      return { drawings: { ...s.drawings, [id]: { ...existing, ...patch } } };
    }),

  removeDrawing: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.drawings;
      return { drawings: rest };
    }),

  setDrawingsBulk: (drawings) =>
    set(() => {
      const map: Record<string, SceneDrawing> = {};
      for (const d of drawings) map[d.id] = d;
      return { drawings: map };
    }),

  resetForScene: (sceneId) =>
    set((s) => {
      const kept: Record<string, Token> = {};
      for (const [id, t] of Object.entries(s.tokens)) {
        if (t.sceneId === sceneId) kept[id] = t;
      }
      const keptWalls: Record<string, Wall> = {};
      for (const [id, w] of Object.entries(s.walls)) {
        if (w.sceneId === sceneId) keptWalls[id] = w;
      }
      const keptTexts: Record<string, SceneText> = {};
      for (const [id, t] of Object.entries(s.texts)) {
        if (t.sceneId === sceneId) keptTexts[id] = t;
      }
      const keptDrawings: Record<string, SceneDrawing> = {};
      for (const [id, d] of Object.entries(s.drawings)) {
        if (d.sceneId === sceneId) keptDrawings[id] = d;
      }
      return {
        tokens: kept,
        walls: keptWalls,
        texts: keptTexts,
        drawings: keptDrawings,
        dragging: null,
        remoteDragLocks: {},
        currentSceneId: sceneId,
        // v2.342.0 — clear AoE preview on scene change so a stale
        // ring from one scene doesn't bleed into the next.
        aoePreview: null,
        // v2.456.0 — clear hover-highlight targets too.
        aoePreviewTargetTokenIds: [],
        // v2.459.0 — clear reach preview on scene change.
        reachPreview: null,
        // v2.344.0 — same for range preview.
        rangePreview: null,
        // v2.345.0 — same for direction-pick state.
        directionPick: { active: false, result: null },
      };
    }),
  // v2.456.0 — Whenever the AoE preview is replaced or cleared we
  // also reset the hover-highlight target list so a stale ring from
  // a previous picker doesn't linger between activations.
  setAoePreview: (p) => set({ aoePreview: p, aoePreviewTargetTokenIds: [] }),
  setAoePreviewTargetTokenIds: (ids) => set({ aoePreviewTargetTokenIds: ids }),
  setReachPreview: (p) => set({ reachPreview: p }),
  setRangePreview: (p) => set({ rangePreview: p }),
  setDirectionPickActive: (active) =>
    set((s) => ({ directionPick: { active, result: active ? null : s.directionPick.result } })),
  setDirectionPickResult: (result) =>
    set((s) => ({ directionPick: { ...s.directionPick, result } })),
  // v2.444.0 — Live cone/line direction update. Splices new direction
  // fields into the active aoePreview without rebuilding the object.
  // No-op when aoePreview is null (no overlay to update).
  setAoePreviewDirection: (worldX, worldY) =>
    set((s) => {
      if (!s.aoePreview) return {};
      return {
        aoePreview: {
          ...s.aoePreview,
          directionWorldX: worldX,
          directionWorldY: worldY,
        },
      };
    }),
  // v2.385.0 — Pan request channel. Each call increments a nonce so
  // consecutive identical clicks still re-fire the consumer effect.
  requestPan: (worldX, worldY) =>
    set((s) => ({
      panRequest: {
        worldX, worldY,
        nonce: (s.panRequest?.nonce ?? 0) + 1,
      },
    })),
  clearPanRequest: () => set({ panRequest: null }),
}));
