// v2.208.0 — Phase Q.1 pt 1: BattleMap V2 foundation shell.
// v2.209.0 — Phase Q.1 pt 2: PixiJS Application mounted.
// v2.210.0 — Phase Q.1 pt 3: pixi-viewport + square grid + snap helper.
// v2.211.0 — Phase Q.1 pt 4: Zustand store + first draggable token.
// v2.212.0 — Phase Q.1 pt 5: multi-token + initials + "Add Token" + context menu.
// v2.213.0 — Phase Q.1 pt 6: scene persistence — scene picker, DB hydration.
// v2.214.0 — Phase Q.1 pt 7: Realtime multiplayer sync via Postgres Changes.
// v2.215.0 — Phase Q.1 pt 8: portrait upload + Pixi Sprite rendering.
// v2.216.0 — Phase Q.1 pt 9: live drag previews + drag-locks via Broadcast+Presence.
// v2.217.0 — Phase Q.1 pt 10: scene background image upload + render.
// v2.218.0 — Phase Q.1 pt 11: Measurement tool (ruler).
// v2.219.0 — Phase Q.1 pt 12: Scene settings modal. DM can rename a
// scene, adjust grid size and width/height in cells, toggle published
// state, delete the scene, or auto-fit dimensions to an uploaded map
// image's aspect. All changes propagate via the v2.214 scenes
// Realtime channel so players see updates instantly.
// v2.220.0 — Phase Q.1 pt 13: "+ Add PC Tokens" button. Bulk-creates
// tokens for every player character in the campaign that doesn't
// already have one in the current scene (linked by character_id).
// Idempotent re-click. Tokens commit to DB and propagate via
// Realtime so all players see their party appear at once.
// v2.221.0 — Phase Q.1 pt 14: Live HP bar on tokens linked to a
// player character. Color-graded (green/yellow/red/gray) bar pinned
// below the token. Updates whenever the parent's playerCharacters
// prop changes (i.e. whenever a character's HP updates anywhere in
// the app). No DB or realtime additions; pure derived rendering.
// v2.222.0 — Phase Q.1 pt 15: "View Character Sheet" right-click
// action on linked tokens. Token context menu gets a navigate-jump
// to the linked character's full sheet via the existing
// /character/:id route. Tiny ship; massive DM utility during prep.
// v2.223.0 — Phase Q.1 pt 16 (Phase 3 begin): scene_walls schema +
// click-to-place wall drawing tool + static WallLayer rendering.
// Walls are line segments between cell corners. DM-only drawing
// (RLS-enforced). Chain mode: each click sets a new start so DMs
// can rapidly lay down connected segments. Right-click within wall
// mode deletes the nearest wall. Escape cancels a pending start.
// Realtime sync via Postgres Changes on scene_walls. v2.224 will
// consume these walls to clip per-token visibility polygons; v2.225
// adds per-player fog of war.
// v2.224.0 — Phase Q.1 pt 17 (Phase 3 cont): VisionLayer.
// Walls now BLOCK SIGHT. Each PC token contributes a visibility
// polygon computed by raycast (180 rays, ~2° resolution) clipped by
// walls with blocks_sight=true. Polygons render with 'erase' blend
// mode against a world-spanning dark fog Graphics, all rasterized to
// a RenderTexture and displayed as a Sprite over the scene. DM sees
// no fog; players see fog with party-shared sight (every PC token
// contributes vision). Vision range hardcoded 60ft for v2.224 —
// v2.226 will read per-character darkvision/normal-vision.
// v2.225.0 — HOTFIX: ViewportHost effect dep-array bug. The effect
// that creates the Pixi Viewport and adds it to the stage was missing
// `app` from its dependency list. Pixi v8's Application init is async,
// so first render returns app:null → effect bails early → effect never
// re-fires when init completes → stage stays empty → canvas renders
// pure black. Symptom: v2 map area completely blank for everyone.
// Fix: depend on the Pixi app + `isInitialised` flag, gate viewport
// creation on `isReady`. Latent bug since v2.210; v2.224's heavier
// component tree pushed initial render order such that the bug became
// reliable. No feature changes in this ship.
// v2.226.0 — Phase Q.1 pt 18: visual polish + token quick panel.
//   1. Top-right zoom buttons now have strong contrast (white text,
//      dark fill, halo shadow) so they read clearly over busy map
//      backgrounds.
//   2. Token name labels render below each token in Pixi (white bold
//      with dark stroke) — DMs can read which token is which without
//      relying on initials alone.
//   3. Default zoom is 1.0× fit (was 0.9×) so tokens read at usable
//      size out of the box.
//   4. Left-click (without drag) on a PC token opens TokenQuickPanel:
//      avatar/name/class/level header + HP bar + AC + Speed + 6-stat
//      mod grid + read-only conditions + DM damage/heal/set HP
//      controls + "Open Character Sheet" link. Closes on Escape or
//      backdrop click. Click vs drag is detected via a screen-space
//      5px movement threshold + 250ms time window.
// v2.227.0 — Phase Q.1 pt 19: condition apply/remove on the panel.
//   - Active condition chips are now interactive (DM only): click ✕
//     to remove. Color-coded via COND_COLOR matching v1's palette.
//   - New "Apply Condition" picker section under DM Controls lists
//     every 5e 2024 PHB condition not already on the character;
//     click → apply.
//   - Both flows write directly to characters.active_conditions
//     (same path v1 uses). Realtime UPDATE on characters table
//     propagates back to the panel and to character sheets.
//   - condBusy flag gates all writes to prevent double-click races.
//   - Cascades (Unconscious → Prone + Incapacitated, etc.) are NOT
//     applied here; same trade-off v1 makes. The cascade pipeline
//     in src/lib/conditions.ts requires a combat_participants row
//     and is reserved for encounter-driven condition changes.
// v2.228.0 — Phase Q.1 pt 20: DM action toolbar separation.
//   - Map / Tokens action buttons (Change Map, Remove Map, + Add PC
//     Tokens, + Add Token) moved out of the in-canvas top-right
//     overlay into a dedicated solid bar above the canvas. They were
//     near-unreadable as semi-transparent cards over busy map
//     backgrounds.
//   - The new bar uses var(--c-card) background + visible borders +
//     small section labels ("Map", "Tokens") + a divider for clarity.
//   - The Scene-name badge (top-left of canvas) and the zoom + ruler
//     + walls toolbars stay on the canvas — they're contextual to
//     the map itself.
//   - No behavior changes; pure layout refactor. Canvas dims and all
//     overlays remain the same.
// v2.229.0 — Phase Q.1 pt 21: ChecksPanel on TokenQuickPanel.
//   - Extracted ChecksPanel from PartyDashboard.tsx into its own file
//     (src/components/Campaign/ChecksPanel.tsx) so the same UI can be
//     reused on the BattleMapV2 token quick panel. PartyDashboard now
//     imports it; behavior on the Party tab is unchanged.
//   - DM clicking a player token on the map now sees the same checks
//     surface they get on the Party tab: skill picker, raw ability
//     buttons, save buttons, advantage/disadvantage/DC controls,
//     "Roll Secret" + "Prompt Player" actions, last-result strip.
//   - Required widening the playerCharacters prop on BattleMapV2 with
//     saving_throw_proficiencies, skill_proficiencies, skill_expertises
//     so checkModifier() can compute per-skill bonuses without an
//     extra fetch. CampaignDashboard now passes these through.
//   - Required adding a campaignId prop to TokenQuickPanel so
//     "Prompt Player" can route the campaign_chat insert correctly.
//   - Panel max-height bumped 380 → 600 so the panel doesn't scroll
//     immediately on a tall character record. overflow:auto still
//     handles the rare case of conditions + checks both being full.
//   - Cast slim-character → Character at the ChecksPanel boundary
//     (rollCheck/checkModifier only read the fields we already pass).
// v2.231.0 — Phase Q.1 pt 22: Initiative bar + Party Vitals strip.
//   - InitiativeBar: slim horizontal strip rendered above the canvas
//     wrapper when sessionState.combat_active is true. Shows
//     "Round N" + each combatant as a chip in initiative order with
//     init number, name, HP. Active combatant is gold-bordered and
//     scaled up. PCs get blue accents, monsters red. DM gets a
//     "Next Turn →" button that wraps + bumps round at end of order.
//     Hidden when combat isn't active so the map isn't crowded.
//   - PartyVitalsBar: always-on horizontal strip below the canvas
//     wrapper. Lists every PC in the campaign as a compact card with
//     name + AC chip + HP bar (color-graded green/yellow/red) +
//     spell-slot pips per level (filled = remaining). Read-only;
//     edits go through TokenQuickPanel or the player's own sheet.
//     Hides itself if no PCs (e.g. a campaign-creation moment).
//   - Plumbing: CampaignDashboard now passes sessionState +
//     onUpdateSession + spell_slots through to BattleMapV2. Both
//     props are optional so older callers still compile.
//   - No schema changes; both bars read existing data flowing through
//     CampaignDashboard's Realtime subscriptions.
//   Deferred to v2.232+:
//      - Enemy attack flow (range highlight → target picker → roll
//        pipeline → reaction prompt → damage application).
//      - NPC token roster + bulk add.
//      - Combat-aware condition cascades.
//      - Lighting / fog of war fix.
//      - Click a vitals card to focus its token on the map (camera
//        pan/zoom). Currently the strip is purely informational.

import { Application, extend } from '@pixi/react';
import { Assets, ColorMatrixFilter, Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBattleMapStore, type Token, type DrawingKind } from '../../lib/stores/battleMapStore';
import * as scenesApi from '../../lib/api/scenes';
// v2.313: tokens now route through the API router so the BattleMap
// can swap between scene_tokens (legacy) and scene_token_placements
// (new combatants+placements path) based on the per-campaign
// use_combatants_for_battlemap flag. The router exposes the same
// surface as the old sceneTokens import, so existing call sites work
// unchanged. See docs/COMBAT_PHASE_3_TOKEN_LIBRARY.md.
import * as tokensApi from '../../lib/api/tokensApiRouter';
// v2.495.0 — Combat Phase 3.1: the module-level cache was retired in
// favor of per-call campaignId threading. Router methods now take
// `{ campaignId }` opts. The router still resolves the flag (and
// memoizes the result per campaign), but it does so on demand
// rather than relying on this component to push the value in.
// (Cache invalidation lives in CampaignSettings.saveUsePhase3 where
// it's actually needed — when the DM flips the engine setting.)

import { getUseCombatantsFlag } from '../../lib/api/scenePlacements';
import * as wallsApi from '../../lib/api/sceneWalls';
import * as textsApi from '../../lib/api/sceneTexts';
import * as drawingsApi from '../../lib/api/sceneDrawings';
import { segmentBlockedByWall } from '../../lib/wallCollision';
// dbRowToToken is the legacy realtime mapper — used only on the
// legacy branch of the subscription effect. The new path re-fetches
// the JOINed placement+combatant row instead.
import { dbRowToToken } from '../../lib/api/sceneTokens';
import * as assetsApi from '../../lib/api/battleMapAssets';
import { supabase } from '../../lib/supabase';
// v2.229 — shared Checks UI; used by the TokenQuickPanel for DM-clicked
// player tokens. Same component PartyDashboard renders on the Party tab.
import { useToast } from '../shared/Toast';
import { useUndoRedo } from '../../lib/hooks/useUndoRedo';
import { useModal } from '../shared/Modal';
// v2.355.0 — Legacy roster modal imports removed in favor of
// CreaturePickerModal, which sources from the unified NPC tab
// (creature_folders + homebrew_monsters). The old NpcRosterPickerModal
// + NpcRosterBuilderModal pointed at the dropped dm_npc_roster
// table and would 500 on open.
import CreaturePickerModal from './CreaturePickerModal';
import NpcTokenQuickPanel from './NpcTokenQuickPanel';
// v2.355.0 — npcRosterApi + npcsApi imports removed along with the
// legacy addRosterTokens callback in this ship.
// v2.339.0 — BG3 turn UX: read currentActor from CombatContext to drive
// the active-turn outline + movement-remaining badge on the map.
import { useCombat } from '../../context/CombatContext';
// v2.340.0 — BG3 turn UX part 2: movement enforcement on token drag.
// canMove validates the budget before commit; logMovement writes the
// new movement_used_ft + emits the combat event + offers OAs.
// computeChebyshevFt drives the live drag-preview path label.
import { computeChebyshevFt, canMove, logMovement } from '../../lib/movement';
// v2.348.0 — A* pathfinder for click-to-move. Routes around walls +
// occupied cells so the player doesn't have to click each leg of an
// L-shaped corridor.
import { findPath } from '../../lib/pathfinding';
// v2.350.0 — participant-type compat: helper recognizes both the new
// 'creature' value and legacy 'monster'/'npc' values until any
// in-flight realtime data settles.
import { isCreatureParticipantType } from '../../lib/participantType';

extend({ Container, Graphics, Sprite, Text });

// v2.636 — decomposition step 1: the self-contained render layers moved
// verbatim to ./battlemap/*, along with the constants + geometry helpers
// they share with this root (./battlemap/shared).
import {
  DEFAULT_GRID_SIZE_PX, DEFAULT_WIDTH_CELLS, DEFAULT_HEIGHT_CELLS,
  BG_COLOR,
  TOKEN_COLORS, COND_ICON, COND_COLOR_HEX,
  tokenRadiusForSize, tokenFootprintCells, tokenInitials,
  type ContextMenuState,
} from './battlemap/shared';
import { ViewportHost } from './battlemap/ViewportHost';
import { BackgroundLayer } from './battlemap/BackgroundLayer';
import { GridOverlay } from './battlemap/GridOverlay';
import { RulerLayer } from './battlemap/RulerLayer';
import { WallLayer } from './battlemap/WallLayer';
import { VisionLayer } from './battlemap/VisionLayer';
import { ReachOverlayLayer } from './battlemap/ReachOverlayLayer';
import { TextLayer } from './battlemap/TextLayer';
import { DrawingLayer } from './battlemap/DrawingLayer';
import { FxLayer, type FxKind } from './battlemap/FxLayer';
import { TokenContextMenu } from './battlemap/TokenContextMenu';
import { SceneSettingsModal } from './battlemap/SceneSettingsModal';
import { TokenQuickPanel } from './battlemap/TokenQuickPanel';
import { PartyVitalsBar } from './battlemap/PartyVitalsBar';




export interface BattleMapV2Props {
  campaignId: string;
  isDM: boolean;
  userId: string;
  myCharacterId: string | null;
  playerCharacters: Array<{
    id: string;
    name: string;
    class_name: string;
    level: number;
    current_hp: number;
    max_hp: number;
    armor_class: number;
    active_conditions: string[];
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    speed: number;
    // v2.229.0 — proficiency arrays needed by ChecksPanel (skill /
    // ability / save modifiers and "Prompt Player" routing).
    saving_throw_proficiencies?: import('../../types').AbilityKey[];
    skill_proficiencies?: string[];
    skill_expertises?: string[];
    // v2.231.0 — spell slot tally for the Party Vitals strip. Optional
    // because not every campaign sources spell-slot data, and not every
    // character is a caster.
    spell_slots?: import('../../types').SpellSlots;
    // v2.413.0 — the owning user's auth.users.id. Needed by the
    // "Grant Player Control" context menu action so the DM can pick
    // a player to receive drag rights on a non-PC token. Optional
    // for backward compat with callers that haven't been widened.
    user_id?: string | null;
  }>;
  // v2.296.0 — sessionState/onUpdateSession dropped. session_states
  // table dropped this ship. The "v2.231 initiative tracker bar"
  // referenced below was retired earlier in the unification arc;
  // the modern initiative surface is the bottom InitiativeStrip,
  // which lives outside BattleMapV2 entirely.
  // v2.244.0 — NPC combat state for token visual feedback. Mirrors the
  // playerCharacters pattern but narrower: just what the canvas needs
  // (HP bar + condition icons + dead-state overlay). CampaignDashboard
  // pre-filters by visible_to_players for player viewers, so this list
  // is "everything I'm allowed to see" — no per-token RLS check needed
  // here. Optional so older callers (e.g., test harnesses) still compile.
  npcs?: Array<{
    id: string;
    name: string;
    current_hp: number;
    max_hp: number;
    conditions: string[];
  }>;
  // v2.393.0 — Per-token combat state, keyed by scene_token id. The
  // v2.389 sync trigger reuses scene_tokens.id as combatants.id, so
  // a token's HP/conditions/death state can be looked up by token id
  // alone — no join chain needed. When a token has an entry here, it
  // takes precedence over the legacy npcs[].hp lookup that reads the
  // creature TEMPLATE.
  //
  // Why introduced: pre-v2.393 the map showed identical HP for every
  // instance of the same creature (all goblins shared one HP pool)
  // and combat damage didn't appear on map tokens at all. Per-token
  // state ends both bugs.
  tokenStateMap?: Map<string, {
    current_hp: number | null;
    max_hp: number | null;
    conditions: string[];
    is_dead: boolean;
  }>;
  // v2.427.0 — Secondary index keyed by `${definition_type}:${definition_id}`
  // for fallback lookups when a token's combatant.id doesn't match
  // the token's id (i.e., the v2.389 sync trigger didn't fire for
  // this token). Token render uses tokenStateMap first, then this
  // map, then the legacy npcHpMap template, in priority order.
  tokenStateMapByDef?: Map<string, {
    current_hp: number | null;
    max_hp: number | null;
    conditions: string[];
    is_dead: boolean;
  }>;
  // v2.470.0 — Concentration map keyed by character.id. Built in
  // CampaignDashboard from the realtime characters list (same path as
  // characterHpMap) and passed straight through to TokenLayer where
  // the v2.460 purple ◉ glyph renderer reads it. v2.460 declared this
  // prop on TokenLayer and wired the renderer but forgot the
  // BattleMapV2 → TokenLayer pass-through, so the map was always
  // undefined inside TokenLayer and the glyph never rendered. This
  // adds the missing declaration; the JSX edit further down passes
  // it through.
  characterConcentrationMap?: Map<string, { spellId: string; roundsRemaining: number | null }>;
}

// Default scene config used when creating new scenes. v2.214 lets the
// DM pick these at create time.

// existing import path keeps working.
import { snapToCellCenter, snapTokenAnchor } from '../../lib/map/coords';
export { snapToCellCenter, snapTokenAnchor };














function TokenLayer(props: {
  viewport: Viewport | null;
  canvasEl: HTMLCanvasElement | null;
  onContextMenu: (state: ContextMenuState) => void;
  worldWidth: number;
  worldHeight: number;
  gridSizePx: number;
  // v2.495.0 — Combat Phase 3.1: campaignId is now required on every
  // tokensApi router call so the flag can be resolved per-call without
  // a stateful singleton. Threaded through from BattleMapV2's prop.
  campaignId: string;
  // v2.216 — Realtime drag callbacks + identity.
  currentUserId: string;
  onDragStart?: (tokenId: string) => void;
  onDragMove?: (tokenId: string, x: number, y: number) => void;
  onDragEnd?: (tokenId: string) => void;
  // v2.218 — when the ruler is active, ALL token interactions are
  // suppressed so the ruler gesture owns the pointer exclusively.
  rulerActive?: boolean;
  // v2.223 — same pattern for wall-drawing mode.
  wallActive?: boolean;
  // v2.234 — same pattern for text annotation mode. When active, all
  // pointer events on tokens bail out so the TextLayer's click handler
  // can place / edit text without competing.
  textActive?: boolean;
  // v2.235 — same pattern for any drawing tool (pencil/line/rect/circle).
  // The DrawingLayer captures pointer events on the canvas; tokens
  // must yield so the user can drag through their position to draw.
  drawActive?: boolean;
  // v2.236 — same pattern for FX particle mode. FxLayer captures
  // single-clicks to spawn effects; tokens yield so drag-through
  // and click-on-token don't compete with effect placement.
  fxActive?: boolean;
  // v2.269.0 — same pattern for the eraser tool. DrawingLayer owns
  // the click handler in this mode (resolves to a delete-drawing
  // operation), so tokens must yield so a click on a drawing
  // overlapping a token still erases the drawing instead of
  // selecting/dragging the token.
  eraserActive?: boolean;
  // v2.221 — character HP lookup for live HP bars on PC tokens.
  // Map<characterId, { current, max }>. Tokens whose characterId
  // matches an entry get an HP bar rendered underneath. Pure data
  // flow — store does not own this; it's derived from the
  // playerCharacters prop on every render.
  characterHpMap?: Map<string, { current: number; max: number }>;
  // v2.244 — NPC HP lookup for HP bars on roster-spawned tokens.
  // Mirrors characterHpMap but keyed by npcId. NPC bar visibility
  // differs: bars hide at full HP and only appear once damage has
  // been dealt (keeps the canvas clean during pre-combat setup).
  npcHpMap?: Map<string, { current: number; max: number }>;
  // v2.393.0 — Per-token state map. See parent prop docs.
  tokenStateMap?: Map<string, {
    current_hp: number | null;
    max_hp: number | null;
    conditions: string[];
    is_dead: boolean;
  }>;
  // v2.427.0 — Definition-keyed fallback (see parent prop docs).
  tokenStateMapByDef?: Map<string, {
    current_hp: number | null;
    max_hp: number | null;
    conditions: string[];
    is_dead: boolean;
  }>;
  // v2.244 — condition strip lookup. Keyed by token.id (NOT character/
  // npc id) so the renderer doesn't have to branch. CampaignDashboard +
  // BattleMapV2 build it by walking tokens and resolving each linked
  // PC or NPC. Tokens not in the map render no strip.
  tokenConditionsMap?: Map<string, string[]>;
  // v2.460.0 — Concentration map for character-linked tokens. Keyed
  // by character.id; values are { spellId, roundsRemaining }. NPCs
  // and monsters omit (the underlying field is character-only — see
  // useCampaignConcentrations docstring). Tokens with characterId in
  // the map render a purple ◉ glyph above the HP bar so DMs see
  // concentration at a glance while scanning the map. Complements
  // the v2.457 InitiativeStrip chip — same data, different surface.
  characterConcentrationMap?: Map<string, { spellId: string; roundsRemaining: number | null }>;
  // v2.226 — left-click-without-drag opens the token quick-info panel.
  // Fires only after the user releases the pointer with negligible
  // movement (and the token wasn't dragged). Receives world-screen
  // coordinates so the parent can place the panel near the token.
  onTokenClick?: (tokenId: string, screenX: number, screenY: number) => void;
  // v2.268.0 — fired when a drop is rejected because the path crosses
  // a movement-blocking wall. The parent shows a toast; TokenLayer
  // doesn't import the toast hook directly so it stays test-friendly
  // (rendering this layer in isolation doesn't need a ToastProvider).
  // v2.572.0 — reason distinguishes wall rejections from movement-
  // budget rejections so the toast can say the right thing.
  onMovementBlocked?: (reason?: 'wall' | 'budget') => void;
  // v2.282 — when true, hidden tokens (visibleToAll=false) render at
  // reduced alpha so the DM can see at a glance which tokens haven't
  // been revealed to players yet. Players never get hidden tokens
  // (RLS strips them at SELECT), so the alpha cue only ever applies
  // on the DM surface — players would never see a faded token.
  isDM?: boolean;
  // v2.396.0 — Player viewer's own PC id. Used to gate HP-bar render:
  // players see HP bars only on their own character; everyone else's
  // HP (party members, NPCs, creatures) is hidden so the table can't
  // meta-game off the bar fill levels. DM ignores this and sees all.
  myCharacterId?: string | null;
  // v2.358.0 — DM-only token-move undo. Pre-v2.358 useUndoRedo
  // explicitly excluded tokens because of multi-user drag races,
  // but DM-only undo on the DM's own token moves is safe — only one
  // user is moving the token. Player tokens still don't record (the
  // commit path checks isDM before calling this).
  recordUndoable?: (action: import('../../lib/hooks/useUndoRedo').UndoableAction) => void;
  // v2.418.0 — Self-write echo suppression hook. Called immediately
  // before each tokensApi.updateTokenPos commit so the realtime
  // postgres_changes echo handler can recognize and skip the
  // resulting UPDATE event for THIS row, avoiding the bulk
  // listTokens roundtrip that caused visible drop-jiggle. Optional
  // because TokenLayer is also used in test contexts that don't
  // wire realtime.
  onCommitPos?: (tokenId: string, x: number, y: number) => void;
  // v2.423.0 — Optimistic-budget hooks for the movement gate.
  // getEffectiveUsed returns the larger of (server-echoed used,
  // local prediction) so fast successive drags can't overspend the
  // budget while waiting for realtime echo. recordMoved is called
  // after a successful logMovement to bump the local prediction.
  getEffectiveUsed?: (participantId: string | null, echoedUsed: number) => number;
  recordMoved?: (participantId: string, distanceFt: number, echoedUsed: number) => void;
  // v2.429.0 — Animated drop-snap. Called instead of updatePos for
  // the post-pointerup snap so the token visually transitions to
  // the snap target over ~120ms instead of teleporting.
  onSnapAnimate?: (tokenId: string, fromX: number, fromY: number, toX: number, toY: number) => void;
  // v2.441.0 — Notification fired in pointerup when the pointer
  // actually moved (probe.didMove=true). Lets the parent stamp a
  // "drag just ended" timestamp so click-to-move can swallow the
  // synthetic click that fires on the same tick as pointerup.
  onDragMotionEnded?: () => void;
  // v2.358.0 — Token id currently selected by left-click. TokenLayer
  // renders a thin cyan ring around this token to indicate selection.
  // Distinct from activeTokenInfo.tokenId (gold ring, driven by
  // initiative) — both can be visible simultaneously when the DM
  // selects a non-active token.
  selectedTokenId?: string | null;
  // v2.339.0 — BG3 turn UX. When combat is active, this carries the
  // token id of the participant whose turn it is + their movement
  // budget so the renderer can stamp a gold pulse outline + an
  // "Xft / Yft" badge above the matching token. Null token id means
  // either no combat OR the active actor isn't placed on this scene.
  // v2.340.0 — extended with participant identity + campaign/encounter
  // ids so the drag handler can invoke canMove() + logMovement() on
  // drop. All four added fields are null when there's no active
  // combat, which is the gate the drag handler uses to decide whether
  // to enforce movement at all.
  // v2.341.0 — extended with action/bonus/reaction booleans so the
  // renderer can stamp the three-pip economy indicator on the active
  // token. Pips render gold-filled when available, dimmed dark when
  // consumed; toggle source-of-truth lives on combat_participants.
  activeTokenInfo?: {
    tokenId: string | null;
    used: number;
    max: number;
    dashed: boolean;
    participantId: string | null;
    participantName: string | null;
    participantType: 'character' | 'npc' | 'monster' | null;
    encounterId: string | null;
    campaignId: string | null;
    actionUsed: boolean;
    bonusUsed: boolean;
    reactionUsed: boolean;
    // v2.403.0 — entity_id of the currently-active actor. Used for
    // the fallback match in onPointerUp's enforcement gate when
    // activeTokenInfo.tokenId picked the wrong instance among
    // multiple same-creature tokens.
    participantEntityId: string | null;
  };
}) {
  const {
    viewport, canvasEl, onContextMenu, worldWidth, worldHeight, gridSizePx,
    currentUserId, onDragStart, onDragMove, onDragEnd, rulerActive, wallActive,
    textActive, drawActive, fxActive, eraserActive, characterHpMap, npcHpMap, tokenStateMap, tokenStateMapByDef, tokenConditionsMap,
    characterConcentrationMap,
    onTokenClick, onMovementBlocked, isDM, myCharacterId, activeTokenInfo,
    recordUndoable, selectedTokenId, onCommitPos, getEffectiveUsed, recordMoved, onSnapAnimate, onDragMotionEnded,
  } = props;
  const tokens = useBattleMapStore(s => s.tokens);
  const updatePos = useBattleMapStore(s => s.updateTokenPosition);
  const setDragging = useBattleMapStore(s => s.setDragging);
  const remoteDragLocks = useBattleMapStore(s => s.remoteDragLocks);

  // v2.358.0 — recordUndoable mirrored into a ref so the drag-end
  // closure (attached once per token at mount) can read the latest
  // value without re-wiring listeners. Same pattern as ruler/wall/etc.
  const recordUndoableRef = useRef(recordUndoable);
  useEffect(() => { recordUndoableRef.current = recordUndoable; }, [recordUndoable]);

  // v2.218: pointerdown is attached once per token; to read the
  // current rulerActive value without re-wiring listeners, mirror it
  // into a ref that updates every render.
  const rulerActiveRef = useRef(false);
  useEffect(() => { rulerActiveRef.current = !!rulerActive; }, [rulerActive]);
  // v2.223: same mechanism for wall-drawing mode.
  const wallActiveRef = useRef(false);
  useEffect(() => { wallActiveRef.current = !!wallActive; }, [wallActive]);
  // v2.234: same mechanism for text annotation mode.
  const textActiveRef = useRef(false);
  useEffect(() => { textActiveRef.current = !!textActive; }, [textActive]);
  // v2.235: same mechanism for any active drawing tool.
  const drawActiveRef = useRef(false);
  useEffect(() => { drawActiveRef.current = !!drawActive; }, [drawActive]);
  // v2.236: same mechanism for FX particle mode.
  const fxActiveRef = useRef(false);
  useEffect(() => { fxActiveRef.current = !!fxActive; }, [fxActive]);
  // v2.269.0: same mechanism for eraser mode.
  const eraserActiveRef = useRef(false);
  useEffect(() => { eraserActiveRef.current = !!eraserActive; }, [eraserActive]);
  // v2.340.0: same pattern for activeTokenInfo. The drag handler
  // attaches listeners once at mount; without a ref the closure
  // would capture the FIRST activeTokenInfo (likely null) and never
  // see turn changes. The ref keeps the closure reading the latest
  // value at drag-move and drop time.
  const activeTokenInfoRef = useRef(activeTokenInfo);
  useEffect(() => { activeTokenInfoRef.current = activeTokenInfo; }, [activeTokenInfo]);
  // v2.411.0: same ref pattern for isDM + myCharacterId. The
  // pointerdown handler is a stable closure attached once per token,
  // so it can't read the live React-prop values directly. The player
  // ownership gate (only the owning player may drag a player-linked
  // token; DM may drag anything) needs both to be current at the
  // moment of pointerdown.
  const isDMRef = useRef(isDM);
  useEffect(() => { isDMRef.current = isDM; }, [isDM]);
  const myCharacterIdRef = useRef(myCharacterId);
  useEffect(() => { myCharacterIdRef.current = myCharacterId; }, [myCharacterId]);

  interface TokenGfx {
    container: Container;
    circle: Graphics;
    initials: Text;
    // v2.215: sprite + mask. Added lazily when a portrait loads.
    sprite: Sprite | null;
    mask: Graphics | null;
    currentPath: string | null;
    loadGen: number;
    // v2.216: lock indicator ring. Added as a top-most child when a
    // remote user is dragging this token. Kept separate from `circle`
    // so we can toggle its visibility cheaply without redraws.
    lockRing: Graphics | null;
    // v2.221: HP bar — a thin pill rendered under the token when the
    // token is linked to a known character. Lazily created on first
    // bar draw, redrawn when HP values change. null if the token has
    // no characterId or the linked character isn't in characterHpMap.
    hpBar: Graphics | null;
    // v2.226: name label rendered below the token + HP bar so DMs can
    // read which token is which without relying on initials. Lazy
    // create on first draw; updated on token.name change.
    nameLabel: Text | null;
    // v2.244 — dead-state visuals. When current_hp <= 0, we apply a
    // grayscale ColorMatrixFilter to the container (washes out the
    // sprite/initials/HP bar uniformly) and overlay a red ✖. Filter is
    // attached/removed at the container level rather than rebuilt each
    // tick — toggling is cheap. The ✖ is a Graphics with two strokes.
    deadFilter: ColorMatrixFilter | null;
    deadX: Graphics | null;
    // v2.391.0 — Strikethrough line over the name label when the
    // token is dead. PIXI Text doesn't support CSS-style line-through,
    // so we draw a thin red Graphics line across the label's width.
    // Sized + positioned each reconcile so it tracks label width and
    // position changes (e.g., HP bar visibility shifting label down).
    nameStrike: Graphics | null;
    // v2.244 — condition icon strip below the name label. One Container
    // owning N child icons (Graphics-backed circle + Text glyph). We
    // tear it down + rebuild on conditions change rather than diff
    // child-by-child; conditions are rare and the cost is trivial.
    conditionsLayer: Container | null;
    // v2.339.0 — BG3 turn UX overlays. Both null until first activation
    // (token isn't the active turn) — we lazily create on first need
    // and toggle .visible thereafter. Removing/re-adding Pixi children
    // is more expensive than visibility toggles, and active-turn flips
    // every few seconds during combat.
    //   • turnRing: gold outline graphics, sibling of `circle`. Pulses
    //     via the same rAF loop that drives lockRing.
    //   • movementBadge: Text node above the token showing "Xft/Yft"
    //     with a small backing pill (movementBadgeBg) for legibility
    //     against any map background.
    turnRing: Graphics | null;
    movementBadge: Text | null;
    movementBadgeBg: Graphics | null;
    // v2.358.0 — Selection ring. Thin cyan outline rendered when the
    // token is the user's currently-selected token (left-click select,
    // not initiative). Lazy-created like turnRing/movementBadge —
    // null until the token first becomes selected, .visible toggled
    // thereafter.
    selectionRing: Graphics | null;
    // v2.341.0 — Action / Bonus / Reaction pip indicators. A small
    // 3-dot strip rendered just below the movement badge above the
    // active token. Each pip is a Graphics circle: gold-filled when
    // available, dim-charcoal when consumed. Letters A / B / R sit
    // inside via a single Text per pip. We keep them as a Container
    // so we can toggle .visible at the group level cheaply, and
    // mutate child fills in place for cheap per-frame updates.
    economyPipsLayer: Container | null;
    economyPipsRefs: Array<{ dot: Graphics; glyph: Text; key: 'A' | 'B' | 'R' }> | null;
    // v2.411.0 — Outer halo ring for the active-turn pulse. Sits at
    // r + 8 with low alpha (0.3) so the inner turnRing reads as the
    // primary signal while the halo gives a softer "active" glow.
    // Lazily created on first activation, toggled .visible afterwards.
    // Same per-frame pulse + rotation as turnRing; we rotate the
    // halo's container so the dashed/segmented stroke pattern (drawn
    // once at create time) appears to spin.
    turnHaloRing: Graphics | null;
    // v2.411.0 — Padlock glyph rendered above any locked token (a
    // token with isLocked=true). Lazy-created on first lock event,
    // visibility toggles thereafter. Position mirrors movement badge
    // offset (-(r + 18)) but shifted right of center so the badge
    // doesn't collide when both are present (active turn AND locked
    // is rare but possible on a DM-controlled creature mid-combat).
    lockGlyph: Text | null;
    // v2.460.0 — Concentration glyph rendered above any character
    // token whose linked character is concentrating. Purple ◉ at
    // -(r + 18) — same vertical band as the lock glyph but on the
    // opposite side (left of center) so they coexist when both apply.
    // Lazy-created on first concentration, .visible toggled thereafter.
    // Only character-linked tokens get this; NPC/monster tokens skip
    // entirely (they don't track concentration in this field — see
    // useCampaignConcentrations docstring).
    concentrationGlyph: Text | null;
    // v2.453.0 — Action Economy Ring. Three 60° arc segments around
    // the active token at radius r + 14, encoding A/B/R availability
    // (bright cyan = available, dim charcoal = consumed). Replaces the
    // v2.341 pip strip approach (reverted in v2.411 for visual noise)
    // — arcs sit OUTSIDE the existing turnHaloRing so they don't fight
    // it for vertical real estate above the token. Three letter labels
    // (A/B/R) at arc midpoints make the encoding self-explanatory
    // without needing legend or hover. Static (no rAF) so they don't
    // compete with the halo's rotation animation.
    actionEconomyRing: Graphics | null;
    actionEconomyLabels: Text[] | null;
    // v2.456.0 — Hover-targeting preview ring. Drawn around any token
    // whose participant ID appears in aoePreviewTargetIds (populated by
    // the cone/line picker's hover-preview subscriber in
    // MonsterActionPanel). Red-orange (#f87171), thicker than the
    // selection ring (3px), sits OUTSIDE the action-economy ring at
    // r + 18 so it doesn't fight the existing decoration. Lazy-created
    // on first highlight; visibility toggled imperatively from a
    // dedicated effect so we don't piggyback on the giant render loop.
    targetHighlight: Graphics | null;
  }
  const gfxMapRef = useRef<Map<string, TokenGfx>>(new Map());
  // v2.268.0 — added originX/originY so the drop handler can validate
  // movement against blocking walls (segment from origin → snapped
  // drop point shouldn't intersect any wall with blocksMovement=true).
  // Captured at drag start; never mutated during the drag.
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; originX: number; originY: number } | null>(null);

  // v2.256.0 — Lock-ring pulse animation. A single rAF walks every
  // active TokenGfx and breathes the lockRing's alpha+scale. Cheaper
  // than redrawing the ring geometry every frame (we only mutate
  // transform fields). The ring's geometry is set once when it's
  // attached (in the per-token reconcile below); this loop just
  // animates its top-level transform.
  //
  // Period: ~1200ms full breath. Math.sin keeps the easing smooth at
  // the endpoints. Range: alpha 0.55 → 1.0, scale 1.0 → 1.08 — small
  // enough to read as "alive" without hijacking attention from the
  // moving token.
  //
  // v2.385.0 — Same loop now also pulses turnRing on the active-turn
  // token. The turn-ring comment in the per-token reconcile block
  // promised this back in v2.339 but the pulse was never wired.
  // Slower period (1800ms — the user described it as "flashing
  // yellow slowly almost pulsing") and a tighter alpha range so the
  // gold halo reads as alive without distracting from action. No
  // scale change on the turn ring — its purpose is to mark the
  // ACTIVE TOKEN, and zooming the ring would compete with the
  // movement-spent visual feedback.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      // Lock ring (v2.256): 1.2s breath, alpha + scale.
      const lockT = elapsed / 1200;
      const lockPhase = (Math.sin(lockT * Math.PI * 2) + 1) / 2; // 0..1
      const lockAlpha = 0.55 + lockPhase * 0.45;
      const lockScale = 1 + lockPhase * 0.08;
      // Turn ring (v2.385): 1.8s breath, alpha only.
      // v2.411.0 — add slow rotation. We rotate the inner turnRing
      // around its center; the halo (v2.411 outer ring) rotates the
      // opposite direction so the two-ring system reads as alive.
      // Rotation rate is small (~0.4 rad/sec) to match the "almost
      // pulsing" pace of the alpha breath without becoming
      // distracting. We do NOT rotate the container — only the ring
      // graphics so other children (HP bar, name, badges) stay put.
      const turnT = elapsed / 1800;
      const turnPhase = (Math.sin(turnT * Math.PI * 2) + 1) / 2;
      const turnAlpha = 0.6 + turnPhase * 0.4;
      const haloAlpha = 0.18 + turnPhase * 0.22; // 0.18..0.40
      const turnRotation = (elapsed / 1000) * 0.4;     // CW
      const haloRotation = -(elapsed / 1000) * 0.25;   // CCW, slower
      for (const entry of gfxMapRef.current.values()) {
        const lock = entry.lockRing;
        if (lock && !lock.destroyed) {
          lock.alpha = lockAlpha;
          lock.scale.set(lockScale);
        }
        const turn = entry.turnRing;
        // Only pulse when visible; the per-token reconcile flips
        // .visible to false when the token isn't the active turn.
        if (turn && !turn.destroyed && turn.visible) {
          turn.alpha = turnAlpha;
          turn.rotation = turnRotation;
        }
        // v2.411.0 — outer halo: same visibility check, opposite-
        // direction rotation, lower alpha range.
        const halo = entry.turnHaloRing;
        if (halo && !halo.destroyed && halo.visible) {
          halo.alpha = haloAlpha;
          halo.rotation = haloRotation;
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // v2.226 — track pointerdown screen pos + timestamp to distinguish
  // "click" (no drag) from "drag commit" on pointerup.
  const clickProbeRef = useRef<{
    id: string;
    downClientX: number;
    downClientY: number;
    downAtMs: number;
    didMove: boolean;
  } | null>(null);

  const layerContainerRef = useRef<Container | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const c = new Container();
    viewport.addChild(c);
    layerContainerRef.current = c;
    return () => {
      if (viewport && !viewport.destroyed) viewport.removeChild(c);
      c.destroy({ children: true });
      layerContainerRef.current = null;
      gfxMapRef.current.clear();
    };
  }, [viewport]);

  useEffect(() => {
    const layer = layerContainerRef.current;
    if (!layer || !viewport) return;
    const gfxMap = gfxMapRef.current;

    for (const [id, entry] of gfxMap) {
      if (!tokens[id]) {
        layer.removeChild(entry.container);
        entry.container.destroy({ children: true });
        gfxMap.delete(id);
      }
    }

    for (const token of Object.values(tokens)) {
      let entry = gfxMap.get(token.id);
      const isNew = !entry;
      if (isNew) {
        const container = new Container();
        container.eventMode = 'static';
        container.cursor = 'grab';
        const circle = new Graphics();
        const initials = new Text({
          text: tokenInitials(token.name),
          style: new TextStyle({
            fontFamily: 'sans-serif',
            fontWeight: '700',
            fontSize: 20,
            fill: 0xffffff,
            align: 'center',
            stroke: { color: 0x0f1012, width: 3 },
          }),
        });
        initials.anchor.set(0.5, 0.5);
        container.addChild(circle);
        container.addChild(initials);
        layer.addChild(container);
        entry = {
          container, circle, initials,
          sprite: null, mask: null, currentPath: null, loadGen: 0,
          lockRing: null,
          hpBar: null,
          nameLabel: null,
          deadFilter: null,
          deadX: null,
          nameStrike: null,
          conditionsLayer: null,
          turnRing: null,
          movementBadge: null,
          movementBadgeBg: null,
          selectionRing: null,
          economyPipsLayer: null,
          economyPipsRefs: null,
          // v2.411.0
          turnHaloRing: null,
          lockGlyph: null,
          // v2.460.0
          concentrationGlyph: null,
          // v2.453.0
          actionEconomyRing: null,
          actionEconomyLabels: null,
          // v2.456.0
          targetHighlight: null,
        };
        gfxMap.set(token.id, entry);

        (container as any).__tokenId = token.id;
        container.on('pointerdown', (event: FederatedPointerEvent) => {
          if (!viewport) return;
          // v2.218: when ruler is active, ignore all token pointer events
          // so the ruler gesture owns the canvas. Don't stopPropagation
          // here — the window-level pointerdown in RulerLayer needs to
          // see the event.
          if (rulerActiveRef.current) return;
          // v2.223: same for wall-drawing mode.
          if (wallActiveRef.current) return;
          // v2.234: same for text annotation mode.
          if (textActiveRef.current) return;
          // v2.235: same for any drawing tool (pencil/line/rect/circle).
          if (drawActiveRef.current) return;
          // v2.236: same for FX particle mode.
          if (fxActiveRef.current) return;
          // v2.269.0: same for eraser mode. DrawingLayer captures the
          // click; tokens yield so a click on a drawing overlapping a
          // token erases the drawing instead of grabbing the token.
          if (eraserActiveRef.current) return;
          if (event.button === 2) {
            event.stopPropagation();
            event.preventDefault();
            const tid = (container as any).__tokenId as string;
            // v2.362.0 — Read viewport-relative clientX from the
            // underlying DOM PointerEvent (event.nativeEvent). This
            // IS viewport-relative (DOM convention) and is what
            // position:fixed expects. Pre-v2.360 used this same
            // path; v2.360 wrongly switched to event.clientX (Pixi
            // canvas-relative); v2.361 wrongly tried event.global +
            // canvas rect (event.global is world-space, not canvas-
            // pixel-space). Back to the original path. The actual
            // bug (menu rendering far off) was that the menu's
            // position:fixed was being trapped by an animate-fade-
            // in transform ancestor — fixed via createPortal in
            // TokenContextMenu's return.
            const oe = event.nativeEvent as MouseEvent | PointerEvent;
            onContextMenu({
              tokenId: tid,
              clientX: oe.clientX,
              clientY: oe.clientY,
            });
            return;
          }
          if (event.button !== 0) return;
          event.stopPropagation();
          const tid = (container as any).__tokenId as string;
          // v2.216: refuse to start drag if a different user is
          // currently dragging this token (stale lock from their
          // in-flight drag). Silently ignore the press — no toast yet.
          const locks = useBattleMapStore.getState().remoteDragLocks;
          if (locks[tid] && locks[tid] !== currentUserId) {
            return;
          }
          const t = useBattleMapStore.getState().tokens[tid];
          if (!t) return;
          // v2.414.0 — Unified permission + combat gate.
          //
          // RULES:
          //   • DM, OUTSIDE combat: drag anything freely. Locks
          //     are inert outside combat (locks exist to enforce
          //     turn-by-turn movement during initiative).
          //   • DM, IN combat: drag any unlocked token freely; for
          //     locked tokens, only when active turn + movement
          //     remaining (BG3-style enforcement). Locks default
          //     ON for new tokens; DM "Unlock Token" via the
          //     context menu to override per-token during combat.
          //   • PLAYER, OUTSIDE combat: cannot drag at all. The
          //     DM is the only one who can move tokens during
          //     setup / between encounters / exploration.
          //   • PLAYER, IN combat: can drag only tokens they own
          //     (PC by characterId match, OR token granted to them
          //     via Player Control), only on their active turn,
          //     only while movement remains.
          //
          // The "in combat" signal is activeTokenInfoRef.current
          // being non-null — combat without any active turn means
          // no token's movement is being tracked, so drag should
          // behave as out-of-combat.
          const ati = activeTokenInfoRef.current;
          const inCombat = !!ati;

          if (!isDMRef.current) {
            // ── PLAYER PATH ───────────────────────────────────────
            const myCid = myCharacterIdRef.current;

            // v2.617.0 — B3a (playable-forms arc): MINION path first.
            // A token whose backing combatant the current user OWNS
            // (familiar / creature summon, v2.615–616) but which
            // isn't a PC token. RLS (v2.616) already authorizes the
            // position write server-side; this is the matching client
            // affordance. Rules:
            //   - Out of combat: free movement (walk your familiar).
            //   - In combat: movable while YOUR character's token is
            //     the active one — 2024 RAW: the creature takes its
            //     turn immediately after yours. Minions aren't combat
            //     participants, so no movement budget is tracked
            //     (matches how the DM moves unlocked tokens).
            const ownsMinion = !t.characterId
              && !!(t as any).combatantOwnerId
              && (t as any).combatantOwnerId === currentUserId;
            if (ownsMinion) {
              if (!inCombat) {
                // fall through to drag start below
              } else {
                const activeTok = ati!.tokenId != null ? tokens[ati!.tokenId] : undefined;
                const ownerTokenActive = !!activeTok
                  && !!activeTok.characterId && activeTok.characterId === myCid;
                if (!ownerTokenActive) return;
              }
            } else {
              // ── PC / DM-granted path (pre-v2.617 behavior) ──────
              // Outside combat: refuse silently.
              if (!inCombat) return;

              // Must own this token (PC characterId match OR DM grant).
              const ownsByCharacter = !!t.characterId && t.characterId === myCid;
              const grantedByDM = !!(t as any).playerId && (t as any).playerId === currentUserId;
              if (!ownsByCharacter && !grantedByDM) return;

              // Must be this token's active turn with movement left.
              const isThisTokenActive = ati!.tokenId === tid;
              const movementRemaining = Math.max(0, ati!.max - ati!.used);
              if (!isThisTokenActive || movementRemaining <= 0) return;
            }
          } else {
            // ── DM PATH ───────────────────────────────────────────
            // Outside combat: free reign.
            if (inCombat && (t as any).isLocked) {
              // In combat with a locked token: same active-turn rule
              // applies even to the DM. Unlocking via context menu
              // exempts the token from this gate for the rest of
              // combat (or until re-locked).
              const isThisTokenActive = ati!.tokenId === tid;
              const movementRemaining = Math.max(0, ati!.max - ati!.used);
              if (!isThisTokenActive || movementRemaining <= 0) return;
            }
            // else: in-combat unlocked, OR out-of-combat → allow.
          }
          const worldPoint = viewport.toWorld(event.global.x, event.global.y);
          // v2.416.0 — For even-size tokens (Large 2×2, Gargantuan
          // 4×4) the anchor sits at a grid intersection (the
          // top-left corner of the footprint, not the visual center).
          // Pre-v2.416 we computed offset = cursor − anchor, so
          // clicking on the *bottom-right* cell of a Tarrasque set
          // a ~120px offset. The drag then tracked the click point
          // correctly during pointermove, but at pointerup
          // snapTokenAnchor snapped the ANCHOR — not the cursor —
          // and the relationship between "where the cursor sits"
          // and "where the snap target is" was off by one or two
          // cells. Symptom: drop a Tarrasque and watch it shift
          // to a neighboring grid cell.
          //
          // v2.428.1 — Use the natural cursor-to-anchor offset for
          // ALL sizes (odd + even). Pre-v2.423, the even-size branch
          // used offsetX=0 because visual = anchor for even sizes
          // (both at the top-left intersection), so zeroing the
          // offset put the visual top-left under the cursor — fine
          // back then. After v2.423 added a visual offset for even
          // sizes (centering the visual on the footprint instead of
          // its top-left corner), offsetX=0 means the cursor is no
          // longer over the visual at all — visual sits half a
          // footprint to the south-east of the cursor while
          // dragging, and on release the snap target was relative
          // to the anchor under the cursor, so the token "fell"
          // to where the anchor was rather than where the visual
          // appeared. WYSIWYG drag requires the cursor-to-visual
          // relationship to be preserved, which the natural
          // (cursor - anchor) offset accomplishes for both even
          // and odd sizes given v2.423's centering math.
          const offsetX = worldPoint.x - t.x;
          const offsetY = worldPoint.y - t.y;
          dragRef.current = {
            id: tid,
            offsetX,
            offsetY,
            // v2.268 — remember where the token was when the drag began so
            // wall-collision validation has both endpoints of the segment.
            originX: t.x,
            originY: t.y,
          };
          // v2.226 — record click-probe state. If pointerup fires soon
          // after with negligible movement, the parent gets onTokenClick
          // instead of (or in addition to) the drag commit.
          // v2.362.0 — Read viewport-relative clientX from the
          // underlying DOM PointerEvent. The pointerup compares
          // against a DOM PointerEvent.clientX (also viewport-
          // relative), so both endpoints of the comparison must use
          // the same coord space. v2.360-2.361 attempts at "fixing"
          // this with Pixi-relative coords broke click vs drag
          // detection.
          const oeProbe = event.nativeEvent as PointerEvent;
          clickProbeRef.current = {
            id: tid,
            downClientX: oeProbe.clientX,
            downClientY: oeProbe.clientY,
            downAtMs: performance.now(),
            didMove: false,
          };
          setDragging(tid);
          container.cursor = 'grabbing';
          container.alpha = 0.75;
          // v2.216: claim the lock + notify peers.
          onDragStart?.(tid);
        });
      }
      const { container, circle, initials } = entry!;

      // v2.423.0 — Center the visual on the FOOTPRINT, not the
      // anchor. For odd-size tokens (1×1, 3×3) the anchor IS the
      // cell center, so no offset needed. For even-size tokens
      // (Large 2×2, Gargantuan 4×4) the anchor sits on the
      // top-left grid intersection of the footprint — drawing the
      // circle at (0,0) inside the container puts the visual in
      // the WRONG place (overhanging the cell up-and-left of the
      // footprint). Symptom user reported: "the large token still
      // doesnt art right when dropping it" — visual lands a cell
      // off because every child renders relative to the anchor,
      // not the footprint center.
      //
      // Fix: shift the container BY half the footprint span for
      // even-size tokens. Children all stay at (0,0) and render at
      // the proper visual center. snap math, click-area math, and
      // distance math all keep using token.x/token.y as the anchor
      // (they don't read container.position) so this is render-only.
      const footprintCells = tokenFootprintCells(token.size);
      const evenSize = footprintCells % 2 === 0;
      const visualOffset = evenSize ? (footprintCells * gridSizePx) / 2 : 0;
      container.position.set(token.x + visualOffset, token.y + visualOffset);

      // v2.282 — DM-side visual cue for hidden tokens. Players never
      // get this code path (RLS strips visibleToAll=false rows from
      // their SELECT), so the dim only ever shows on the DM surface.
      // Skipped while THIS token is being dragged — the drag handler
      // imperatively sets alpha=0.75 on grab and =1 on release, and
      // we don't want to fight it mid-drag (the 0.75 dim is the v2.216
      // visual contract for "I'm holding this"). On drag-end the
      // handler resets to 1 then the very next render frame restores
      // the visibility-correct value, so there's no flash.
      const isThisDragging = dragRef.current?.id === token.id;
      if (!isThisDragging) {
        container.alpha = (isDM && !token.visibleToAll) ? 0.4 : 1;
      }

      const r = tokenRadiusForSize(token.size, gridSizePx);
      circle.clear();
      circle.setFillStyle({ color: token.color, alpha: 0.92 });
      circle.circle(0, 0, r);
      circle.fill();
      circle.setStrokeStyle({ color: 0x0f1012, width: 2, alpha: 0.9 });
      circle.circle(0, 0, r);
      circle.stroke();
      circle.setStrokeStyle({ color: 0xffffff, width: 1, alpha: 0.35 });
      circle.circle(0, 0, r - 2);
      circle.stroke();

      // v2.397.0 — Click/drag area covers the FULL footprint, not just
      // the visible circle. Pre-v2.397 the container's interactive
      // bounds were derived from the circle Graphics — for a Large
      // token the visual circle has cellSpan 1.85 (radius ≈ 0.925
      // cells), so the corner cells of the 2×2 footprint were
      // outside the hit region. User reported "the click area is just
      // one box" — meaning only the anchor cell reliably grabbed the
      // token. Setting an explicit Rectangle hitArea sized to the
      // full footprint makes every cell of the footprint draggable.
      //
      // Footprint sizing & centering: we use the RAW cell count
      // (tokenFootprintCells: 1/2/3/4 for medium/large/huge/garg)
      // and center the rectangle on the anchor. For even sizes
      // (Large=2, Garg=4), centering means the anchor sits at the
      // intersection of cells, offset by half a cell from any
      // single-cell center. That matches what the visual circle
      // does today, so the click area aligns with what the user
      // sees.
      const footCells = tokenFootprintCells(token.size);
      const footPx = footCells * gridSizePx;
      // Set on container (the pointer-event target) rather than
      // circle. Container.eventMode='static' wires the events; its
      // hitArea drives where they fire. Belt-and-suspenders: also
      // cover the children with a footprint-sized hit area so any
      // future child reorder doesn't drop hits.
      container.hitArea = new Rectangle(-footPx / 2, -footPx / 2, footPx, footPx);

      // v2.398.0 — Footprint square outline for Large+ tokens. With
      // the v2.398 visual circle now inscribed in the size×size
      // footprint, the user can see the dragon fills its 3×3 area
      // — but a faint square outline around the cell boundaries
      // makes it absolutely unambiguous which cells are occupied,
      // both at rest and while dragging (the outline moves with the
      // container). Only drawn for size > 1 because Medium tokens
      // are 1 cell and the existing circle already conveys that.
      // Drawn ON the same circle Graphics so we don't add a child
      // (keeps the gfx tree small + scrubs cleanly between renders
      // because circle.clear() runs above).
      if (footCells > 1) {
        const half = footPx / 2;
        circle.setStrokeStyle({ color: 0xffffff, width: 1, alpha: 0.18 });
        circle.rect(-half, -half, footPx, footPx);
        circle.stroke();
      }

      const newText = tokenInitials(token.name);
      if (initials.text !== newText) initials.text = newText;
      const targetFontSize = Math.max(11, Math.round(r * 0.75));
      if (initials.style.fontSize !== targetFontSize) {
        initials.style.fontSize = targetFontSize;
      }

      // v2.215 portrait rendering.
      //
      // Goal: when token.imageStoragePath is set and differs from the
      // path we currently have loaded, async-load the texture and on
      // success add a masked Sprite child. Keep the color+initials
      // fallback during load and on error.
      //
      // Side-effect handling in a render-reconcile is ugly but bounded:
      // we capture loadGen at kick-off and compare on resolve to ignore
      // outdated loads. The async chain is intentionally fire-and-forget
      // so the reconcile loop stays synchronous.
      const desiredPath = token.imageStoragePath;
      const currentEntry = entry!;
      if (desiredPath !== currentEntry.currentPath) {
        // Bump gen so any in-flight load becomes stale.
        currentEntry.loadGen += 1;
        const thisGen = currentEntry.loadGen;
        currentEntry.currentPath = desiredPath;

        // Clean up any previous sprite + mask — the old texture no
        // longer applies. Will re-add if/when the new one loads.
        if (currentEntry.sprite) {
          if (!currentEntry.sprite.destroyed) {
            container.removeChild(currentEntry.sprite);
            currentEntry.sprite.destroy();
          }
          currentEntry.sprite = null;
        }
        if (currentEntry.mask) {
          if (!currentEntry.mask.destroyed) {
            container.removeChild(currentEntry.mask);
            currentEntry.mask.destroy();
          }
          currentEntry.mask = null;
        }
        initials.visible = true; // fallback re-shown while loading

        if (desiredPath) {
          const url = assetsApi.getPortraitUrl(desiredPath);
          if (url) {
            // Pixi's Assets.load caches by URL so re-requesting the
            // same portrait across tokens is free after first load.
            Assets.load<Texture>(url).then(texture => {
              // If the token was removed, reassigned a new path, or
              // the container got torn down while we were loading,
              // bail silently.
              const live = gfxMapRef.current.get(token.id);
              if (!live || live.loadGen !== thisGen) return;
              if (live.container.destroyed) return;

              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5);
              // Size the sprite to match the token circle, preserving
              // the portrait's aspect ratio (the mask crops it circular
              // regardless of source aspect).
              const { width: tw, height: th } = texture;
              const aspect = tw && th ? tw / th : 1;
              const diameter = 2 * r;
              if (aspect >= 1) {
                sprite.height = diameter;
                sprite.width = diameter * aspect;
              } else {
                sprite.width = diameter;
                sprite.height = diameter / aspect;
              }

              // Circular mask so portraits render as circle crops.
              const mask = new Graphics();
              mask.circle(0, 0, r - 1);
              mask.fill(0xffffff);
              sprite.mask = mask;

              // Insert order: mask first (so Pixi processes it), sprite
              // above the fallback circle, initials hidden (portrait is
              // identification enough). Outline circle stays on top of
              // sprite for a clean rim.
              live.container.addChild(mask);
              // Move sprite below the circle outline? Actually we want
              // circle on top so the rim shows. Pixi draw order = child
              // order. So: [circle-fill, sprite, circle-outline, initials].
              // Our circle has both fill and stroke in one Graphics,
              // so we just put the sprite after it and hide initials.
              live.container.addChildAt(sprite, live.container.getChildIndex(circle) + 1);
              live.initials.visible = false;

              live.sprite = sprite;
              live.mask = mask;
            }).catch(err => {
              // Failure path: silently fall back. Console log for
              // devs, token still renders fine with color+initials.
              console.error('[BattleMapV2] texture load failed', desiredPath, err);
            });
          }
        }
      } else if (currentEntry.sprite && !currentEntry.sprite.destroyed) {
        // Same portrait as before — just resync size (token.size may
        // have changed via context menu resize).
        const { width: tw, height: th } = currentEntry.sprite.texture;
        const aspect = tw && th ? tw / th : 1;
        const diameter = 2 * r;
        if (aspect >= 1) {
          currentEntry.sprite.height = diameter;
          currentEntry.sprite.width = diameter * aspect;
        } else {
          currentEntry.sprite.width = diameter;
          currentEntry.sprite.height = diameter / aspect;
        }
        // Redraw the mask too (r may have changed).
        if (currentEntry.mask && !currentEntry.mask.destroyed) {
          currentEntry.mask.clear();
          currentEntry.mask.circle(0, 0, r - 1);
          currentEntry.mask.fill(0xffffff);
        }
      }

      // v2.216 — lock ring for tokens being dragged by a remote user.
      // We render a thicker purple outline outside the circle so it's
      // visually distinct from the normal token rim. When the lock
      // clears (user released), we remove the ring on the next
      // reconcile cycle.
      const lockerId = remoteDragLocks[token.id];
      const shouldShowLockRing = Boolean(lockerId) && lockerId !== currentUserId;
      if (shouldShowLockRing) {
        let ring = currentEntry.lockRing;
        if (!ring || ring.destroyed) {
          ring = new Graphics();
          container.addChild(ring);
          currentEntry.lockRing = ring;
        }
        ring.clear();
        // Outer glow ring, 5px outside the token's rim.
        ring.setStrokeStyle({ color: 0xa78bfa, width: 3, alpha: 0.85 });
        ring.circle(0, 0, r + 5);
        ring.stroke();
        // Inner soft halo for emphasis.
        ring.setStrokeStyle({ color: 0xa78bfa, width: 1, alpha: 0.4 });
        ring.circle(0, 0, r + 8);
        ring.stroke();
      } else if (currentEntry.lockRing) {
        // Not locked — tear down the ring.
        if (!currentEntry.lockRing.destroyed) {
          container.removeChild(currentEntry.lockRing);
          currentEntry.lockRing.destroy();
        }
        currentEntry.lockRing = null;
      }

      // v2.221 — HP bar. Renders for tokens linked to a known PC
      // (always-on) or NPC (only when damaged — full-HP NPCs hide
      // the bar to keep pre-combat setup uncluttered, per v2.244 spec).
      // Bar sits below the token at a constant offset; width scales
      // with token radius so Tiny vs Gargantuan both look proportional.
      // Color shifts from green (full) → yellow (50%) → red (25%) for
      // at-a-glance status.
      // v2.244 — fall through to NPC HP map when token isn't linked to
      // a PC. PCs and NPCs are mutually exclusive on a token so the
      // priority is just for the (rare) case of a token with both ids.
      const pcHpInfo = token.characterId && characterHpMap
        ? characterHpMap.get(token.characterId)
        : null;
      // v2.393.0 — Per-token combatants state takes precedence over
      // the legacy creature-template fallback. tokenStateMap is keyed
      // by token.id (== combatants.id thanks to the v2.389 sync
      // trigger), so each goblin instance gets its own HP / dead /
      // conditions independent of its template. Combat damage written
      // to combatants.current_hp now appears here in real time. Falls
      // through to npcHpMap (template) for tokens that don't yet have
      // a combatant — e.g., a token created during a brief window
      // before the trigger fires, or a custom orphan token where the
      // template lookup is meaningless anyway.
      //
      // v2.427.0 — Secondary lookup by definition. When token.id !=
      // combatant.id (sync trigger missed for some tokens — observed
      // for at least the Adult Gold Dragon roster spawn the user
      // reported), the primary tokenStateMap.get(token.id) misses
      // and the renderer falls through to npcHpInfo (template HP,
      // always full). That made the token bar show full HP while
      // combat had actually damaged the dragon's combatants.current_hp.
      // The secondary index keyed by `${type}:${id}` recovers the
      // right row whether or not the sync trigger fired.
      // v2.428.0 — Order changed: definition-keyed lookup is now the
      // PRIMARY path, with token.id-keyed lookup as a fallback. User
      // logs showed combat_participants → combatants JOIN was working
      // but the token bar still didn't update. Root cause: there are
      // duplicate combatants rows for the dragon — the v2.389 trigger
      // created one keyed by token.id (full HP, never damaged) and
      // an earlier creation path made another keyed by a different
      // UUID that combat_participants.combatant_id points to (this
      // is the one being damaged). tokenStateMap.get(token.id) found
      // the orphan row; the canonical damaged row was invisible.
      //
      // tokenStateMapByDef in v2.428 is built from CombatContext's
      // participants array (which reads through combat_participants
      // → JOIN combatants with v2.426 fallbacks), so it ALWAYS points
      // to the canonical damaged row that the InitiativeStrip and
      // MonsterActionPanel already use.
      let tokenState: { current_hp: number | null; max_hp: number | null; conditions: string[]; is_dead: boolean } | null = null;
      if (!pcHpInfo && tokenStateMapByDef) {
        // Build the definition key from the token's own linkage. Tokens
        // that link to PCs use 'character', NPC roster tokens use
        // 'npc', creature/monster spawns use 'monster'. Token shape
        // exposes characterId and npcId; monsters share npcId for
        // roster-spawned creature instances.
        if (token.characterId) {
          tokenState = tokenStateMapByDef.get(`character:${token.characterId}`) ?? null;
        }
        if (!tokenState && token.npcId) {
          // npc roster combatants use definition_type='npc'; creature
          // template combatants use 'monster'. Try both.
          tokenState = tokenStateMapByDef.get(`npc:${token.npcId}`)
            ?? tokenStateMapByDef.get(`monster:${token.npcId}`)
            ?? null;
        }
      }
      // Fallback to the token.id-keyed map for tokens not in active
      // combat (no participant entry, but maybe still has a combatants
      // row from a previous encounter).
      if (!pcHpInfo && !tokenState && tokenStateMap) {
        tokenState = tokenStateMap.get(token.id) ?? null;
      }
      const tokenStateHpInfo = (tokenState && tokenState.max_hp != null && tokenState.current_hp != null)
        ? { current: tokenState.current_hp, max: tokenState.max_hp }
        : null;
      const npcHpInfo = !pcHpInfo && !tokenStateHpInfo && token.npcId && npcHpMap
        ? npcHpMap.get(token.npcId)
        : null;
      const hpInfo = pcHpInfo ?? tokenStateHpInfo ?? npcHpInfo ?? null;
      // v2.396.0 — Player privacy gate. Players see HP bars only on
      // their own PC; everyone else's HP (party, NPCs, creatures) is
      // hidden. Prevents meta-gaming off bar fill levels — a player
      // shouldn't be able to look at the dragon and say "ok 75% so
      // probably ~400hp left". DM ignores this and sees all bars.
      // The own-PC gate is character-id match: token.characterId
      // === myCharacterId.
      const isOwnPcToken = !!myCharacterId && token.characterId === myCharacterId;
      const visibleToViewer = isDM || isOwnPcToken;
      // v2.400.0 — DM always sees HP bars on every token (PCs +
      // creatures, full or damaged). Pre-v2.400 the rule was
      // "NPC bars hide at full HP" (a v2.244 anti-clutter
      // heuristic) — but that meant after a fresh combat start
      // the DM saw NO bars on any creature until someone took
      // damage, which made tactical planning harder. The privacy
      // gate (visibleToViewer) is still enforced — players still
      // see only their own PC's bar.
      //
      // For PLAYER viewers, we keep the original "hide at full HP"
      // for any NPC bar that does slip through (shouldn't, given
      // visibleToViewer, but defense in depth).
      const showHpBar = !!hpInfo && hpInfo.max > 0 && visibleToViewer && (
        isDM
          ? true  // DM sees every bar, every time
          : (!!pcHpInfo || ((tokenStateHpInfo ?? npcHpInfo) != null && hpInfo.current < hpInfo.max))
      );
      if (showHpBar && hpInfo) {
        let bar = currentEntry.hpBar;
        if (!bar || bar.destroyed) {
          bar = new Graphics();
          container.addChild(bar);
          currentEntry.hpBar = bar;
        }
        // Width is 80% of token diameter, capped so it stays readable
        // on small tokens without floating off larger ones.
        const barWidth = Math.max(28, Math.min(r * 1.6, 96));
        const barHeight = 5;
        const barY = r + 6; // 6px below token rim
        const barX = -barWidth / 2;
        const ratio = Math.max(0, Math.min(1, hpInfo.current / hpInfo.max));

        // Color thresholds — match conventional VTT semantics.
        let fillColor: number;
        if (ratio > 0.5) fillColor = 0x34d399;       // green
        else if (ratio > 0.25) fillColor = 0xfbbf24; // yellow
        else if (ratio > 0) fillColor = 0xf87171;    // red
        else fillColor = 0x6b7280;                   // gray (0 HP / dropped)

        bar.clear();
        // Background pill (dim, full width).
        bar.setFillStyle({ color: 0x0f1012, alpha: 0.85 });
        bar.roundRect(barX, barY, barWidth, barHeight, barHeight / 2);
        bar.fill();
        // Filled portion.
        if (ratio > 0) {
          bar.setFillStyle({ color: fillColor, alpha: 0.95 });
          bar.roundRect(barX, barY, barWidth * ratio, barHeight, barHeight / 2);
          bar.fill();
        }
        // Outline for definition against busy backgrounds.
        bar.setStrokeStyle({ color: 0x000000, width: 1, alpha: 0.5 });
        bar.roundRect(barX, barY, barWidth, barHeight, barHeight / 2);
        bar.stroke();
      } else if (currentEntry.hpBar) {
        // Token is no longer linked / character data unavailable / NPC at
        // full HP — remove the bar.
        if (!currentEntry.hpBar.destroyed) {
          container.removeChild(currentEntry.hpBar);
          currentEntry.hpBar.destroy();
        }
        currentEntry.hpBar = null;
      }

      // v2.226 — name label below the token. Always shown when the
      // token has a non-empty name. Position adjusts based on whether
      // an HP bar is present (sits below it). Created lazily and
      // updated on name change. Bold white with dark stroke for
      // legibility over any background.
      const showLabel = !!token.name && token.name.trim().length > 0;
      if (showLabel) {
        let label = currentEntry.nameLabel;
        if (!label || label.destroyed) {
          label = new Text({
            text: token.name,
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontWeight: '700',
              fontSize: 12,
              fill: 0xffffff,
              align: 'center',
              stroke: { color: 0x0a0c10, width: 4 },
            }),
          });
          label.anchor.set(0.5, 0);
          container.addChild(label);
          currentEntry.nameLabel = label;
        }
        if (label.text !== token.name) label.text = token.name;
        // Position below HP bar (if visible) or token rim. v2.244 —
        // showHpBar drives this rather than raw hpInfo so NPC names
        // sit closer to the token when the bar is hidden.
        const hpBarOffset = showHpBar ? 14 : 0;
        label.position.set(0, r + 6 + hpBarOffset);
      } else if (currentEntry.nameLabel) {
        if (!currentEntry.nameLabel.destroyed) {
          container.removeChild(currentEntry.nameLabel);
          currentEntry.nameLabel.destroy();
        }
        currentEntry.nameLabel = null;
      }

      // v2.244 — Dead overlay. Triggered by current_hp <= 0 on the
      // linked PC or NPC. We desaturate the entire container with a
      // ColorMatrixFilter (washes out sprite + initials + HP bar
      // uniformly — keeps a single visual signal of "dropped") and
      // overlay a red ✖ centered on the token. Filter is attached at
      // the container level so it composes with everything; the ✖ is a
      // separate Graphics stacked above the sprite. We rebuild the ✖
      // every reconcile (cheap — two strokes) so radius changes from
      // resize stay accurate.
      const isDead = !!hpInfo && hpInfo.current <= 0 && hpInfo.max > 0;
      if (isDead) {
        if (!currentEntry.deadFilter) {
          const f = new ColorMatrixFilter();
          f.desaturate();
          currentEntry.deadFilter = f;
        }
        // Pixi 8: filters is an array on Container.
        const existingFilters = (container.filters as any[]) ?? [];
        if (!existingFilters.includes(currentEntry.deadFilter)) {
          container.filters = [...existingFilters, currentEntry.deadFilter];
        }
        let xMark = currentEntry.deadX;
        if (!xMark || xMark.destroyed) {
          xMark = new Graphics();
          container.addChild(xMark);
          currentEntry.deadX = xMark;
        }
        // v2.391.0 — Heavier X. User feedback: "thick red X through the
        // characters portrait." Previous width=4 read as a thin scribble
        // on larger tokens. Width=8 with full opacity is unmistakable
        // even on Huge/Gargantuan radii. Reach extended to 0.7×r so the
        // X spans more of the token area — was 0.6 which left a lot of
        // visible token corners.
        const xR = r * 0.7;
        xMark.clear();
        xMark.setStrokeStyle({ color: 0xef4444, width: 8, alpha: 1, cap: 'round' });
        xMark.moveTo(-xR, -xR);
        xMark.lineTo(xR, xR);
        xMark.moveTo(xR, -xR);
        xMark.lineTo(-xR, xR);
        xMark.stroke();

        // v2.391.0 — Strikethrough on the name label, sized to label
        // width. Only drawn when there's actually a label visible
        // (not all tokens have names). Red, mid-thickness — readable
        // through it ("struck through enough to where you can still
        // read the name but understand that it is dead").
        if (currentEntry.nameLabel && !currentEntry.nameLabel.destroyed) {
          let strike = currentEntry.nameStrike;
          if (!strike || strike.destroyed) {
            strike = new Graphics();
            container.addChild(strike);
            currentEntry.nameStrike = strike;
          }
          const lbl = currentEntry.nameLabel;
          const labelW = lbl.width;
          const labelH = lbl.height;
          const labelCenterY = lbl.position.y + labelH / 2;
          // Slight horizontal padding so the line extends beyond the
          // text edges — looks deliberate rather than clipped.
          const halfW = labelW / 2 + 3;
          strike.clear();
          strike.setStrokeStyle({ color: 0xef4444, width: 2.5, alpha: 0.95, cap: 'round' });
          strike.moveTo(-halfW, labelCenterY);
          strike.lineTo(halfW, labelCenterY);
          strike.stroke();
        } else if (currentEntry.nameStrike) {
          // Token has no label but had a strike from a previous frame.
          if (!currentEntry.nameStrike.destroyed) {
            container.removeChild(currentEntry.nameStrike);
            currentEntry.nameStrike.destroy();
          }
          currentEntry.nameStrike = null;
        }
      } else {
        if (currentEntry.deadFilter && container.filters) {
          const filtered = (container.filters as any[]).filter(f => f !== currentEntry.deadFilter);
          container.filters = filtered.length ? filtered : null;
        }
        if (currentEntry.deadX) {
          if (!currentEntry.deadX.destroyed) {
            container.removeChild(currentEntry.deadX);
            currentEntry.deadX.destroy();
          }
          currentEntry.deadX = null;
        }
        // v2.391.0 — Tear down the strikethrough when the token comes
        // back to life (heal back above 0 HP, etc.).
        if (currentEntry.nameStrike) {
          if (!currentEntry.nameStrike.destroyed) {
            container.removeChild(currentEntry.nameStrike);
            currentEntry.nameStrike.destroy();
          }
          currentEntry.nameStrike = null;
        }
      }

      // v2.244 — Conditions strip. One small colored circle + glyph per
      // active condition that has an icon mapping. Sits below the name
      // label so it doesn't fight the HP bar for vertical space. We
      // tear down + rebuild on every conditions change rather than
      // diff child-by-child — conditions change rarely and the cost is
      // v2.429.0 — isActiveTurn is referenced both here (to position
      // status dots ABOVE the active-turn ring) and further below (for
      // movement badge / turn ring rendering). Pre-v2.429 the conditions
      // strip rendered below the token so it didn't need this — it does
      // now that the strip is positioned above per Roll20-style chrome.
      const isActiveTurn = !!activeTokenInfo && activeTokenInfo.tokenId === token.id;
      // a handful of cheap Graphics. Conditions without a COND_ICON
      // entry are skipped silently (still surface as chips in the
      // quick panel).
      const conds = tokenConditionsMap?.get(token.id) ?? [];
      const iconConds = conds.filter(c => c in COND_ICON);
      const stripKey = iconConds.join('|');
      const prevStripKey = (currentEntry.conditionsLayer as any)?.__stripKey as string | undefined;
      if (iconConds.length === 0) {
        if (currentEntry.conditionsLayer) {
          if (!currentEntry.conditionsLayer.destroyed) {
            container.removeChild(currentEntry.conditionsLayer);
            currentEntry.conditionsLayer.destroy({ children: true });
          }
          currentEntry.conditionsLayer = null;
        }
      } else if (stripKey !== prevStripKey || !currentEntry.conditionsLayer) {
        // Rebuild from scratch.
        if (currentEntry.conditionsLayer) {
          if (!currentEntry.conditionsLayer.destroyed) {
            container.removeChild(currentEntry.conditionsLayer);
            currentEntry.conditionsLayer.destroy({ children: true });
          }
          currentEntry.conditionsLayer = null;
        }
        const layer = new Container();
        // v2.429.0 — Roll20-style status dot row. Smaller dots
        // (10px) stacked horizontally ABOVE the token, leaving the
        // area below clear for the v2.429 action ring. Pre-v2.429
        // these sat under the name label; moved up for parity with
        // Roll20's status-dot row and to declutter the bottom of
        // the token.
        const ICON_SIZE = 10;            // diameter of each colored circle
        const ICON_GAP = 2;
        const totalWidth = iconConds.length * ICON_SIZE + (iconConds.length - 1) * ICON_GAP;
        // Position: above the token. Sit just above the active-turn
        // ring (r + 8) and any movement badge that may render there.
        // The active turn badge owns y = -(r + 18); place dots at
        // y = -(r + 32) so they live just above the badge without
        // overlap. For non-active tokens with no badge they sit at
        // -(r + 18), tight against the top edge of the token.
        const stripY = isActiveTurn ? -(r + 32) : -(r + 18);
        let cursorX = -totalWidth / 2 + ICON_SIZE / 2;
        for (const cond of iconConds) {
          const color = COND_COLOR_HEX[cond] ?? 0x94a3b8;
          const dot = new Graphics();
          dot.setFillStyle({ color, alpha: 0.95 });
          dot.circle(0, 0, ICON_SIZE / 2);
          dot.fill();
          dot.setStrokeStyle({ color: 0x0a0c10, width: 1, alpha: 0.85 });
          dot.circle(0, 0, ICON_SIZE / 2);
          dot.stroke();
          dot.position.set(cursorX, stripY);
          layer.addChild(dot);
          const glyph = new Text({
            text: COND_ICON[cond],
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontWeight: '800',
              fontSize: 8,
              fill: 0x0a0c10,
              align: 'center',
            }),
          });
          glyph.anchor.set(0.5, 0.5);
          glyph.position.set(cursorX, stripY);
          layer.addChild(glyph);
          cursorX += ICON_SIZE + ICON_GAP;
        }
        (layer as any).__stripKey = stripKey;
        container.addChild(layer);
        currentEntry.conditionsLayer = layer;
      }

      // v2.339.0 — BG3 turn UX overlay (active-turn ring + movement badge).
      //
      // Mounted last in the per-token reconcile so the ring + badge sit
      // above the HP bar, name label, and conditions strip in z-order.
      // Both pieces toggle visibility based on whether THIS token is the
      // active actor's token — created lazily on first activation, kept
      // around so subsequent activations are just a .visible flip.
      //
      // The ring is sized as a full-width outline at the token radius +
      // 4px breathing room. Stroke alpha pulses between 0.6 and 1.0 via
      // the same rAF that drives lockRing — see "rAF" loop below.
      // We tint the ring color based on remaining movement: gold if any
      // movement left, red-orange if budget is fully spent. (Future v2.340
      // will add green-yellow-red drag-preview path coloring, but the
      // ring itself is a coarser at-a-glance signal.)
      //
      // The badge is a Text node with a small backing pill so it stays
      // legible over any map texture. Positions ABOVE the token (negative
      // Y from container origin) — far enough up that the HP bar and
      // name label below stay uncluttered. Hidden when not the active
      // turn, redrawn on movement-spent change.
      // (isActiveTurn declared earlier in v2.429.0 conditions strip.)

      // ── Turn ring ──────────────────────────────────────────────────
      if (isActiveTurn) {
        if (!currentEntry.turnRing) {
          const ring = new Graphics();
          // Add as the FIRST child of the container (under the circle/
          // sprite/initials) so the ring reads as a halo, not an
          // overlay. addChildAt(0) keeps z-order natural.
          container.addChildAt(ring, 0);
          currentEntry.turnRing = ring;
        }
        const ring = currentEntry.turnRing;
        const remaining = Math.max(0, (activeTokenInfo!.max - activeTokenInfo!.used));
        // Ring color encodes remaining-budget state at a glance:
        //   • gold  (#d4a017): budget remaining
        //   • amber (#f59e0b): half or less remaining
        //   • red   (#ef4444): fully spent / can't move
        const ringColor =
          remaining <= 0                         ? 0xef4444 :
          remaining <= activeTokenInfo!.max / 2  ? 0xf59e0b :
                                                   0xd4a017;
        ring.clear();
        ring.setStrokeStyle({ color: ringColor, width: 3, alpha: 1.0 });
        ring.circle(0, 0, r + 4);
        ring.stroke();
        ring.visible = true;
        // v2.411.0 — Outer halo ring at r + 8 with low alpha. Drawn
        // as a single Graphics under the turnRing so it sits below in
        // z-order (halo → turnRing → token body → sprite). Same color
        // as the inner ring; the rAF loop animates rotation and
        // alpha. We also lay down four short arc segments to give
        // the rotation something visible to track — a solid circle
        // would be invisibly rotating.
        if (!currentEntry.turnHaloRing) {
          const halo = new Graphics();
          // Insert below turnRing — turnRing was added at index 0,
          // so addChildAt(0) again pushes turnRing to index 1.
          container.addChildAt(halo, 0);
          currentEntry.turnHaloRing = halo;
        }
        const halo = currentEntry.turnHaloRing;
        halo.clear();
        // Outer base ring at low alpha — the always-on glow.
        halo.setStrokeStyle({ color: ringColor, width: 6, alpha: 1.0 });
        halo.circle(0, 0, r + 8);
        halo.stroke();
        // Four bright arc segments distributed around the ring so
        // the rotation reads as motion. Each arc spans ~30°. The
        // overall halo alpha is animated by the rAF loop, so we
        // just set the arc strokeStyle to opaque here.
        halo.setStrokeStyle({ color: ringColor, width: 4, alpha: 1.0 });
        for (let i = 0; i < 4; i++) {
          const a0 = (i * Math.PI) / 2;
          const a1 = a0 + Math.PI / 6;
          halo.arc(0, 0, r + 8, a0, a1);
          halo.stroke();
        }
        halo.visible = true;

        // ── Action Economy Ring (v2.453.0) ─────────────────────────
        // Three 60° arcs at r + 14, fixed positions:
        //   • TOP (12 o'clock) — Action
        //   • BOTTOM-LEFT (8 o'clock) — Bonus
        //   • BOTTOM-RIGHT (4 o'clock) — Reaction
        // Bright cyan when available, dim charcoal when consumed.
        // Letter labels (A/B/R) at arc midpoints. The arcs sit
        // OUTSIDE the rotating turnHaloRing (r + 8) so the halo's
        // animation doesn't visually shred them. Static — no rAF.
        //
        // Action economy state lives on activeTokenInfo (plumbed from
        // combat_participants.action_used / bonus_used / reaction_used,
        // toggled by the corresponding standard-action flows). For
        // tokens that aren't the active actor we never draw this — only
        // the active actor has live action-economy state in scope.
        if (!currentEntry.actionEconomyRing) {
          const aeRing = new Graphics();
          // addChildAt(0) puts it at the bottom of the container so it
          // sits UNDER the token circle/sprite — mirroring turnRing's
          // z-order convention.
          container.addChildAt(aeRing, 0);
          currentEntry.actionEconomyRing = aeRing;
        }
        const aeRing = currentEntry.actionEconomyRing;
        aeRing.clear();

        const aeRadius = r + 14;
        const aeWidth = 4;
        const aeArcSpan = Math.PI / 3;       // 60° per arc
        // Three slot midpoints. Pixi: angle 0 = +x (3 o'clock),
        // PI/2 = +y (6 o'clock, since y grows downward in screen space).
        // 12 o'clock = -PI/2.
        const slots: Array<{ midAngle: number; consumed: boolean; letter: 'A' | 'B' | 'R' }> = [
          { midAngle: -Math.PI / 2,                    consumed: !!activeTokenInfo!.actionUsed,   letter: 'A' },
          { midAngle: -Math.PI / 2 + (4 * Math.PI) / 3, consumed: !!activeTokenInfo!.bonusUsed,    letter: 'B' }, // 8 o'clock
          { midAngle: -Math.PI / 2 + (2 * Math.PI) / 3, consumed: !!activeTokenInfo!.reactionUsed, letter: 'R' }, // 4 o'clock
        ];
        for (const slot of slots) {
          const a0 = slot.midAngle - aeArcSpan / 2;
          const a1 = slot.midAngle + aeArcSpan / 2;
          const color = slot.consumed ? 0x4b5563 : 0x67e8f9; // gray vs cyan
          const alpha = slot.consumed ? 0.55 : 0.95;
          aeRing.setStrokeStyle({ color, width: aeWidth, alpha });
          aeRing.arc(0, 0, aeRadius, a0, a1);
          aeRing.stroke();
        }
        aeRing.visible = true;

        // Letter labels at arc midpoints. Lazy-create the 3 Text
        // nodes and reuse them on subsequent activations — text
        // positions don't change, only fill alpha.
        if (!currentEntry.actionEconomyLabels) {
          const labels: Text[] = [];
          for (const slot of slots) {
            const t = new Text({
              text: slot.letter,
              style: new TextStyle({
                fontFamily: 'sans-serif',
                fontWeight: '800',
                fontSize: 9,
                fill: 0xffffff,
                align: 'center',
                stroke: { color: 0x0a0c10, width: 2 },
              }),
            });
            t.anchor.set(0.5, 0.5);
            // Sit slightly OUTSIDE the arc radius so the letter is
            // legible without the arc cutting through it.
            const lr = aeRadius + 1;
            t.position.set(Math.cos(slot.midAngle) * lr, Math.sin(slot.midAngle) * lr);
            container.addChild(t);
            labels.push(t);
          }
          currentEntry.actionEconomyLabels = labels;
        }
        // Per-frame: dim consumed labels (we mutate alpha rather than
        // tearing down + rebuilding the Text nodes).
        if (currentEntry.actionEconomyLabels) {
          for (let i = 0; i < currentEntry.actionEconomyLabels.length; i++) {
            const t = currentEntry.actionEconomyLabels[i];
            const consumed = slots[i].consumed;
            t.alpha = consumed ? 0.5 : 1.0;
            t.visible = true;
          }
        }
      } else {
        if (currentEntry.turnRing) currentEntry.turnRing.visible = false;
        if (currentEntry.turnHaloRing) currentEntry.turnHaloRing.visible = false;
        // v2.453.0 — hide action economy ring + labels for non-active
        // tokens. Created on first activation, kept around for the
        // common toggle-back case (turn flips back to this token).
        if (currentEntry.actionEconomyRing) currentEntry.actionEconomyRing.visible = false;
        if (currentEntry.actionEconomyLabels) {
          for (const t of currentEntry.actionEconomyLabels) t.visible = false;
        }
      }

      // ── Selection ring (v2.358.0) ──────────────────────────────────
      // Drawn when this token is the user's currently-selected token
      // (left-click select). Cyan, thin, outside the active-turn ring
      // so both can read simultaneously without visual collision.
      // v2.429.0 — Roll20-style footprint rectangle. Replaces the
      // pre-v2.429 circular halo with a thin rectangle that exactly
      // matches the token's footprint cells (1×1 for Medium, 2×2 for
      // Large, 4×4 for Gargantuan). Provides crisp visual confirmation
      // of "this is which cells the token occupies" — separate from
      // the token visual itself. Modeled on the blue selection
      // rectangle Roll20 draws around selected tokens.
      const isSelected = selectedTokenId === token.id;
      if (isSelected) {
        if (!currentEntry.selectionRing) {
          const ring = new Graphics();
          // First child so it sits below the circle (reads as a halo).
          // Using addChildAt(0) places it under the token sprite/circle.
          container.addChildAt(ring, 0);
          currentEntry.selectionRing = ring;
        }
        const ring = currentEntry.selectionRing;
        ring.clear();
        // v2.431.0 — Compute the rectangle in WORLD space relative to
        // the footprint cells the token actually occupies, then convert
        // to container-local coordinates. Pre-v2.431 we drew the rect
        // centered on the container origin (-halfFootPx, -halfFootPx)
        // assuming "container origin = visual center = footprint
        // center." User report: "the box is a little bit off-centered
        // to the top left" for Gargantuan. Symptoms suggest the
        // rectangle is being drawn at a position that doesn't match
        // the actual occupied cells — possibly because the visual
        // offset math has an edge case for some rows or the render
        // is using a stale offset.
        //
        // Defensive fix: derive the cell range from token.x/token.y
        // (the canonical anchor) and gridSizePx, then convert to
        // container-local coords by subtracting container.position.
        // For an even-size token, anchor sits on a grid intersection
        // and the footprint occupies cells (anchor_col, anchor_row)
        // through (anchor_col + N - 1, anchor_row + N - 1). For an
        // odd-size token, anchor sits on a cell center and the
        // footprint occupies cells around it. Either way, the
        // RECTANGLE bounds are at world positions:
        //   left = token.x  (for even) OR token.x - cellSize/2  (for odd, 1×1)
        //                    OR token.x - cellSize * (N-1)/2 - cellSize/2  (odd, 3×3)
        //   = token.x - cellSize/2 * (1 if N=1, else N-2 if N=3) — too
        //     fiddly. Simpler: compute the visual center directly,
        //     since that's already correct, then draw the rect
        //     centered on it — but in CONTAINER-LOCAL coords the
        //     visual center is at (0, 0) by v2.423 design. So rect
        //     coords don't change... unless container.position is
        //     wrong, which is what we're trying to defend against.
        //
        // Alternative defensive approach: ignore container.position
        // entirely and convert the rect to its parent (viewport)
        // coords directly. ring.position.set is then absolute.
        const halfFootPx = (footprintCells * gridSizePx) / 2;
        // Anchor world coords (token.x/y is the canonical anchor —
        // cell center for odd, intersection for even).
        // For odd sizes: footprint center == anchor.
        // For even sizes: footprint center == anchor + (halfFootPx, halfFootPx).
        const footprintCenterWorldX = token.x + (evenSize ? halfFootPx : 0);
        const footprintCenterWorldY = token.y + (evenSize ? halfFootPx : 0);
        // Convert footprint center to container-local coords. After
        // v2.423, container.position == footprintCenterWorld, so this
        // should evaluate to (0, 0). If not, the v2.423 offset is
        // out of sync with what we expect — and using the WORLD-derived
        // value rather than (0, 0) makes the rectangle land in the
        // right place regardless.
        const localCx = footprintCenterWorldX - container.position.x;
        const localCy = footprintCenterWorldY - container.position.y;
        // 2px stroke at slightly transparent cyan, sitting just outside
        // the cell border so the line is visible against any map color
        // without crowding the token glyph. ~1.5px outset.
        ring.setStrokeStyle({ color: 0x67e8f9, width: 2, alpha: 0.95 });
        ring.rect(localCx - halfFootPx - 1.5, localCy - halfFootPx - 1.5, footprintCells * gridSizePx + 3, footprintCells * gridSizePx + 3);
        ring.stroke();
        // Subtle interior glow so the rectangle reads even when the
        // token is mid-map on busy terrain. 8% fill.
        ring.setFillStyle({ color: 0x67e8f9, alpha: 0.08 });
        ring.rect(localCx - halfFootPx, localCy - halfFootPx, footprintCells * gridSizePx, footprintCells * gridSizePx);
        ring.fill();
        ring.visible = true;
      } else if (currentEntry.selectionRing) {
        currentEntry.selectionRing.visible = false;
      }

      // ── Movement badge ─────────────────────────────────────────────
      if (isActiveTurn) {
        const badgeY = -(r + 18); // sits just above the token
        const remaining = Math.max(0, (activeTokenInfo!.max - activeTokenInfo!.used));
        const badgeText =
          activeTokenInfo!.max === 0
            ? '0 / 0 ft'
            : `${remaining} / ${activeTokenInfo!.max} ft${activeTokenInfo!.dashed ? ' · Dash' : ''}`;
        const badgeColor =
          remaining <= 0                         ? 0xef4444 :
          remaining <= activeTokenInfo!.max / 2  ? 0xf59e0b :
                                                   0xfde68a;

        if (!currentEntry.movementBadgeBg) {
          const bg = new Graphics();
          container.addChild(bg);
          currentEntry.movementBadgeBg = bg;
        }
        if (!currentEntry.movementBadge) {
          const txt = new Text({
            text: badgeText,
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontWeight: '800',
              fontSize: 11,
              fill: badgeColor,
              align: 'center',
            }),
          });
          txt.anchor.set(0.5, 0.5);
          container.addChild(txt);
          currentEntry.movementBadge = txt;
        }
        const txt = currentEntry.movementBadge;
        const bg = currentEntry.movementBadgeBg;
        // Update text + color (cheap; .text setter triggers a re-layout
        // only if the string changed). Re-applying TextStyle would
        // allocate a new style object — tweak fill in place instead.
        if (txt.text !== badgeText) txt.text = badgeText;
        (txt.style as TextStyle).fill = badgeColor;
        txt.position.set(0, badgeY);
        // Backing pill sized to the measured text width with padding.
        const padX = 6;
        const padY = 3;
        const w = txt.width + padX * 2;
        const h = txt.height + padY * 2;
        bg.clear();
        bg.setFillStyle({ color: 0x0a0c10, alpha: 0.85 });
        bg.roundRect(-w / 2, badgeY - h / 2, w, h, 4);
        bg.fill();
        bg.setStrokeStyle({ color: badgeColor, width: 1, alpha: 0.5 });
        bg.roundRect(-w / 2, badgeY - h / 2, w, h, 4);
        bg.stroke();
        txt.visible = true;
        bg.visible = true;
      } else {
        if (currentEntry.movementBadge) currentEntry.movementBadge.visible = false;
        if (currentEntry.movementBadgeBg) currentEntry.movementBadgeBg.visible = false;
      }

      // ── v2.341.0 — Action / Bonus / Reaction pips ─────────────────
      // Three small dots in a row, sitting just under the movement
      // badge, marking which parts of the action economy the active
      // actor still has available this turn. A=Action, B=Bonus,
      // R=Reaction. Available pips render gold; consumed pips dim
      // to a charcoal fill with reduced alpha so the read at a
      // glance is "shiny = ready, dull = spent."
      //
      // We lazy-create the layer + 3 child Graphics+Text pairs on
      // first activation and only mutate fills/alpha thereafter.
      // That avoids tearing down + rebuilding on every state flip
      // (action flips every couple seconds during play).
      // v2.411.0 — Action / Bonus / Reaction pips above tokens removed
      // per UX feedback (the strip duplicates info already visible on
      // the InitiativeStrip + MonsterActionPanel and was visually
      // noisy directly above the token). Keep the layer ref so a
      // legacy entry (e.g. from a hot-reload) gets cleanly hidden,
      // and skip create+update entirely. If we want them back later,
      // restore the v2.341 block from git history.
      if (currentEntry.economyPipsLayer) currentEntry.economyPipsLayer.visible = false;

      // ── Unlocked glyph (v2.412.0 / v2.414.0) ───────────────────────
      // Open-padlock above any UNLOCKED token, visible ONLY to the
      // DM. Players never see lock state — lock is a DM-side workflow
      // affordance. Locked tokens (the new default) get NO indicator
      // so the map stays uncluttered. The glyph signals "this token
      // can be moved freely even during the active turn enforcement
      // — a deliberately conspicuous DM warning since unlocked
      // tokens bypass the active-turn movement gate.
      //
      // v2.414.0 — Only render during combat. Outside combat locks
      // are inert (DM moves anything, players move nothing), so the
      // ✓ indicator outside combat communicated nothing useful and
      // confused the visual. Combat-only display matches the
      // "tokens unlocked before combat, locked when combat starts"
      // mental model: outside combat → no indicators (everything
      // moves freely for the DM); inside combat → ✓ marks tokens
      // the DM has explicitly exempted from the active-turn gate.
      //
      // Lazy-create on first need, toggle .visible thereafter.
      const tokenIsUnlocked = !((token as any).isLocked);
      const showUnlockedGlyph = isDM && tokenIsUnlocked && !!activeTokenInfo;
      if (showUnlockedGlyph) {
        if (!currentEntry.lockGlyph) {
          const glyph = new Text({
            text: '✓',
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontSize: 16,
              fill: 0xffffff,
              align: 'center',
            }),
          });
          glyph.anchor.set(0.5, 0.5);
          container.addChild(glyph);
          currentEntry.lockGlyph = glyph;
        }
        const glyph = currentEntry.lockGlyph;
        const offsetX = isActiveTurn ? 18 : 0;
        glyph.position.set(offsetX, -(r + 18));
        glyph.visible = true;
      } else if (currentEntry.lockGlyph) {
        currentEntry.lockGlyph.visible = false;
      }

      // v2.460.0 — Concentration glyph for character tokens. Sits at
      // -(r + 18) shifted left (-18px) when the active-turn ring is
      // present, mirroring the lock glyph's right-shift convention so
      // they don't overlap when both apply (active turn + concentrating
      // is common — bards, clerics, druids all concentrate every fight).
      // Reads characterConcentrationMap directly each pass; absence in
      // the map = not concentrating = hide.
      const charId = (token as { characterId?: string }).characterId;
      const isConcentrating = !!(charId && characterConcentrationMap?.has(charId));
      if (isConcentrating) {
        if (!currentEntry.concentrationGlyph) {
          const glyph = new Text({
            text: '◉',
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontWeight: '900',
              fontSize: 16,
              fill: 0xa78bfa, // purple — matches v2.457 chip + CharacterSheet banner
              align: 'center',
              stroke: { color: 0x0a0c10, width: 3 },
            }),
          });
          glyph.anchor.set(0.5, 0.5);
          container.addChild(glyph);
          currentEntry.concentrationGlyph = glyph;
        }
        const cglyph = currentEntry.concentrationGlyph;
        // Mirror the lock glyph's offset logic: when active turn ring
        // is present, the lock glyph shifts +18 (right). Concentration
        // shifts -18 (left). When inactive, lock sits at center; we
        // sit at center-but-up if alone (then push left -18 if lock
        // is also present — wait, lock is already at center. Use a
        // simpler rule: always offset left by 18 from center when
        // active-turn, otherwise sit center. This keeps concentration
        // visible during the most common case (active actor) without
        // overlapping the lock glyph; on inactive tokens, lock isn't
        // shown except in DM debug states so collision is rare.)
        const offsetX = isActiveTurn ? -18 : 0;
        cglyph.position.set(offsetX, -(r + 18));
        cglyph.visible = true;
      } else if (currentEntry.concentrationGlyph) {
        currentEntry.concentrationGlyph.visible = false;
      }
    }
  }, [tokens, viewport, setDragging, onContextMenu, gridSizePx, remoteDragLocks, currentUserId, characterHpMap, npcHpMap, tokenStateMap, tokenStateMapByDef, tokenConditionsMap, characterConcentrationMap, isDM, myCharacterId, activeTokenInfo, selectedTokenId]);

  // v2.456.0 — Hover-targeting preview render. Subscribes to
  // aoePreviewTargetTokenIds (populated by the cone/line picker's
  // hover subscriber in MonsterActionPanel on every direction change)
  // and toggles a red highlight ring around each matching token. Lazy
  // -created on first highlight, kept around between activations so a
  // common toggle-back path is just a .visible flip + redraw.
  //
  // Decoupled from the giant per-token reconcile effect on purpose:
  // hits change at mousemove rate, and we don't want to invalidate
  // the whole render dep array on every pixel of cursor motion. This
  // effect only re-runs when the target list changes; it does its own
  // gfxMap walk to find the affected entries.
  //
  // v2.461.0 fix — Was originally placed in BattleMapV2's outer scope
  // (line ~8488) where gfxMapRef isn't defined. Compiled-but-broken
  // since v2.456 — reproduced as TS2552 not TS2304 so the deploy
  // script's TS2304-specific gate missed it. Component crashed on
  // first mount with "Cannot find name 'gfxMapRef'" the moment React
  // tried to call this effect. Moved inside TokenLayer — that's where
  // gfxMapRef lives, and where the per-token reconcile already
  // operates. Same effect, correct scope.
  const aoeTargetIds = useBattleMapStore(s => s.aoePreviewTargetTokenIds);
  useEffect(() => {
    const gfxMap = gfxMapRef.current;
    const targetSet = new Set(aoeTargetIds);
    for (const [tokenId, entry] of gfxMap.entries()) {
      const isTarget = targetSet.has(tokenId);
      if (isTarget) {
        if (!entry.targetHighlight) {
          const ring = new Graphics();
          // Insert at index 0 so it sits UNDER the token sprite/circle
          // (reads as a halo behind, not an overlay). Same z-order
          // convention as turnRing/selectionRing.
          entry.container.addChildAt(ring, 0);
          entry.targetHighlight = ring;
        }
        const ring = entry.targetHighlight;
        // Re-derive radius from the token's size + grid. Same convention
        // as the per-token reconcile uses for the inner circle.
        const tokenObj = useBattleMapStore.getState().tokens[tokenId];
        const footprintCells =
          tokenObj?.size === 'large'      ? 2 :
          tokenObj?.size === 'huge'       ? 3 :
          tokenObj?.size === 'gargantuan' ? 4 : 1;
        const r = (footprintCells * gridSizePx) / 2;
        ring.clear();
        // Red-orange (#f87171). 3px stroke matches the visual weight of
        // the turnRing without overpowering it on simultaneous active+
        // hit cases. Subtle 10% interior fill so the ring reads on busy
        // terrain backgrounds.
        ring.setStrokeStyle({ color: 0xf87171, width: 3, alpha: 0.95 });
        ring.circle(0, 0, r + 14);
        ring.stroke();
        ring.setFillStyle({ color: 0xf87171, alpha: 0.10 });
        ring.circle(0, 0, r + 14);
        ring.fill();
        ring.visible = true;
      } else if (entry.targetHighlight) {
        entry.targetHighlight.visible = false;
      }
    }
  }, [aoeTargetIds, gridSizePx]);

  useEffect(() => {
    if (!viewport || !canvasEl) return;

    // v2.216 — throttle drag_move broadcasts to ~20Hz (50ms) so a
    // 60fps pointermove doesn't flood the Realtime channel. Leading-
    // edge: send immediately on the first movement after the window
    // elapses. The final position is covered by onPointerUp below.
    let lastBroadcastMs = 0;

    // v2.340.0 — Live drag-preview path (BG3-style).
    //
    // A single persistent Graphics overlay attached to the viewport,
    // re-drawn on every pointermove during a drag. Shows:
    //   • Origin → snapped-cursor straight line (faint dashed)
    //   • Destination cell highlight (rounded square marker)
    //   • Distance + cost-vs-remaining label near the cursor
    //
    // The line color encodes whether the move is affordable:
    //   • green   — within remaining movement
    //   • amber   — into Dash range / dipping past base speed
    //   • red     — over the cap (drop will snap back if active turn)
    //
    // The overlay is purely visual (eventMode='none' so it never
    // captures clicks meant for tokens/walls underneath). It only
    // renders during an actual drag — on pointerup we clear() so
    // nothing is left behind. When combat isn't running we still
    // show the path (for distance reference) but skip color-grading
    // since there's no budget to compare against — a soft white line.
    const previewGfx = new Graphics();
    previewGfx.eventMode = 'none';
    previewGfx.visible = false;
    viewport.addChild(previewGfx);
    const previewLabel = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontWeight: '800',
        fontSize: 13,
        fill: 0xfde68a,
        stroke: { color: 0x0a0c10, width: 3 },
        align: 'center',
      }),
    });
    previewLabel.anchor.set(0.5, 1);
    previewLabel.eventMode = 'none';
    previewLabel.visible = false;
    viewport.addChild(previewLabel);

    function clearPreview() {
      previewGfx.clear();
      previewGfx.visible = false;
      previewLabel.visible = false;
    }

    // v2.430.0 / v2.436.0 — Persistent drag preview. Pre-v2.430 the
    // preview was only redrawn on pointermove, so a stationary hold
    // (cursor not moving while still pressed) showed nothing. v2.430
    // introduced a rAF loop, but it appears not to fire reliably in
    // production (rate-counter showed essentially zero extra rAF
    // calls during stationary holds via instrumentation in
    // v2.435.0 → v2.436.0 investigation). Switching to setInterval,
    // which is a dumb timer that fires regardless of rAF scheduling.
    //
    // Roll20 keeps the path visible for the entire duration of the
    // drag regardless of cursor motion; we want the same.
    let lastCursor: { originX: number; originY: number; cursorX: number; cursorY: number } | null = null;
    let previewIntervalId: ReturnType<typeof setInterval> | null = null;
    function startPreviewLoop() {
      if (previewIntervalId !== null) return;
      // 33ms = ~30Hz. Plenty for a pulsing/static preview overlay.
      // Lower than 60Hz to keep the GPU work modest.
      previewIntervalId = setInterval(() => {
        if (!dragRef.current) {
          stopPreviewLoop();
          return;
        }
        if (lastCursor) {
          drawPreview(lastCursor.originX, lastCursor.originY, lastCursor.cursorX, lastCursor.cursorY);
        }
      }, 33);
    }
    function stopPreviewLoop() {
      if (previewIntervalId !== null) {
        clearInterval(previewIntervalId);
        previewIntervalId = null;
      }
      lastCursor = null;
    }

    function drawPreview(originX: number, originY: number, cursorX: number, cursorY: number) {
      // v2.414.0 — Use the same size-aware snap helper that the
      // pointerup commit uses (snapTokenAnchor). Pre-v2.414 the
      // preview always called snapToCellCenter — which is correct
      // only for odd-size tokens (1×1, 3×3). For even-size tokens
      // (Large 2×2, Gargantuan 4×4) the commit snaps to grid
      // INTERSECTIONS instead, so the preview marker pointed to one
      // spot and the dropped token landed at a different one.
      // Symptom: "the token shifts around when I drop it." Using
      // snapTokenAnchor here keeps preview and final position in
      // lockstep regardless of token size.
      const drag = dragRef.current;
      const draggedToken = drag ? useBattleMapStore.getState().tokens[drag.id] : null;
      const snapped = draggedToken
        ? snapTokenAnchor(cursorX, cursorY, draggedToken.size, gridSizePx)
        : snapToCellCenter(cursorX, cursorY, gridSizePx);
      // v2.432.0 — Footprint-aware clamping. See note in pointerup
      // commit below; same rules so the preview marker can't show
      // a target the actual drop won't accept.
      let tx: number, ty: number;
      if (draggedToken) {
        const footCellsP = tokenFootprintCells(draggedToken.size);
        const evenP = footCellsP % 2 === 0;
        const footPxP = footCellsP * gridSizePx;
        const halfP = footPxP / 2;
        const minXp = evenP ? 0 : halfP;
        const maxXp = evenP ? worldWidth - footPxP : worldWidth - halfP;
        const minYp = evenP ? 0 : halfP;
        const maxYp = evenP ? worldHeight - footPxP : worldHeight - halfP;
        tx = Math.max(minXp, Math.min(maxXp, snapped.x));
        ty = Math.max(minYp, Math.min(maxYp, snapped.y));
      } else {
        tx = Math.max(0, Math.min(worldWidth, snapped.x));
        ty = Math.max(0, Math.min(worldHeight, snapped.y));
      }

      // Compute Chebyshev distance in feet using the canonical math
      // from lib/movement.ts. Convert from world pixels → cells via
      // gridSizePx, then feed the cell coordinates to the helper.
      // v2.357.0 — Math.floor (not Math.round). Tokens are stored at
      // center-of-cell positions (col*size + size/2), so x/size is
      // N+0.5 for column N. Math.round on N+0.5 returns N+1 (off-by-
      // one toward the bottom-right cell). Math.floor returns N
      // correctly. Pre-fix the distance result was still right because
      // both endpoints had the same offset and they canceled, but any
      // caller reading the cell coords directly was landing one cell
      // SE of the actual token.
      const fromCell = { row: Math.floor(originY / gridSizePx), col: Math.floor(originX / gridSizePx) };
      const toCell = { row: Math.floor(ty / gridSizePx), col: Math.floor(tx / gridSizePx) };
      const distanceFt = computeChebyshevFt(fromCell.row, fromCell.col, toCell.row, toCell.col);

      // Color decision. If we have an active actor + this dragged token
      // is theirs, grade green/amber/red against the budget. Otherwise
      // (DM repositioning monsters out of combat, or non-active token),
      // show a neutral white line so the distance label still helps.
      // (drag was captured at the top of this function.)
      const ati = activeTokenInfoRef.current;
      const inCombatForThisToken = !!(ati && drag && ati.tokenId === drag.id && ati.max > 0);
      let lineColor = 0xffffff;
      let labelColor = 0xffffff;
      let costLabel = `${distanceFt} ft`;
      if (inCombatForThisToken) {
        const remaining = Math.max(0, ati!.max - ati!.used);
        const wouldUse = ati!.used + distanceFt;
        if (wouldUse > ati!.max) {
          lineColor = 0xef4444; labelColor = 0xfca5a5;          // red — overspend
        } else if (wouldUse > ati!.max - Math.floor(ati!.max / 4)) {
          lineColor = 0xf59e0b; labelColor = 0xfde68a;          // amber — getting close
        } else {
          lineColor = 0x22c55e; labelColor = 0x86efac;          // green — comfortably within budget
        }
        costLabel = `${distanceFt} ft  ·  ${remaining - distanceFt >= 0 ? remaining - distanceFt : 0} left`;
      }

      // Draw: dashed line from origin → snapped cursor + small square
      // marker at the destination. PIXI v8 has no native dashed-line
      // helper, so we manually segment the line with `moveTo / lineTo`
      // jumps. ~6px on / 6px off reads as obviously-temporary.
      // v2.435.0 — Line endpoints adjusted for even-size tokens. For
      // odd sizes (Medium, Huge) origin/tx are cell CENTERS, so the
      // dashed line correctly goes center→center. For even sizes
      // (Large, Gargantuan) origin/tx are top-left intersections of
      // the footprint, so the unadjusted line went from one NW corner
      // to another NW corner — pointing at the white marker's NW
      // corner instead of where the visual will land. Add halfFootPx
      // to put the line endpoints at the FOOTPRINT CENTER for even-
      // size tokens; visual center == footprint center, so the line
      // now correctly points at where the token will visually sit.
      previewGfx.clear();
      const lineEvenAdjust = dragRef.current && draggedToken && tokenFootprintCells(draggedToken.size) % 2 === 0
        ? (tokenFootprintCells(draggedToken.size) * gridSizePx) / 2
        : 0;
      const lineOriginX = originX + lineEvenAdjust;
      const lineOriginY = originY + lineEvenAdjust;
      const lineTargetX = tx + lineEvenAdjust;
      const lineTargetY = ty + lineEvenAdjust;
      const dx = lineTargetX - lineOriginX;
      const dy = lineTargetY - lineOriginY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        const nx = dx / len;
        const ny = dy / len;
        const dashOn = 8;
        const dashOff = 6;
        previewGfx.setStrokeStyle({ color: lineColor, width: 3, alpha: 0.85 });
        let traveled = 0;
        while (traveled < len) {
          const segStart = traveled;
          const segEnd = Math.min(traveled + dashOn, len);
          previewGfx.moveTo(lineOriginX + nx * segStart, lineOriginY + ny * segStart);
          previewGfx.lineTo(lineOriginX + nx * segEnd, lineOriginY + ny * segEnd);
          traveled += dashOn + dashOff;
        }
        previewGfx.stroke();
      }

      // v2.398.0 — Destination footprint marker. Pre-v2.398 this
      // was hardcoded `gridSizePx * 0.85` — a single-cell preview
      // square regardless of token size. So when dragging an Ancient
      // Red Dragon (3×3 footprint), the user saw the full dragon
      // ghost at the cursor but a tiny single-cell preview square
      // at the snap target — two visuals that disagreed on the
      // dragon's size. Now we look up the dragged token's footprint
      // and draw a marker the size of its actual occupancy.
      //
      // The store lookup is cheap (it's a Zustand selector hit on
      // an object map) and the size only changes via context-menu
      // resize, so the value is stable for the duration of any
      // single drag. We still subtract a few px from the marker so
      // it fits visually inside the footprint cells rather than
      // pixel-aligned to the grid lines.
      // (draggedToken was captured at the top of this function.)
      const dragFootCells = draggedToken
        ? tokenFootprintCells(draggedToken.size)
        : 1;
      const mark = (dragFootCells * gridSizePx) - 4;
      // v2.435.0 — Footprint position depends on whether the snap
      // returned an ANCHOR (top-left of footprint, for even-size
      // tokens) or a CENTER (for odd-size tokens). Pre-v2.435 the
      // marker was always centered on (tx, ty), which was correct
      // only for odd sizes — for Large/Gargantuan it placed the
      // marker 2 cells NW of where the actual drop would land,
      // because the visual renders at anchor + halfFootPx (v2.423
      // visual offset). User screenshot showed the white square
      // floating NW of the AW dragon mid-drag.
      //
      // Fix: for even-size tokens, draw the marker with TOP-LEFT
      // at (tx, ty), since tx/ty IS the top-left anchor of the
      // footprint. For odd sizes, keep the existing center-on-
      // (tx, ty) draw because tx/ty IS the cell center for those.
      const dragEvenSize = dragFootCells % 2 === 0 && !!draggedToken;
      const markX = dragEvenSize ? tx + 2 : tx - mark / 2;
      const markY = dragEvenSize ? ty + 2 : ty - mark / 2;
      previewGfx.setStrokeStyle({ color: lineColor, width: 2, alpha: 0.9 });
      previewGfx.roundRect(markX, markY, mark, mark, 4);
      previewGfx.stroke();

      previewGfx.visible = true;

      // Label sits just above the destination cell. Keeping it in
      // world space (not screen space) means it rides the viewport
      // zoom — readable at 1x, hugs the cell at 4x. Acceptable.
      previewLabel.text = costLabel;
      (previewLabel.style as TextStyle).fill = labelColor;
      // v2.435.0 — Label sits above the marker's TOP edge.
      const labelY = dragEvenSize ? markY - 4 : ty - mark / 2 - 4;
      const labelX = dragEvenSize ? tx + (dragFootCells * gridSizePx) / 2 : tx;
      previewLabel.position.set(labelX, labelY);
      previewLabel.visible = true;
    }

    function onPointerMove(e: PointerEvent) {
      // v2.226 — click probe: if pointer moves > CLICK_THRESHOLD_PX
      // in screen space, mark drag as "moved" (suppresses click).
      const probe = clickProbeRef.current;
      if (probe && !probe.didMove) {
        const dx = e.clientX - probe.downClientX;
        const dy = e.clientY - probe.downClientY;
        if (dx * dx + dy * dy > 25) { // > 5px move
          probe.didMove = true;
        }
      }

      const drag = dragRef.current;
      if (!drag || !viewport || !canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = viewport.toWorld(screenX, screenY);
      const newX = worldPoint.x - drag.offsetX;
      const newY = worldPoint.y - drag.offsetY;
      updatePos(drag.id, newX, newY);

      // v2.340.0 — live drag preview. Only show after the user has
      // actually moved (probe.didMove guards against firing on a
      // pure-click landing on the token).
      // v2.430.0 — Persistent: capture cursor and let the rAF loop
      // keep redrawing on stationary holds. The loop kicks off on
      // first move and runs until pointerup.
      if (probe?.didMove) {
        lastCursor = { originX: drag.originX, originY: drag.originY, cursorX: newX, cursorY: newY };
        drawPreview(drag.originX, drag.originY, newX, newY);
        startPreviewLoop();
      }

      // Throttled broadcast to peers.
      const now = performance.now();
      if (now - lastBroadcastMs >= 50) {
        onDragMove?.(drag.id, newX, newY);
        lastBroadcastMs = now;
      }
    }

    function onPointerUp(e: PointerEvent) {
      const drag = dragRef.current;
      const probe = clickProbeRef.current;
      // v2.226 — click classifier. If pointer moved < threshold AND
      // the down→up window was short, treat as a click and fire the
      // callback. Drag commit runs in EITHER case so the position
      // (snapped to nearest cell) ends up consistent on the DB.
      const wasClick = !!(
        probe &&
        !probe.didMove &&
        performance.now() - probe.downAtMs < 250
      );
      // v2.441.0 — If the pointer actually moved during this gesture,
      // notify the parent so it can stamp the time and have click-to-
      // move ignore the synthetic 'click' event the browser fires on
      // the same tick as this pointerup.
      if (probe?.didMove) {
        onDragMotionEnded?.();
      }

      if (!drag) {
        clickProbeRef.current = null;
        return;
      }
      const t = useBattleMapStore.getState().tokens[drag.id];
      if (t) {
        // v2.400.0 — Compute final position from the pointerup event
        // coordinates, not the last pointermove's stored t.x/y. Pre-
        // v2.400 we snapped t.x/y, which lagged the cursor by however
        // far it moved between the last 60Hz pointermove and the
        // pointerup. For a cursor moving even modestly at release,
        // that gap could be 5-10px — enough to push across a cell
        // boundary and snap to the wrong cell. Reading clientX/Y
        // from `e` (the pointerup event itself) gives the exact
        // release position.
        let finalX = t.x;
        let finalY = t.y;
        if (viewport && canvasEl && e.clientX !== undefined) {
          const rect = canvasEl.getBoundingClientRect();
          const screenX = e.clientX - rect.left;
          const screenY = e.clientY - rect.top;
          const worldPoint = viewport.toWorld(screenX, screenY);
          finalX = worldPoint.x - drag.offsetX;
          finalY = worldPoint.y - drag.offsetY;
        }
        // v2.401.0 — Size-aware snap. Even-size tokens (Large 2×2,
        // Garg 4×4) anchor on grid intersections; odd-size tokens
        // anchor on cell centers. snapTokenAnchor picks the right
        // snap target. Pre-v2.401 always snapped to cell center,
        // which made dropping a Large dragon "shift to a different
        // spot" because the visual's natural center is a grid
        // intersection but snap put the anchor at a cell center,
        // re-centering the visual asymmetrically.
        const snapped = snapTokenAnchor(finalX, finalY, t.size, gridSizePx);
        // v2.432.0 — Footprint-aware clamping. Pre-v2.432 the clamp
        // used `Math.max(0, Math.min(worldWidth, snapped.x))`, which
        // bounded the ANCHOR to (0, worldWidth). For odd-size tokens
        // (anchor on cell center) that's mostly fine — the visual
        // extends ½ cell past the anchor in each direction, so a
        // token anchored at the right edge has its right half
        // hanging off the map. For even-size tokens (Large 2×2,
        // Gargantuan 4×4) the anchor is the TOP-LEFT intersection
        // of the footprint, so anchoring at (worldWidth, worldHeight)
        // puts the ENTIRE 4×4 footprint off the map. User report:
        // "you can throw the entire token off of the map" — the
        // Ancient White Dragon was at (2100, 1400) on a
        // 2100×1400 world, with all 4×4 cells off-map.
        //
        // Fix: clamp the anchor based on the footprint occupancy
        // rules so the visual stays inside the map. For odd sizes
        // (1×1, 3×3) the visual extends `cellSize * footCells / 2`
        // in each direction from the anchor, so anchor must be in
        // [halfFoot, worldWidth - halfFoot]. For even sizes the
        // footprint extends `cellSize * footCells` to the bottom-
        // right of the anchor, so anchor must be in
        // [0, worldWidth - footCells*cellSize] (anchor top-left,
        // bottom-right at anchor + footPx).
        const footCellsForClamp = tokenFootprintCells(t.size);
        const evenSizeForClamp = footCellsForClamp % 2 === 0;
        const footPxForClamp = footCellsForClamp * gridSizePx;
        const halfFootForClamp = footPxForClamp / 2;
        const minX = evenSizeForClamp ? 0 : halfFootForClamp;
        const maxX = evenSizeForClamp ? worldWidth - footPxForClamp : worldWidth - halfFootForClamp;
        const minY = evenSizeForClamp ? 0 : halfFootForClamp;
        const maxY = evenSizeForClamp ? worldHeight - footPxForClamp : worldHeight - halfFootForClamp;
        const clampedX = Math.max(minX, Math.min(maxX, snapped.x));
        const clampedY = Math.max(minY, Math.min(maxY, snapped.y));
        // v2.268.0 — wall-blocked movement check. If the segment from
        // the drag origin to the (clamped, snapped) drop point crosses
        // any wall with blocksMovement=true (and not an open door), the
        // drop is rejected and the token snaps back to its origin.
        // Click drops (wasClick === true) skip this check — clicks
        // don't change position, so there's no segment to validate.
        // The check is also skipped when the user didn't actually move
        // (origin === drop) since that's a no-op drop.
        const movedAtAll = drag.originX !== clampedX || drag.originY !== clampedY;
        const blocked = !wasClick && movedAtAll && segmentBlockedByWall(
          drag.originX, drag.originY,
          clampedX, clampedY,
          Object.values(useBattleMapStore.getState().walls),
        );
        if (blocked) {
          // Snap back to origin. updatePos rewrites the local store;
          // peers see this position on the next broadcast/commit cycle.
          // No DB write — the token's row in scene_tokens already has
          // the origin position (we never committed the drag-target
          // for this drop, since updatePos calls below this branch).
          updatePos(drag.id, drag.originX, drag.originY);
          onDragMove?.(drag.id, drag.originX, drag.originY);
          onMovementBlocked?.('wall');
        } else {
          // v2.340.0 — movement-budget enforcement (BG3-style hard
          // block). When combat is active AND the dragged token is
          // the active actor's, validate that the drop distance
          // doesn't exceed remaining movement (Dash-doubled, condition-
          // zeroed per RAW). If it does, snap the token back to
          // origin and fire the budget-exceeded callback. On success,
          // commit BOTH the position write AND a logMovement call so
          // movement_used_ft updates and the badge reflects the new
          // remaining budget.
          //
          // canMove is async (single SELECT), so we sequence:
          //   1. validate (canMove)
          //   2a. if !allowed → snap back, fire callback, return
          //   2b. if allowed → commit pos via tokensApi (existing
          //       wall-trigger path), then logMovement
          //
          // Out-of-combat drags (no active actor, or this token
          // isn't the active one) skip enforcement entirely — DM
          // pre-staging, NPC re-positioning by DM, all unchanged.
          const ati = activeTokenInfoRef.current;
          // v2.403.0 — Tightened enforcement check. Pre-v2.403 this
          // gated on `ati.tokenId === drag.id`. activeTokenInfo.tokenId
          // is computed by walking liveTokens for one whose npcId or
          // characterId matches currentActor.entity_id. For
          // multi-instance creatures (multiple goblins sharing one
          // homebrew_monsters row → same creature_id on each token)
          // the walk picks ONE token — which may not be the one the
          // user is dragging. That dropped enforcement on most
          // dragged copies. Now we re-check by reading the dragged
          // token's identifiers directly from the store and matching
          // them against currentActor.entity_id.
          let enforceMove = false;
          let activeMatch = false;
          if (!wasClick && movedAtAll && ati && ati.participantId) {
            // Original check — fast path when activeTokenInfo correctly
            // identified the dragged token.
            if (ati.tokenId === drag.id) {
              activeMatch = true;
            } else {
              // Fallback: check the dragged token's identifiers.
              const draggedTok = useBattleMapStore.getState().tokens[drag.id];
              if (draggedTok) {
                const activeEntity = ati.participantEntityId ?? '';
                if (ati.participantType === 'character'
                    && draggedTok.characterId
                    && draggedTok.characterId === activeEntity) {
                  activeMatch = true;
                } else if (ati.participantType !== 'character'
                    && draggedTok.npcId
                    && draggedTok.npcId === activeEntity) {
                  activeMatch = true;
                }
              }
            }
            enforceMove = activeMatch;
          }
          // v2.403.0 — Diagnostic log so the DM can confirm enforcement
          // is firing on the right tokens. Remove or quiet once the
          // movement-enforcement bug class is closed.
          if (movedAtAll && !wasClick) {
            // eslint-disable-next-line no-console
            console.log('[BattleMapV2] drop commit', {
              tokenId: drag.id,
              hasAti: !!ati,
              atiTokenId: ati?.tokenId,
              atiParticipantId: ati?.participantId,
              atiEntityId: ati?.participantEntityId,
              enforceMove,
              activeMatch,
            });
          }

          // v2.357.0 — Math.floor (not Math.round). See drawPreview
          // comment for rationale. Tokens stored at center-of-cell
          // produce N+0.5 when divided by cell size; floor gives N.
          const fromCellRow = Math.floor(drag.originY / gridSizePx);
          const fromCellCol = Math.floor(drag.originX / gridSizePx);
          const toCellRow = Math.floor(clampedY / gridSizePx);
          const toCellCol = Math.floor(clampedX / gridSizePx);
          const distanceFt = computeChebyshevFt(fromCellRow, fromCellCol, toCellRow, toCellCol);

          // v2.361.0 — Snappy local over-budget snap-back. User
          // feedback: snap-back was sluggish because we awaited a
          // canMove() round-trip (~100-500ms over the network) before
          // resetting the token. The local activeTokenInfo already
          // has authoritative .max + .used values that are kept in
          // sync via the combat-state push loop; checking distanceFt
          // > remaining locally gives the same answer 99% of the
          // time. Predict locally first → snap immediately if over —
          // no network wait. canMove still runs below as the
          // authoritative server check (catches edge cases where the
          // local cache was stale due to another concurrent action),
          // but by then the user has already seen the snap.
          if (enforceMove) {
            // v2.423.0 — Effective `used` is the max of the echoed
            // server value and our local optimistic prediction. Without
            // this, fast successive drags read a stale server `used`
            // value and over-spend the budget. The prediction lives
            // in BattleMapV2 (ref) and is read via getEffectiveUsed
            // since this code is inside TokenLayer.
            const effectiveUsed = getEffectiveUsed
              ? getEffectiveUsed(ati!.participantId, ati!.used)
              : ati!.used;
            const remaining = Math.max(0, ati!.max - effectiveUsed);
            if (distanceFt > remaining) {
              // Snap back instantly. Skip both the optimistic position
              // commit AND the canMove round-trip. No DB write; the
              // origin position is still canonical in scene_tokens.
              useBattleMapStore.getState().updateTokenPosition(drag.id, drag.originX, drag.originY);
              onDragMove?.(drag.id, drag.originX, drag.originY);
              onMovementBlocked?.('budget');
              // v2.438.0 — Full pointerup cleanup BEFORE returning.
              // Pre-v2.438 the rejection branch did `return;` early,
              // which skipped the cleanup at the bottom of the
              // pointerup handler:
              //   - dragRef.current = null
              //   - clickProbeRef.current = null
              //   - setDragging(null)
              //   - onDragEnd?.(drag.id)
              // With dragRef.current still set, the NEXT pointermove
              // (without the mouse button held) was treated as a
              // continuation of the original drag — `updatePos`
              // continued moving the token to wherever the cursor
              // was. The user could then click anywhere to finalize
              // a position that was supposed to have been rejected.
              // User report: "click drag and drop outside total
              // distance, then click again, the token drops at the
              // far cell."
              //
              // Now: do the full cleanup synchronously on the
              // rejection path so the state machine returns to
              // "no drag in progress" cleanly. Subsequent pointer
              // events start fresh.
              //
              // v2.440.0 — Also stop the preview loop and clear the
              // preview graphics. Pre-v2.440 the dashed line + white
              // marker stayed visible on screen after a rejected
              // drop because v2.438 added the dragRef cleanup but
              // forgot the preview teardown. The "movement blocked"
              // toast already communicates the rejection — leftover
              // preview marks are just noise.
              stopPreviewLoop();
              clearPreview();
              onDragEnd?.(drag.id);
              dragRef.current = null;
              clickProbeRef.current = null;
              setDragging(null);
              return;
            }
          }

          // Optimistic UI: position the token at the drop site
          // immediately. If validation fails, we'll snap it back
          // below — most drags succeed, so this avoids a perceptible
          // pause on the common path.
          // v2.429.0 — Animate the snap from current cursor position
          // to the snap target over ~120ms with an ease-out curve
          // (Roll20-feel). Falls back to instant updatePos when no
          // animator is wired (test envs / dragless scenarios).
          if (onSnapAnimate) {
            const cur = useBattleMapStore.getState().tokens[drag.id];
            if (cur) {
              onSnapAnimate(drag.id, cur.x, cur.y, clampedX, clampedY);
            } else {
              updatePos(drag.id, clampedX, clampedY);
            }
          } else {
            updatePos(drag.id, clampedX, clampedY);
          }
          onDragMove?.(drag.id, clampedX, clampedY);

          const commit = async () => {
            if (enforceMove) {
              const check = await canMove(ati!.participantId!, distanceFt);
              if (!check.allowed) {
                // Authoritative server-side rejection. The local
                // pre-check above passed, so this only fires when
                // the local cache was stale (rare). Same snap-back
                // path as the local short-circuit.
                useBattleMapStore.getState().updateTokenPosition(drag.id, drag.originX, drag.originY);
                onDragMove?.(drag.id, drag.originX, drag.originY);
                onMovementBlocked?.('budget');
                return;
              }
            }
            if (wasClick) return; // pure click — no commit needed
            // v2.213 commit (existing path) — wall-trigger rejection
            // handling is preserved verbatim from pre-v2.340.
            // v2.418.0 — Stamp the upcoming write so the realtime
            // echo handler skips the bulk re-fetch when this same
            // row comes back to us. Stamp BEFORE the await so the
            // echo (which can race the await's resolve) sees it.
            // Implemented via the onCommitPos prop the parent wires
            // up; the actual markSelfWrite ref lives in BattleMapV2.
            onCommitPos?.(drag.id, clampedX, clampedY);
            const result = await tokensApi.updateTokenPos(drag.id, clampedX, clampedY, { campaignId: props.campaignId });
            if (!result.ok) {
              if (result.reason === 'wall_blocked') {
                useBattleMapStore.getState().updateTokenPosition(drag.id, drag.originX, drag.originY);
                onDragMove?.(drag.id, drag.originX, drag.originY);
                onMovementBlocked?.('wall');
              } else {
                console.error('[BattleMapV2] pos commit failed', result);
              }
              return;
            }
            // v2.340.0 — log the movement so movement_used_ft updates
            // server-side and the badge reflects the new remaining
            // budget on the next combat-state push. Also fires
            // opportunity-attack offers for adjacent enemies.
            if (enforceMove && distanceFt > 0) {
              // v2.437.0 — Bump the optimistic budget BEFORE awaiting
              // logMovement, not after. Pre-v2.437 recordMoved was
              // called only after the network round-trip completed,
              // which left a window during which a fast second drag
              // could pass its pre-check (remaining = max - echoedUsed
              // = max - 0 still) and commit, even though the first
              // drag had already used the budget. User report: "it's
              // possible to move a token outside its movement range
              // by clicking it twice." Bumping predictedUsed
              // synchronously closes that window — the second drag's
              // pre-check now reads the predicted-post-first-move
              // remaining and rejects correctly.
              if (recordMoved) {
                recordMoved(ati!.participantId!, distanceFt, ati!.used);
              }
              try {
                await logMovement({
                  campaignId: ati!.campaignId!,
                  encounterId: ati!.encounterId,
                  participantId: ati!.participantId!,
                  participantName: ati!.participantName!,
                  participantType: ati!.participantType!,
                  fromRow: fromCellRow,
                  fromCol: fromCellCol,
                  toRow: toCellRow,
                  toCol: toCellCol,
                  distanceFt,
                });
              } catch (err) {
                console.error('[BattleMapV2] logMovement threw', err);
                // logMovement failed (network glitch, server error).
                // The optimistic predictedUsed is now stale — we
                // bumped it before the await, but the server didn't
                // record the move. The next combat-state echo will
                // overwrite ati.used with the server's true value
                // (which is the pre-move value), and getEffectiveUsed
                // will continue returning the stale local prediction
                // until the user's turn ends or the page is refreshed.
                // Acceptable: erring on the side of MORE conservative
                // budget enforcement is better than the over-spend
                // bug we're fixing here. Document this in case the
                // tradeoff needs revisiting.
              }
            }
            // v2.358.0 — Record token-move undo (DM only).
            // User feedback: "if the character moved into a incorrect
            // position for the dm it should be in their log in the
            // bottom right corner." Capture the move before/after so
            // a single Ctrl-Z (or the floating Undo Last Move button)
            // restores the original position. Skipped for player drags
            // since the multi-user race concerns useUndoRedo flagged
            // still apply to player tokens.
            if (isDM) {
              const tokenId = drag.id;
              const fromX = drag.originX;
              const fromY = drag.originY;
              const toX = clampedX;
              const toY = clampedY;
              recordUndoableRef.current?.({
                label: 'move token',
                forward: async () => {
                  useBattleMapStore.getState().updateTokenPosition(tokenId, toX, toY);
                  await tokensApi.updateTokenPos(tokenId, toX, toY, { campaignId: props.campaignId });
                },
                backward: async () => {
                  useBattleMapStore.getState().updateTokenPosition(tokenId, fromX, fromY);
                  await tokensApi.updateTokenPos(tokenId, fromX, fromY, { campaignId: props.campaignId });
                },
              });
            }
          };
          commit().catch(err => console.error('[BattleMapV2] drop commit threw', err));
        }
      }
      // v2.340.0 — always clear the preview overlay on pointerup.
      // Even on click drops or rejected drops, the dashes shouldn't
      // linger after the gesture ends.
      stopPreviewLoop();
      clearPreview();
      const entry = gfxMapRef.current.get(drag.id);
      if (entry) {
        entry.container.cursor = 'grab';
        entry.container.alpha = 1;
      }
      // v2.216: release the lock — whether or not the commit succeeds,
      // we're done locally. Stale commits are rare; stale locks would
      // block the UI.
      onDragEnd?.(drag.id);
      // v2.226: fire click callback AFTER drag teardown so the parent
      // can rely on store/lock state being clean.
      if (wasClick && probe) {
        onTokenClick?.(probe.id, e.clientX, e.clientY);
      }
      dragRef.current = null;
      clickProbeRef.current = null;
      setDragging(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      // v2.430.0 — kill the preview rAF loop if a drag was in flight
      // when the effect tore down (rare — mostly happens on hot-reload
      // during dev). Without this the rAF callback fires once more
      // after teardown and writes to a destroyed Graphics → crash.
      stopPreviewLoop();
      // v2.340.0 — tear down the persistent drag-preview overlay so
      // it doesn't leak between viewport remounts (rare, but happens
      // on scene change). destroy() releases the Graphics + Text
      // GPU resources cleanly.
      try {
        if (previewGfx.parent) previewGfx.parent.removeChild(previewGfx);
        previewGfx.destroy();
        if (previewLabel.parent) previewLabel.parent.removeChild(previewLabel);
        previewLabel.destroy();
      } catch {
        // PIXI sometimes throws if the parent has already disposed
        // — safe to ignore on teardown.
      }
    };
  }, [viewport, canvasEl, updatePos, setDragging, worldWidth, worldHeight, gridSizePx, onDragMove, onDragEnd, onTokenClick, onMovementBlocked, onCommitPos, getEffectiveUsed, recordMoved, onSnapAnimate, onDragMotionEnded]);

  return null;
}




// v2.286.0 — Legacy InitiativeBar component removed. It rendered
// ABOVE the canvas wrapper when sessionState.combat_active was true,
// driven by the legacy initiative_order on campaign_sessions. The
// modern InitiativeStrip mounts at the bottom of the page from
// CombatProvider and is the canonical surface for combat. Keeping
// both was a UX hazard — they could disagree if the legacy boolean
// got toggled without participants being seeded. The mount site
// (~line 6844 originally) was deleted in the same commit.



export default function BattleMapV2(props: BattleMapV2Props) {
  const { isDM, campaignId, userId } = props;

  // v2.222 — navigate to a linked character's full sheet from a token's
  // right-click menu. Uses the same /character/:id route the character
  // creator/lobby use. Memoized to keep TokenContextMenu props stable.
  const navigate = useNavigate();
  const handleOpenCharacter = useCallback((characterId: string) => {
    navigate(`/character/${characterId}`);
  }, [navigate]);

  // v2.240 — non-blocking toast handle. Used in this file to replace
  // the chain of `window.alert()` calls left over from earlier ships
  // with the existing toast UI (mounted at app root in App.tsx).
  const { showToast } = useToast();
  // v2.241 — non-blocking modal handles for prompts/confirms (replaces
  // window.prompt and window.confirm in this file). Single-modal-at-a-
  // time semantics; opening a second cancels the first. ModalProvider
  // is mounted at app root in App.tsx.
  const { prompt: promptModal, confirm: confirmModal } = useModal();

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });
  // v2.281.0 — pseudo-fullscreen toggle. When true the wrapper goes
  // position:fixed inset:0 to take over the viewport without invoking
  // the browser's native fullscreen API (which would hide portaled
  // overlays like the InitiativeStrip, dice/log buttons, toasts, and
  // modals — all of which mount via document.body). The CSS approach
  // keeps every portal layer correctly stacked above the map.
  // v2.425.0 — Default back to OFF. v2.424 made fullscreen the
  // default to address "the map is small" feedback, but fullscreen
  // mode overlays the page including the InitiativeStrip and the
  // page tab strip, so it's the wrong fix when the user wants the
  // map larger but still wants the surrounding controls visible.
  // Reverting to the pre-v2.424 default; the existing ⛶ Fullscreen
  // toggle remains for users who DO want the map filling the screen.
  // Persisted choices ('0' / '1') are still honored.
  const FULLSCREEN_KEY = 'dndkeep:battlemap:fullscreen';
  const [mapFullscreen, setMapFullscreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(FULLSCREEN_KEY) === '1'; } catch { return false; }
  });
  const toggleMapFullscreen = useCallback(() => {
    setMapFullscreen(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(FULLSCREEN_KEY, '1');
        else localStorage.removeItem(FULLSCREEN_KEY);
      } catch { /* ignore */ }
      return next;
    });
  }, []);
  // Esc exits fullscreen. Doesn't interfere with other Esc handlers
  // because they generally check for an open modal/menu first; this
  // listener only acts when fullscreen is on AND no other Esc-eating
  // surface is mounted. We can't easily detect "another modal open"
  // from here without coupling, so we just check our own state and
  // bail otherwise — the cost of double-handling Esc (closing both
  // a popup and exiting fullscreen) is acceptably minor.

  // v2.313.0 — Combat Phase 3 pt 5: per-campaign feature flag. When
  // true, this BattleMap reads/writes through scenePlacements.ts
  // (placements + combatants) instead of sceneTokens.ts. Hydrated by
  // the scene-load effect after fetching campaigns.use_combatants_for_battlemap
  // and used by the realtime subscription effect to choose which
  // table to subscribe to. Defaults false so the legacy path stays
  // active until the DM opts in. Flip via SQL during dogfooding —
  // a UI toggle in CampaignSettings is queued for a follow-up ship.
  const [useNewPath, setUseNewPath] = useState(false);
  useEffect(() => {
    if (!mapFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMapFullscreen(false);
        try { localStorage.removeItem(FULLSCREEN_KEY); } catch { /* ignore */ }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mapFullscreen]);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // v2.358.0 — Token selection (left-click without drag). Local-only
  // UI state; not persisted, not sync'd across users. Shows a thin
  // cyan ring around the selected token to distinguish from the
  // active-turn gold ring (which is sync'd / driven by initiative).
  // Clicking a different token replaces selection; Escape clears it;
  // right-click → "Open Quick Panel" is how the DM accesses the
  // character/NPC quick panel that left-click used to open before
  // this ship.
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  // Escape clears selection. Bails on text inputs so a user typing
  // in the rename modal can press Escape to dismiss the modal
  // without also wiping their selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      }
      setSelectedTokenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // v2.226 — left-click-without-drag opens the TokenQuickPanel for
  // character-linked tokens. State holds the tokenId + screen pos
  // so the panel can be anchored near the click.
  const [clickedToken, setClickedToken] = useState<{
    tokenId: string;
    x: number;
    y: number;
  } | null>(null);
  // v2.243 — separate state for NPC-linked token clicks. The NPC
  // panel reads from `npcs` and is structurally different from the
  // character TokenQuickPanel (no class/level/abilities/checks),
  // so it gets its own state slot. Mutually exclusive with
  // clickedToken — opening one clears the other.
  // v2.386.0 — tokenId added so the panel can act on the specific
  // scene_tokens row that was clicked. Previously the panel only
  // had npcId (creature_id), which is fine for HP/conditions but
  // the wrong granularity for the per-token visibility toggle.
  const [clickedNpcToken, setClickedNpcToken] = useState<{
    npcId: string;
    tokenId: string;
    x: number;
    y: number;
  } | null>(null);

  // v2.215 — portrait upload state. fileInputRef drives the hidden
  // <input type="file">; uploadTargetIdRef holds which token the next
  // file-select applies to; uploadingTokenId gates the "UPLOADING…"
  // banner during the async upload round-trip.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetIdRef = useRef<string | null>(null);
  const [uploadingTokenId, setUploadingTokenId] = useState<string | null>(null);

  // Called by the context menu when the user picks "Upload portrait…".
  // Records which token the resulting file will apply to and opens the
  // native file picker.
  const handleRequestUpload = useCallback((tokenId: string) => {
    uploadTargetIdRef.current = tokenId;
    fileInputRef.current?.click();
  }, []);

  // Called when the file input onChange fires. Validates, uploads,
  // updates the token, then persists via tokensApi.updateToken. The
  // Realtime subscription will echo the update back for this client
  // (idempotent) and forward to all other clients in the scene.
  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file still triggers onChange.
    e.target.value = '';
    const tokenId = uploadTargetIdRef.current;
    uploadTargetIdRef.current = null;
    if (!file || !tokenId) return;

    // Redundant client validation — matches the bucket's allowed list.
    if (!assetsApi.ACCEPTED_PORTRAIT_MIME.includes(file.type)) {
      showToast(`Unsupported file type: ${file.type}. Use PNG, JPEG, WebP, or GIF.`, 'warn');
      return;
    }
    if (file.size > assetsApi.MAX_PORTRAIT_BYTES) {
      showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`, 'warn');
      return;
    }

    setUploadingTokenId(tokenId);
    try {
      const path = await assetsApi.uploadTokenPortrait(file, userId, tokenId);
      if (!path) {
        showToast('Upload failed. Check the browser console for details.', 'error');
        return;
      }
      // Optimistic local update.
      useBattleMapStore.getState().updateTokenFields(tokenId, { imageStoragePath: path });
      // Commit to DB — Realtime echoes back to all clients.
      tokensApi.updateToken(tokenId, { imageStoragePath: path }, { campaignId }).catch(err =>
        console.error('[BattleMapV2] portrait path commit failed', err)
      );
    } finally {
      setUploadingTokenId(null);
    }
  }, [userId]);

  // v2.213: scene list + currently-selected scene. Scenes are fetched
  // on mount and on campaign change.
  const [scenes, setScenes] = useState<scenesApi.Scene[]>([]);
  const [currentScene, setCurrentScene] = useState<scenesApi.Scene | null>(null);
  const [scenesLoading, setScenesLoading] = useState(true);
  const loading = useBattleMapStore(s => s.loading);

  // v2.255.0 — undo/redo stack for drawings + texts. Scene-scoped
  // (history resets on scene switch). Bound to Cmd-Z / Cmd-Shift-Z
  // by the hook's own keyboard listener; we just consume `record`
  // and pass it down to TextLayer + DrawingLayer.
  // v2.358.0 — also consume `undo` + `canUndo` + `lastActionLabel`
  // for the floating "Undo Last Move" button rendered in the bottom-
  // right corner of the map. Per user request: undo affordance lives
  // in the log corner, not just behind a keybind.
  const { record: recordUndoable, undo: undoLast, canUndo, lastActionLabel } = useUndoRedo(currentScene?.id ?? null);

  // Derive world dimensions from the current scene (fallback to
  // defaults so the empty-state screen still renders a reasonable
  // placeholder grid behind the CTA).
  const gridSizePx = currentScene?.gridSizePx ?? DEFAULT_GRID_SIZE_PX;
  const widthCells = currentScene?.widthCells ?? DEFAULT_WIDTH_CELLS;
  const heightCells = currentScene?.heightCells ?? DEFAULT_HEIGHT_CELLS;
  const WORLD_WIDTH = gridSizePx * widthCells;
  const WORLD_HEIGHT = gridSizePx * heightCells;

  // Fetch scenes on mount / campaign change.
  useEffect(() => {
    let cancelled = false;
    setScenesLoading(true);
    scenesApi.listScenes(campaignId).then(list => {
      if (cancelled) return;
      setScenes(list);
      // Auto-select the first scene if none is selected yet.
      if (list.length > 0) {
        setCurrentScene(prev => prev ?? list[0]);
      }
      setScenesLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  // Hydrate tokens when the current scene changes.
  useEffect(() => {
    const store = useBattleMapStore.getState();
    if (!currentScene) {
      store.resetForScene(null);
      store.setTokensBulk([]);
      store.setWallsBulk([]);
      return;
    }
    let cancelled = false;
    store.setLoading(true);
    store.resetForScene(currentScene.id);
    // v2.313.0 — Combat Phase 3 pt 5: chain flag fetch before
    // listTokens so the router knows which path to use. Walls/texts/
    // drawings hydrate in parallel below as before — they're not
    // affected by the Phase 3 swap.
    (async () => {
      let flag = false;
      try {
        flag = await getUseCombatantsFlag(campaignId);
      } catch (err) {
        // Default to legacy path on flag-fetch errors so a transient
        // outage doesn't silently switch render modes.
        console.error('[BattleMapV2] getUseCombatantsFlag failed', err);
      }
      if (cancelled) return;
      // v2.495.0 — setUseCombatantsPath was retired. The router
      // resolves the flag per-call (and caches the result), so the
      // setUseNewPath below is the only state still needed — it
      // drives this component's own realtime subscription routing
      // (scene_tokens vs scene_token_placements channel).
      setUseNewPath(flag);
      const list = await tokensApi.listTokens(currentScene.id, { campaignId });
      if (cancelled) return;
      useBattleMapStore.getState().setTokensBulk(list);
      useBattleMapStore.getState().setLoading(false);
    })();
    // v2.223 — walls hydration runs in parallel with tokens. No
    // loading gate for walls specifically; they populate when ready.
    wallsApi.listWalls(currentScene.id).then(list => {
      if (cancelled) return;
      useBattleMapStore.getState().setWallsBulk(list);
    });
    // v2.234 — texts hydration parallel to walls.
    textsApi.listTexts(currentScene.id).then(list => {
      if (cancelled) return;
      useBattleMapStore.getState().setTextsBulk(list);
    });
    // v2.235 — drawings hydration parallel to walls/texts.
    drawingsApi.listDrawings(currentScene.id).then(list => {
      if (cancelled) return;
      useBattleMapStore.getState().setDrawingsBulk(list);
    });
    return () => { cancelled = true; };
  }, [currentScene]);

  // v2.214.0 — Phase Q.1 pt 7: Realtime sync for scene_tokens.
  // When any client commits a token change (add / move / edit / delete),
  // Supabase Postgres Changes fires an event here and we apply it to the
  // Zustand store. RLS filters — each subscriber only receives events
  // for rows they could SELECT, so no sensitive tokens leak to players
  // who shouldn't see them.
  //
  // Idempotency: the originating client also receives its own events.
  // Since `addToken` is an upsert (spread + set by id) and the payload
  // data matches the client's optimistic state, the re-apply is a no-op.
  // No special filtering needed.
  //
  // Race window: there's a brief gap (typically <200ms) between
  // subscription setup and listTokens resolving where a new INSERT
  // event could be superseded by setTokensBulk's wholesale replacement.
  // Acceptable for v2.214; v2.215 can introduce a merge strategy.
  //
  // v2.313.0 — Combat Phase 3 pt 5: when useNewPath is true, the
  // subscription targets scene_token_placements. INSERT/UPDATE
  // payloads from that table don't include the JOINed combatant
  // data, so the handler re-fetches the full list via the router
  // (bounded scenes; ~50 tokens is the realistic upper bound and the
  // round-trip cost is acceptable). DELETE payloads carry only the
  // primary key, which is enough to drop from the store.
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const tableName = useNewPath ? 'scene_token_placements' : 'scene_tokens';
    let cancelled = false;
    const channel = supabase
      .channel(`battle_map:${tableName}:${sceneId}`)
      .on(
        // Supabase types lag behind runtime; cast to bypass the literal.
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `scene_id=eq.${sceneId}`,
        },
        async (payload: any) => {
          const store = useBattleMapStore.getState();
          // Ignore events for tokens belonging to a different scene —
          // the filter should already handle this but defense-in-depth
          // against filter semantics changing.
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRow = payload.new;
            if (newRow?.scene_id !== sceneId) return;
            // v2.418.0 — Suppress echo of our own write. If this row
            // matches a recent local commit, the store is already
            // correct; a bulk re-fetch only risks regressing back to
            // a momentarily-stale DB read while the server settles.
            if (shouldSuppressEcho(newRow)) {
              return;
            }
            if (useNewPath) {
              // The placement realtime payload doesn't carry the
              // combatants JOIN. Re-fetch via the router so the store
              // sees the merged Token shape. v2.314+ may do a
              // single-row JOINed fetch by id for tighter cost.
              const list = await tokensApi.listTokens(sceneId, { campaignId });
              if (cancelled) return;
              useBattleMapStore.getState().setTokensBulk(list);
            } else {
              store.addToken(dbRowToToken(newRow));
            }
          } else if (payload.eventType === 'DELETE') {
            // For DELETE with REPLICA IDENTITY DEFAULT (Postgres default),
            // payload.old contains only the primary key. That's all we need.
            const oldRow = payload.old;
            if (oldRow?.id) {
              store.removeToken(oldRow.id);
            }
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id, useNewPath]);

  // v2.314.0 — Combat Phase 3 pt 6: combatants realtime subscription.
  // The placement subscription above only fires on placement-row
  // changes — it doesn't see UPDATEs to the linked combatant (e.g.,
  // a rename writes to combatants.name, not the placement). Without
  // this second channel, multi-client rename propagation is broken
  // (the DM's own UI sees the rename via optimistic state, but other
  // clients keep showing the old name until they reload).
  //
  // The dual-write trigger from v2.311 also writes HP/condition
  // changes to combatants whenever a combat_participants row is
  // updated. We don't want every HP tick to trigger a full token
  // re-fetch, so the handler filters on a name-change predicate
  // (and portrait_storage_path, which also affects token render)
  // before refreshing. HP/conditions/buffs/etc. updates are skipped
  // because the BattleMap doesn't currently render those on tokens
  // — they're shown elsewhere (initiative strip, character sheet).
  // If a future feature shows HP on tokens, expand the predicate.
  //
  // Filter: campaign_id=eq.${campaignId}. RLS still applies on top.
  useEffect(() => {
    if (!useNewPath || !campaignId) return;
    let cancelled = false;
    const channel = supabase
      .channel(`battle_map:combatants:${campaignId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'combatants',
          filter: `campaign_id=eq.${campaignId}`,
        },
        async (payload: any) => {
          // Skip if neither name nor portrait changed. The dual-write
          // trigger fires on HP/condition changes which we don't
          // visualize on the map.
          const oldRow = payload.old ?? {};
          const newRow = payload.new ?? {};
          const visualChanged =
            oldRow.name !== newRow.name ||
            oldRow.portrait_storage_path !== newRow.portrait_storage_path;
          if (!visualChanged) return;
          if (!currentScene?.id) return;
          // Only refresh if this combatant has a placement on the
          // current scene. Avoids refreshing for combatants that
          // only exist in other scenes or in combat-only state.
          const tokens = useBattleMapStore.getState().tokens;
          const onScene = Object.values(tokens).some(
            (t) => t.combatantId === newRow.id
          );
          if (!onScene) return;
          const list = await tokensApi.listTokens(currentScene.id, { campaignId });
          if (cancelled) return;
          useBattleMapStore.getState().setTokensBulk(list);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaignId, useNewPath, currentScene?.id]);

  // v2.223.0 — Phase Q.1 pt 16: Realtime sync for scene_walls.
  // Same pattern as scene_tokens. INSERTs (wall drawn) fire addWall on
  // all subscribers; DELETEs fire removeWall. No UPDATE handler in
  // this ship — walls are currently immutable (draw + delete, no edit).
  // v2.226+ door-state changes will add UPDATE handling.
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const channel = supabase
      .channel(`battle_map:scene_walls:${sceneId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scene_walls',
          filter: `scene_id=eq.${sceneId}`,
        },
        (payload: any) => {
          const store = useBattleMapStore.getState();
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const wall = wallsApi.dbRowToWall(payload.new);
            // addWall is upsert semantics — safe for the originator's
            // own echo (idempotent) and for remote inserts alike.
            store.addWall(wall);
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old;
            if (oldRow?.id) {
              store.removeWall(oldRow.id);
            }
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id]);

  // v2.234.0 — Realtime sync for scene_texts. Parallel to scene_walls
  // but with UPDATE handling because text rows DO mutate (rename via
  // double-click edit). Idempotent: addText/updateText with the same
  // payload is a no-op if state matches, so the originator echo is safe.
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const channel = supabase
      .channel(`battle_map:scene_texts:${sceneId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scene_texts',
          filter: `scene_id=eq.${sceneId}`,
        },
        (payload: any) => {
          const store = useBattleMapStore.getState();
          if (payload.eventType === 'INSERT') {
            store.addText(textsApi.dbRowToSceneText(payload.new));
          } else if (payload.eventType === 'UPDATE') {
            store.updateText(payload.new.id, textsApi.dbRowToSceneText(payload.new));
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old;
            if (oldRow?.id) store.removeText(oldRow.id);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id]);

  // v2.235.0 — Realtime sync for scene_drawings. Drawings are immutable
  // (insert + delete only). Same pattern as scene_walls; no UPDATE.
  useEffect(() => {
    if (!currentScene?.id) return;
    const sceneId = currentScene.id;
    const channel = supabase
      .channel(`battle_map:scene_drawings:${sceneId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scene_drawings',
          filter: `scene_id=eq.${sceneId}`,
        },
        (payload: any) => {
          const store = useBattleMapStore.getState();
          if (payload.eventType === 'INSERT') {
            store.addDrawing(drawingsApi.dbRowToSceneDrawing(payload.new));
          } else if (payload.eventType === 'UPDATE') {
            // v2.255.0 — drawings are now mutable (drag-to-reposition).
            // Project the row through the same mapper as INSERT so
            // the local cache stays consistent with the DB shape.
            store.updateDrawing(payload.new.id, drawingsApi.dbRowToSceneDrawing(payload.new));
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old;
            if (oldRow?.id) store.removeDrawing(oldRow.id);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentScene?.id]);

  // v2.214.0 — Phase Q.1 pt 7: Realtime sync for scenes.
  // When a DM creates a new scene or publishes/unpublishes one, all
  // campaign members see the scenes list update. Players who don't
  // have permission via RLS silently won't receive unpublished scenes.
  useEffect(() => {
    if (!campaignId) return;
    const channel = supabase
      .channel(`battle_map:scenes:${campaignId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'scenes',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new;
            const scene: scenesApi.Scene = {
              id: newRow.id,
              campaignId: newRow.campaign_id,
              ownerId: newRow.owner_id,
              name: newRow.name,
              gridType: newRow.grid_type,
              gridSizePx: newRow.grid_size_px,
              widthCells: newRow.width_cells,
              heightCells: newRow.height_cells,
              backgroundStoragePath: newRow.background_storage_path,
              dmNotes: newRow.dm_notes,
              isPublished: newRow.is_published,
              // v2.274.0 — ambient_light defaults to 'dark' if missing.
              ambientLight: newRow.ambient_light ?? 'dark',
              createdAt: newRow.created_at,
              updatedAt: newRow.updated_at,
            };
            setScenes(prev => {
              // Avoid dupes in case the originator's state already
              // includes this scene from its own create flow.
              if (prev.some(s => s.id === scene.id)) return prev;
              return [...prev, scene];
            });
          } else if (payload.eventType === 'UPDATE') {
            const newRow = payload.new;
            setScenes(prev => prev.map(s => s.id === newRow.id ? {
              ...s,
              name: newRow.name,
              gridSizePx: newRow.grid_size_px,
              widthCells: newRow.width_cells,
              heightCells: newRow.height_cells,
              backgroundStoragePath: newRow.background_storage_path,
              dmNotes: newRow.dm_notes,
              isPublished: newRow.is_published,
              // v2.274.0 — pull ambient_light through realtime so the
              // DM's lighting toggle reaches all connected players
              // without a refetch.
              ambientLight: newRow.ambient_light ?? 'dark',
              updatedAt: newRow.updated_at,
            } : s));
            // If the currently-selected scene was renamed / retuned,
            // reflect that in `currentScene` too.
            setCurrentScene(prev => prev && prev.id === newRow.id ? {
              ...prev,
              name: newRow.name,
              gridSizePx: newRow.grid_size_px,
              widthCells: newRow.width_cells,
              heightCells: newRow.height_cells,
              backgroundStoragePath: newRow.background_storage_path,
              dmNotes: newRow.dm_notes,
              isPublished: newRow.is_published,
              ambientLight: newRow.ambient_light ?? 'dark',
              updatedAt: newRow.updated_at,
            } : prev);
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (!oldId) return;
            setScenes(prev => prev.filter(s => s.id !== oldId));
            // If the deleted scene was selected, fall back to null;
            // the empty-state screen or auto-select will handle recovery.
            setCurrentScene(prev => prev && prev.id === oldId ? null : prev);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  // v2.216.0 — Phase Q.1 pt 9: drag channel (Broadcast + Presence).
  //
  // One Realtime channel per scene, carrying two kinds of traffic:
  //   (a) Broadcast `drag_move` events at ~20Hz with {tokenId, x, y,
  //       senderId}. Peers apply to their Zustand store as preview;
  //       senders ignore their own echo to avoid self-feedback loops.
  //   (b) Presence state `{ userId, draggingTokenId }` tracking who's
  //       currently mid-drag on which token. Receivers rebuild a
  //       `remoteDragLocks` map (tokenId → userId) on 'sync' events.
  //       Presence auto-cleans on disconnect (Phoenix Tracker CRDT).
  //
  // The channel is rebuilt on scene change; presence state from the
  // previous scene doesn't carry over. userId is stable across
  // scenes, so we track() fresh on each subscription.
  const dragChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // v2.418.0 — Self-write echo suppression. After we commit a token
  // position via tokensApi.updateTokenPos, the postgres_changes
  // realtime channel echoes the UPDATE back to us — same row, same
  // values, but the handler bulk-refetches every token in the scene
  // and replaces the store. The bulk replace causes a visible
  // "jiggle" on the dragged token (the optimistic snap → bulk
  // replace round-trips a few ms apart, sometimes with a stale
  // x/y from the DB while the server-side write is still settling).
  // Symptom: drop a Tarrasque, it jiggles back-and-forth, settles.
  //
  // Fix: stamp each self-write with the (id, x, y, timestamp) tuple.
  // When an echo arrives matching the stamp, skip the bulk refetch —
  // our optimistic store state is already canonical for that row.
  // Other tokens' echoes (HP, conditions, peer drags) still trigger
  // the full refresh.
  //
  // v2.420.0 — Multi-echo handling. The pre-v2.420 timestamp window
  // (1500ms) was too short for the Tarrasque case the user reported:
  // a single drop fires multiple downstream echoes (the
  // sync_scene_token_to_placement trigger writes to placements,
  // logMovement writes to combat_participants, both of which echo
  // through their own channels and may also touch scene_tokens
  // updated_at). Now suppression EXTENDS the timestamp on every
  // matching echo (sliding window) and only lifts after 2.5s of
  // quiet OR a non-matching echo (different x/y, indicating a
  // legitimate peer-driven update or a server-side reposition).
  const recentSelfWritesRef = useRef<Map<string, { x: number; y: number; t: number }>>(new Map());
  // v2.441.0 — Synthetic-click suppression after drag.
  // Browsers fire a synthetic 'click' event at the release coordinates
  // after every pointer drag, even drags with significant motion. Pixi
  // uses pointer events (not legacy mouse events), so the browser's
  // normal click suppression for drags doesn't apply. The click-to-move
  // handler was treating every post-drag synthetic click as a new
  // movement command and re-snapping the token to the cursor's release
  // cell — typically SE of the actual snap target. We stamp the time
  // a real drag motion ended; click-to-move ignores clicks within 100ms
  // of that stamp.
  const lastDragEndedAtRef = useRef<number>(0);
  // v2.423.0 — Optimistic movement budget tracking. The pre-v2.423
  // budget check `distanceFt > (max - used)` reads `used` from
  // currentActor.movement_used_ft, which is the SERVER-side counter.
  // After a successful drag, logMovement writes to the DB → realtime
  // echo arrives → CombatContext reloads → `used` updates locally.
  // That round trip is 100-500ms.
  //
  // If the user starts a SECOND drag before the echo lands, `used`
  // is still the pre-first-move value and the budget appears full.
  // Symptom: token has 5ft left, user drags it 30ft because the
  // first drag's logMovement hasn't echoed yet, second drag thinks
  // 30ft is still available.
  //
  // Fix: track the predicted server-side `movement_used_ft` value
  // we expect after our last logMovement settles. Use it (max'd
  // with the current echoed value) as the effective `used` in the
  // budget check. Cleared when the echoed value catches up.
  const pendingMoveRef = useRef<{ participantId: string | null; predictedUsed: number }>({ participantId: null, predictedUsed: 0 });
  // v2.429.0 — Snap-drop animation. Roll20-style: when a drag ends,
  // the token position interpolates from "where the cursor was" to
  // "the snapped grid cell" over ~120ms with an ease-out curve,
  // instead of teleporting. Reads as physical and forgiving rather
  // than digital and abrupt. Tracking the active animation by token
  // id lets us cancel mid-flight if the same token gets dragged
  // again before the animation completes.
  const snapAnimRef = useRef<Map<string, number>>(new Map());
  const animateSnap = useCallback((tokenId: string, fromX: number, fromY: number, toX: number, toY: number) => {
    // Cancel any in-flight animation for this token.
    const prev = snapAnimRef.current.get(tokenId);
    if (prev !== undefined) {
      cancelAnimationFrame(prev);
      snapAnimRef.current.delete(tokenId);
    }
    const dx = toX - fromX;
    const dy = toY - fromY;
    // If the snap delta is essentially zero, write directly. Saves a
    // frame's worth of churn for drags that happen to end right on
    // a grid point.
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      useBattleMapStore.getState().updateTokenPosition(tokenId, toX, toY);
      return;
    }
    const start = performance.now();
    const DURATION = 120; // ms — Roll20-feel snap
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / DURATION);
      // Ease-out cubic. Quick start, gentle landing.
      const eased = 1 - Math.pow(1 - t, 3);
      const x = fromX + dx * eased;
      const y = fromY + dy * eased;
      useBattleMapStore.getState().updateTokenPosition(tokenId, x, y);
      if (t < 1) {
        snapAnimRef.current.set(tokenId, requestAnimationFrame(tick));
      } else {
        snapAnimRef.current.delete(tokenId);
        // Final write at the exact target so float drift can't leave
        // the token off-snap by a sub-pixel.
        useBattleMapStore.getState().updateTokenPosition(tokenId, toX, toY);
      }
    };
    snapAnimRef.current.set(tokenId, requestAnimationFrame(tick));
  }, []);
  // v2.423.0 — Stable refs for the budget helpers so the TokenLayer
  // dep array doesn't re-fire pointermove subscription on every render.
  // Defined as `useRef`-wrapped functions; the actual logic reads/writes
  // pendingMoveRef directly. Both are no-side-effect on the React tree.
  const getEffectiveUsed = useCallback((participantId: string | null, echoedUsed: number): number => {
    const pm = pendingMoveRef.current;
    if (!participantId || pm.participantId !== participantId) return echoedUsed;
    return Math.max(echoedUsed, pm.predictedUsed);
  }, []);
  const recordMoved = useCallback((participantId: string, distanceFt: number, echoedUsed: number): void => {
    const pm = pendingMoveRef.current;
    const baseUsed = pm.participantId === participantId
      ? Math.max(pm.predictedUsed, echoedUsed)
      : echoedUsed;
    pendingMoveRef.current = {
      participantId,
      predictedUsed: baseUsed + distanceFt,
    };
  }, []);
  const ECHO_SUPPRESS_MS = 2500; // sliding window
  // v2.439.0 — useCallback so the reference is stable across renders.
  // Pre-v2.439 this was a plain function declaration, which produced
  // a fresh reference on every render of BattleMapV2. It's passed to
  // TokenLayer as the `onCommitPos` prop, and TokenLayer's pointer-
  // handler useEffect lists `onCommitPos` in its dep array — so the
  // effect tore down and recreated on EVERY BattleMapV2 render.
  // During a drag, that's every pointermove (each move bumps the
  // token store via updatePos, BattleMapV2 subscribes to tokens, so
  // it re-renders, so onCommitPos is fresh, so the effect resets).
  // The teardown destroyed previewGfx, so on stationary holds (no
  // pointermove → no recreate) the preview vanished. Wrapping in
  // useCallback with stable deps (`recentSelfWritesRef` is a ref,
  // never changes) keeps the reference stable through the drag and
  // lets the preview rAF/interval loop survive across re-renders.
  const markSelfWrite = useCallback((tokenId: string, x: number, y: number) => {
    recentSelfWritesRef.current.set(tokenId, { x, y, t: performance.now() });
  }, []);
  // v2.441.0 — Stable callback for TokenLayer to notify when a drag
  // motion ends (i.e. pointerup after non-zero movement). Stamps the
  // current performance.now() so click-to-move can ignore the synthetic
  // click that follows the same pointerup tick.
  const stampDragEnded = useCallback(() => {
    lastDragEndedAtRef.current = performance.now();
  }, []);
  function shouldSuppressEcho(row: { id?: string; x?: number; y?: number } | null | undefined): boolean {
    if (!row?.id) return false;
    const stamp = recentSelfWritesRef.current.get(row.id);
    if (!stamp) return false;
    if (performance.now() - stamp.t > ECHO_SUPPRESS_MS) {
      recentSelfWritesRef.current.delete(row.id);
      return false;
    }
    // Coordinate match within a half-pixel — should be exact since
    // we snap before writing, but tolerate floating-point noise.
    const dx = Math.abs((row.x ?? 0) - stamp.x);
    const dy = Math.abs((row.y ?? 0) - stamp.y);
    if (dx < 0.5 && dy < 0.5) {
      // Sliding window: matching echo extends the suppression so
      // chained echoes (trigger writebacks, downstream channels)
      // all stay suppressed until a real change arrives.
      stamp.t = performance.now();
      return true;
    }
    // Coordinate mismatch — a real position change from elsewhere
    // (peer drag, server reposition). Lift suppression and let
    // the bulk refresh apply the new value.
    recentSelfWritesRef.current.delete(row.id);
    return false;
  }
  useEffect(() => {
    if (!currentScene?.id || !userId) return;
    const sceneId = currentScene.id;
    const channel = supabase.channel(`battle_map:scene_drag:${sceneId}`, {
      config: {
        presence: { key: userId },
      },
    });

    channel.on('broadcast', { event: 'drag_move' }, (msg: any) => {
      const payload = msg?.payload;
      if (!payload) return;
      // Ignore our own echoes — we already updated the local store
      // optimistically in the drag handler.
      if (payload.senderId === userId) return;
      if (typeof payload.tokenId !== 'string') return;
      if (typeof payload.x !== 'number' || typeof payload.y !== 'number') return;
      useBattleMapStore.getState().updateTokenPosition(payload.tokenId, payload.x, payload.y);
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const locks: Record<string, string> = {};
      for (const presences of Object.values(state) as any[]) {
        for (const p of presences) {
          if (p?.draggingTokenId && typeof p.userId === 'string') {
            locks[p.draggingTokenId] = p.userId;
          }
        }
      }
      useBattleMapStore.getState().setRemoteDragLocks(locks);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Initial presence entry — no drag yet.
        await channel.track({ userId, draggingTokenId: null });
      }
    });

    dragChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      dragChannelRef.current = null;
    };
  }, [currentScene?.id, userId]);

  // Callbacks passed down to TokenLayer. Each one pokes the channel —
  // no-op if the channel isn't yet subscribed.
  const handleDragStart = useCallback((tokenId: string) => {
    dragChannelRef.current?.track({ userId, draggingTokenId: tokenId });
  }, [userId]);

  const handleDragMove = useCallback((tokenId: string, x: number, y: number) => {
    dragChannelRef.current?.send({
      type: 'broadcast',
      event: 'drag_move',
      payload: { tokenId, x, y, senderId: userId },
    });
  }, [userId]);

  const handleDragEnd = useCallback((tokenId: string) => {
    // Clear the drag lock. We keep our presence entry itself so other
    // users still see us as connected; just update draggingTokenId.
    dragChannelRef.current?.track({ userId, draggingTokenId: null });
    // Also clear locally in case the presence 'sync' event is slow —
    // otherwise the indicator might persist until the next sync.
    useBattleMapStore.setState((s) => {
      if (s.remoteDragLocks[tokenId]) {
        const { [tokenId]: _, ...rest } = s.remoteDragLocks;
        return { remoteDragLocks: rest };
      }
      return s;
    });
  }, [userId]);

  // v2.268.0 — fired when a drag is rejected because it crosses a
  // movement-blocking wall. Surface a toast so the player knows the
  // snap-back wasn't a UI glitch. Cooldown via the toast system's own
  // dedup if it has one; otherwise rapid-fire reject attempts will
  // stack toasts (acceptable: rare, and self-explanatory).
  const handleMovementBlocked = useCallback((reason?: 'wall' | 'budget') => {
    // v2.572.0 — over-budget rejections previously reused the wall
    // message ("A wall blocks that path") because both paths shared
    // this callback with no reason. Now says what actually happened.
    if (reason === 'budget') showToast('Not enough movement left.', 'warn');
    else showToast('A wall blocks that path.', 'warn');
  }, [showToast]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // v2.270.0 — was: width × 0.5625 (16:9), capped at 700px max.
    // v2.281.0 — bigger default + fullscreen support. The previous
    // 0.78 ratio felt cramped on tall monitors; bumped to 0.86 for
    // the standard layout, and the cap from 1100 → 1400 so 1440p+
    // displays can use more vertical real estate. When mapFullscreen
    // is on the canvas takes essentially the whole viewport
    // (height = innerHeight - 8 to keep a hairline border visible).
    // Width still comes from the wrapper's own clientWidth, which
    // becomes 100vw because the wrapper is position:fixed inset:0
    // when fullscreen is on.
    const computeDims = () => {
      const w = Math.max(300, Math.floor(el.clientWidth));
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
      let h: number;
      if (mapFullscreen) {
        h = Math.max(400, viewportH - 8);
      } else {
        // v2.360.0 — Settled at 0.92 of viewport height. Path:
        //   v2.336: 0.92 (baseline that worked)
        //   v2.356: 0.96 (user said "still small")
        //   v2.357: 0.96 (held — no measurements)
        //   v2.358: 0.99 (aggressive — pushed under tab strip,
        //     hid the left-side floating tools toolbar)
        //   v2.359: 0.99 (held)
        //   v2.360: 0.92 (rolled back). User feedback: "tools are
        //     hidden because the map is too small" (i.e. too big,
        //     pushing tools off-screen). The right answer for "bigger
        //     map" is the existing fullscreen mode, which gives 100%
        //     viewport coverage with no chrome competing. Default
        //     layout keeps room for the floating tools + InitiativeStrip.
        //   v2.393: 0.95 — user requested bigger again. Compromise
        //     between 0.92 and 0.96 that adds ~30-50px of vertical
        //     real estate on a 1080p monitor without going aggressive
        //     enough to hide the tools toolbar (the failure mode in
        //     v2.358-v2.359). Cap raised 1400→1600 so tall monitors
        //     get the benefit too. Fullscreen mode remains the right
        //     answer when the DM wants the full canvas.
        const targetH = Math.floor(viewportH * 0.95);
        h = Math.max(400, Math.min(targetH, 1600));
      }
      setDims({ width: w, height: h });
    };
    const ro = new ResizeObserver(() => computeDims());
    ro.observe(el);
    // ResizeObserver only fires on the wrapper's own size; window
    // height changes don't change the wrapper box on the standard
    // layout, so a separate window listener catches that case. (In
    // fullscreen the wrapper IS the viewport, so RO would fire too,
    // but the window listener is harmless redundancy.)
    const onWinResize = () => computeDims();
    window.addEventListener('resize', onWinResize);
    // Force one immediate recompute so toggling fullscreen updates
    // dims even if the wrapper's clientWidth happens to be unchanged
    // (it isn't, in practice — but defensively explicit).
    computeDims();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
    };
  }, [mapFullscreen]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let attempts = 0;
    const id = setInterval(() => {
      const canvas = el.querySelector('canvas');
      if (canvas) {
        setCanvasEl(canvas as HTMLCanvasElement);
        clearInterval(id);
      } else if (++attempts > 30) {
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [dims.width, dims.height, currentScene?.id]);

  const vpRef = useRef<Viewport | null>(null);
  const zoomIn = useCallback(() => {
    if (!vpRef.current) return;
    vpRef.current.setZoom(Math.min(4, vpRef.current.scale.x * 1.2), true);
  }, []);
  const zoomOut = useCallback(() => {
    if (!vpRef.current) return;
    vpRef.current.setZoom(Math.max(0.25, vpRef.current.scale.x / 1.2), true);
  }, []);
  const zoomFit = useCallback(() => {
    if (!vpRef.current) return;
    const fitScale = Math.min(dims.width / WORLD_WIDTH, dims.height / WORLD_HEIGHT) * 0.9;
    vpRef.current.setZoom(fitScale, true);
    vpRef.current.moveCenter(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  }, [dims.width, dims.height, WORLD_WIDTH, WORLD_HEIGHT]);

  // v2.345.0 — Free-aim direction picker for cone/line spell targeting.
  //
  // When the spell picker activates direction-pick mode, this effect
  // attaches a one-shot click listener on the canvas. The click is
  // converted to world-pixel coords via vpRef.current.toWorld(),
  // written to store.directionPick.result, and direction-pick mode is
  // auto-deactivated. The picker reads the result on its next render.
  //
  // Capture phase + stopImmediatePropagation: critical. The map has
  // many click consumers (tokens, walls, drawing tools); without
  // capture-phase intercept a click on a token would also trigger
  // token-click. Direction-pick is "where on the canvas, ignore what's
  // there" — we win the race and stop propagation.
  //
  // CSS cursor flips to crosshair while active so the player has a
  // clear "click to aim" affordance; restored on deactivate.
  const directionPickActiveStore = useBattleMapStore(s => s.directionPick.active);
  const setDirectionPickResultStore = useBattleMapStore(s => s.setDirectionPickResult);
  const setDirectionPickActiveStore = useBattleMapStore(s => s.setDirectionPickActive);
  // v2.444.0 — Live direction updater for cone/line overlays. While
  // directionPick is active, every mousemove pushes cursor world coords
  // into aoePreview.directionWorldX/Y so the cone rotates continuously
  // with the cursor. Click commits + deactivates as before.
  // v2.454.0 — 8-way direction snapping. Mousemove + click both snap
  // the cursor angle around the apex to the nearest of N/NE/E/SE/S/SW/W/NW
  // (PI/4 increments). Default ON because continuous mousemove makes
  // sub-pixel cursor wobble visually translate to the cone wobble; the
  // snap removes that without compromising aim. Hold Shift to bypass
  // for fine control. Distance from apex is preserved — only the angle
  // gets snapped — so the cursor's read as "you're aiming this far in
  // this direction" stays intact.
  const setAoePreviewDirectionStore = useBattleMapStore(s => s.setAoePreviewDirection);
  useEffect(() => {
    if (!canvasEl || !directionPickActiveStore) return;
    const prevCursor = canvasEl.style.cursor;
    canvasEl.style.cursor = 'crosshair';
    // Snap (px, py) world point to the nearest 8-way axis around
    // (apexX, apexY). Returns the snapped world point. Apex is read
    // from the live store (aoePreview.centerWorldX/Y) — when no
    // overlay is active this returns the input unchanged so we don't
    // accidentally collapse points to (0,0).
    function snapTo8Way(px: number, py: number): { x: number; y: number } {
      const aoe = useBattleMapStore.getState().aoePreview;
      if (!aoe) return { x: px, y: py };
      const dx = px - aoe.centerWorldX;
      const dy = py - aoe.centerWorldY;
      const distSq = dx * dx + dy * dy;
      // Sub-pixel distance: snapping is meaningless and would zero out
      // the dir vector. Skip.
      if (distSq < 1) return { x: px, y: py };
      const angle = Math.atan2(dy, dx);
      const step = Math.PI / 4;
      const snapped = Math.round(angle / step) * step;
      const dist = Math.sqrt(distSq);
      return {
        x: aoe.centerWorldX + Math.cos(snapped) * dist,
        y: aoe.centerWorldY + Math.sin(snapped) * dist,
      };
    }
    function onClick(e: MouseEvent) {
      const vp = vpRef.current;
      if (!canvasEl || !vp) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = vp.toWorld(screenX, screenY);
      // Shift held → fine aim (no snap). Default → 8-way snap.
      const point = e.shiftKey ? worldPoint : snapTo8Way(worldPoint.x, worldPoint.y);
      setDirectionPickResultStore({ worldX: point.x, worldY: point.y });
      setDirectionPickActiveStore(false);
    }
    // v2.444.0 — Live preview tracking. Throttling not needed; the
    // store update is a single object splice and the Pixi cone redraw
    // is gated by requestAnimationFrame in the renderer's effect.
    function onMouseMove(e: MouseEvent) {
      const vp = vpRef.current;
      if (!canvasEl || !vp) return;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = vp.toWorld(screenX, screenY);
      const point = e.shiftKey ? worldPoint : snapTo8Way(worldPoint.x, worldPoint.y);
      setAoePreviewDirectionStore(point.x, point.y);
    }
    canvasEl.addEventListener('click', onClick, true);
    canvasEl.addEventListener('mousemove', onMouseMove);
    return () => {
      if (canvasEl) {
        canvasEl.removeEventListener('click', onClick, true);
        canvasEl.removeEventListener('mousemove', onMouseMove);
        canvasEl.style.cursor = prevCursor;
      }
    };
  }, [canvasEl, directionPickActiveStore, setDirectionPickResultStore, setDirectionPickActiveStore, setAoePreviewDirectionStore]);

  // v2.239.0 — Pan-to-token. Click a PartyVitalsBar card → camera
  // animates to that PC's linked token on the current scene. Lifts
  // the vitals bar from "info display" to "navigation control" with
  // no schema, no Realtime — pure local Pixi viewport animation.
  //
  // Lookup: the store keeps tokens keyed by token id, but the link
  // we have is character id. We walk Object.values once per click;
  // token counts are typically small (<50) so the linear scan is
  // fine. We also filter to the current scene so a PC's stale token
  // on another scene doesn't pull the camera.
  //
  // If the character isn't placed on the current scene, the click
  // is a no-op (silently). Future polish: flash a "no token placed"
  // toast once the toast system lands.
  //
  // Animation: viewport.animate({position}) pans the viewport CENTER
  // to (x, y). 400ms feels snappy but smooth; default easing reads
  // natural. Zoom stays where the user left it — opinionated choice
  // (forced auto-zoom is jarring when you just want to "find that
  // PC"). If the player is zoomed way out, they'll see the token
  // recenter without losing their orientation.
  const panToCharacter = useCallback((characterId: string) => {
    const vp = vpRef.current;
    if (!vp || !currentScene) return;
    const sceneId = currentScene.id;
    const tokens = useBattleMapStore.getState().tokens;
    const target = Object.values(tokens).find(
      t => t.sceneId === sceneId && t.characterId === characterId,
    );
    if (!target) {
      // v2.240 — replace the previous silent no-op with a toast so the
      // user knows why nothing happened. Look up the character name
      // from the props array for a friendlier message.
      const char = props.playerCharacters.find(c => c.id === characterId);
      showToast(
        `${char?.name ?? 'That character'} has no token on this scene.`,
        'info',
      );
      return;
    }
    vp.animate({
      position: { x: target.x, y: target.y },
      time: 400,
      removeOnInterrupt: true,
    });
  }, [currentScene, props.playerCharacters, showToast]);

  // v2.385.0 — External pan-request consumer. The InitiativeStrip
  // (and other dashboard-level UI that doesn't have a viewport ref)
  // can call useBattleMapStore.getState().requestPan(x, y) to nudge
  // the camera. We watch the nonce, animate, and clear. Same 400ms
  // duration as panToCharacter — keeps both flows feeling identical.
  // We also zoom in to a comfortable read-the-token level on the
  // first pan: per the user's spec, "enough to where it shows that
  // character and maybe one other that is closest to them".
  //
  // Cold-mount safety: the InitiativeStrip lives at the dashboard
  // level. If the user clicks a tile while on a non-map tab, the
  // dashboard switches to the map tab and BattleMapV2 mounts at
  // about the same time. vpRef.current is assigned inside a render
  // callback that hasn't run yet on the first effect tick, so we
  // rAF-poll for up to ~1s before giving up. After that the
  // request is cleared so it doesn't re-fire on the next render.
  const panRequest = useBattleMapStore(s => s.panRequest);
  useEffect(() => {
    if (!panRequest) return;
    let raf = 0;
    let attempts = 0;
    const TARGET_CELLS_VISIBLE = 5;
    const desiredWorldVisible = TARGET_CELLS_VISIBLE * gridSizePx;
    function tryPan() {
      const vp = vpRef.current;
      if (!vp || vp.screenWidth === 0) {
        if (attempts++ < 60) {
          raf = requestAnimationFrame(tryPan);
          return;
        }
        // Gave up — clear so future requests still fire.
        useBattleMapStore.getState().clearPanRequest();
        return;
      }
      const screenShorter = Math.min(vp.screenWidth, vp.screenHeight);
      const desiredScale = screenShorter / desiredWorldVisible;
      // Don't force a zoom-OUT — only zoom in if the user is already
      // way out. (If they're zoomed past our target, leave them alone.)
      const finalScale = Math.max(vp.scale.x, desiredScale);
      vp.animate({
        position: { x: panRequest!.worldX, y: panRequest!.worldY },
        scale: finalScale,
        time: 400,
        removeOnInterrupt: true,
      });
      useBattleMapStore.getState().clearPanRequest();
    }
    tryPan();
    return () => cancelAnimationFrame(raf);
  }, [panRequest, gridSizePx]);

  // v2.213 — "+ Add Token" callback. REMOVED in v2.353.0 along with
  // its toolbar button. The original implementation created default
  // placeholder tokens (named "Token 1", "Token 2") with no creature
  // linkage, which conflicts with the unified flow where everything
  // on the map should be a player character or a creature from the
  // NPC section. v2.354 will add a fresh placement helper that
  // takes a creature_id.

  // v2.220 — "+ Add PC Tokens". Bulk-creates tokens for every player
  // character in the campaign that doesn't already have a token linked
  // (by character_id) in the current scene. Tokens are arranged in a
  // compact row near viewport center, named after the character, and
  // colored from the palette.
  //
  // Skipping already-linked characters makes the button idempotent —
  // clicking again when the party is already on the map does nothing
  // (rather than duplicating everyone).
  //
  // Rationale: DMs running prepared adventures don't want to right-click
  // "add token, rename, rename, rename" 6 times per scene. One click
  // populates the entire party ready to drag into position.
  const addPcTokens = useCallback(() => {
    const vp = vpRef.current;
    if (!vp || !currentScene) return;
    const state = useBattleMapStore.getState();

    // Characters already represented in this scene (by character_id).
    // Filter by sceneId too, since the store may hold tokens from a
    // stale hydration window.
    const existing = new Set(
      Object.values(state.tokens)
        .filter(t => t.sceneId === currentScene.id && t.characterId)
        .map(t => t.characterId as string)
    );

    const toAdd = props.playerCharacters.filter(pc => !existing.has(pc.id));
    if (toAdd.length === 0) {
      showToast('All party characters already have tokens in this scene.', 'info');
      return;
    }

    // Starting point: viewport center snapped. Arrange tokens in a
    // simple row, one cell apart, centered horizontally. For parties
    // bigger than ~5, wraps to a second row.
    const center = vp.center;
    const snapped = snapToCellCenter(center.x, center.y, gridSizePx);
    const perRow = Math.min(5, toAdd.length);
    const rows = Math.ceil(toAdd.length / perRow);
    const startCol = Math.floor(-perRow / 2);
    const startRow = Math.floor(-rows / 2);

    const baseCount = Object.keys(state.tokens).length;
    const newTokens: Token[] = toAdd.map((pc, idx) => {
      const col = idx % perRow;
      const row = Math.floor(idx / perRow);
      const x = snapped.x + (startCol + col) * gridSizePx;
      const y = snapped.y + (startRow + row) * gridSizePx;
      const clampedX = Math.max(gridSizePx / 2, Math.min(WORLD_WIDTH - gridSizePx / 2, x));
      const clampedY = Math.max(gridSizePx / 2, Math.min(WORLD_HEIGHT - gridSizePx / 2, y));
      return {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `token-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        sceneId: currentScene.id,
        x: clampedX,
        y: clampedY,
        size: 'medium',
        rotation: 0,
        name: pc.name,
        color: TOKEN_COLORS[(baseCount + idx) % TOKEN_COLORS.length],
        imageStoragePath: null,
        characterId: pc.id,
        npcId: null,
        // v2.354.0: creatureId added to Token interface; PC tokens
        // never link to a creature row.
        creatureId: null,
        // v2.282: PCs are visible to all from creation. The owning
        // player needs to see their own character; hiding it would
        // be confusing UX. (The other players also see PC tokens —
        // intended behavior, players know who's in the party.)
        visibleToAll: true,
        // v2.412.0 — default LOCKED. PCs are typically immobile until
        // their initiative comes around; the active-turn bypass in
        // pointerdown lets the owning player drag during their own
        // turn while movement remains.
        isLocked: true,
        // v2.413.0 — no granted controller. The owning player drags
        // their own PC token via the characterId match path; player_id
        // is reserved for DM-granted control of non-PC tokens.
        playerId: null,
      };
    });

    // Optimistic local inserts first.
    for (const t of newTokens) state.addToken(t);
    // Then fire-and-forget DB inserts. We do them in sequence — the
    // batch is small (party size) and Supabase doesn't have a
    // first-class batch insert via the JS client; mapping to Promise.all
    // is fine but sequential keeps error logs readable.
    (async () => {
      for (const t of newTokens) {
        try { await tokensApi.createToken(t, { campaignId }); }
        catch (err) { console.error('[BattleMapV2] pc token create failed', t.name, err); }
      }
    })();
  }, [props.playerCharacters, currentScene, gridSizePx, WORLD_WIDTH, WORLD_HEIGHT]);

  // v2.355.0 — Legacy NPC roster bulk-add (v2.242) and roster builder
  // (v2.252) are gone. The "+ Add NPCs" toolbar button now opens
  // CreaturePickerModal which sources from the unified NPC tab
  // (creature_folders + homebrew_monsters), and the "Manage Roster"
  // button is removed entirely — creatures are managed in the NPC
  // tab now. The dropped state vars: rosterBuilderOpen,
  // addRosterTokens, and the inlined RosterSelection import.
  const [npcPickerOpen, setNpcPickerOpen] = useState(false);


  // v2.213 "New Scene" — creates an empty scene with default grid,
  // auto-selects it. DM-only via RLS + UI gating.
  // v2.241 — uses inline modal prompt (replaced window.prompt).
  const createNewScene = useCallback(async () => {
    // v2.518.0 — client-side scene cap check for a friendly message.
    // The DB trigger enforce_scene_limit is the authoritative backstop;
    // this just avoids a raw error and explains the Ultimate upgrade.
    try {
      const { data: campRow } = await supabase
        .from('campaigns')
        .select('scene_limit')
        .eq('id', campaignId)
        .maybeSingle();
      const cap = (campRow?.scene_limit as number | null) ?? 10;
      if (scenes.length >= cap) {
        showToast(
          cap >= 50
            ? `This campaign has reached its ${cap}-scene limit.`
            : `This campaign has reached its ${cap}-scene limit. The Ultimate Campaign upgrade raises new campaigns to 50 scenes.`,
          'error',
        );
        return;
      }
    } catch {
      // If the check fails, fall through — the DB trigger still guards.
    }
    const name = await promptModal({
      title: 'New scene',
      placeholder: 'Scene name',
      defaultValue: `Scene ${scenes.length + 1}`,
      confirmLabel: 'Create',
      allowEmpty: true,
    });
    if (name === null) return; // cancelled
    const scene = await scenesApi.createScene(campaignId, userId, {
      name: name.trim() || `Scene ${scenes.length + 1}`,
    });
    if (!scene) {
      showToast('Failed to create scene. Check console for details.', 'error');
      return;
    }
    setScenes(prev => [...prev, scene]);
    setCurrentScene(scene);
  }, [campaignId, userId, scenes.length, promptModal, showToast]);

  // v2.217 — scene background upload. Separate from portrait uploads:
  // own hidden <input>, own in-flight state, own commit path.
  const mapInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingMap, setUploadingMap] = useState(false);

  // v2.218 — ruler mode toggle. When active, clicking+dragging on the
  // canvas draws a measurement line instead of dragging tokens.
  const [rulerActive, setRulerActive] = useState(false);

  // v2.267.0 — DM-only "Player View" toggle. When on, the DM also
  // sees the fog of war overlay computed from party-shared sight,
  // identical to what players see. Lets the DM verify wall placement
  // without needing a second logged-in client. Default off so the DM
  // sees everything by default; the toggle is a momentary diagnostic.
  // Players never see this control (it's gated by isDM at the
  // toolbar render site).
  const [dmPreviewFog, setDmPreviewFog] = useState(false);

  // v2.223 — wall drawing mode. Mutually exclusive with ruler mode —
  // enabling one disables the other so tool intent is unambiguous.
  const [wallActive, setWallActive] = useState(false);
  // v2.234 — text annotation mode. Three-way mutex with ruler + walls.
  const [textActive, setTextActive] = useState(false);
  // v2.235 — drawing tool mode. Either null (no drawing tool), or one
  // of pencil/line/rect/circle. Mutex with all other tools.
  const [drawActive, setDrawActive] = useState<DrawingKind | null>(null);
  // v2.235 — color + line width for new drawings. Single source for
  // the picker UI; DrawingLayer reads via refs so changes don't
  // re-attach pointer listeners.
  const [drawColor, setDrawColor] = useState('#a78bfa');
  const [drawLineWidth, setDrawLineWidth] = useState(3);
  // v2.236 — FX particle mode. Either null (no FX tool) or one of
  // fire/lightning/sparkles/smoke. Five-way mutex with everything else.
  const [fxActive, setFxActive] = useState<FxKind | null>(null);

  // v2.269.0 — eraser mode. Click on a drawing → delete it. Mutex
  // with every other tool. Held in its own boolean (rather than as a
  // 5th DrawingKind) because:
  //   1. DrawingKind is the persisted shape type — adding an 'eraser'
  //      value would muddle a column that's only ever a real shape.
  //   2. The eraser doesn't paint a preview; its lifecycle is
  //      single-click delete, not drag-to-author. Keeping the state
  //      separate lets DrawingLayer fork the pointer logic cleanly.
  const [eraserActive, setEraserActive] = useState(false);
  // v2.256.0 — particle-density multiplier for FX effects. 1.0 is the
  // legacy v2.236 default; the slider goes 0.25 (subtle) → 2.0 (dense).
  // Persisted in component state only (not localStorage / DB) — the
  // value carries across cast clicks within a session, but resets on
  // refresh. That matches the slider's visual proximity to the FX
  // tools and avoids surprising DMs with a stale density next session.
  const [fxIntensity, setFxIntensity] = useState(1);
  // Imperative trigger handle owned by FxLayer; we set it via ref.
  // Future ships (e.g. enemy attacks) can fire effects through this
  // without going through tool-mode UI.
  const triggerFxRef = useRef<((kind: FxKind, x: number, y: number) => void) | null>(null);
  const toggleRuler = useCallback(() => {
    setRulerActive(a => {
      const next = !a;
      if (next) { setWallActive(false); setTextActive(false); setDrawActive(null); setFxActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  const toggleWallMode = useCallback(() => {
    setWallActive(a => {
      const next = !a;
      if (next) { setRulerActive(false); setTextActive(false); setDrawActive(null); setFxActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  const toggleTextMode = useCallback(() => {
    setTextActive(a => {
      const next = !a;
      if (next) { setRulerActive(false); setWallActive(false); setDrawActive(null); setFxActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  // v2.235 — toggle a specific drawing kind. Clicking the active kind
  // turns it off; clicking a different kind switches to it (still a
  // single-tool active state, just parameterized).
  const toggleDrawMode = useCallback((kind: DrawingKind) => {
    setDrawActive(curr => {
      const next = curr === kind ? null : kind;
      if (next != null) { setRulerActive(false); setWallActive(false); setTextActive(false); setFxActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  // v2.236 — toggle a specific FX kind. Same parameterized pattern.
  const toggleFxMode = useCallback((kind: FxKind) => {
    setFxActive(curr => {
      const next = curr === kind ? null : kind;
      if (next != null) { setRulerActive(false); setWallActive(false); setTextActive(false); setDrawActive(null); setEraserActive(false); }
      return next;
    });
  }, []);
  // v2.269.0 — eraser toggle. Same mutex pattern.
  const toggleEraserMode = useCallback(() => {
    setEraserActive(a => {
      const next = !a;
      if (next) { setRulerActive(false); setWallActive(false); setTextActive(false); setDrawActive(null); setFxActive(null); }
      return next;
    });
  }, []);

  // v2.356.0 — Clear all drawings on the current scene. One-shot
  // bulk wipe for when the DM has scribbled all over the map and
  // wants a clean slate. Walls, texts, and tokens are NOT touched —
  // only freehand pencil, lines, rects, and circles. Confirms before
  // committing because there's no undo for bulk delete in v2.356.
  const clearAllDrawings = useCallback(async () => {
    if (!currentScene) return;
    // Count locally first so the confirm message is informative.
    const localCount = Object.values(useBattleMapStore.getState().drawings)
      .filter(d => d.sceneId === currentScene.id).length;
    if (localCount === 0) {
      showToast('No drawings to clear on this scene.', 'info');
      return;
    }
    // v2.486.0 — In-app confirm via existing useModal hook (declared
    // at top of BattleMapV2). Replaces window.confirm().
    const ok = await confirmModal({
      title: `Delete all ${localCount} drawing${localCount === 1 ? '' : 's'} on this scene?`,
      message: 'Walls, text, and tokens are not affected.',
      confirmLabel: 'Delete Drawings',
      danger: true,
    });
    if (!ok) return;
    // Optimistically remove from store so the canvas clears immediately.
    const store = useBattleMapStore.getState();
    const ids = Object.values(store.drawings)
      .filter(d => d.sceneId === currentScene.id)
      .map(d => d.id);
    for (const id of ids) store.removeDrawing(id);
    // Server commit. Returns count or -1 on failure.
    const deleted = await drawingsApi.clearSceneDrawings(currentScene.id);
    if (deleted < 0) {
      showToast('Failed to clear drawings on the server. Refreshing may restore them.', 'error');
      return;
    }
    showToast(`Cleared ${deleted} drawing${deleted === 1 ? '' : 's'}.`, 'success');
  }, [currentScene, showToast, confirmModal]);

  // v2.358.0 — Clear all walls. Companion to clearAllDrawings.
  // User feedback: "The walls that are being drawn and then being
  // erased are still there in affecting the tokens." This happens
  // when per-wall eraser deletes hit RLS errors or network issues —
  // the local store updates optimistically but the DB row stays, so
  // the server-side wall-collision trigger keeps blocking movement.
  // Bulk delete from the DB side guarantees the trigger has nothing
  // to block against.
  const clearAllWalls = useCallback(async () => {
    if (!currentScene) return;
    // Count locally for the confirm message. We may be missing some
    // server-side rows (the bug we're fixing), so the confirm count is
    // a lower bound — we'll report the actual server-side delete count
    // after the fact.
    const localCount = Object.values(useBattleMapStore.getState().walls)
      .filter(w => w.sceneId === currentScene.id).length;
    // v2.486.0 — In-app confirm. The two-mode title/message reflects
    // the v2.358 fix: when the local count is 0 we suspect server-
    // side stale rows.
    const ok = await confirmModal(
      localCount === 0
        ? {
            title: 'Clear walls anyway?',
            message: 'Local view shows no walls, but the server may have stale ones blocking movement.',
            confirmLabel: 'Clear Walls',
            danger: true,
          }
        : {
            title: `Delete all ${localCount} wall${localCount === 1 ? '' : 's'} on this scene?`,
            message: 'Drawings, text, and tokens are not affected.',
            confirmLabel: 'Delete Walls',
            danger: true,
          }
    );
    if (!ok) return;
    // Optimistic local clear so the canvas updates immediately.
    const store = useBattleMapStore.getState();
    const ids = Object.values(store.walls)
      .filter(w => w.sceneId === currentScene.id)
      .map(w => w.id);
    for (const id of ids) store.removeWall(id);
    // Server commit. The bulk delete also catches any stale rows the
    // local store didn't know about (the v2.358 fix's whole point).
    const deleted = await wallsApi.clearSceneWalls(currentScene.id);
    if (deleted < 0) {
      showToast('Failed to clear walls on the server. Movement may still be blocked.', 'error');
      return;
    }
    showToast(`Cleared ${deleted} wall${deleted === 1 ? '' : 's'}.`, 'success');
  }, [currentScene, showToast, confirmModal]);

  // v2.219 — scene settings modal open state.
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Callback invoked by the modal when Save succeeds. Applies the
  // patch optimistically to both local state arrays; the Realtime
  // UPDATE echo will confirm shortly after.
  const applyScenePatch = useCallback((patch: Partial<scenesApi.Scene>) => {
    setScenes(prev => prev.map(s => s.id === currentScene?.id ? { ...s, ...patch } : s));
    setCurrentScene(prev => prev ? { ...prev, ...patch } : prev);
  }, [currentScene?.id]);

  // Callback invoked by the modal after Delete succeeds. Clears
  // currentScene (empty-state screen handles recovery) and removes
  // from list. Realtime DELETE echo will also run but is idempotent.
  const handleSceneDeleted = useCallback((id: string) => {
    setScenes(prev => prev.filter(s => s.id !== id));
    setCurrentScene(prev => prev && prev.id === id ? null : prev);
  }, []);

  // v2.221 — derive characterId → HP lookup for the HP-bar overlay
  // on PC tokens. Memoized on playerCharacters identity so we don't
  // rebuild every BattleMapV2 render. The map is recreated whenever
  // playerCharacters changes (which happens whenever a character's
  // HP updates, since CampaignDashboard owns the characters state).
  const characterHpMap = useMemo(() => {
    const map = new Map<string, { current: number; max: number }>();
    for (const c of props.playerCharacters) {
      map.set(c.id, { current: c.current_hp, max: c.max_hp });
    }
    return map;
  }, [props.playerCharacters]);

  // v2.244 — npcId → HP lookup, mirror of characterHpMap. CampaignDashboard
  // pre-filters out NPCs without numeric HP, so every entry in props.npcs
  // is a valid bar candidate. Recreated whenever Realtime echoes a
  // damage/heal write, same as characters.
  const npcHpMap = useMemo(() => {
    const map = new Map<string, { current: number; max: number }>();
    for (const n of props.npcs ?? []) {
      map.set(n.id, { current: n.current_hp, max: n.max_hp });
    }
    return map;
  }, [props.npcs]);

  // v2.428.0 — Authoritative token state map derived from CombatContext
  // participants (which read through the combat_participants → combatants
  // JOIN with v2.426 fallbacks for broken FKs). This is the SAME data
  // path the InitiativeStrip and MonsterActionPanel use, so the token
  // bar can't disagree with them.
  //
  // Why a NEW map instead of reusing tokenStateMap from props? The
  // upstream tokenStateMap is built in CampaignDashboard from a flat
  // `combatants` SELECT keyed by combatants.id. When the v2.389 sync
  // trigger doesn't fire (or there are duplicate combatants for one
  // token from earlier sync misses), tokenStateMap.get(token.id) lands
  // on a stale combatant row that nobody is damaging — token bar
  // never updates.
  //
  // Keying by definition (entity_id from combat_participants) gives us
  // the canonical combatant per active participant. participants is
  // small (N actors per encounter) so this map rebuild is trivial.
  // Keys: `${participant_type}:${entity_id}` matching the tokenStateMapByDef
  // shape from v2.427.
  const { currentActor, encounter, participants } = useCombat();
  const liveTokenStateByDef = useMemo(() => {
    const map = new Map<string, {
      current_hp: number | null;
      max_hp: number | null;
      conditions: string[];
      is_dead: boolean;
    }>();
    for (const p of (participants ?? []) as any[]) {
      if (!p?.entity_id || !p?.participant_type) continue;
      const key = `${p.participant_type}:${p.entity_id}`;
      // First wins per definition; subsequent participants for the
      // same entity (shouldn't happen in normal play) are ignored.
      if (map.has(key)) continue;
      map.set(key, {
        current_hp: p.current_hp ?? null,
        max_hp: p.max_hp ?? null,
        conditions: p.active_conditions ?? [],
        is_dead: !!p.is_dead,
      });
    }
    return map;
  }, [participants]);

  // v2.244 — token.id → conditions[]. Walks the live token store and
  // resolves each token to its linked PC (active_conditions) or NPC
  // (conditions). Keyed by token.id rather than character/npc id so
  // the canvas renderer doesn't have to branch on token kind. The
  // renderer's useEffect already depends on `tokens`, so churn here
  // tracks the same trigger.
  const liveTokens = useBattleMapStore(s => s.tokens);
  const tokenConditionsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const pcConds = new Map<string, string[]>();
    for (const c of props.playerCharacters) pcConds.set(c.id, c.active_conditions ?? []);
    const npcConds = new Map<string, string[]>();
    for (const n of props.npcs ?? []) npcConds.set(n.id, n.conditions ?? []);
    for (const t of Object.values(liveTokens)) {
      // v2.393.0 — prefer per-token combatant conditions when present.
      // Falls through to PC active_conditions for character tokens
      // (those are the canonical store for PCs and stay in sync via
      // the existing characters realtime channel) and template
      // npcConds for legacy creatures without a combatant yet.
      // v2.427.0 — Same definition-keyed fallback as the HP bar:
      // when token.id != combatant.id, try the secondary index
      // keyed by `${definition_type}:${definition_id}` before falling
      // through to template conds.
      // v2.428.0 — Use liveTokenStateByDef (built from CombatContext
      // participants) instead of the upstream tokenStateMapByDef from
      // props. Same fix path as the HP bar — see comment near
      // liveTokenStateByDef declaration above.
      let tokenCombatantConds = props.tokenStateMap?.get(t.id)?.conditions ?? null;
      if (!tokenCombatantConds && liveTokenStateByDef) {
        if (t.characterId) {
          tokenCombatantConds = liveTokenStateByDef.get(`character:${t.characterId}`)?.conditions ?? null;
        }
        if (!tokenCombatantConds && t.npcId) {
          tokenCombatantConds = liveTokenStateByDef.get(`npc:${t.npcId}`)?.conditions
            ?? liveTokenStateByDef.get(`monster:${t.npcId}`)?.conditions
            ?? null;
        }
      }
      const conds = tokenCombatantConds
        || (t.characterId && pcConds.get(t.characterId))
        || (t.npcId && npcConds.get(t.npcId))
        || null;
      if (conds && conds.length > 0) map.set(t.id, conds);
    }
    return map;
  }, [liveTokens, props.playerCharacters, props.npcs, props.tokenStateMap, liveTokenStateByDef]);

  // v2.339.0 — BG3 turn UX. Derive on-map signals for active-turn
  // outline + movement-remaining badge from the combat context.
  //
  // Three derived values:
  //   • activeTokenId — the token belonging to the participant whose
  //     turn it is. Resolved by matching currentActor.entity_id +
  //     participant_type against tokens' characterId / npcId. May be
  //     null if combat isn't running OR if the active actor isn't
  //     placed on this scene's map.
  //   • used — feet of movement spent so far this turn.
  //   • max — effective max for THIS turn (base speed, doubled when
  //     Dash has been consumed; zeroed when the active actor is
  //     unconscious / paralyzed / petrified / stunned). Mirrors the
  //     cheap version of the lib/movement.ts speed gate so the badge
  //     stays honest with what the actor is allowed to spend.
  //
  // TokensLayer reads these via props and stamps a gold pulse + a
  // "Xft / Yft" Text node above the matching token. Cheap to
  // recompute — the heavy lift is upstream in useCombat.
  // (currentActor / encounter / participants destructure moved
  // above the conditions useMemo in v2.428.0 so liveTokenStateByDef
  // can feed both surfaces.)
  const activeTokenInfo = useMemo<{
    tokenId: string | null;
    used: number;
    max: number;
    dashed: boolean;
    participantId: string | null;
    participantName: string | null;
    participantType: 'character' | 'npc' | 'monster' | null;
    encounterId: string | null;
    campaignId: string | null;
    actionUsed: boolean;
    bonusUsed: boolean;
    reactionUsed: boolean;
    participantEntityId: string | null;
  }>(() => {
    const empty = {
      tokenId: null, used: 0, max: 0, dashed: false,
      participantId: null, participantName: null, participantType: null,
      encounterId: null, campaignId: null,
      actionUsed: false, bonusUsed: false, reactionUsed: false,
      participantEntityId: null,
    };
    if (!currentActor) return empty;
    let tokenId: string | null = null;
    for (const t of Object.values(liveTokens)) {
      if (currentActor.participant_type === 'character' && t.characterId === currentActor.entity_id) {
        tokenId = t.id; break;
      }
      if (isCreatureParticipantType(currentActor.participant_type) && t.npcId === currentActor.entity_id) {
        tokenId = t.id; break;
      }
    }
    let baseMax = currentActor.max_speed_ft ?? 30;
    // v2.631.0 — Weapon Mastery Slow preview: −10 ft while the
    // mastery_slowed buff rides on this actor (canMove enforces
    // server-side; this keeps the range ring honest).
    if (((currentActor.active_buffs ?? []) as { key?: string }[]).some(b => b?.key === 'mastery_slowed')) {
      baseMax = Math.max(0, baseMax - 10);
    }
    const dashed = currentActor.dash_used_this_turn === true;
    const conds = currentActor.active_conditions ?? [];
    const speedZeroed =
      conds.includes('Unconscious') ||
      conds.includes('Petrified') ||
      conds.includes('Paralyzed') ||
      conds.includes('Stunned');
    const max = speedZeroed ? 0 : (dashed ? baseMax * 2 : baseMax);
    return {
      tokenId,
      used: currentActor.movement_used_ft ?? 0,
      max,
      dashed,
      participantId: currentActor.id,
      participantName: currentActor.name,
      participantType: currentActor.participant_type as 'character' | 'npc' | 'monster',
      encounterId: encounter?.id ?? null,
      campaignId: props.campaignId,
      actionUsed: currentActor.action_used === true,
      bonusUsed: currentActor.bonus_used === true,
      reactionUsed: currentActor.reaction_used === true,
      participantEntityId: (currentActor as any).entity_id ?? null,
    };
  }, [currentActor, liveTokens, encounter, props.campaignId]);

  // v2.423.0 — Reset pending-move counter when:
  //   (a) the active actor changes (turn ended or someone else's
  //       turn now), OR
  //   (b) the server-side `movement_used_ft` echo catches up to or
  //       past our predicted value (the realtime echo arrived).
  // Either condition means the local prediction is no longer needed.
  useEffect(() => {
    const pm = pendingMoveRef.current;
    if (!currentActor) {
      if (pm.predictedUsed !== 0) {
        pendingMoveRef.current = { participantId: null, predictedUsed: 0 };
      }
      return;
    }
    if (pm.participantId && pm.participantId !== currentActor.id) {
      pendingMoveRef.current = { participantId: null, predictedUsed: 0 };
      return;
    }
    const serverUsed = currentActor.movement_used_ft ?? 0;
    if (pm.participantId === currentActor.id && serverUsed >= pm.predictedUsed) {
      // Echo caught up — clear prediction.
      pendingMoveRef.current = { participantId: null, predictedUsed: 0 };
    }
  }, [currentActor?.id, currentActor?.movement_used_ft]);

  // v2.346.0 — Click-to-move (BG3 alt input).
  //
  // Drag-to-move (v2.340) is one BG3-style input; click-to-move is
  // the other. Click any empty cell on the map and your active
  // token snaps there, subject to the same movement enforcement +
  // wall checks + logMovement that the drag uses.
  //
  // Activation gates (all must be true):
  //   • Active combat with a current actor
  //   • The active actor's token is on this scene
  //   • The user owns the active actor (their character's token, or
  //     for DMs, any NPC/monster they're running)
  //   • No conflicting tool mode is on (ruler/wall/text/draw/fx/
  //     eraser/directionPick — those modes own canvas clicks)
  //   • The click landed on an EMPTY cell (no token there)
  //   • The click landed on the same scene's grid (within world bounds)
  //
  // The sequence reuses the drag-drop logic verbatim: validate via
  // canMove, snap-back on overspend or wall-block, otherwise commit
  // position and call logMovement to update movement_used_ft +
  // trigger opportunity-attack offers.
  //
  // Tokens already use stopPropagation in their PIXI pointerdown,
  // but PIXI events and DOM events are separate event systems —
  // so a DOM click on the canvas reaches us regardless. We
  // distinguish empty-cell clicks from token clicks by checking
  // if the click cell is occupied; if it is, we abort and let the
  // token's own click handler (open quick panel etc.) do its thing.
  const activeTokenInfoForMoveRef = useRef(activeTokenInfo);
  useEffect(() => { activeTokenInfoForMoveRef.current = activeTokenInfo; }, [activeTokenInfo]);
  // v2.347.0 — generation counter for the in-flight click-to-move
  // animation. Bumped at the start of each move; the rAF loop checks
  // this on every frame and bails if a newer move started. Prevents
  // overlapping animations from fighting over the token's position.
  const clickMoveGenRef = useRef(0);
  // Mirror tool-mode flags into a ref so the click handler reads the
  // current value without re-attaching every time a mode toggles.
  const modeFlagsRef = useRef({
    ruler: rulerActive, wall: wallActive, text: textActive,
    draw: drawActive != null, fx: fxActive != null, eraser: eraserActive,
  });
  useEffect(() => {
    modeFlagsRef.current = {
      ruler: rulerActive, wall: wallActive, text: textActive,
      draw: drawActive != null, fx: fxActive != null, eraser: eraserActive,
    };
  }, [rulerActive, wallActive, textActive, drawActive, fxActive, eraserActive]);

  useEffect(() => {
    if (!canvasEl) return;
    function onClick(e: MouseEvent) {
      // v2.441.0 — Suppress the synthetic 'click' the browser fires on
      // the same tick as a drag's pointerup. Without this, every drag
      // ends with a follow-up click-to-move animation that re-snaps the
      // token to the cursor's release cell — typically SE of the
      // intended drop target. 100ms covers the same-tick case (~0ms
      // between pointerup and click) plus jitter.
      if (performance.now() - lastDragEndedAtRef.current < 100) return;
      const ati = activeTokenInfoForMoveRef.current;
      if (!ati || !ati.tokenId || !ati.participantId) return;
      // Block if any tool mode is on — they own canvas clicks.
      const mf = modeFlagsRef.current;
      if (mf.ruler || mf.wall || mf.text || mf.draw || mf.fx || mf.eraser) return;
      // Block if direction-pick is active (handled by its own listener
      // already, but we're cautious).
      if (useBattleMapStore.getState().directionPick.active) return;
      // Ownership: PC tokens move only when the user owns them.
      // DMs can move any NPC/monster token they control. The
      // myCharacterId prop carries the user's currently-selected PC;
      // isDM is the role flag.
      const isMyCharacter =
        ati.participantType === 'character' &&
        props.myCharacterId &&
        liveTokens[ati.tokenId]?.characterId === props.myCharacterId;
      const isDmRunning =
        props.isDM &&
        isCreatureParticipantType(ati.participantType);
      if (!isMyCharacter && !isDmRunning) return;

      const vp = vpRef.current;
      if (!canvasEl || !vp) return;
      const rect = canvasEl.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPoint = vp.toWorld(screenX, screenY);

      // Block clicks outside the world bounds (clicks on the grey
      // padding around the map shouldn't trigger movement).
      if (worldPoint.x < 0 || worldPoint.x > WORLD_WIDTH) return;
      if (worldPoint.y < 0 || worldPoint.y > WORLD_HEIGHT) return;

      // v2.440.0 — Size-aware snap. Pre-v2.440 always called
      // snapToCellCenter, which is correct only for odd-size tokens
      // (Medium, Huge). For even-size tokens (Large 2×2, Gargantuan
      // 4×4), the renderer expects an anchor at a grid INTERSECTION,
      // not a cell center. Click-to-moving an even-size token via
      // cell-center snap produced positions like (875, 315) — half-
      // cell offsets that the renderer treated as broken. User report
      // after v2.439 testing: "the preview move and the token are
      // not linked up anymore" — that was the AW dragon stuck at a
      // cell-center position from a prior click-to-move.
      //
      // Fix: route through snapTokenAnchor with the active token's
      // size so even-size tokens snap to intersections (footprint
      // centered on the clicked cell area).
      const myTokenForSnap = liveTokens[ati.tokenId];
      const tokenSize = myTokenForSnap?.size ?? 'medium';
      const snapped = snapTokenAnchor(worldPoint.x, worldPoint.y, tokenSize, gridSizePx);
      // Footprint-aware clamping (same rules as drag commit) so
      // click-to-move can't push even-size tokens off the map.
      const footCellsCtm = (() => {
        switch (tokenSize) {
          case 'tiny': case 'small': case 'medium': return 1;
          case 'large': return 2;
          case 'huge': return 3;
          case 'gargantuan': return 4;
          default: return 1;
        }
      })();
      const evenCtm = footCellsCtm % 2 === 0;
      const footPxCtm = footCellsCtm * gridSizePx;
      const halfCtm = footPxCtm / 2;
      const minXCtm = evenCtm ? 0 : halfCtm;
      const maxXCtm = evenCtm ? WORLD_WIDTH - footPxCtm : WORLD_WIDTH - halfCtm;
      const minYCtm = evenCtm ? 0 : halfCtm;
      const maxYCtm = evenCtm ? WORLD_HEIGHT - footPxCtm : WORLD_HEIGHT - halfCtm;
      const targetX = Math.max(minXCtm, Math.min(maxXCtm, snapped.x));
      const targetY = Math.max(minYCtm, Math.min(maxYCtm, snapped.y));

      // Block if the target cell is occupied by another token (would
      // collide with a creature). Cell-radius check: any token whose
      // snapped position equals our target cell.
      // v2.357.0 — Math.floor (not Math.round); see drawPreview.
      const targetCellRow = Math.floor(targetY / gridSizePx);
      const targetCellCol = Math.floor(targetX / gridSizePx);
      for (const t of Object.values(liveTokens)) {
        if (t.id === ati.tokenId) continue; // skip self
        const tCellRow = Math.floor(t.y / gridSizePx);
        const tCellCol = Math.floor(t.x / gridSizePx);
        if (tCellRow === targetCellRow && tCellCol === targetCellCol) {
          return; // occupied — abort, let token's own click handler win
        }
      }

      // Origin (current token position).
      const myToken = liveTokens[ati.tokenId];
      if (!myToken) return;
      const originX = myToken.x;
      const originY = myToken.y;
      // No-op if the click is on our own current cell.
      if (Math.abs(originX - targetX) < 1 && Math.abs(originY - targetY) < 1) return;

      // v2.348.0 — A* pathfinding (was straight-line wall check).
      // Routes around walls + occupied cells. If no path exists,
      // surface a clean message. The path's cell count drives the
      // movement-budget check (multi-cell paths around walls cost
      // more feet than the straight line would have, and that's
      // RAW-correct).
      // v2.357.0 — Math.floor (not Math.round); see drawPreview.
      const fromCellRow = Math.floor(originY / gridSizePx);
      const fromCellCol = Math.floor(originX / gridSizePx);
      const walls = Object.values(useBattleMapStore.getState().walls);
      const path = findPath(
        { row: fromCellRow, col: fromCellCol },
        { row: targetCellRow, col: targetCellCol },
        {
          widthCells,
          heightCells,
          gridSizePx,
          walls,
          occupants: Object.values(liveTokens),
          moverTokenId: ati.tokenId,
          // Cap A*'s search at the actor's full effective movement
          // (Dash-doubled). Past that, no point searching — the move
          // would fail the canMove gate anyway.
          maxCells: Math.max(1, Math.floor(ati.max / 5)),
        },
      );
      if (!path) {
        showToast("Can't reach there.", 'warn');
        return;
      }
      // Path includes both endpoints. Distance = (cells-1) * 5ft.
      const distanceFt = (path.length - 1) * 5;

      // v2.447.0 — Optimistic budget pre-check using getEffectiveUsed.
      // Mirrors the drag-drop pre-check (line ~5321). Pre-v2.447 click-
      // to-move only consulted canMove (server-authoritative), which
      // doesn't account for in-flight drags whose logMovement hasn't
      // landed yet. A fast "drag 30ft, then click-to-move 30ft" combo
      // could pass canMove (server still shows 0 used) and over-spend.
      // This local pre-check reads the predicted-post-pending-moves
      // remaining and rejects before any work fires.
      const effectiveUsed = getEffectiveUsed(ati.participantId, ati.used);
      const remaining = Math.max(0, ati.max - effectiveUsed);
      if (distanceFt > remaining) {
        showToast(
          `Not enough movement (need ${distanceFt}ft, have ${remaining}ft).`,
          'warn',
        );
        return;
      }

      (async () => {
        // Authoritative server check as a backstop. The local pre-
        // check above passed, so this only fires when the local cache
        // was stale (rare). Failure path is the same as the local
        // rejection — toast and bail.
        const check = await canMove(ati.participantId!, distanceFt);
        if (!check.allowed) {
          showToast(
            `Not enough movement (need ${distanceFt}ft, have ${check.remaining}ft).`,
            'warn',
          );
          return;
        }
        // v2.347.0 — Smooth-slide animation (BG3 feel).
        // v2.348.0 — Now walks along the multi-cell path returned by
        // A* instead of one straight-line segment, so the token
        // visibly bends around walls and obstacles.
        //
        // Pre-v2.347 the click-to-move snapped instantly. Now we
        // slide the token along the returned path at ~120 ft/s
        // (250ms per 30ft step). Visual only — server commit + log
        // fire upfront so peers see the move immediately and the
        // movement_used_ft + OA triggers don't lag the animation.
        //
        // Cancellation: a generation counter gates each frame. If
        // another click-to-move starts (or any code calls
        // updateTokenPosition for this token), the token's stored
        // position will diverge from our animated frame's target,
        // so we abort. Belt-and-suspenders against double-clicks
        // and rapid re-aiming.
        //
        // Min duration 60ms (a 5ft step) so even a single-cell
        // step shows visible motion and reads as "deliberate" rather
        // than "snap." Max ~500ms cap so a Dash-doubled 60ft move
        // doesn't drag too long. Cap is total path duration (not per-
        // segment) so a path that bends around walls still finishes
        // in a single human-readable beat.
        const SPEED_PX_PER_MS = (120 * gridSizePx / 5) / 1000; // 120 ft/s in px/ms
        // Convert path cells to world-pixel waypoints. Path[0] is the
        // current cell; we start the slide from path[1].
        // v2.440.0 — Size-aware waypoint conversion. For odd-size
        // tokens (Medium/Huge), the token anchor is the cell center
        // → (col + 0.5) * cellSize. For even-size tokens (Large/
        // Gargantuan), the anchor is the top-left intersection of
        // the footprint at the path cell — which means anchor =
        // (col, row) * cellSize.
        const waypoints = path.map(c => {
          if (evenCtm) {
            // Even-size: anchor at intersection. The path cell
            // (col, row) represents the cell at the footprint's
            // top-left; anchor is the intersection at (col, row).
            return { x: c.col * gridSizePx, y: c.row * gridSizePx };
          }
          // Odd-size: anchor at cell center.
          return { x: (c.col + 0.5) * gridSizePx, y: (c.row + 0.5) * gridSizePx };
        });
        // Total path length in pixels — used for total-duration calc.
        let totalDistPx = 0;
        for (let i = 1; i < waypoints.length; i++) {
          const ddx = waypoints[i].x - waypoints[i - 1].x;
          const ddy = waypoints[i].y - waypoints[i - 1].y;
          totalDistPx += Math.sqrt(ddx * ddx + ddy * ddy);
        }
        const durationMs = Math.max(60, Math.min(500, totalDistPx / SPEED_PX_PER_MS));

        // Fire server commit immediately (peers see the destination).
        // Animation is local-only.
        const commitPromise = tokensApi.updateTokenPos(ati.tokenId!, targetX, targetY, { campaignId });

        // Local rAF animation along the path. Per-frame: compute
        // total elapsed-time-along-path in pixels, then walk the
        // waypoints to find which segment we're in and lerp inside it.
        const startMs = performance.now();
        const tokenId = ati.tokenId!;
        const animateGen = ++clickMoveGenRef.current;
        await new Promise<void>(resolve => {
          function step() {
            if (animateGen !== clickMoveGenRef.current) {
              resolve();
              return;
            }
            const elapsed = performance.now() - startMs;
            const t = Math.min(1, elapsed / durationMs);
            // Distance traveled so far along the path, in pixels.
            const distSoFar = totalDistPx * t;
            let remaining = distSoFar;
            let x = waypoints[0].x;
            let y = waypoints[0].y;
            for (let i = 1; i < waypoints.length; i++) {
              const a = waypoints[i - 1];
              const b = waypoints[i];
              const segDx = b.x - a.x;
              const segDy = b.y - a.y;
              const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
              if (remaining <= segLen || i === waypoints.length - 1) {
                const frac = segLen > 0 ? Math.min(1, remaining / segLen) : 1;
                x = a.x + segDx * frac;
                y = a.y + segDy * frac;
                break;
              }
              remaining -= segLen;
            }
            useBattleMapStore.getState().updateTokenPosition(tokenId, x, y);
            if (t < 1) {
              requestAnimationFrame(step);
            } else {
              resolve();
            }
          }
          requestAnimationFrame(step);
        });

        const result = await commitPromise;
        if (!result.ok) {
          // Roll back on server reject (wall trigger, RLS, etc.).
          useBattleMapStore.getState().updateTokenPosition(ati.tokenId!, originX, originY);
          if (result.reason === 'wall_blocked') {
            showToast('A wall blocks that path.', 'warn');
          } else {
            console.error('[BattleMapV2] click-to-move commit failed', result);
          }
          return;
        }
        if (distanceFt > 0) {
          // v2.447.0 — Bump the optimistic budget BEFORE awaiting
          // logMovement, mirroring the drag-drop pattern (v2.437).
          // This closes the race window where a fast follow-up move
          // could read a stale used value and pass its pre-check.
          recordMoved(ati.participantId!, distanceFt, ati.used);
          try {
            await logMovement({
              campaignId: ati.campaignId!,
              encounterId: ati.encounterId,
              participantId: ati.participantId!,
              participantName: ati.participantName!,
              participantType: ati.participantType!,
              fromRow: fromCellRow,
              fromCol: fromCellCol,
              toRow: targetCellRow,
              toCol: targetCellCol,
              distanceFt,
            });
          } catch (err) {
            console.error('[BattleMapV2] click-to-move logMovement threw', err);
          }
        }
      })().catch(err => console.error('[BattleMapV2] click-to-move threw', err));
    }
    canvasEl.addEventListener('click', onClick);
    return () => {
      canvasEl?.removeEventListener('click', onClick);
    };
  }, [canvasEl, liveTokens, gridSizePx, WORLD_WIDTH, WORLD_HEIGHT, props.myCharacterId, props.isDM, showToast]);

  // v2.349.0 — Animated hover path preview for click-to-move.
  //
  // BG3 shows a translucent ghost line from your active token to
  // wherever the cursor is hovering, with the same color-coded
  // cost-vs-budget logic as the drag preview. Click confirms; hover
  // updates live. This is the most polished version of click-to-move
  // feedback — the player sees exactly where they'll end up and what
  // it'll cost BEFORE clicking.
  //
  // Differences from the drag preview (v2.340):
  //   • Activated by hover, not by drag. Hidden when no active turn,
  //     no ownership, mode active, or cursor not over the canvas.
  //   • Uses A* (v2.348) so the preview shows the actual route, not
  //     a straight line. Bends around walls in real time.
  //   • Owned by the parent (this scope), separate from the drag
  //     preview which TokensLayer owns. Both Graphics live on the
  //     viewport but never simultaneously visible (drag is exclusive
  //     while the mouse is held).
  //
  // Throttling: rAF-gated rather than fixed-interval. A fast mouse
  // can fire pointermove 200+ Hz; we only redraw once per animation
  // frame which caps work at ~60 Hz. A* runs in <1ms on typical
  // scenes so the cost is negligible — but redraws aren't, and the
  // visible result is the same.
  const hoverPreviewRefs = useRef<{
    gfx: Graphics | null;
    label: Text | null;
    rafPending: boolean;
    lastClientX: number;
    lastClientY: number;
  }>({
    gfx: null, label: null, rafPending: false,
    lastClientX: 0, lastClientY: 0,
  });
  useEffect(() => {
    if (!canvasEl) return;
    const vp = vpRef.current;
    if (!vp) return;

    // Lazy-mount the preview Graphics + label once. They live in the
    // viewport so they pan/zoom with the world. Both are eventMode:
    // 'none' so they never capture pointer events.
    const gfx = new Graphics();
    gfx.eventMode = 'none';
    gfx.visible = false;
    vp.addChild(gfx);
    const label = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontWeight: '800',
        fontSize: 13,
        fill: 0xfde68a,
        stroke: { color: 0x0a0c10, width: 3 },
        align: 'center',
      }),
    });
    label.anchor.set(0.5, 1);
    label.eventMode = 'none';
    label.visible = false;
    vp.addChild(label);
    hoverPreviewRefs.current.gfx = gfx;
    hoverPreviewRefs.current.label = label;

    function clearPreview() {
      const refs = hoverPreviewRefs.current;
      if (refs.gfx) { refs.gfx.clear(); refs.gfx.visible = false; }
      if (refs.label) refs.label.visible = false;
    }

    function redraw(_clientX: number, _clientY: number) {
      const refs = hoverPreviewRefs.current;
      const gfxLocal = refs.gfx;
      const labelLocal = refs.label;
      if (!gfxLocal || !labelLocal) return;

      // v2.359.0 — Hover-path preview disabled by default. User
      // feedback: the path showing on every mouse move during a
      // turn read as visual noise / "where the character can move
      // by default." The drag-preview path (TokenLayer, fires only
      // during an actual drag) still shows the route + cost while
      // a token is picked up — which is what the user wanted. Click-
      // to-move continues to work via its own handler; users just
      // don't see the planned route until they click.
      clearPreview();
      return;

    }

    function onMove(e: PointerEvent) {
      const refs = hoverPreviewRefs.current;
      refs.lastClientX = e.clientX;
      refs.lastClientY = e.clientY;
      // rAF coalesce: a fast mouse fires pointermove 200+Hz but we
      // only need to redraw once per animation frame. The pending
      // flag ensures we coalesce all moves between two rAF callbacks
      // into a single redraw at the latest cursor position.
      if (refs.rafPending) return;
      refs.rafPending = true;
      requestAnimationFrame(() => {
        refs.rafPending = false;
        redraw(refs.lastClientX, refs.lastClientY);
      });
    }
    function onLeave() { clearPreview(); }
    function onDown() {
      // While drag is starting, the drag preview takes over. Clear
      // ours immediately so the two don't double-render. Drag
      // preview is shown by TokensLayer; we just yield.
      clearPreview();
    }

    canvasEl.addEventListener('pointermove', onMove);
    canvasEl.addEventListener('pointerleave', onLeave);
    canvasEl.addEventListener('pointerdown', onDown);
    return () => {
      if (canvasEl) {
        canvasEl.removeEventListener('pointermove', onMove);
        canvasEl.removeEventListener('pointerleave', onLeave);
        canvasEl.removeEventListener('pointerdown', onDown);
      }
      try {
        if (gfx.parent) gfx.parent.removeChild(gfx);
        if (!gfx.destroyed) gfx.destroy();
        if (label.parent) label.parent.removeChild(label);
        if (!label.destroyed) label.destroy();
      } catch { /* viewport torn down */ }
      hoverPreviewRefs.current.gfx = null;
      hoverPreviewRefs.current.label = null;
    };
  }, [canvasEl, vpRef.current, liveTokens, gridSizePx, widthCells, heightCells, WORLD_WIDTH, WORLD_HEIGHT, props.myCharacterId, props.isDM]);

  // v2.224 — character IDs whose linked tokens should contribute
  // vision polygons. For party-shared sight, every PC in the campaign
  // counts. v2.225 will narrow this to the current user's own
  // characters for proper per-player anti-cheat fog.
  const visionOriginCharacterIds = useMemo(
    () => props.playerCharacters.map(c => c.id),
    [props.playerCharacters],
  );

  const handleRequestMapUpload = useCallback(() => {
    if (!currentScene) return;
    mapInputRef.current?.click();
  }, [currentScene]);

  const handleMapFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-picking the same file re-fires
    if (!file || !currentScene) return;

    if (!assetsApi.ACCEPTED_PORTRAIT_MIME.includes(file.type)) {
      showToast(`Unsupported file type: ${file.type}. Use PNG, JPEG, WebP, or GIF.`, 'warn');
      return;
    }
    if (file.size > assetsApi.MAX_PORTRAIT_BYTES) {
      showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`, 'warn');
      return;
    }

    setUploadingMap(true);
    try {
      const path = await assetsApi.uploadSceneBackground(file, userId, currentScene.id);
      if (!path) {
        showToast('Map upload failed. Check the browser console for details.', 'error');
        return;
      }
      // Optimistic local update — update both the scenes list + currentScene.
      setScenes(prev => prev.map(s => s.id === currentScene.id
        ? { ...s, backgroundStoragePath: path }
        : s));
      setCurrentScene(prev => prev && prev.id === currentScene.id
        ? { ...prev, backgroundStoragePath: path }
        : prev);
      scenesApi.updateScene(currentScene.id, { backgroundStoragePath: path }).catch(err =>
        console.error('[BattleMapV2] scene bg commit failed', err)
      );
    } finally {
      setUploadingMap(false);
    }
  }, [userId, currentScene]);

  const handleRemoveMap = useCallback(async () => {
    if (!currentScene?.backgroundStoragePath) return;
    // v2.241 — was window.confirm.
    const ok = await confirmModal({
      title: 'Remove map image?',
      message: 'The grid will render on a plain background. You can re-upload the image later.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setScenes(prev => prev.map(s => s.id === currentScene.id
      ? { ...s, backgroundStoragePath: null }
      : s));
    setCurrentScene(prev => prev && prev.id === currentScene.id
      ? { ...prev, backgroundStoragePath: null }
      : prev);
    scenesApi.updateScene(currentScene.id, { backgroundStoragePath: null }).catch(err =>
      console.error('[BattleMapV2] scene bg remove commit failed', err)
    );
  }, [currentScene, confirmModal]);

  // v2.274.0 — Set the scene's ambient lighting (bright/dim/dark).
  // Optimistic local update + async DB commit. Realtime echo to other
  // clients is handled by the existing scenes-table channel; the
  // originator's state is already correct from the optimistic update,
  // so the echo is a no-op.
  const handleSetAmbientLight = useCallback((mode: 'bright' | 'dim' | 'dark') => {
    if (!currentScene) return;
    if (currentScene.ambientLight === mode) return; // no-op when already in this mode
    setScenes(prev => prev.map(s => s.id === currentScene.id
      ? { ...s, ambientLight: mode }
      : s));
    setCurrentScene(prev => prev && prev.id === currentScene.id
      ? { ...prev, ambientLight: mode }
      : prev);
    scenesApi.updateScene(currentScene.id, { ambientLight: mode }).catch(err =>
      console.error('[BattleMapV2] ambient light commit failed', err)
    );
  }, [currentScene]);

  const handleContextMenu = useCallback((state: ContextMenuState) => {
    setContextMenu(state);
  }, []);

  // v2.358.0 — Click on a token = JUST SELECT IT. Pre-v2.358 click
  // opened the rich TokenQuickPanel for PCs / NpcTokenQuickPanel for
  // NPCs / TokenContextMenu for unlinked. User feedback: "if we just
  // left click a token it should just select it and shouldn't do
  // anything but if we right click on the token it should give us
  // all the menu system that we currently have." Quick panels are
  // still accessible via the right-click menu's "Open Quick Panel"
  // item — users who want them just take the explicit extra step.
  const handleTokenClick = useCallback((tokenId: string, _screenX: number, _screenY: number) => {
    setSelectedTokenId(tokenId);
    // Close any open quick panels so selection is the only active
    // surface — keeps the canvas clean.
    setClickedToken(null);
    setClickedNpcToken(null);
  }, []);

  // v2.359.0 — wrapper-level contextmenu suppression moved to the JSX
  // onContextMenu prop on the wrapper div (see render below). The
  // previous useEffect was racing with the empty-state early returns.

  // ========================================================
  // Empty-state renderers
  // ========================================================

  // Scenes list loading on first mount — show a neutral placeholder.
  if (scenesLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, padding: 'var(--sp-6, 32px)',
        background: 'var(--c-card)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg, 12px)',
        fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)',
      }}>
        Loading scenes…
      </div>
    );
  }

  // No scenes at all in this campaign yet.
  if (scenes.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
        minHeight: 400, padding: 'var(--sp-8, 48px) var(--sp-4, 16px)',
        background: 'var(--c-card)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg, 12px)',
        textAlign: 'center' as const,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❖</div>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 700,
          color: 'var(--t-1)', marginBottom: 8, letterSpacing: '0.02em',
        }}>
          {isDM ? 'No scenes yet' : 'No scenes published yet'}
        </div>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 12,
          color: 'var(--t-2)', maxWidth: 400, lineHeight: 1.6, marginBottom: 20,
        }}>
          {isDM
            ? 'Create your first scene to start placing tokens. You can add multiple scenes per campaign and switch between them.'
            : 'The DM hasn\u2019t set up a scene for this campaign yet. Check back soon.'}
        </div>
        {isDM && (
          <button
            onClick={createNewScene}
            style={{
              padding: '8px 20px',
              background: 'rgba(167,139,250,0.2)',
              border: '1px solid rgba(167,139,250,0.5)',
              borderRadius: 'var(--r-md, 8px)',
              color: '#a78bfa',
              fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            + Create First Scene
          </button>
        )}
      </div>
    );
  }

  // ========================================================
  // Main render — scene selected (or defaulting to first).
  // ========================================================
  return (
    <div>
      {/* v2.213 scene picker toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', marginBottom: 8,
        background: 'var(--c-raised)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-md, 8px)',
      }}>
        <label style={{
          fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.06em', color: 'var(--t-3)',
          textTransform: 'uppercase' as const,
        }}>
          Scene
        </label>
        <select
          value={currentScene?.id ?? ''}
          onChange={(e) => {
            const next = scenes.find(s => s.id === e.target.value);
            if (next) setCurrentScene(next);
          }}
          style={{
            padding: '4px 8px',
            background: 'var(--c-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            color: 'var(--t-1)',
            fontFamily: 'var(--ff-body)', fontSize: 12,
            minWidth: 200,
          }}
        >
          {scenes.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {isDM && (
          <button
            onClick={createNewScene}
            style={{
              padding: '4px 12px',
              background: 'rgba(167,139,250,0.15)',
              border: '1px solid rgba(167,139,250,0.4)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#a78bfa',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            + New Scene
          </button>
        )}
        {isDM && currentScene && (
          <button
            onClick={() => setSettingsOpen(true)}
            title="Scene settings — rename, resize grid, delete"
            style={{
              padding: '4px 10px',
              background: 'var(--c-card)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm, 4px)',
              color: 'var(--t-2)',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            ⚙ Settings
          </button>
        )}
        {/* v2.281.0 — Fullscreen toggle. Visible to all users (DM and
            players both benefit from a maximized canvas during combat).
            When on, the wrapper goes position:fixed inset:0 and the
            canvas dims compute to viewport size. Esc also exits.
            Active state shown via gold tint to match the existing
            DM toolbar's "active mode" affordance. */}
        <button
          onClick={toggleMapFullscreen}
          title={mapFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen map'}
          style={{
            padding: '4px 10px',
            background: mapFullscreen ? 'rgba(212,160,23,0.20)' : 'var(--c-card)',
            border: `1px solid ${mapFullscreen ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
            borderRadius: 'var(--r-sm, 4px)',
            color: mapFullscreen ? 'var(--c-gold-l)' : 'var(--t-2)',
            fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          {mapFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
        </button>
        {loading && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--ff-body)', fontSize: 10,
            color: 'var(--t-3)', fontStyle: 'italic' as const,
          }}>
            Loading tokens…
          </span>
        )}
      </div>

      {/* v2.228 — DM action toolbar. Moved out of the canvas overlay
          (where the buttons sat in semi-transparent cards over the
          map image and were hard to read) into a dedicated solid
          bar that lives above the canvas. The Scene-name badge and
          the zoom/ruler/walls buttons remain on the canvas itself
          since they're contextual to the map. Renders only for the
          DM, and only when there's a current scene to act on. */}
      {isDM && currentScene && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            marginBottom: 8,
            background: 'var(--c-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-md, 8px)',
            flexWrap: 'wrap' as const,
          }}
        >
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
            color: 'var(--t-3)', letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginRight: 4,
          }}>
            Map
          </span>
          <button
            onClick={handleRequestMapUpload}
            title={currentScene.backgroundStoragePath
              ? 'Replace the current map image'
              : 'Upload a map image as the scene background'}
            style={{
              padding: '6px 14px',
              background: 'rgba(96,165,250,0.18)',
              border: '1px solid rgba(96,165,250,0.6)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#60a5fa',
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.32)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.18)'; }}
          >
            {currentScene.backgroundStoragePath ? 'Change Map' : 'Upload Map'}
          </button>
          {currentScene.backgroundStoragePath && (
            <button
              onClick={handleRemoveMap}
              title="Remove the current map image"
              style={{
                padding: '6px 14px',
                background: 'rgba(248,113,113,0.18)',
                border: '1px solid rgba(248,113,113,0.55)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#f87171',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.3)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.18)'; }}
            >
              Remove Map
            </button>
          )}
          <span style={{
            width: 1, height: 22,
            background: 'var(--c-border)',
            margin: '0 4px',
          }} />
          {/* v2.274.0 — Lighting controls. Three-state toggle for the
              scene's ambient_light value. Active state is highlighted
              gold; inactive states use a muted variant of the icon
              color so the cluster reads as a connected control group.
              Click the active button = no-op (handler short-circuits).
              Tooltips explain the player-side effect of each mode. */}
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
            color: 'var(--t-3)', letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginRight: 4,
          }}>
            Light
          </span>
          {([
            { mode: 'bright' as const, icon: '☀', label: 'Bright', tip: 'Daylight / outdoor — players see the entire map (no fog).' },
            { mode: 'dim'    as const, icon: '◐', label: 'Dim',    tip: 'Dusk / mood — players see a translucent fog over the map; their vision cones cut clear holes.' },
            { mode: 'dark'   as const, icon: '☾', label: 'Dark',   tip: 'Night / dungeon — players only see inside their vision cones; the rest is opaque black.' },
          ]).map(({ mode, icon, label, tip }) => {
            const active = currentScene.ambientLight === mode;
            return (
              <button
                key={mode}
                onClick={() => handleSetAmbientLight(mode)}
                title={tip}
                style={{
                  padding: '6px 12px',
                  background: active ? 'var(--c-gold-bg)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
                  borderRadius: 'var(--r-sm, 4px)',
                  color: active ? 'var(--c-gold-l)' : 'var(--t-2)',
                  fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: active ? 'default' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <span aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
          <span style={{
            width: 1, height: 22,
            background: 'var(--c-border)',
            margin: '0 4px',
          }} />
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
            color: 'var(--t-3)', letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            marginRight: 4,
          }}>
            Tokens
          </span>
          {props.playerCharacters.length > 0 && (
            <button
              onClick={addPcTokens}
              title="Create a token for each player character that doesn't already have one in this scene"
              style={{
                padding: '6px 14px',
                background: 'rgba(52,211,153,0.18)',
                border: '1px solid rgba(52,211,153,0.6)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#34d399',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.32)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.18)'; }}
            >
              + Add PC Tokens
            </button>
          )}
          {/* v2.242 — DM-only "+ Add NPCs" button. Opens the roster
              picker for bulk NPC token placement from the DM's
              dm_npc_roster. Red-accented to distinguish from the
              green PC button (PC = friendly, NPC = hostile by default). */}
          {isDM && (
            <button
              onClick={() => setNpcPickerOpen(true)}
              title="Add NPCs from your roster"
              style={{
                padding: '6px 14px',
                background: 'rgba(239,68,68,0.18)',
                border: '1px solid rgba(239,68,68,0.55)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#fca5a5',
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.32)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)'; }}
            >
              + Add NPCs
            </button>
          )}
          {/* v2.355.0 — Manage Roster button removed. Creature
              management lives in the NPC tab now (folder browser +
              creature form + catalog import). The legacy
              dm_npc_roster table this button targeted was dropped in
              v2.350. */}
          {/* v2.353.0 — "+ Add Token" button removed. It created
              default placeholder tokens with no creature/character
              linkage, which conflicts with the new unified flow where
              everything on the map should come from the NPC section
              (creatures + folder browser) or be a player's character. */}
        </div>
      )}

      {/* v2.286.0 — Legacy InitiativeBar mount removed. Combat UI
          now lives exclusively in the InitiativeStrip at the bottom
          of the page (mounted by CombatProvider via CampaignDashboard). */}

      <div
        ref={wrapperRef}
        // v2.359.0 — Suppress the browser's native context menu on
        // the entire battle-map wrapper. Pre-v2.359 this was wired
        // via a useEffect with deps=[] that ran once at mount; if
        // the wrapper wasn't rendered yet (scenesLoading state, or
        // empty-scenes empty state), wrapperRef.current was null and
        // the listener never attached. Putting the handler on the
        // JSX makes it a property of the element and applies to any
        // render where the wrapper exists. Token + wall + drawing
        // layers still install their own contextmenu listeners on
        // the canvas for tool-specific delete/menu logic; they
        // preventDefault themselves so they don't fight this one.
        onContextMenu={(e) => e.preventDefault()}
        style={{
          // v2.281.0 — pseudo-fullscreen via position:fixed inset:0.
          // zIndex is below the InitiativeStrip (9999) so combat UI
          // stays on top, but above the app sidebar/header chrome
          // (which sits at standard z-indices ≤100). Border kept on
          // both modes for visual continuity; in fullscreen the
          // border becomes a hairline against the viewport edge.
          ...(mapFullscreen
            ? {
                position: 'fixed' as const,
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 9000,
                borderRadius: 0,
              }
            : {
                width: '100%',
                position: 'relative' as const,
              }),
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          ...(mapFullscreen ? {} : { borderRadius: 'var(--r-lg, 12px)' }),
          overflow: 'hidden',
        }}
      >
        {/* v2.281.0 — Floating exit affordance, only when fullscreen.
            The toolbar with the Fullscreen toggle lives ABOVE the
            wrapper and is hidden behind it when fullscreen is on
            (the wrapper covers the viewport). This in-canvas button
            gives users an obvious way out besides Esc. Top-right
            corner; high zIndex to stay above any canvas overlays. */}
        {mapFullscreen && (
          <button
            onClick={toggleMapFullscreen}
            title="Exit fullscreen (Esc)"
            style={{
              position: 'absolute',
              top: 8, right: 8,
              zIndex: 10,
              padding: '6px 12px',
              background: 'rgba(15,16,18,0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid var(--c-gold-bdr)',
              borderRadius: 'var(--r-sm, 4px)',
              color: 'var(--c-gold-l)',
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            ⛶ Exit Fullscreen
          </button>
        )}
        <Application
          width={dims.width}
          height={dims.height}
          background={BG_COLOR}
          antialias={true}
        >
          <ViewportHost
            screenWidth={dims.width}
            screenHeight={dims.height}
            worldWidth={WORLD_WIDTH}
            worldHeight={WORLD_HEIGHT}
          >
            {vp => {
              vpRef.current = vp;
              return (
                <>
                  <BackgroundLayer
                    viewport={vp}
                    backgroundPath={currentScene?.backgroundStoragePath ?? null}
                    worldWidth={WORLD_WIDTH}
                    worldHeight={WORLD_HEIGHT}
                  />
                  <GridOverlay
                    viewport={vp}
                    widthCells={widthCells}
                    heightCells={heightCells}
                    gridSizePx={gridSizePx}
                  />
                  {/* v2.223 — walls render above grid but below tokens
                      so tokens overlap walls at their edges (correct
                      depth cue). The drawing tool's rubber-band preview
                      lives on its own Graphics inside WallLayer and
                      also sits in this z-plane. */}
                  <WallLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    active={wallActive}
                    isDM={isDM}
                    gridSizePx={gridSizePx}
                    currentSceneId={currentScene?.id ?? null}
                  />
                  <TokenLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    onContextMenu={handleContextMenu}
                    worldWidth={WORLD_WIDTH}
                    worldHeight={WORLD_HEIGHT}
                    gridSizePx={gridSizePx}
                    campaignId={campaignId}
                    currentUserId={userId}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    rulerActive={rulerActive}
                    wallActive={wallActive}
                    textActive={textActive}
                    drawActive={drawActive != null}
                    fxActive={fxActive != null}
                    eraserActive={eraserActive}
                    characterHpMap={characterHpMap}
                    npcHpMap={npcHpMap}
                    tokenStateMap={props.tokenStateMap}
                    tokenStateMapByDef={liveTokenStateByDef}
                    tokenConditionsMap={tokenConditionsMap}
                    characterConcentrationMap={props.characterConcentrationMap}
                    onTokenClick={handleTokenClick}
                    onMovementBlocked={handleMovementBlocked}
                    isDM={isDM}
                    myCharacterId={props.myCharacterId}
                    activeTokenInfo={activeTokenInfo}
                    recordUndoable={recordUndoable}
                    selectedTokenId={selectedTokenId}
                    onCommitPos={markSelfWrite}
                    getEffectiveUsed={getEffectiveUsed}
                    recordMoved={recordMoved}
                    onSnapAnimate={animateSnap}
                    onDragMotionEnded={stampDragEnded}
                  />
                  {/* v2.234 — TextLayer renders text annotations and
                      handles the placement/edit/delete interactions
                      when textActive is true. Mounted above tokens
                      so labels read on top of token graphics. */}
                  <TextLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    active={textActive}
                    isDM={isDM}
                    currentSceneId={currentScene?.id ?? null}
                    selectMode={!textActive && drawActive == null && !eraserActive}
                    recordUndoable={recordUndoable}
                  />
                  {/* v2.235 — DrawingLayer renders pencil/line/rect/
                      circle annotations and authors new drawings via
                      pointer drag when activeKind is non-null. Sits
                      above tokens so drawings read on top, but below
                      labels (which are mounted later in this list).
                      Actually mounted AFTER TextLayer here, so labels
                      sit above drawings — DM intent is "drawings as
                      backdrop, labels as captions." */}
                  <DrawingLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    activeKind={drawActive}
                    isDM={isDM}
                    currentSceneId={currentScene?.id ?? null}
                    color={drawColor}
                    lineWidth={drawLineWidth}
                    selectMode={!textActive && drawActive == null && !eraserActive}
                    recordUndoable={recordUndoable}
                    eraserActive={eraserActive}
                    gridSizePx={gridSizePx}
                  />
                  {/* v2.236 — FxLayer renders ephemeral particle
                      effects. Mounted last (top of z-stack) so
                      effects always read above other layers — fire
                      on top of a token feels right. Effects are
                      broadcast over Realtime to all clients viewing
                      this scene; no persistence. */}
                  <FxLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    activeKind={fxActive}
                    campaignId={campaignId}
                    currentSceneId={currentScene?.id ?? null}
                    triggerRef={triggerFxRef}
                    intensity={fxIntensity}
                  />
                  {/* v2.224 — fog of war overlay. DM sees nothing
                      (no fog applied); players see dark over anything
                      outside any party PC token's visibility polygon.
                      Sits above tokens so it can hide them, below the
                      ruler so the ruler is always visible to its user.
                      v2.267.0 — DM can also see fog when dmPreviewFog
                      is on, via the toolbar ◉ Player View toggle. */}
                  <VisionLayer
                    viewport={vp}
                    worldWidth={WORLD_WIDTH}
                    worldHeight={WORLD_HEIGHT}
                    gridSizePx={gridSizePx}
                    isDM={isDM}
                    visionOriginCharacterIds={visionOriginCharacterIds}
                    dmPreviewFog={dmPreviewFog}
                    ambientLight={currentScene?.ambientLight ?? 'dark'}
                  />
                  {/* v2.469.0 — Reach hover overlay, extracted from
                      VisionLayer. Mounted unconditionally so the melee-
                      reach preview works in every state (DM with
                      vision off, players, plain map view, etc.) and
                      isn't coupled to fog-of-war lifecycle. */}
                  <ReachOverlayLayer
                    viewport={vp}
                    gridSizePx={gridSizePx}
                  />
                  {/* v2.218 — rendered last so the ruler's Graphics +
                      label appear on top of tokens. Internally addChild's
                      to the viewport when active, so visual z-order
                      follows child order = top of stack. */}
                  <RulerLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    active={rulerActive}
                    gridSizePx={gridSizePx}
                  />
                </>
              );
            }}
          </ViewportHost>
        </Application>

        <div
          style={{
            position: 'absolute', top: 8, left: 12,
            padding: '4px 10px',
            background: 'rgba(15,16,18,0.75)',
            border: '1px solid rgba(167,139,250,0.3)',
            borderRadius: 'var(--r-sm, 4px)',
            fontFamily: 'var(--ff-body)', fontSize: 10,
            fontWeight: 700, letterSpacing: '0.04em',
            color: '#a78bfa', pointerEvents: 'none' as const,
          }}
        >
          {currentScene?.name ?? 'BATTLE MAP v2'} · {widthCells}×{heightCells} · {gridSizePx}PX
        </div>

        {/* v2.228 — DM action toolbar moved out to its own solid bar
            above the canvas (see block above the wrapperRef div). The
            in-canvas position was hard to read against busy maps. */}

        <div
          style={{
            position: 'absolute', bottom: 12, right: 12,
            display: 'flex', gap: 4, flexDirection: 'column' as const,
          }}
        >
          {[
            { label: '+', onClick: zoomIn, title: 'Zoom in' },
            { label: '−', onClick: zoomOut, title: 'Zoom out' },
            { label: '⊡', onClick: zoomFit, title: 'Fit to screen' },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              title={btn.title}
              style={{
                // v2.226 — strong contrast for readability over busy map
                // images. Dark fill + bright text + box-shadow halo so
                // buttons "pop" against any background.
                width: 36, height: 36,
                background: 'rgba(15,16,18,0.95)',
                border: '1px solid rgba(167,139,250,0.65)',
                borderRadius: 'var(--r-sm, 4px)',
                color: '#ffffff',
                fontFamily: 'var(--ff-body)', fontSize: 18, fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.5)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.35)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.95)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.95)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.65)';
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* v2.233 — Vertical tool palette on the LEFT edge of the canvas
            (Roll20-inspired layout). Replaces the previous bottom-left
            horizontal Ruler/Walls strip. Stacked icon buttons, tooltips
            on hover, color-coded active state. Top "TOOLS" label
            mirrors Roll20's section header. Future ships will slot
            additional tools (Text v2.234, Drawing v2.235, FX v2.236)
            into this same palette without re-layout work.

            Position: top: 60 leaves room for the scene-name badge at
            top: 8, and far enough from the action toolbar bar above
            the canvas that it reads as a tool surface, not a header. */}
        <div
          style={{
            position: 'absolute', top: 60, left: 12,
            display: 'flex', flexDirection: 'column' as const,
            alignItems: 'center', gap: 4,
            padding: '6px 5px',
            background: 'rgba(15,16,18,0.92)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-md, 8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 5,
          }}
        >
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase' as const,
            color: 'var(--t-3)',
            padding: '2px 0 4px',
            borderBottom: '1px solid var(--c-border)',
            width: '100%', textAlign: 'center' as const,
            marginBottom: 2,
          }}>
            Tools
          </div>

          {/* Ruler — available to all users (player or DM). */}
          <button
            onClick={toggleRuler}
            title={rulerActive
              ? 'Ruler active — left-click to add segments, right-click or Esc to finish.'
              : 'Ruler — click to drop waypoints; the running total is shown at the cursor.'}
            style={{
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: rulerActive ? 'rgba(251,191,36,0.28)' : 'transparent',
              border: `1px solid ${rulerActive ? 'rgba(251,191,36,0.85)' : 'rgba(251,191,36,0.25)'}`,
              borderRadius: 'var(--r-sm, 4px)',
              color: rulerActive ? '#fbbf24' : 'var(--t-2)',
              fontSize: 18,
              cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!rulerActive) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,0.14)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(251,191,36,0.55)';
              }
            }}
            onMouseLeave={(e) => {
              if (!rulerActive) {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(251,191,36,0.25)';
              }
            }}
          >
            ↔
          </button>

          {/* Walls — DM only. */}
          {isDM && (
            <button
              onClick={toggleWallMode}
              title={wallActive
                ? 'Walls active — click to place vertices, shift+click on a wall cycles solid → closed door → open door, right-click a wall to delete, Esc to cancel current line. Click this button again to exit. Walls/closed doors block sight + movement; open doors block neither.'
                : 'Walls — block line-of-sight + token movement on the map. Shift+click a wall to make it a door (cycles closed/open). Players can\'t see or move past solid walls or closed doors. Toggle ◉ to preview the player\'s view. DM only.'}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: wallActive ? 'rgba(167,139,250,0.28)' : 'transparent',
                border: `1px solid ${wallActive ? 'rgba(167,139,250,0.85)' : 'rgba(167,139,250,0.25)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: wallActive ? '#a78bfa' : 'var(--t-2)',
                fontSize: 18,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!wallActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.55)';
                }
              }}
              onMouseLeave={(e) => {
                if (!wallActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.25)';
                }
              }}
            >
              ▦
            </button>
          )}

          {/* v2.358.0 — Clear All Walls button. Companion to the
              wall tool. Bulk wipe of every wall on the current scene.
              Critical for unsticking the "walls erased but still
              blocking movement" failure mode where per-wall eraser
              calls didn't reach the DB but the scene_walls table
              still has rows the server-side collision trigger reads. */}
          {isDM && (
            <button
              onClick={clearAllWalls}
              title="Clear all walls on this scene (drawings, text, and tokens are not affected). Use this if walls you erased seem to still be blocking token movement."
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: '1px solid rgba(167,139,250,0.25)',
                borderRadius: 'var(--r-sm, 4px)',
                color: 'var(--t-2)',
                fontSize: 14,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.14)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.55)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.25)';
              }}
            >
              ▦✕
            </button>
          )}

          {/* v2.267.0 — Player View preview toggle. DM only. When on,
              the DM sees the same fog of war the players see (computed
              from party-shared sight polygons). Used to verify wall +
              token placement without needing a second logged-in client.
              Default off so DMs see the whole map by default. The
              fog overlay only shows up if at least one PC token exists
              on the scene — otherwise there's no vision origin and
              the fog covers the world solid. */}
          {isDM && (
            <button
              onClick={() => setDmPreviewFog(v => !v)}
              title={dmPreviewFog
                ? 'Player View: ON — you are seeing fog as a player would. Click to return to full DM view.'
                : 'Preview Player View — show the same fog of war players see, so you can verify wall placement and PC sight lines.'}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: dmPreviewFog ? 'rgba(96,165,250,0.28)' : 'transparent',
                border: `1px solid ${dmPreviewFog ? 'rgba(96,165,250,0.85)' : 'rgba(96,165,250,0.25)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: dmPreviewFog ? '#60a5fa' : 'var(--t-2)',
                fontSize: 16,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!dmPreviewFog) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(96,165,250,0.55)';
                }
              }}
              onMouseLeave={(e) => {
                if (!dmPreviewFog) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(96,165,250,0.25)';
                }
              }}
            >
              ◉
            </button>
          )}

          {/* v2.234 — Text annotation tool. DM only. Click on map
              empty space to drop a label; click an existing label to
              edit; right-click an existing label to delete. */}
          {isDM && (
            <button
              onClick={toggleTextMode}
              title={textActive
                ? 'Text active — left-click on the map to place a label, click existing text to edit, right-click to delete. Click this button again to exit.'
                : 'Text — drop labels on the map. DM only.'}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: textActive ? 'rgba(96,165,250,0.28)' : 'transparent',
                border: `1px solid ${textActive ? 'rgba(96,165,250,0.85)' : 'rgba(96,165,250,0.25)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: textActive ? '#60a5fa' : 'var(--t-2)',
                fontFamily: 'var(--ff-stat)', fontSize: 18, fontWeight: 800,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!textActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,165,250,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(96,165,250,0.55)';
                }
              }}
              onMouseLeave={(e) => {
                if (!textActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(96,165,250,0.25)';
                }
              }}
            >
              T
            </button>
          )}

          {/* v2.234+ slot for Text annotation tool will go here. */}
          {/* v2.235 — Drawing tools. DM only. Four kinds in a stack:
              pencil (freehand), line, rect, circle. Each button toggles
              its kind; clicking the active kind exits drawing mode. */}
          {isDM && (() => {
            const drawKinds: Array<{ kind: DrawingKind; icon: string; label: string }> = [
              { kind: 'pencil', icon: '✎', label: 'Pencil — freehand drawing' },
              { kind: 'line',   icon: '╱',  label: 'Line — straight line segment' },
              { kind: 'rect',   icon: '▭',  label: 'Rectangle' },
              { kind: 'circle', icon: '○',  label: 'Circle' },
            ];
            return (
              <>
                {drawKinds.map(({ kind, icon, label }) => {
                  const active = drawActive === kind;
                  return (
                    <button
                      key={kind}
                      onClick={() => toggleDrawMode(kind)}
                      title={active
                        ? `${label} (active) — click-drag to draw, right-click to delete a drawing. Click this button again to exit.`
                        : label}
                      style={{
                        width: 36, height: 36,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? 'rgba(244,114,182,0.28)' : 'transparent',
                        border: `1px solid ${active ? 'rgba(244,114,182,0.85)' : 'rgba(244,114,182,0.25)'}`,
                        borderRadius: 'var(--r-sm, 4px)',
                        color: active ? '#f472b6' : 'var(--t-2)',
                        fontFamily: 'var(--ff-stat)', fontSize: 16, fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'background 0.12s, border-color 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,114,182,0.14)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.55)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.25)';
                        }
                      }}
                    >
                      {icon}
                    </button>
                  );
                })}
              </>
            );
          })()}

          {/* v2.269.0 — Eraser tool. DM only. Click on a drawing to
              delete it (no confirm — eraser mode is the explicit
              intent). Right-click delete with confirm still works
              outside this mode for the cautious path. Mutex with all
              other tools. Pink palette to match the drawing tools
              (the eraser is a sibling of the draw tools). */}
          {isDM && (
            <button
              onClick={toggleEraserMode}
              title={eraserActive
                ? 'Eraser active — click any drawing to delete it. Click this button again to exit.'
                : 'Eraser — click drawings to remove them. Right-click outside this mode also deletes (with confirm).'}
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: eraserActive ? 'rgba(244,114,182,0.28)' : 'transparent',
                border: `1px solid ${eraserActive ? 'rgba(244,114,182,0.85)' : 'rgba(244,114,182,0.25)'}`,
                borderRadius: 'var(--r-sm, 4px)',
                color: eraserActive ? '#f472b6' : 'var(--t-2)',
                fontSize: 16,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!eraserActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,114,182,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.55)';
                }
              }}
              onMouseLeave={(e) => {
                if (!eraserActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.25)';
                }
              }}
            >
              ✕
            </button>
          )}
          {/* v2.356.0 — Clear All Drawings button. Bulk wipe of every
              pencil/line/rect/circle on the current scene. Confirm
              dialog gates the action since there's no undo. Trash
              icon distinguishes from the eraser (single-click delete);
              same pink palette since both are drawing-tool siblings. */}
          {isDM && (
            <button
              onClick={clearAllDrawings}
              title="Clear all drawings on this scene (walls and text are not affected)"
              style={{
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: '1px solid rgba(244,114,182,0.25)',
                borderRadius: 'var(--r-sm, 4px)',
                color: 'var(--t-2)',
                fontSize: 16,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,114,182,0.14)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.55)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,114,182,0.25)';
              }}
            >
              ✕
            </button>
          )}
          {/* v2.236 — FX particle effects. DM only. Four kinds:
              fire, lightning, sparkles, smoke. Each spawns a short
              animation at click point and broadcasts to all clients
              via the scene's FX channel. Effects don't persist. */}
          {isDM && (() => {
            const fxKinds: Array<{ kind: FxKind; icon: string; label: string }> = [
              { kind: 'fire',      icon: '✶', label: 'Fire — orange embers rising' },
              { kind: 'lightning', icon: '↯', label: 'Lightning — bolt strike with flash' },
              { kind: 'sparkles',  icon: '✧', label: 'Sparkles — gold twinkles fanning out' },
              { kind: 'smoke',     icon: '≈', label: 'Smoke — gray puffs rising' },
            ];
            return (
              <>
                {fxKinds.map(({ kind, icon, label }) => {
                  const active = fxActive === kind;
                  return (
                    <button
                      key={kind}
                      onClick={() => toggleFxMode(kind)}
                      title={active
                        ? `${label} (active) — click on the map to spawn. Click this button again to exit.`
                        : label}
                      style={{
                        width: 36, height: 36,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? 'rgba(34,211,238,0.28)' : 'transparent',
                        border: `1px solid ${active ? 'rgba(34,211,238,0.85)' : 'rgba(34,211,238,0.25)'}`,
                        borderRadius: 'var(--r-sm, 4px)',
                        color: active ? '#22d3ee' : 'var(--t-2)',
                        fontSize: 18,
                        cursor: 'pointer',
                        transition: 'background 0.12s, border-color 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,211,238,0.14)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(34,211,238,0.55)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(34,211,238,0.25)';
                        }
                      }}
                    >
                      {icon}
                    </button>
                  );
                })}
              </>
            );
          })()}
        </div>

        {/* v2.235 — Color + line-width picker. Floats next to the
            tool palette only when a drawing tool is active so it
            doesn't crowd the canvas otherwise. Six color swatches +
            three width buttons cover ~95% of typical use without
            needing a full color picker. Future ship can add a
            free-form hex input + a fill toggle. */}
        {isDM && drawActive && (
          <div
            style={{
              position: 'absolute', top: 60, left: 60,
              display: 'flex', flexDirection: 'column' as const,
              alignItems: 'flex-start', gap: 6,
              padding: '8px 10px',
              background: 'rgba(15,16,18,0.92)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-md, 8px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 5,
              minWidth: 130,
            }}
          >
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase' as const,
              color: 'var(--t-3)',
            }}>
              Color
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {['#a78bfa', '#f87171', '#60a5fa', '#34d399', '#fbbf24', '#ffffff'].map(hex => (
                <button
                  key={hex}
                  onClick={() => setDrawColor(hex)}
                  title={hex}
                  style={{
                    width: 18, height: 18,
                    background: hex,
                    border: drawColor === hex ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
              {/* v2.255.0 — freeform hex color. Native <input type="color">
                  acts as the visual picker (DM clicks the swatch, the OS
                  native picker opens). The text input lets DMs paste a
                  specific hex (e.g. from a campaign palette) without
                  going through the picker. Both bind to the same state.
                  Validated to #RGB or #RRGGBB shape before commit so a
                  half-typed string doesn't clobber the active color. */}
              <input
                type="color"
                value={drawColor}
                onChange={(e) => setDrawColor(e.target.value)}
                title="Pick any color"
                style={{
                  width: 22, height: 22,
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: 0,
                  background: 'transparent',
                  marginLeft: 2,
                }}
              />
              <input
                type="text"
                value={drawColor}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  // Permissive while typing; only commit when shape matches.
                  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
                    setDrawColor(v);
                  }
                }}
                placeholder="#hex"
                spellCheck={false}
                style={{
                  width: 70, height: 22,
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 4,
                  color: 'var(--t-1)',
                  fontSize: 10, fontFamily: 'monospace',
                  padding: '0 6px',
                  marginLeft: 2,
                }}
              />
            </div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase' as const,
              color: 'var(--t-3)',
              marginTop: 4,
            }}>
              Width
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[2, 4, 8].map(w => (
                <button
                  key={w}
                  onClick={() => setDrawLineWidth(w)}
                  title={`${w}px`}
                  style={{
                    width: 28, height: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: drawLineWidth === w ? 'rgba(244,114,182,0.28)' : 'transparent',
                    border: `1px solid ${drawLineWidth === w ? 'rgba(244,114,182,0.85)' : 'rgba(255,255,255,0.18)'}`,
                    borderRadius: 'var(--r-sm, 4px)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <div style={{
                    width: 16, height: w, background: drawColor, borderRadius: 1,
                  }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* v2.256.0 — FX intensity slider. Only visible when an FX
            kind is active so it doesn't crowd the toolbar otherwise.
            Same visual idiom as the draw-color popover above. Range
            0.25 (subtle puff) → 2.0 (dense stage effect). The label
            chip shows the current multiplier and a percent so DMs can
            ballpark "twice as many particles" without doing math. */}
        {isDM && fxActive && (
          <div
            style={{
              position: 'absolute', top: 60, left: 60,
              display: 'flex', flexDirection: 'column' as const,
              alignItems: 'flex-start', gap: 6,
              padding: '8px 10px',
              background: 'rgba(15,16,18,0.92)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-md, 8px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 5,
              minWidth: 180,
            }}
          >
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase' as const,
              color: 'var(--t-3)',
              display: 'flex', justifyContent: 'space-between' as const, width: '100%',
            }}>
              <span>FX Intensity</span>
              <span style={{ color: '#22d3ee' }}>{Math.round(fxIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={fxIntensity}
              onChange={(e) => setFxIntensity(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#22d3ee' }}
            />
            {/* Quick presets — single-click to common values. */}
            <div style={{ display: 'flex', gap: 4, width: '100%' }}>
              {[
                { v: 0.5, label: 'Subtle' },
                { v: 1.0, label: 'Normal' },
                { v: 1.5, label: 'Dense' },
              ].map(p => (
                <button
                  key={p.v}
                  onClick={() => setFxIntensity(p.v)}
                  style={{
                    flex: 1,
                    padding: '3px 4px',
                    background: Math.abs(fxIntensity - p.v) < 0.05
                      ? 'rgba(34,211,238,0.22)' : 'transparent',
                    border: `1px solid ${Math.abs(fxIntensity - p.v) < 0.05
                      ? 'rgba(34,211,238,0.7)' : 'var(--c-border)'}`,
                    borderRadius: 4,
                    color: Math.abs(fxIntensity - p.v) < 0.05 ? '#22d3ee' : 'var(--t-2)',
                    fontSize: 9, fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            // v2.270.0 — moved to top-right so the floating party
            // panel can occupy the full bottom-left without collision.
            // Top-right is otherwise unused. Reads cleanly above the
            // viewport without competing for attention with the
            // canvas content.
            position: 'absolute', top: 12, right: 12,
            padding: '3px 8px',
            background: 'rgba(15,16,18,0.6)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            fontFamily: 'var(--ff-body)', fontSize: 9,
            color: 'var(--t-3)', pointerEvents: 'none' as const,
            letterSpacing: '0.02em',
            // v2.270.0 — z-index parallel to the party panel (30) so
            // the hint stays above the canvas but below modals.
            zIndex: 30,
            // Cap width so a long hint string doesn't span more than
            // a third of the canvas width — keeps the right edge
            // available for the toolbar overflow / future controls.
            maxWidth: '40%',
            textAlign: 'right' as const,
          }}
        >
          {dmPreviewFog
            ? 'Player View ON — fog shows what players see. Click ◉ again to return to full DM view.'
            : eraserActive
            ? 'Eraser ON — click any drawing to delete it. Click ✕ again to exit.'
            : wallActive
            ? 'Click to place wall vertices · shift+click a wall = cycle door state · right-click to delete · Esc to cancel · right/middle drag pans · wheel zooms'
            : rulerActive
              ? 'Click to add waypoints · right-click/Esc to finish · right/middle drag pans · wheel zooms'
              : 'Drag tokens · right-click for options · right/middle drag pans · wheel zooms'}
        </div>

        {contextMenu && (
          <TokenContextMenu
            state={contextMenu}
            isDM={isDM}
            campaignId={campaignId}
            onClose={() => setContextMenu(null)}
            onRequestUpload={handleRequestUpload}
            onOpenCharacter={handleOpenCharacter}
            // v2.413.0 — playerCharacters drives the "Grant Player
            // Control" submenu so the DM can hand drag rights to a
            // specific party member.
            playerCharacters={props.playerCharacters}
            onOpenQuickPanel={(tokenId) => {
              // v2.358.0 — Resolve which panel based on token type.
              // Mirrors the pre-v2.358 handleTokenClick branching but
              // triggered explicitly via the menu instead of on every
              // click. Uses the menu's clientX/Y as the anchor so the
              // panel pops near where the user right-clicked.
              const t = useBattleMapStore.getState().tokens[tokenId];
              if (!t) return;
              if (t.characterId) {
                setClickedNpcToken(null);
                setClickedToken({ tokenId, x: contextMenu.clientX, y: contextMenu.clientY });
              } else if (t.npcId) {
                setClickedToken(null);
                setClickedNpcToken({ npcId: t.npcId, tokenId, x: contextMenu.clientX, y: contextMenu.clientY });
              }
            }}
          />
        )}

        {/* v2.226 — token quick info panel. Opens on left-click
            (without drag) of a character-linked token. Anchored
            near the click point. Backdrop click + Escape close it.
            Re-reads the live character on each render so HP edits
            via the panel reflect immediately (the playerCharacters
            prop is the source of truth and updates via Realtime). */}
        {clickedToken && (() => {
          const t = useBattleMapStore.getState().tokens[clickedToken.tokenId];
          const char = t?.characterId
            ? props.playerCharacters.find(c => c.id === t.characterId)
            : null;
          if (!char) return null;
          return (
            <TokenQuickPanel
              character={char}
              anchorX={clickedToken.x}
              anchorY={clickedToken.y}
              isDM={isDM}
              campaignId={campaignId}
              onClose={() => setClickedToken(null)}
              onOpenSheet={() => {
                setClickedToken(null);
                navigate(`/character/${char.id}`);
              }}
            />
          );
        })()}

        {/* v2.243 — NPC quick panel. Opens when a token with `npcId`
            is clicked. Mutually exclusive with the character panel
            (handleTokenClick clears one when opening the other).
            The panel does its own fetch + Realtime sync against
            the npcs row by id, so we don't need to plumb data here. */}
        {clickedNpcToken && (
          <NpcTokenQuickPanel
            npcId={clickedNpcToken.npcId}
            tokenId={clickedNpcToken.tokenId}
            anchorX={clickedNpcToken.x}
            anchorY={clickedNpcToken.y}
            isDM={isDM}
            onClose={() => setClickedNpcToken(null)}
            /* v2.296.0 — sessionState/onUpdateSession dropped. */
          />
        )}

        {/* v2.219 scene settings modal. Rendered above the canvas via
            position:fixed backdrop so it covers the full viewport, not
            just the map area. */}
        {settingsOpen && currentScene && (
          <SceneSettingsModal
            scene={currentScene}
            onClose={() => setSettingsOpen(false)}
            onScenePatched={applyScenePatch}
            onSceneDeleted={handleSceneDeleted}
          />
        )}

        {/* v2.355.0 — Creature picker. DM-only. Opens on "+ Add NPCs"
            in the Tokens toolbar. Lists every creature the DM has
            created in the NPC tab, organized by folder, with a
            "Place" button per row + bulk "Place Folder" per group.
            Replaces the v2.242 NpcRosterPickerModal which targeted
            the dropped dm_npc_roster table. */}
        {npcPickerOpen && isDM && (
          <CreaturePickerModal
            campaignId={campaignId}
            onClose={() => setNpcPickerOpen(false)}
          />
        )}

        {/* v2.215 hidden file input for portrait uploads. Triggered
            programmatically from the context menu. accept limits the
            native picker; we re-validate in the handler. */}
        <input
          ref={fileInputRef}
          type="file"
          accept={assetsApi.ACCEPTED_PORTRAIT_MIME.join(',')}
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />

        {/* v2.217 hidden file input for scene background uploads. */}
        <input
          ref={mapInputRef}
          type="file"
          accept={assetsApi.ACCEPTED_PORTRAIT_MIME.join(',')}
          style={{ display: 'none' }}
          onChange={handleMapFileSelected}
        />

        {/* v2.215 upload status banner — appears while uploading. */}
        {uploadingTokenId && (
          <div
            style={{
              position: 'absolute', top: 44, left: 12,
              padding: '4px 10px',
              background: 'rgba(15,16,18,0.85)',
              border: '1px solid rgba(167,139,250,0.4)',
              borderRadius: 'var(--r-sm, 4px)',
              fontFamily: 'var(--ff-body)', fontSize: 10,
              fontWeight: 700, letterSpacing: '0.04em',
              color: '#a78bfa', pointerEvents: 'none' as const,
            }}
          >
            UPLOADING PORTRAIT…
          </div>
        )}

        {/* v2.217 upload status banner for map. */}
        {uploadingMap && (
          <div
            style={{
              position: 'absolute', top: 44, left: 12,
              padding: '4px 10px',
              background: 'rgba(15,16,18,0.85)',
              border: '1px solid rgba(96,165,250,0.5)',
              borderRadius: 'var(--r-sm, 4px)',
              fontFamily: 'var(--ff-body)', fontSize: 10,
              fontWeight: 700, letterSpacing: '0.04em',
              color: '#60a5fa', pointerEvents: 'none' as const,
            }}
          >
            UPLOADING MAP IMAGE…
          </div>
        )}

        {/* v2.270.0 — Party Vitals strip is now a hovering overlay
            inside the canvas wrapper instead of a sibling below it.
            Anchored bottom-left, transparent enough that the canvas
            shows through, and collapsible (state managed inside
            PartyVitalsBar via localStorage). Frees up the vertical
            space the bottom strip used to occupy so the canvas can
            grow taller. */}
        <PartyVitalsBar
          characters={props.playerCharacters}
          onCharacterClick={panToCharacter}
        />

        {/* v2.358.0 — Floating Undo button. User feedback: "There also
            needs to be an undo button if the character moved into a
            incorrect position for the dam it should be in their log
            in the bottom right corner." Anchored bottom-right of the
            map wrapper; visible only when there's something to undo;
            shows the last action label so the DM knows what reverts.
            DM-only (player tokens skip recording per the v2.358 carve-
            out from useUndoRedo's "tokens excluded" rule). */}
        {isDM && canUndo && (
          <button
            onClick={() => { undoLast(); }}
            title="Undo the last action (Ctrl+Z / Cmd+Z)"
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              padding: '8px 14px',
              background: 'rgba(15,16,18,0.92)',
              border: '1px solid rgba(234,179,8,0.55)',
              borderRadius: 'var(--r-sm, 4px)',
              color: '#fde68a',
              fontFamily: 'var(--ff-body)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              transition: 'background 0.12s, transform 0.12s',
              zIndex: 50,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(234,179,8,0.18)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.92)';
            }}
          >
            ↶ Undo {lastActionLabel ? lastActionLabel : 'last action'}
          </button>
        )}
      </div>
    </div>
  );
}
