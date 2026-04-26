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

export type TokenSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

/** v2.223 — wall segment.
 *  Endpoints live in world pixel coordinates. Drawing tool snaps to
 *  cell CORNERS (not centers like tokens) but free-placement is
 *  schema-valid for future curve approximations. */
export interface Wall {
  id: string;
  sceneId: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Blocks line-of-sight for vision polygon (v2.224). */
  blocksSight: boolean;
  /** Blocks token movement (future ship). */
  blocksMovement: boolean;
  /** NULL = regular wall. Door states come from the DB CHECK set. */
  doorState: 'closed' | 'open' | 'locked' | null;
}

/** v2.234.0 — Map text annotation. Anchored at world (x,y); rendered
 *  by TextLayer in BattleMapV2. DM-only authoring; SELECT for party
 *  members on published scenes (RLS in scene_texts). */
export interface SceneText {
  id: string;
  sceneId: string | null;
  /** World pixel coords (same units as Wall and Token). */
  x: number;
  y: number;
  text: string;
  /** Hex string e.g. '#ffffff'. */
  color: string;
  /** Pixi Text font size in pixels. */
  fontSize: number;
}

/** v2.235.0 — Drawing kinds. Pencil = freehand polyline; the others
 *  are 2-point primitives whose meaning depends on the kind. */
export type DrawingKind = 'pencil' | 'line' | 'rect' | 'circle';

/** v2.235.0 — Map drawing annotation. World coords for points. The
 *  semantics of `points` depend on `kind`:
 *    - pencil: arbitrary length polyline
 *    - line:   2 points (start, end)
 *    - rect:   2 points (top-left, bottom-right)
 *    - circle: 2 points (center, edge — radius computed at render) */
export interface SceneDrawing {
  id: string;
  sceneId: string | null;
  kind: DrawingKind;
  points: Array<{ x: number; y: number }>;
  /** Hex string e.g. '#a78bfa'. */
  color: string;
  /** Stroke width in pixels (world space). */
  lineWidth: number;
}

export interface Token {
  id: string;
  sceneId: string | null; // null = ephemeral / pre-sync
  x: number; // world pixels, cell corner after snap
  y: number;
  size: TokenSize;
  rotation: number; // degrees, 0 = facing up (reserved for v2.212+)
  name: string;
  // v2.211: tokens render as solid-color circles with initials.
  // v2.215 adds imageStoragePath — when set, a Sprite replaces the
  // colored circle. The color/initials still render as fallback during
  // texture load and on error. image_storage_path maps to the same
  // column in scene_tokens.
  color: number; // 0xRRGGBB
  imageStoragePath: string | null; // v2.215 — Supabase Storage path
  // v2.220: link to a player character. When set, the token represents
  // that character on the map — used by "+ Add PC Tokens" to prevent
  // duplicates and by future features to read live HP/AC from the
  // character sheet.
  characterId: string | null;
  // v2.242: link to an NPC instance (`npcs` table row). Set when the
  // token was created from the DM roster bulk-add picker. Each NPC
  // instance has its own HP/conditions, so multiple tokens with the
  // same roster origin don't share a stat block — each gets its own
  // npc row. characterId and npcId are mutually exclusive.
  npcId: string | null;
  // Future fields (DB has them; store doesn't mirror yet):
  //   playerId: string | null    (ownership / RLS)
  //   visibleToAll: boolean
  //   zIndex: number
}

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
      };
    }),
}));
