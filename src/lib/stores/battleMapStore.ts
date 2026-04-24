// v2.211.0 — Phase Q.1 pt 4: Zustand store for BattleMap V2 token state.
// v2.213.0 — Phase Q.1 pt 6: scene-awareness (currentSceneId, loading,
// bulk hydrate) so BattleMapV2 can load/save tokens to Supabase.
//
// Hydration flow: on scene change BattleMapV2 calls resetForScene(newId)
// → fetches tokens via lib/api/sceneTokens.listTokens → calls
// setTokensBulk with the results. Writes use optimistic local update
// first, then fire-and-forget API call (see BattleMapV2 commit helpers).
//
// For now this is otherwise local (no multiplayer sync). v2.215 will add
// Supabase Realtime Broadcast for drag previews + Postgres Changes for
// committed positions, mirroring the architecture from the Phase Q.1
// research plan.
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

export interface Token {
  id: string;
  sceneId: string | null; // null = ephemeral / pre-sync
  x: number; // world pixels, cell corner after snap
  y: number;
  size: TokenSize;
  rotation: number; // degrees, 0 = facing up (reserved for v2.212+)
  name: string;
  // v2.211: tokens render as solid-color circles with initials.
  // v2.212 replaces this with image_url + sprite rendering.
  color: number; // 0xRRGGBB
  // v2.215 adds:
  //   playerId: string | null    (ownership / RLS)
  //   visibleToAll: boolean
  //   imageUrl: string | null
  //   zIndex: number
}

interface BattleMapStore {
  tokens: Record<string, Token>;
  /** True iff a token is currently being dragged. Subscribed to by the
   *  viewport so it can temporarily disable plugins like decelerate
   *  during a drag (prevents rubber-band after a fast release). */
  dragging: string | null;
  /** v2.213: currently-hydrated scene id. Null means no scene selected. */
  currentSceneId: string | null;
  /** v2.213: true while tokens are being fetched for the current scene.
   *  UI uses this to render a skeleton / avoid showing "empty scene"
   *  flash before the DB query returns. */
  loading: boolean;

  addToken: (token: Token) => void;
  updateTokenPosition: (id: string, x: number, y: number) => void;
  updateTokenFields: (id: string, patch: Partial<Token>) => void;
  setDragging: (id: string | null) => void;
  removeToken: (id: string) => void;
  /** v2.213: replace the whole token set in one shot (used by
   *  hydration — call after fetching tokens from the API). */
  setTokensBulk: (tokens: Token[]) => void;
  setCurrentSceneId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  /** v2.215 will replace this with realtime hydration from scene_tokens. */
  resetForScene: (sceneId: string | null) => void;
}

export const useBattleMapStore = create<BattleMapStore>((set) => ({
  tokens: {},
  dragging: null,
  currentSceneId: null,
  loading: false,

  addToken: (token) =>
    set((s) => ({ tokens: { ...s.tokens, [token.id]: token } })),

  updateTokenPosition: (id, x, y) =>
    set((s) => {
      const t = s.tokens[id];
      if (!t) return s; // stale drag → no-op
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

  resetForScene: (sceneId) =>
    set((s) => {
      // Drop every token not belonging to the new scene. When the
      // sceneId is null we clear everything (unmount path).
      const kept: Record<string, Token> = {};
      for (const [id, t] of Object.entries(s.tokens)) {
        if (t.sceneId === sceneId) kept[id] = t;
      }
      return { tokens: kept, dragging: null, currentSceneId: sceneId };
    }),
}));
