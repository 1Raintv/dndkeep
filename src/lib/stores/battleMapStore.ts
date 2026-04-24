// v2.211.0 — Phase Q.1 pt 4: Zustand store for BattleMap V2 token state.
//
// For now this is local-only (no multiplayer sync). v2.215 will add
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

  addToken: (token: Token) => void;
  updateTokenPosition: (id: string, x: number, y: number) => void;
  setDragging: (id: string | null) => void;
  removeToken: (id: string) => void;
  /** v2.215 will replace this with realtime hydration from scene_tokens. */
  resetForScene: (sceneId: string | null) => void;
}

export const useBattleMapStore = create<BattleMapStore>((set) => ({
  tokens: {},
  dragging: null,

  addToken: (token) =>
    set((s) => ({ tokens: { ...s.tokens, [token.id]: token } })),

  updateTokenPosition: (id, x, y) =>
    set((s) => {
      const t = s.tokens[id];
      if (!t) return s; // stale drag → no-op
      return { tokens: { ...s.tokens, [id]: { ...t, x, y } } };
    }),

  setDragging: (id) => set({ dragging: id }),

  removeToken: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.tokens;
      return { tokens: rest };
    }),

  resetForScene: (sceneId) =>
    set((s) => {
      // Drop every token not belonging to the new scene. When the
      // sceneId is null we clear everything (unmount path).
      const kept: Record<string, Token> = {};
      for (const [id, t] of Object.entries(s.tokens)) {
        if (t.sceneId === sceneId) kept[id] = t;
      }
      return { tokens: kept, dragging: null };
    }),
}));
