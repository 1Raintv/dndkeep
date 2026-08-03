// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 4).
// See that file's header changelog for this code's full history.
// This is the heart of the battle map: token sprites, drag/drop with
// movement budget enforcement, pathfinding previews, HP bars, condition
// badges, concentration glyphs, death overlays, and drag-lock presence.

import { Assets, ColorMatrixFilter, Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef } from 'react';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import * as tokensApi from '../../../lib/api/tokensApiRouter';
import * as assetsApi from '../../../lib/api/battleMapAssets';
import { computeChebyshevFt, canMove, logMovement } from '../../../lib/movement';
import { segmentBlockedByWall } from '../../../lib/wallCollision';
import { snapToCellCenter, snapTokenAnchor } from '../../../lib/map/coords';
import { COND_COLOR_HEX, COND_ICON, tokenFootprintCells, tokenInitials, tokenRadiusForSize, type ContextMenuState } from './shared';

export function TokenLayer(props: {
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
  recordUndoable?: (action: import('../../../lib/hooks/useUndoRedo').UndoableAction) => void;
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

    // v2.637 perf (audit 6.2) — coalesce the LOCAL store write behind
    // requestAnimationFrame. pointermove fires at the mouse's polling
    // rate (240Hz+ on gaming mice), and every updatePos call shallow-
    // clones the whole tokens map and re-renders every whole-map
    // subscriber. The screen can only show one frame per ~16ms, so
    // writing more often than rAF is pure waste — this was the frame
    // drop while dragging tokens. The peer broadcast below was already
    // throttled (50ms); this applies the same idea locally. Pending
    // position is flushed synchronously on pointerup so the drop/
    // snap-animation logic never reads a stale store.
    let pendingDragPos: { id: string; x: number; y: number } | null = null;
    let dragPosRaf = 0;
    function flushDragPos() {
      dragPosRaf = 0;
      if (pendingDragPos) {
        updatePos(pendingDragPos.id, pendingDragPos.x, pendingDragPos.y);
        pendingDragPos = null;
      }
    }

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
      // rAF-coalesced store write (see flushDragPos above).
      pendingDragPos = { id: drag.id, x: newX, y: newY };
      if (!dragPosRaf) dragPosRaf = requestAnimationFrame(flushDragPos);

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
      // Flush any rAF-pending drag position synchronously so the
      // commit/snap logic below reads a current store (the animator
      // path uses store state as its animation start point).
      if (dragPosRaf) { cancelAnimationFrame(dragPosRaf); }
      flushDragPos();
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
      // v2.637 — drop any pending coalesced drag write; the store update
      // targets a token that may belong to a torn-down scene.
      if (dragPosRaf) { cancelAnimationFrame(dragPosRaf); dragPosRaf = 0; }
      pendingDragPos = null;
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
