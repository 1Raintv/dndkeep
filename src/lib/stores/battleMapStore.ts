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
  // character sheet. npc_id column is in the DB schema too but we
  // don't expose it here yet.
  characterId: string | null;
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
  addWall: (wall: Wall) => void;
  removeWall: (id: string) => void;
  setWallsBulk: (walls: Wall[]) => void;
  resetForScene: (sceneId: string | null) => void;
}

export const useBattleMapStore = create<BattleMapStore>((set) => ({
  tokens: {},
  dragging: null,
  remoteDragLocks: {},
  walls: {},
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
      return {
        tokens: kept,
        walls: keptWalls,
        dragging: null,
        remoteDragLocks: {},
        currentSceneId: sceneId,
      };
    }),
}));
