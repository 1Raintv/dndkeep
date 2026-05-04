// v2.96.0 — Phase D of the Combat Backbone
//
// Fixed-position bottom strip showing initiative order during an active
// encounter. Current actor highlighted gold, past actors dimmed, upcoming
// actors normal. Hidden monsters are rendered as blank placeholders only
// for the DM (invisible to players — RLS-filtered out of the participants
// array for non-DMs).

import { useState } from 'react';
import { useCombat } from '../../context/CombatContext';
import { advanceTurn, endEncounter } from '../../lib/combatEncounter';
import { takeDash, takeDisengage } from '../../lib/movement';
import { removeCondition } from '../../lib/conditions';
import { removeBuff } from '../../lib/buffs';
import { CONDITION_MAP } from '../../data/conditions';
// v2.411.0 — DeclareAttackModal import removed. The ⚔ Attack button
// that mounted it was removed in this same ship.
// import DeclareAttackModal from './DeclareAttackModal';
import LegendaryActionPopover from './LegendaryActionPopover';
// v2.140.0 — Phase M pt 3: DM popover for Legendary Resistance
import LegendaryResistancePopover from './LegendaryResistancePopover';
import LegendaryActionConfigModal from './LegendaryActionConfigModal';
import LairActionPickerPopover from './LairActionPickerPopover';
import LairActionsConfigModal from './LairActionsConfigModal';
// v2.278.0 — toast for action-button failures (RLS, network, stale state).
// Without this, a click that hit an error was indistinguishable from a click
// that worked-but-rendered-late, since the realtime echo also drives the UI.
import { useToast } from '../shared/Toast';
import { useFastCombatRolls } from '../../lib/useFastCombatRolls';
// v2.385.0 — Click-on-tile pans the battle-map viewport to the
// participant's token (see store.requestPan). Conditions used to live
// here too; they've moved to the per-token quick panel where they're
// applied less often than damage/HP, which dominates combat UX.
import { useBattleMapStore } from '../../lib/stores/battleMapStore';
import { isCreatureParticipantType } from '../../lib/participantType';
import type { CombatParticipant } from '../../types';

interface Props {
  isDM: boolean;
}

const ACTOR_COLORS: Record<CombatParticipant['participant_type'], string> = {
  character: 'var(--c-gold-l)',
  // v2.363.0 — 'creature' is the v2.350-unified value; 'monster'/'npc'
  // kept for backward compat (any in-flight rows). All three render
  // with the same red since they're DM-controlled.
  creature: '#f87171',
  monster: '#f87171',
  npc: '#60a5fa',
};

export default function InitiativeStrip({ isDM }: Props) {
  const { encounter, participants, currentActor } = useCombat();
  // v2.278.0 — surface action-button failures to the user. Pre-2.278
  // every handler did `await fn(...)` and discarded the result, so an
  // RLS rejection / network error / stale state was completely silent.
  const { showToast } = useToast();
  // v2.416.0 — Shared preference, also read/written from
  // MonsterActionPanel. Hooked here so the in-strip checkbox can
  // toggle it during PC turns where MonsterActionPanel isn't shown.
  const [fastRolls, setFastRolls] = useFastCombatRolls();
  // v2.411.0 — showDeclare state removed alongside the Attack button.
  // const [showDeclare, setShowDeclare] = useState(false);
  // v2.385.0 — conditionPicker state removed. Tile click now pans the
  // map (via store.requestPan); conditions are applied from the
  // per-token quick panel.
  // v2.126.0 — Phase J pt 4: legendary action popover + config modal for DM
  const [laPopover, setLaPopover] = useState<{
    participant: CombatParticipant;
    anchor: { x: number; y: number };
  } | null>(null);
  const [laConfigFor, setLaConfigFor] = useState<CombatParticipant | null>(null);
  // v2.140.0 — Phase M pt 3: LR popover state, parallel to LA
  const [lrPopover, setLrPopover] = useState<{
    participant: CombatParticipant;
    anchor: { x: number; y: number };
  } | null>(null);
  // v2.127.0 — Phase J pt 5: lair action popover + config modal (encounter-scoped)
  const [lairPopoverAnchor, setLairPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [lairConfigOpen, setLairConfigOpen] = useState(false);
  // v2.285.0 — Round summary popover. Click the "Round N" badge to
  // open; shows one row per participant with chips for action /
  // bonus / reaction / movement / conditions, derived from the
  // already-loaded participants array (no new fetch). DM-only —
  // players don't have the same coordination need (they only see
  // their own turn).
  const [roundSummaryAnchor, setRoundSummaryAnchor] = useState<{ x: number; y: number } | null>(null);

  if (!encounter || encounter.status !== 'active') return null;

  // Order by turn_order, drop dead+stable
  const ordered = [...participants].sort((a, b) => a.turn_order - b.turn_order);
  const currentIdx = encounter.current_turn_index ?? 0;

  async function onEndTurn() {
    if (!encounter) return;
    const result = await advanceTurn(encounter.id);
    if (!result.ok) {
      showToast(`Couldn't end turn: ${result.reason}`, 'error');
    }
  }

  async function onEndCombat() {
    if (!encounter) return;
    if (!window.confirm('End combat?')) return;
    const result = await endEncounter(encounter.id);
    if (!result.ok) {
      showToast(`Couldn't end combat: ${result.reason}`, 'error');
    }
  }

  // v2.108.0 — Phase G: Dash + Disengage action buttons. Apply to the current
  // actor (either DM controlling them or the player whose character it is).
  async function onDash() {
    if (!encounter || !currentActor) return;
    if (currentActor.dash_used_this_turn) return;
    const result = await takeDash({
      campaignId: encounter.campaign_id,
      encounterId: encounter.id,
      participantId: currentActor.id,
      participantName: currentActor.name,
      participantType: currentActor.participant_type,
    });
    if (!result.ok) {
      showToast(`Couldn't Dash: ${result.reason}`, 'error');
    }
  }

  async function onDisengage() {
    if (!encounter || !currentActor) return;
    if (currentActor.disengaged_this_turn) return;
    const result = await takeDisengage({
      campaignId: encounter.campaign_id,
      encounterId: encounter.id,
      participantId: currentActor.id,
      participantName: currentActor.name,
      participantType: currentActor.participant_type,
    });
    if (!result.ok) {
      showToast(`Couldn't Disengage: ${result.reason}`, 'error');
    }
  }

  // v2.414.0 — onResetMovement handler removed from this strip. The
  // canonical Reset Movement button now lives in MonsterActionPanel
  // (near Dash/Disengage) per user request.

  return (
    <div
      className="initiative-strip"
      style={{
        position: 'fixed',
        // v2.360.0 — Constrain horizontally so the strip doesn't
        // overlap the left sidebar (where the version label lives)
        // or the bottom-right dice roller / dice log FAB. Pre-v2.360
        // was left:0, right:0 (full-bleed), which buried both.
        // Sidebar width: 220px expanded, 60px collapsed (CSS var).
        // Dice fab cluster: ~80px wide on the right edge.
        bottom: 0,
        left: 'var(--sidebar-w, 220px)',
        right: 80,
        padding: '8px 14px',
        background: 'rgba(19, 19, 29, 0.96)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--c-gold-bdr)',
        borderLeft: '1px solid var(--c-border)',
        borderRight: '1px solid var(--c-border)',
        borderTopLeftRadius: 'var(--r-md, 8px)',
        borderTopRightRadius: 'var(--r-md, 8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        {/* v2.285.0 — Round badge is clickable for the DM. Click
            opens a per-participant action-status popover anchored
            below the badge. Player-side stays a static span: the
            popover would only show their own status which they
            already see on their tile. */}
        {isDM ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setRoundSummaryAnchor({ x: rect.left, y: rect.top });
            }}
            title="Show per-participant action status for this round"
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--c-gold-l)',
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: 4,
              padding: '1px 4px',
              cursor: 'pointer',
              textAlign: 'left' as const,
              lineHeight: 1.3,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,160,23,0.10)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-gold-bdr)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
            }}
          >
            ⚔ Combat · Round {encounter.round_number}
          </button>
        ) : (
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--c-gold-l)',
          }}>
            ⚔ Combat · Round {encounter.round_number}
          </span>
        )}
        <span style={{
          fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
          color: 'var(--t-2)',
        }}>
          Now: <span style={{ color: 'var(--c-gold-l)' }}>{currentActor?.name ?? '—'}</span>
          {/* v2.107.0 — Phase G: remaining movement chip for the current actor. */}
          {currentActor && currentActor.max_speed_ft != null && (() => {
            const used = currentActor.movement_used_ft ?? 0;
            const max = currentActor.max_speed_ft;
            const remaining = Math.max(0, max - used);
            const pct = max > 0 ? used / max : 0;
            const color = pct >= 1 ? '#f87171' : pct >= 0.67 ? '#fbbf24' : '#60a5fa';
            return (
              <span
                title={`${used} / ${max} ft used this turn — ${remaining} ft remaining`}
                style={{
                  marginLeft: 8,
                  fontFamily: 'var(--ff-stat)',
                  fontSize: 10, fontWeight: 800,
                  padding: '1px 6px', borderRadius: 3,
                  color,
                  background: `${color}20`,
                  border: `1px solid ${color}40`,
                }}
              >
                {remaining}/{max} ft
              </span>
            );
          })()}
        </span>
        {/* v2.416.0 — Fast Combat Rolls toggle, moved here from
            MonsterActionPanel per user request: "should be a box that
            checks so if you want fast combat rolls" placed underneath
            the round/actor display. When ON, attack chains resolve
            instantly. When OFF (default), the d20 and damage dice
            animate before damage applies. Single source of truth
            via the useFastCombatRolls hook so MonsterActionPanel
            and any future surface read the same value. */}
        <label
          title="When on, attacks resolve instantly. When off (default), dice animate before damage applies."
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9, fontWeight: 700,
            color: 'var(--t-2)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer',
            userSelect: 'none' as const,
            marginTop: 1,
          }}
        >
          <input
            type="checkbox"
            checked={fastRolls}
            onChange={e => setFastRolls(e.target.checked)}
            style={{ accentColor: '#a78bfa', cursor: 'pointer', margin: 0 }}
          />
          Fast Combat Rolls
        </label>
      </div>

      {/* v2.414.0 — Reset Movement button moved back to MonsterActionPanel
          per user request. PCs use the strip-bottom-right cluster's
          End Turn / Dash / Disengage but not Reset; Reset for PC turns
          is reachable via the dice log / character sheet undo if
          needed. (TODO: a per-tile undo on the active PC's tile would
          be a cleaner path; deferred to a focused ship.) */}

      <div style={{
        display: 'flex', gap: 6, flex: 1,
        overflowX: 'auto', padding: '0 4px',
        scrollbarWidth: 'none',
      }}>
        {ordered.map((p, i) => {
          const isPast = i < currentIdx;
          const isCurrent = i === currentIdx;
          const color = ACTOR_COLORS[p.participant_type];
          const dimmed = isPast || p.is_dead || p.is_stable;
          // v2.112.0 — Phase H pt 3: visible conditions + overflow
          const conditions = p.active_conditions ?? [];
          const VISIBLE_CHIPS = 3;
          const visibleConds = conditions.slice(0, VISIBLE_CHIPS);
          const overflowCount = conditions.length - visibleConds.length;

          // v2.114.0 — Phase H pt 5: active buffs chip row (Bless, Hunter's
          // Mark, Hex, Divine Favor, Absorb Elements rider).
          const buffs = p.active_buffs ?? [];
          const visibleBuffs = buffs.slice(0, VISIBLE_CHIPS);
          const buffOverflow = buffs.length - visibleBuffs.length;

          // v2.385.0 — Click pans the battle-map viewport to this
          // participant's token. Conditions previously lived behind
          // this click; they've moved entirely to NpcTokenQuickPanel
          // since (per user feedback) damage/HP changes dominate
          // combat far more than condition application.
          //
          // Linkage: combat_participants.entity_id holds the
          // character_id (for PCs) or homebrew_monster_id (for
          // creatures). scene_tokens stores both characterId and
          // creatureId. We match on participant_type to avoid
          // cross-contamination.
          //
          // No-token-on-scene case: silently no-op. The toast plumbing
          // isn't trivial from this scope and the visual feedback
          // (camera doesn't move) is acceptable. The DM will either
          // place a token or click a different tile.
          function handleTileClick() {
            const tokens = useBattleMapStore.getState().tokens;
            const sceneId = useBattleMapStore.getState().currentSceneId;
            // sceneId may be null if the DM hasn't opened the map
            // tab yet — match against any-scene tokens in that case
            // (the dashboard will switch tabs and BattleMapV2 will
            // pull the request out of the store on mount).
            const isCreature = isCreatureParticipantType(p.participant_type);
            const target = Object.values(tokens).find(t => {
              if (sceneId && t.sceneId !== sceneId) return false;
              if (p.participant_type === 'character') return t.characterId === p.entity_id;
              if (isCreature) return t.creatureId === p.entity_id;
              return false;
            });
            if (!target) return;
            useBattleMapStore.getState().requestPan(target.x, target.y);
          }

          async function handleRemoveCondition(e: React.MouseEvent, name: string) {
            e.stopPropagation();  // don't trigger tile click
            if (!isDM || !encounter) return;
            await removeCondition({
              participantId: p.id,
              conditionName: name,
              campaignId: encounter.campaign_id,
              encounterId: encounter.id,
            });
          }

          async function handleRemoveBuff(e: React.MouseEvent, key: string) {
            e.stopPropagation();
            if (!isDM || !encounter) return;
            await removeBuff({
              participantId: p.id,
              key,
              reason: 'manual',
              campaignId: encounter.campaign_id,
              encounterId: encounter.id,
            });
          }

          return (
            <div
              key={p.id}
              onClick={handleTileClick}
              title={isDM
                ? `${p.name} · init ${p.initiative ?? '—'}${p.is_dead ? ' · DEAD' : p.is_stable ? ' · Stable' : ''} · click to focus on map`
                : `${p.name} · init ${p.initiative ?? '—'}${p.is_dead ? ' · DEAD' : p.is_stable ? ' · Stable' : ''}`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, padding: '4px 10px',
                borderRadius: 6,
                border: isCurrent ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                background: isCurrent ? 'var(--c-gold-bg)' : '#0d1117',
                opacity: dimmed ? 0.45 : 1,
                minWidth: 72, flexShrink: 0,
                position: 'relative',
                cursor: isDM ? 'pointer' : 'default',
              }}
            >
              <span style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                color: isCurrent ? 'var(--c-gold-l)' : color,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap', maxWidth: 96,
                overflow: 'hidden', textOverflow: 'ellipsis',
                // v2.391.0 — Strikethrough on dead participants. The
                // map already gets a red X + strikethrough; mirror in
                // the initiative tile so the cue is consistent
                // wherever the DM looks. Kept in addition to the 💀
                // glyph at top-right so death reads at a glance.
                textDecoration: p.is_dead ? 'line-through' : 'none',
                textDecorationColor: p.is_dead ? '#f87171' : undefined,
                textDecorationThickness: p.is_dead ? 2 : undefined,
              }}>
                {p.name}
              </span>
              <span style={{
                fontFamily: 'var(--ff-stat)', fontSize: 12, fontWeight: 900,
                color: isCurrent ? 'var(--c-gold-l)' : 'var(--t-2)',
              }}>
                {p.initiative ?? '—'}
              </span>
              {/* v2.410.0 — Per-tile HP bar. User feedback: the strip
                  should show health "where the attack in turn in combat
                  buttons are" — i.e., right on the initiative tiles
                  themselves so the DM can scan everyone's status from
                  one row. Hidden for PCs from non-DM eyes (player HP
                  privacy is configurable elsewhere; if this becomes a
                  concern we can gate the bar on isDM || !is_pc). HP
                  reads from p.current_hp / p.max_hp, the joined-from-
                  combatants virtual fields. After v2.410 these refresh
                  on combatants UPDATE so the bar tracks damage in real
                  time. */}
              {(() => {
                const cur = (p as any).current_hp ?? null;
                const max = (p as any).max_hp ?? null;
                if (cur == null || max == null || max <= 0) return null;
                const pct = Math.max(0, Math.min(1, cur / max));
                const color = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : pct > 0 ? '#f87171' : '#6b7280';
                return (
                  <div style={{ width: '100%', maxWidth: 80, marginTop: 2 }}>
                    <div style={{
                      height: 4,
                      background: 'rgba(15,16,18,0.85)',
                      border: '1px solid var(--c-border)',
                      borderRadius: 2,
                      overflow: 'hidden' as const,
                    }}>
                      <div style={{
                        width: `${pct * 100}%`, height: '100%',
                        background: color, transition: 'width 0.2s, background 0.2s',
                      }} />
                    </div>
                    <div style={{
                      fontSize: 8, color: 'var(--t-3)', textAlign: 'center' as const,
                      fontFamily: 'var(--ff-stat)', marginTop: 1, fontWeight: 700,
                    }}>
                      {cur}/{max}
                    </div>
                  </div>
                );
              })()}
              {/* v2.112.0 — Phase H pt 3: condition chip row */}
              {conditions.length > 0 && (
                <div style={{
                  display: 'flex', gap: 2, marginTop: 2,
                  justifyContent: 'center', flexWrap: 'wrap', maxWidth: 100,
                }}>
                  {visibleConds.map(cond => {
                    const meta = CONDITION_MAP[cond];
                    const chipColor = meta?.color ?? '#64748b';
                    // v2.122.0 — Phase I polish: show exhaustion level as a
                    // superscript digit on the chip so DMs can tell which
                    // level the character is at without hovering.
                    const isExhaustion = cond === 'Exhaustion';
                    const exhaustionLvl = (p.exhaustion_level as number | undefined) ?? 0;
                    const chipText = isExhaustion && exhaustionLvl > 0
                      ? `EXH${exhaustionLvl}`
                      : cond.slice(0, 4);
                    const chipTitle = isExhaustion
                      ? `Exhaustion ${exhaustionLvl} — −${2 * exhaustionLvl} to d20 rolls, −${5 * exhaustionLvl} ft speed${isDM ? ' (click to remove; click tile for +/−)' : ''}`
                      : `${cond}${meta?.description ? ' — ' + meta.description : ''}${isDM ? ' (click to remove)' : ''}`;
                    return (
                      <span
                        key={cond}
                        onClick={isDM ? (e => handleRemoveCondition(e, cond)) : undefined}
                        title={chipTitle}
                        style={{
                          fontSize: 8, fontWeight: 800,
                          padding: '1px 4px', borderRadius: 2,
                          background: `${chipColor}35`,
                          color: chipColor,
                          border: `1px solid ${chipColor}70`,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                          cursor: isDM ? 'pointer' : 'default',
                          lineHeight: 1.2,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {chipText}
                      </span>
                    );
                  })}
                  {overflowCount > 0 && (
                    <span
                      title={conditions.slice(VISIBLE_CHIPS).join(', ')}
                      style={{
                        fontSize: 8, fontWeight: 800,
                        padding: '1px 4px', borderRadius: 2,
                        background: 'rgba(148,163,184,0.25)',
                        color: '#94a3b8',
                        border: '1px solid rgba(148,163,184,0.4)',
                        lineHeight: 1.2,
                      }}
                    >
                      +{overflowCount}
                    </span>
                  )}
                </div>
              )}
              {/* v2.114.0 — Phase H pt 5: buff chip row — gold scheme */}
              {buffs.length > 0 && (
                <div style={{
                  display: 'flex', gap: 2, marginTop: 2,
                  justifyContent: 'center', flexWrap: 'wrap', maxWidth: 100,
                }}>
                  {visibleBuffs.map(b => (
                    <span
                      key={b.key}
                      onClick={isDM ? (e => handleRemoveBuff(e, b.key)) : undefined}
                      title={`${b.name}${b.source ? ' — ' + b.source : ''}${isDM ? ' (click to remove)' : ''}`}
                      style={{
                        fontSize: 8, fontWeight: 800,
                        padding: '1px 4px', borderRadius: 2,
                        background: 'rgba(250,204,21,0.25)',
                        color: '#facc15',
                        border: '1px solid rgba(250,204,21,0.55)',
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                        cursor: isDM ? 'pointer' : 'default',
                        lineHeight: 1.2, whiteSpace: 'nowrap',
                      }}
                    >
                      ✦{b.name.slice(0, 4)}
                    </span>
                  ))}
                  {buffOverflow > 0 && (
                    <span
                      title={buffs.slice(VISIBLE_CHIPS).map(b => b.name).join(', ')}
                      style={{
                        fontSize: 8, fontWeight: 800,
                        padding: '1px 4px', borderRadius: 2,
                        background: 'rgba(250,204,21,0.18)',
                        color: '#facc15',
                        border: '1px solid rgba(250,204,21,0.35)',
                        lineHeight: 1.2,
                      }}
                    >
                      +{buffOverflow}
                    </span>
                  )}
                </div>
              )}
              {/* v2.126.0 — Phase J pt 4: legendary actions chip. DM-only.
                  Visible when the participant has a configured LA pool. Click
                  opens LegendaryActionPopover anchored at the chip's
                  bottom-left. */}
              {isDM && (p.legendary_actions_total ?? 0) > 0 && (() => {
                const laRem = p.legendary_actions_remaining ?? 0;
                const laTot = p.legendary_actions_total ?? 0;
                const hasPoints = laRem > 0;
                return (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();   // don't open condition picker
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setLaPopover({ participant: p, anchor: { x: rect.left, y: rect.bottom } });
                    }}
                    title={`Legendary Actions: ${laRem}/${laTot} remaining (click to spend)`}
                    style={{
                      marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 2,
                      fontSize: 9, fontWeight: 800,
                      padding: '1px 5px', borderRadius: 3,
                      background: hasPoints ? 'rgba(245,158,11,0.22)' : 'rgba(245,158,11,0.08)',
                      color: hasPoints ? '#f59e0b' : 'rgba(245,158,11,0.55)',
                      border: `1px solid ${hasPoints ? '#f59e0b80' : 'rgba(245,158,11,0.35)'}`,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      cursor: 'pointer', lineHeight: 1.2, whiteSpace: 'nowrap',
                      alignSelf: 'center',
                    }}
                  >
                    🐉 LA {laRem}/{laTot}
                  </span>
                );
              })()}
              {/* v2.140.0 — Phase M pt 3: Legendary Resistance chip. DM-only.
                  Visible when the participant has LR charges (seeded from the
                  monster stat block at encounter start). Click opens
                  LegendaryResistancePopover for manual Spend/Reset. Save-driven
                  LR uses go through LegendaryResistancePromptModal (v2.139)
                  and don't route through this chip. */}
              {isDM && (p.legendary_resistance ?? 0) > 0 && (() => {
                const lrTot = p.legendary_resistance ?? 0;
                const lrUsed = p.legendary_resistance_used ?? 0;
                const lrRem = Math.max(0, lrTot - lrUsed);
                const hasCharges = lrRem > 0;
                // Use a distinct gold tone from the amber LA chip so the two
                // chips are visually independent at a glance.
                return (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setLrPopover({ participant: p, anchor: { x: rect.left, y: rect.bottom } });
                    }}
                    title={`Legendary Resistance: ${lrRem}/${lrTot} remaining (click for options)`}
                    style={{
                      marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 2,
                      fontSize: 9, fontWeight: 800,
                      padding: '1px 5px', borderRadius: 3,
                      background: hasCharges ? 'rgba(212,160,23,0.22)' : 'rgba(212,160,23,0.08)',
                      color: hasCharges ? 'var(--c-gold-l)' : 'rgba(212,160,23,0.5)',
                      border: `1px solid ${hasCharges ? 'var(--c-gold-bdr)' : 'rgba(212,160,23,0.35)'}`,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      cursor: 'pointer', lineHeight: 1.2, whiteSpace: 'nowrap',
                      alignSelf: 'center',
                    }}
                  >
                    🛡 LR {lrRem}/{lrTot}
                  </span>
                );
              })()}
              {p.is_dead && (
                <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9, color: '#f87171' }}>💀</span>
              )}
              {p.hidden_from_players && isDM && (
                <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9 }} title="Hidden from players">👁️</span>
              )}
              {/* v2.126.0 — Phase J pt 4: DM-only "🐉+" affordance to
                  bootstrap LA config on creatures that don't have any yet.
                  Only shown for non-character tiles without configured LAs. */}
              {isDM && p.participant_type !== 'character' && (p.legendary_actions_total ?? 0) === 0 && (
                <span
                  onClick={(e) => { e.stopPropagation(); setLaConfigFor(p); }}
                  title="Add legendary actions"
                  style={{
                    position: 'absolute', bottom: 2, right: 4,
                    fontSize: 9, fontWeight: 800,
                    padding: '1px 4px', borderRadius: 3,
                    background: 'transparent', color: 'rgba(245,158,11,0.45)',
                    border: '1px dashed rgba(245,158,11,0.35)',
                    cursor: 'pointer', lineHeight: 1.2, opacity: 0.7,
                  }}
                >
                  🐉+
                </span>
              )}
            </div>
          );
        })}
      </div>

      {isDM && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {/* v2.127.0 — Phase J pt 5: Lair action button. Shown when the
              encounter is flagged in_lair AND at least one action is
              configured. When already used this round, button is dimmed and
              its label switches to "Lair ✓". A dashed "🏛+" placeholder is
              shown instead when NOT in_lair so the DM can discover the
              feature + configure it. */}
          {(encounter.in_lair && (encounter.lair_actions_config ?? []).length > 0) ? (
            <button
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setLairPopoverAnchor({ x: rect.left, y: rect.top });
              }}
              title={encounter.lair_action_used_this_round
                ? 'Lair action already used this round (resets next round)'
                : 'Pick a lair action (1 per round, initiative 20 RAW)'}
              style={{
                fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                padding: '6px 10px', borderRadius: 6,
                border: '1px solid rgba(167,139,250,0.6)',
                background: encounter.lair_action_used_this_round
                  ? 'rgba(167,139,250,0.08)'
                  : 'rgba(167,139,250,0.2)',
                color: encounter.lair_action_used_this_round
                  ? 'rgba(167,139,250,0.55)'
                  : '#a78bfa',
                cursor: 'pointer',
                minHeight: 0,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}
            >
              {encounter.lair_action_used_this_round ? '🏛 Used' : '🏛 Lair'}
            </button>
          ) : (
            <button
              onClick={() => setLairConfigOpen(true)}
              title="Configure lair actions for this encounter"
              style={{
                fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                padding: '6px 10px', borderRadius: 6,
                border: '1px dashed rgba(167,139,250,0.35)',
                background: 'transparent',
                color: 'rgba(167,139,250,0.55)',
                cursor: 'pointer', minHeight: 0,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}
            >
              🏛+ Lair
            </button>
          )}
          {/* v2.108.0 — Phase G: Dash + Disengage action buttons. Show "ON"
              state when already used this turn; click does nothing in that
              state. Dash doubles remaining movement; Disengage suppresses
              future OA offers. */}
          <button
            onClick={onDash}
            disabled={!currentActor || currentActor.dash_used_this_turn}
            title={currentActor?.dash_used_this_turn
              ? 'Already dashed this turn'
              : `Dash: double ${currentActor?.name ?? ''}'s movement this turn`}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              padding: '6px 10px', borderRadius: 6,
              border: currentActor?.dash_used_this_turn
                ? '1px solid rgba(96,165,250,0.8)'
                : '1px solid var(--c-border)',
              background: currentActor?.dash_used_this_turn
                ? 'rgba(96,165,250,0.2)'
                : 'transparent',
              color: currentActor?.dash_used_this_turn ? '#60a5fa' : 'var(--t-2)',
              cursor: currentActor?.dash_used_this_turn ? 'default' : 'pointer',
              minHeight: 0,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              opacity: currentActor ? 1 : 0.4,
            }}
          >
            {currentActor?.dash_used_this_turn ? 'Dashed' : 'Dash'}
          </button>
          <button
            onClick={onDisengage}
            disabled={!currentActor || currentActor.disengaged_this_turn}
            title={currentActor?.disengaged_this_turn
              ? 'Already disengaged this turn — no OA offers'
              : `Disengage: suppress Opportunity Attacks from ${currentActor?.name ?? ''}'s remaining movement`}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              padding: '6px 10px', borderRadius: 6,
              border: currentActor?.disengaged_this_turn
                ? '1px solid rgba(167,139,250,0.8)'
                : '1px solid var(--c-border)',
              background: currentActor?.disengaged_this_turn
                ? 'rgba(167,139,250,0.2)'
                : 'transparent',
              color: currentActor?.disengaged_this_turn ? '#a78bfa' : 'var(--t-2)',
              cursor: currentActor?.disengaged_this_turn ? 'default' : 'pointer',
              minHeight: 0,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              opacity: currentActor ? 1 : 0.4,
            }}
          >
            {currentActor?.disengaged_this_turn ? 'Disengaged' : 'Disengage'}
          </button>
          {/* v2.413.0 — Reset Movement button moved out of this
              right-side cluster (was occluded by MonsterActionPanel)
              into the leftmost section of the strip, alongside the
              round badge. See above. */}
          {/* v2.411.0 — ⚔ Attack button removed. The DeclareAttackModal
              flow it opened was non-functional in the post-v2.402
              auto-resolve combat path (creature attacks resolve
              end-to-end via MonsterActionPanel, and PC attacks go
              through PlayerAttackButton on the character sheet).
              Removing the orphaned button + its modal mount + state. */}
          <button
            onClick={onEndTurn}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid var(--c-gold-bdr)',
              background: 'var(--c-gold-bg)',
              color: 'var(--c-gold-l)',
              cursor: 'pointer', minHeight: 0,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            End Turn
          </button>
          <button
            onClick={onEndCombat}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--c-border)',
              background: 'transparent',
              color: '#f87171',
              cursor: 'pointer', minHeight: 0,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            End Combat
          </button>
        </div>
      )}
      {/* v2.411.0 — DeclareAttackModal mount removed alongside the
          ⚔ Attack button above. */}
      {/* v2.126.0 — Phase J pt 4: legendary action popover (spend) */}
      {laPopover && encounter && (
        <LegendaryActionPopover
          participant={laPopover.participant}
          campaignId={encounter.campaign_id}
          encounterId={encounter.id}
          anchor={laPopover.anchor}
          onClose={() => setLaPopover(null)}
        />
      )}
      {/* v2.140.0 — Phase M pt 3: legendary resistance popover (Spend/Reset) */}
      {lrPopover && encounter && (
        <LegendaryResistancePopover
          participant={lrPopover.participant}
          campaignId={encounter.campaign_id}
          encounterId={encounter.id}
          anchor={lrPopover.anchor}
          onClose={() => setLrPopover(null)}
        />
      )}
      {/* v2.126.0 — Phase J pt 4: legendary action config modal. Opened
          directly from the 🐉+ affordance on un-configured tiles, or
          indirectly from the ⚙ Configure button inside LegendaryActionPopover
          (which manages its own state and doesn't need to be rendered here). */}
      {laConfigFor && (
        <LegendaryActionConfigModal
          participant={laConfigFor}
          onClose={() => setLaConfigFor(null)}
        />
      )}
      {/* v2.127.0 — Phase J pt 5: lair action picker popover */}
      {lairPopoverAnchor && encounter && (
        <LairActionPickerPopover
          encounter={encounter}
          anchor={lairPopoverAnchor}
          onClose={() => setLairPopoverAnchor(null)}
          onConfigure={() => {
            setLairPopoverAnchor(null);
            setLairConfigOpen(true);
          }}
        />
      )}
      {/* v2.127.0 — Phase J pt 5: lair actions config modal */}
      {lairConfigOpen && encounter && (
        <LairActionsConfigModal
          encounter={encounter}
          onClose={() => setLairConfigOpen(false)}
        />
      )}
      {/* v2.285.0 — Round summary popover. Renders above the strip
          when the DM clicks the Round badge. Pure derivation from
          the loaded participants array; no fetch. Closes on outside
          click via the invisible backdrop layer. */}
      {roundSummaryAnchor && (() => {
        // Position the popover ABOVE the badge: badge is in the
        // strip at bottom:0, so popover anchored to the badge top
        // grows upward via a bottom-relative position.
        const POPOVER_W = 360;
        const POPOVER_MAX_H = 320;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const left = Math.min(Math.max(8, roundSummaryAnchor.x), vw - POPOVER_W - 8);
        // The strip is at bottom:0; we position the popover above
        // it with a bottom offset that clears the strip's height
        // (~64px) plus a small gap.
        return (
          <>
            <div
              onClick={() => setRoundSummaryAnchor(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 29000, background: 'transparent' }}
            />
            <div
              style={{
                position: 'fixed', left, bottom: 76,
                zIndex: 29100,
                width: POPOVER_W, maxHeight: POPOVER_MAX_H,
                overflowY: 'auto' as const,
                background: 'var(--c-card)',
                border: '1px solid var(--c-gold-bdr)',
                borderRadius: 10,
                boxShadow: '0 -10px 28px rgba(0,0,0,0.6)',
                padding: '10px 12px',
                animation: 'modalIn 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
                letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                color: 'var(--c-gold-l)',
                marginBottom: 8,
              }}>
                Round {encounter.round_number} · Action Status
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                {ordered.map(p => {
                  const used = (used: boolean, label: string, color: string) => (
                    <span
                      title={label + (used ? ' — used' : ' — available')}
                      style={{
                        fontFamily: 'var(--ff-stat)', fontSize: 9, fontWeight: 800,
                        padding: '1px 5px', borderRadius: 3,
                        background: used ? `${color}33` : 'transparent',
                        color: used ? color : 'var(--t-3)',
                        border: `1px solid ${used ? color + '80' : 'var(--c-border)'}`,
                        letterSpacing: '0.02em',
                        opacity: used ? 1 : 0.45,
                      }}
                    >{label}</span>
                  );
                  const moveUsed = (p.movement_used_ft ?? 0) > 0;
                  const isCurrent = currentActor?.id === p.id;
                  // ACTOR_COLORS is defined at the top of this file
                  // (character/monster/npc → hex). Falls back to the
                  // generic body text color if a participant slips
                  // through with an unrecognized type.
                  const typeColor = ACTOR_COLORS[p.participant_type] ?? 'var(--t-2)';
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 6px',
                        background: isCurrent ? 'rgba(212,160,23,0.12)' : 'rgba(15,16,18,0.5)',
                        border: `1px solid ${isCurrent ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
                        borderRadius: 4,
                        opacity: p.is_dead ? 0.5 : 1,
                      }}
                    >
                      <div style={{
                        fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                        color: typeColor,
                        whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {isCurrent && <span style={{ marginRight: 4 }}>▶</span>}
                        {p.name}
                        {p.is_dead && <span style={{ marginLeft: 6, color: '#f87171', fontSize: 9 }}>✝</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {used(p.action_used, 'A', '#f87171')}
                        {used(p.bonus_used, 'B', '#fbbf24')}
                        {used(p.reaction_used, 'R', '#60a5fa')}
                        {used(moveUsed, 'M', '#34d399')}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{
                marginTop: 8, paddingTop: 8,
                borderTop: '1px solid var(--c-border)',
                fontSize: 9, color: 'var(--t-3)',
                fontFamily: 'var(--ff-body)',
                letterSpacing: '0.04em',
              }}>
                A action · B bonus · R reaction · M movement
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
