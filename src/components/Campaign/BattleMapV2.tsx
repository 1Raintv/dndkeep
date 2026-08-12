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
import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { canMove, logMovement } from '../../lib/movement';
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
  TOKEN_COLORS,
  type ContextMenuState,
} from './battlemap/shared';
import { buildTokenCoverMap } from './battlemap/coverState';
import { PingLayer } from './battlemap/PingLayer';
import { MarqueeLayer } from './battlemap/MarqueeLayer';
import { SelectionActionBar } from './battlemap/SelectionActionBar';
import { WallTypePanel } from './battlemap/WallTypePanel';
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
import { TokenLayer } from './battlemap/TokenLayer';





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
    /** v2.657.0 — battle-map size for this character, resolved by the
     *  caller (species size today; the character's own chosen size once
     *  that ships). Absent falls back to Medium. */
    size?: import('../../lib/map/mapTypes').TokenSize;
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


















// v2.286.0 — Legacy InitiativeBar component removed. It rendered
// ABOVE the canvas wrapper when sessionState.combat_active was true,
// driven by the legacy initiative_order on campaign_sessions. The
// modern InitiativeStrip mounts at the bottom of the page from
// CombatProvider and is the canonical surface for combat. Keeping
// both was a UX hazard — they could disagree if the legacy boolean
// got toggled without participants being seeded. The mount site
// (~line 6844 originally) was deleted in the same commit.



// v2.644 (audit 5.6/6.7 slice B): memo'd — pairs with CampaignDashboard's
// memoized battleMapProps so dashboard re-renders that don't change map
// data (chat ticks, tab-strip state, form typing) skip this whole tree.
function BattleMapV2(props: BattleMapV2Props) {
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
  // v2.653.0 — multi-select. Was a single `selectedTokenId`; a Set now
  // backs marquee sweeps, shift-click, and the bulk action bar. A
  // one-member set behaves exactly as the old single selection did.
  const [selectedTokenIds, setSelectedTokenIds] = useState<ReadonlySet<string>>(() => new Set());
  const clearSelection = useCallback(() => setSelectedTokenIds(new Set()), []);
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
      setSelectedTokenIds(new Set());
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
        // v2.657.0 — was hardcoded 'medium'. A PC token now takes the
        // size its species grants, the same way a creature token takes
        // the size on its stat block. Halfling and Gnome are the two
        // Small species in the 2024 set; before this they occupied a
        // Medium square and, since v2.652, granted and received cover
        // as though they were Medium.
        size: pc.size ?? 'medium',
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

  // v2.652.0 — token.id → cover state. Feeds the shield glyph
  // TokenLayer stamps on any token currently behind something. All the
  // work is in battlemap/coverState.ts (pure, unit-tested); the root
  // just supplies the live tokens + walls and memoises.
  const liveWalls = useBattleMapStore(s => s.walls);
  const tokenCoverMap = useMemo(
    () => buildTokenCoverMap(Object.values(liveTokens), Object.values(liveWalls), gridSizePx),
    [liveTokens, liveWalls, gridSizePx],
  );

  // v2.653.0 — True while any tool owns the left mouse button. The
  // marquee has to stand down for all of them: each already treats a
  // left-drag on empty canvas as its own gesture (draw a wall, sweep a
  // ruler, place text), and two listeners on the same drag would both
  // fire. Mirrors the identical guard list in TokenLayer's pointerdown.
  const anyToolActive = rulerActive || wallActive || textActive
    || drawActive != null || fxActive != null || eraserActive;

  // v2.653.0 — Ping colour. A player's ping takes their own PC token's
  // colour so the table can tell at a glance who is pointing; the DM
  // (and any player without a token on this scene) pings in gold.
  const myPingColor = useMemo(() => {
    const mine = props.myCharacterId
      ? Object.values(liveTokens).find(t => t.characterId === props.myCharacterId)
      : undefined;
    return mine?.color ?? 0xfbbf24;
  }, [liveTokens, props.myCharacterId]);

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

  // v2.653.0 — Arrow-key nudge: shift the whole selection one cell.
  //
  // This is the "group move" half of multi-select, and it is keyboard
  // rather than drag on purpose. Pointer drags run through TokenLayer's
  // gate — movement budget, wall collision, remote drag locks, active
  // turn — and there is no honest way to spend six separate movement
  // budgets in one gesture. So the nudge is DM-only and refuses while
  // combat has an active actor; out of combat the DM already has "free
  // reign" in that same gate, which is exactly the case this mirrors.
  // A true pointer group-drag is queued in docs/ROADMAP.md.
  //
  // Placed after activeTokenInfo rather than beside the other
  // selection state because it reads it — hoisting it would be a
  // temporal-dead-zone reference.
  const nudgeBlocked = !isDM || !!activeTokenInfo.participantId;
  useEffect(() => {
    if (nudgeBlocked || selectedTokenIds.size === 0) return;
    const DELTAS: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const onKey = (e: KeyboardEvent) => {
      const delta = DELTAS[e.key];
      if (!delta) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      e.preventDefault();
      const [dc, dr] = delta;
      const store = useBattleMapStore.getState();
      for (const id of selectedTokenIds) {
        const tok = store.tokens[id];
        if (!tok) continue;
        const x = Math.max(0, Math.min(WORLD_WIDTH, tok.x + dc * gridSizePx));
        const y = Math.max(0, Math.min(WORLD_HEIGHT, tok.y + dr * gridSizePx));
        store.updateTokenPosition(id, x, y);
        tokensApi.updateTokenPos(id, x, y, { campaignId }).catch(err =>
          console.error('[BattleMapV2] nudge commit failed', id, err));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudgeBlocked, selectedTokenIds, gridSizePx, WORLD_WIDTH, WORLD_HEIGHT, campaignId]);

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
  // v2.653.0 — `additive` (shift/ctrl held) toggles the token in the
  // selection instead of replacing it.
  const handleTokenClick = useCallback((tokenId: string, _screenX: number, _screenY: number, additive = false) => {
    setSelectedTokenIds(prev => {
      if (!additive) return new Set([tokenId]);
      const next = new Set(prev);
      if (next.has(tokenId)) next.delete(tokenId); else next.add(tokenId);
      return next;
    });
    // Close any open quick panels so selection is the only active
    // surface — keeps the canvas clean.
    setClickedToken(null);
    setClickedNpcToken(null);
  }, []);

  // v2.653.0 — Marquee result. A plain sweep replaces the selection;
  // shift-sweep unions with what's already there.
  const handleMarqueeSelect = useCallback((ids: string[], additive: boolean) => {
    setSelectedTokenIds(prev => {
      if (!additive) return new Set(ids);
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
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
                    tokenCoverMap={tokenCoverMap}
                    onTokenClick={handleTokenClick}
                    onMovementBlocked={handleMovementBlocked}
                    isDM={isDM}
                    myCharacterId={props.myCharacterId}
                    activeTokenInfo={activeTokenInfo}
                    recordUndoable={recordUndoable}
                    selectedTokenIds={selectedTokenIds}
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
                  {/* v2.653.0 — Alt+click pings the map for everyone
                      in the scene; Alt+Shift+click also pulls their
                      viewports to the spot. Not DM-gated — pointing
                      is exactly what players need it for, and it
                      writes nothing. */}
                  <PingLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    currentSceneId={currentScene?.id ?? null}
                    gridSizePx={gridSizePx}
                    myColor={myPingColor}
                  />
                  {/* v2.653.0 — rubber-band multi-select. Disabled
                      while any other tool owns the left button, and
                      DM-only (every bulk action it feeds is a write
                      RLS refuses for players). */}
                  <MarqueeLayer
                    viewport={vp}
                    canvasEl={canvasEl}
                    tokens={Object.values(liveTokens)}
                    gridSizePx={gridSizePx}
                    enabled={isDM && !anyToolActive}
                    onSelect={handleMarqueeSelect}
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

        {/* v2.653.0 — bulk actions for a multi-token selection. Renders
            itself away below two selected, so single-select behaves
            exactly as it did before this ship. */}
        {isDM && (
          <SelectionActionBar
            selectedIds={selectedTokenIds}
            campaignId={campaignId}
            onClear={clearSelection}
          />
        )}

        {/* v2.661.0 — material picker for the wall tool. HTML, so it
            lives outside <Application> rather than beside WallLayer.
            Only while the tool is active: it is authoring state with
            nothing to say when you aren't drawing walls. */}
        {isDM && wallActive && <WallTypePanel />}

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
            gridSizePx={gridSizePx}
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

export default memo(BattleMapV2);
