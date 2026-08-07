// v2.646 (audit 4.6 slice 3): the battle-map DOMAIN TYPES, extracted from
// battleMapStore. Ten src/lib modules needed only these shapes but had to
// import the UI store file to get them — the "inverted dependency" the
// audit flagged. Types are pure; this module imports nothing. The store
// re-exports them, so store-side consumers are unchanged.
// (Moved verbatim from stores/battleMapStore.ts lines 32-174 — original
// v2.2xx field comments preserved.)

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
  // v2.354.0: link to a unified creature row (homebrew_monsters table).
  // Set when a token was placed from the NPC manager's "Place on Map"
  // action, post-v2.350 schema unification. Replaces the legacy npcId
  // semantics for new code paths. npcId stays in the type for backward
  // compatibility with existing realtime payloads + tokens whose rows
  // pre-date v2.354, but the database column behind npcId was dropped
  // in v2.350 — only creatureId is wired to a real DB column now.
  // Mutually exclusive with characterId.
  creatureId: string | null;
  // v2.312: Combat Phase 3 — combatant identity for tokens that came
  // through the new placement+combatant path. Optional for backward
  // compat: tokens hydrated from scene_tokens (legacy path) leave this
  // undefined; tokens hydrated from scene_token_placements (new path,
  // gated on campaigns.use_combatants_for_battlemap) populate it. The
  // BattleMap can use this to navigate to the combatant editor or
  // share state with combat encounters that reference the same
  // combatant. Mutually NON-exclusive with characterId/npcId — a PC
  // token can have both characterId set AND combatantId set when the
  // new path is on, since the combatant's definition_id mirrors
  // characterId in that case.
  combatantId?: string | null;
  // v2.617.0 — B3a: owning auth user of the backing combatant (new
  // path only). Null on the legacy scene_tokens path.
  combatantOwnerId?: string | null;
  // v2.282: hide-from-players flag. When false, RLS strips the row
  // from the players' SELECT result (and from realtime broadcasts),
  // so the token is invisible to non-DM users. The DM sees every
  // token regardless and the BattleMapV2 token render fades hidden
  // tokens to half-alpha so they're visually distinguished from
  // revealed ones. DM-placed tokens default to false (hidden) per
  // the v2.282 spec; character-linked tokens stay visible because
  // the player owning that character needs to see themselves.
  // Maps to scene_tokens.visible_to_all (column already existed; the
  // ship just wired the client to read/write it).
  visibleToAll: boolean;
  // v2.411.0: lock token to prevent drag. When true, BattleMapV2's
  // pointerdown handler refuses to start a drag on this token. The
  // DM toggles this via the token context menu (Lock/Unlock). A small
  // padlock glyph renders above any locked token. Players can never
  // drag locked tokens (the player ownership gate runs first anyway,
  // but locks apply uniformly across DM + player views). Maps to
  // scene_tokens.is_locked (added in migration
  // add_is_locked_to_scene_tokens_v2_411, default false → existing
  // tokens behave identically).
  isLocked: boolean;
  // v2.413.0: per-token grant of drag control to a player. When set
  // to a user_id (auth.users.id) other than the DM, that user is
  // allowed to drag the token in BattleMapV2 even if the token isn't
  // their PC. Implements the "Grant Player Control" workflow — the
  // DM hands a creature/familiar/ally to a specific player. Maps to
  // scene_tokens.player_id (column exists since v2.208 migration;
  // RLS already permits UPDATE when player_id = auth.uid()). Null
  // means no player has been granted control — only DM and the PC's
  // owner (via characterId match) can drag.
  playerId: string | null;
  // Future fields (DB has them; store doesn't mirror yet):
  //   playerId: string | null    (ownership / RLS)
  //   zIndex: number
}
