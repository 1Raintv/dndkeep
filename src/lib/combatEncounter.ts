// v2.96.0 — Phase D of the Combat Backbone
//
// Encounter lifecycle helpers:
//  - startEncounter: create encounter, seed participants from map tokens, auto or prompt initiative
//  - rollInitiative: roll for a specific participant
//  - advanceTurn: end current turn, move to next non-dead participant, increment round if wrapped
//  - endEncounter: mark ended
//  - revealMonster: unhide a monster, roll initiative if configured
//
// All helpers emit structured combat_events via emitCombatEvent for the log.

import { supabase } from './supabase';
import { emitCombatEvent, emitCombatEventChain, newChainId } from './combatEvents';
import type {
  CombatEncounter,
  CombatParticipant,
  Character,
  MonsterData,
} from '../types';
import { abilityModifier } from './gameUtils';
// v2.315: HP/conditions/death-save reads come from combatants via JOIN.
// See src/lib/combatParticipantNormalize.ts.
import {
  JOINED_COMBATANT_FIELDS,
  normalizeParticipantRow,
} from './combatParticipantNormalize';

// ─── d20 ─────────────────────────────────────────────────────────
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

// ─── Initiative computation ──────────────────────────────────────

/** 2024 initiative: d20 + DEX mod (+ proficiency if rogue/etc, covered later). */
export function rollInitiativeFor(dexMod: number, bonus = 0): {
  d20: number; total: number;
} {
  const d20 = rollD20();
  return { d20, total: d20 + dexMod + bonus };
}

// ─── Seed participants from campaign sources ─────────────────────

export interface SeedSource {
  type: 'character' | 'monster' | 'npc';
  entityId: string;
  name: string;
  ac: number | null;
  hp: number | null;
  maxHp: number | null;
  dexMod: number;
  initiativeBonus: number;
  hiddenFromPlayers?: boolean;
  /** v2.107.0 — Phase G: max walking speed in feet. */
  maxSpeedFt?: number;
  /** v2.138.0 — Phase M pt 1: legendary resistance uses per day. Only
   *  populated for monster seeds whose stat block has LR (e.g. dragons,
   *  Lich, Tarrasque). Character/NPC seeds leave this undefined. */
  legendaryResistance?: number;
  /** v2.285.0 — legendary actions per round. SRD standard is 3 for
   *  every creature whose stat block carries an LA list (dragons,
   *  liches, vampires, etc.); variants like Tiamat (5) the DM can
   *  override after start via the existing LegendaryActionConfigModal.
   *  Undefined for creatures with no LA at all. */
  legendaryActionsTotal?: number;
  /** v2.285.0 — the LA option list itself (Detect, Tail Attack, Wing
   *  Attack, etc.) carried into combat_participants.legendary_actions_config
   *  so the DM popover can render them without re-querying the
   *  bestiary. Mirrors the MonsterData.legendary_actions shape. */
  legendaryActionsConfig?: import('../types').MonsterLegendaryAction[];
}

export function characterToSeed(c: Character): SeedSource {
  return {
    type: 'character',
    entityId: c.id,
    name: c.name,
    ac: c.armor_class ?? null,
    hp: c.current_hp ?? null,
    maxHp: c.max_hp ?? null,
    dexMod: abilityModifier(c.dexterity ?? 10),
    initiativeBonus: (c as any).initiative_bonus ?? 0,
    hiddenFromPlayers: false,
    maxSpeedFt: (c as any).speed ?? 30,
  };
}

// v2.175.0 — Phase Q.0 pt 16: seed an NPC row as a combat participant.
// The dm_npc_roster (called `npcs` in the DB) already carries HP, AC,
// ability scores, speed, etc. — everything startEncounter needs. This
// helper lets DMs add named recurring allies/enemies directly from
// the NPC manager into ongoing combat without re-entering stats.
export function npcToSeed(n: {
  id: string; name: string; ac?: number; hp?: number; max_hp?: number;
  dex?: number; speed?: number;
}, hiddenFromPlayers = false): SeedSource {
  return {
    type: 'npc',
    entityId: n.id,
    name: n.name,
    ac: n.ac ?? null,
    hp: n.hp ?? n.max_hp ?? null,
    maxHp: n.max_hp ?? null,
    dexMod: abilityModifier(n.dex ?? 10),
    initiativeBonus: 0,
    hiddenFromPlayers,
    maxSpeedFt: n.speed ?? 30,
  };
}

// v2.175.0 — Phase Q.0 pt 16: add a single seed to an already-running
// encounter. Used for late arrivals — e.g. DM sends in reinforcements
// three rounds into combat — where startEncounter is the wrong tool
// (it creates a new encounter row). Rolls initiative only if the
// encounter is in auto_all mode; otherwise the participant sits with
// null initiative until the DM rolls manually. Turn order is
// recomputed after insert so the new participant slots in correctly.
export async function addParticipantToEncounter(
  encounterId: string,
  campaignId: string,
  seed: SeedSource,
  initiativeMode: 'auto_all' | 'player_agency' = 'auto_all',
): Promise<CombatParticipant | null> {
  const shouldAutoRoll =
    initiativeMode === 'auto_all' ||
    seed.type !== 'character'; // NPCs and monsters always auto-roll

  const shouldRollHidden = seed.hiddenFromPlayers ? false : true;

  let initiative: number | null = null;
  if (shouldAutoRoll && shouldRollHidden) {
    initiative = rollInitiativeFor(seed.dexMod, seed.initiativeBonus).total;
  }

  const row = {
    encounter_id: encounterId,
    campaign_id: campaignId,
    participant_type: seed.type,
    entity_id: seed.entityId,
    name: seed.name,
    initiative,
    initiative_tiebreaker: seed.dexMod,
    turn_order: 999, // placeholder — recomputed below
    ac: seed.ac,
    current_hp: seed.hp,
    max_hp: seed.maxHp,
    hidden_from_players: seed.hiddenFromPlayers ?? false,
    max_speed_ft: seed.maxSpeedFt ?? 30,
    legendary_resistance: seed.legendaryResistance ?? null,
    legendary_resistance_used: (seed.legendaryResistance ?? 0) > 0 ? 0 : null,
    // v2.285.0 — same explicit-defaults LA seeding as startEncounter
    // (see comment there for the rationale on writing zero/empty
    // explicitly vs conditional spread). Non-LA seeds get 0/0/[]
    // matching the DB defaults; LA seeds get 3/3/<list>.
    legendary_actions_total: seed.legendaryActionsTotal ?? 0,
    legendary_actions_remaining: seed.legendaryActionsTotal ?? 0,
    // Cast required because MonsterLegendaryAction is a structural
    // interface without an index signature, but Supabase's generated
    // Json type insists on `{ [key: string]: Json | undefined }`. The
    // runtime payload is plain JSON-serializable data (string fields
    // + optional numeric `cost`), so the cast is sound. Same pattern
    // mirrored in startEncounter at the equivalent insert.
    legendary_actions_config: (seed.legendaryActionsConfig ?? []) as unknown as import('../types/supabase').Json,
  };

  const { data, error } = await supabase
    .from('combat_participants')
    .insert([row])
    .select()
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[addParticipantToEncounter] insert failed:', error?.message);
    return null;
  }

  // Recompute turn_order so the new participant sorts into the correct
  // position by initiative. Without this, the placeholder 999 would
  // push them to the end of the strip regardless of their roll.
  await recomputeTurnOrder(encounterId);

  return data as CombatParticipant;
}

export function monsterToSeed(m: MonsterData, hiddenFromPlayers = false): SeedSource {
  // v2.285.0 — auto-import legendary actions. The bestiary stores the
  // LA option list (Detect, Tail Attack, Wing Attack, ...) but no
  // per-round count field — it's flavor text in 5e SRD. The 2014
  // standard for every LA-bearing creature with a published count is
  // 3, with rare exceptions (Tiamat 5, some homebrew bosses 1-2). We
  // default to 3 when the option list is non-empty; the DM overrides
  // via the existing LegendaryActionConfigModal if the creature uses
  // a different budget. Pre-2.285 the participant row was created
  // with legendary_actions_total = null, so the LA chip never
  // appeared and the v2.126 ⚙ Configure popover required manual
  // bootstrap on every dragon — bad UX.
  const laList = m.legendary_actions ?? [];
  const hasLa = laList.length > 0;
  return {
    type: 'monster',
    entityId: m.id,
    name: m.name,
    ac: m.ac ?? null,
    hp: m.hp ?? null,
    maxHp: m.hp ?? null,
    dexMod: abilityModifier(m.dex ?? 10),
    initiativeBonus: 0,
    hiddenFromPlayers,
    maxSpeedFt: (m as any).speed ?? 30,
    // v2.138.0 — Phase M pt 1: carry LR from the bestiary into combat.
    // Backfilled for all SRD 2014 LR-bearing creatures via
    // phase_m_lr_backfill migration. Null/0 for creatures without LR.
    legendaryResistance: m.legendary_resistance_count ?? undefined,
    legendaryActionsTotal: hasLa ? 3 : undefined,
    legendaryActionsConfig: hasLa ? laList : undefined,
  };
}

// ─── startEncounter ──────────────────────────────────────────────

export interface StartEncounterOptions {
  campaignId: string;
  name?: string;
  initiativeMode: 'auto_all' | 'player_agency';
  hiddenMonsterRevealMode?: 'roll_at_reveal' | 'roll_at_start';
  seeds: SeedSource[];
  dmUserName?: string;      // for event actor_name
}

export interface StartEncounterResult {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
}

export async function startEncounter(opts: StartEncounterOptions): Promise<StartEncounterResult | null> {
  // 1. Create encounter row
  const { data: encData, error: encErr } = await supabase
    .from('combat_encounters')
    .insert({
      campaign_id: opts.campaignId,
      name: opts.name ?? 'Encounter',
      status: 'active',
      round_number: 1,
      current_turn_index: 0,
      initiative_mode: opts.initiativeMode,
      hidden_monster_reveal_mode: opts.hiddenMonsterRevealMode ?? 'roll_at_reveal',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (encErr || !encData) {
    // eslint-disable-next-line no-console
    console.error('[startEncounter] insert failed:', encErr?.message);
    return null;
  }
  const encounter = encData as CombatEncounter;

  // 2. Seed participants. Auto-roll initiative for all if auto_all; otherwise only
  //    NPCs/monsters get auto-rolled and player characters stay null until they
  //    explicitly roll (player_agency mode).
  const rows = opts.seeds.map(s => {
    const shouldAutoRoll =
      opts.initiativeMode === 'auto_all' ||
      s.type !== 'character';

    // Hidden monsters: in roll_at_reveal mode, stay null; in roll_at_start, roll
    const shouldRollHidden = s.hiddenFromPlayers
      ? (opts.hiddenMonsterRevealMode ?? 'roll_at_reveal') === 'roll_at_start'
      : true;

    let initiative: number | null = null;
    if (shouldAutoRoll && shouldRollHidden) {
      initiative = rollInitiativeFor(s.dexMod, s.initiativeBonus).total;
    }

    return {
      encounter_id: encounter.id,
      campaign_id: opts.campaignId,
      participant_type: s.type,
      entity_id: s.entityId,
      name: s.name,
      initiative,
      initiative_tiebreaker: s.dexMod,
      turn_order: 0,  // computed after all rolls settle
      ac: s.ac,
      current_hp: s.hp,
      max_hp: s.maxHp,
      hidden_from_players: s.hiddenFromPlayers ?? false,
      max_speed_ft: s.maxSpeedFt ?? 30,
      // v2.138.0 — Phase M pt 1: seed LR from the monster stat block so
      // v2.139's failed-save prompt and v2.140's initiative-strip badge
      // have data to render. Characters/NPCs leave `legendaryResistance`
      // undefined → both fields stay null.
      legendary_resistance: s.legendaryResistance ?? null,
      legendary_resistance_used:
        (s.legendaryResistance ?? 0) > 0 ? 0 : null,
      // v2.285.0 — auto-seed LA from the bestiary. monsterToSeed sets
      // legendaryActionsTotal=3 + legendaryActionsConfig=<list> when
      // the stat block has any legendary actions; non-LA seeds leave
      // both undefined and we fall back to the DB defaults' shape
      // (0, 0, []). Writing the defaults explicitly rather than
      // conditional-spreading because TS narrows the union shape
      // poorly across the insert overloads. The columns are NOT
      // NULL with defaults, so explicit writes are safe.
      legendary_actions_total: s.legendaryActionsTotal ?? 0,
      legendary_actions_remaining: s.legendaryActionsTotal ?? 0,
      // Cast: see addParticipantToEncounter for the rationale —
      // MonsterLegendaryAction lacks the Json index signature.
      legendary_actions_config: (s.legendaryActionsConfig ?? []) as unknown as import('../types/supabase').Json,
    };
  });

  const { data: partData, error: partErr } = await supabase
    .from('combat_participants')
    .insert(rows)
    .select();

  if (partErr || !partData) {
    // eslint-disable-next-line no-console
    console.error('[startEncounter] participants insert failed:', partErr?.message);
    return { encounter, participants: [] };
  }
  const participants = partData as CombatParticipant[];

  // 3. Compute turn_order for any that have initiative set
  await recomputeTurnOrder(encounter.id);

  // v2.143.0 — Phase N pt 1: fire encumbrance sync for every character
  // participant. Without this, a character that was over-capacity when
  // combat started wouldn't pick up Encumbered until they next touched
  // inventory/currency/strength. Fire-and-forget so it never blocks
  // combat initiation. The sync itself no-ops when campaign
  // encumbrance_variant is 'off' (default), so this is a 0-cost call
  // for campaigns that haven't opted in.
  const characterSeeds = participants.filter(p => p.participant_type === 'character' && !!p.entity_id);
  if (characterSeeds.length > 0) {
    import('./encumbrance').then(async ({ syncEncumbranceCondition }) => {
      for (const p of characterSeeds) {
        try {
          const { data: charRow } = await supabase
            .from('characters')
            .select('*')
            .eq('id', p.entity_id as string)
            .maybeSingle();
          if (!charRow) continue;
          await syncEncumbranceCondition({
            characterId: p.entity_id as string,
            character: charRow as any,
            campaignId: opts.campaignId,
            encounterId: encounter.id,
          });
        } catch {
          /* swallow — encumbrance sync must never break combat start */
        }
      }
    }).catch(() => { /* dynamic import failure is non-fatal */ });
  }

  // 4. Emit combat_started + initiative_rolled events
  const chainId = newChainId();
  const events: Parameters<typeof emitCombatEventChain>[0] = [];
  events.push({
    campaignId: opts.campaignId,
    encounterId: encounter.id,
    actorType: 'system',
    actorName: 'System',
    eventType: 'combat_started',
    payload: { encounter_id: encounter.id, participants: participants.length },
  });
  for (const p of participants) {
    if (p.initiative !== null) {
      events.push({
        campaignId: opts.campaignId,
        encounterId: encounter.id,
        actorType: p.participant_type === 'character' ? 'player' : 'monster',
        actorId: null, // entity_id is text, not uuid
        actorName: p.name,
        eventType: 'initiative_rolled',
        payload: { total: p.initiative, dex_mod: p.initiative_tiebreaker },
        visibility: p.hidden_from_players ? 'hidden_from_players' : 'public',
      });
    }
  }
  await emitCombatEventChain(events);
  // chainId intentionally unused — emitCombatEventChain assigns its own

  return { encounter, participants };
}

// ─── recomputeTurnOrder ──────────────────────────────────────────
// Sorts participants by (initiative DESC, tiebreaker DESC) and writes turn_order.
// Rows with null initiative go to the bottom (order > any rolled participant).
export async function recomputeTurnOrder(encounterId: string): Promise<void> {
  const { data } = await supabase
    .from('combat_participants')
    .select('id, initiative, initiative_tiebreaker')
    .eq('encounter_id', encounterId);
  if (!data) return;

  const sorted = [...data].sort((a, b) => {
    const aInit = a.initiative ?? -Infinity;
    const bInit = b.initiative ?? -Infinity;
    if (aInit !== bInit) return bInit - aInit;
    return (b.initiative_tiebreaker ?? 0) - (a.initiative_tiebreaker ?? 0);
  });

  await Promise.all(
    sorted.map((p, i) =>
      supabase.from('combat_participants').update({ turn_order: i }).eq('id', p.id)
    )
  );
}

// ─── Roll initiative for one participant ─────────────────────────
export async function rollInitiativeForParticipant(
  participantId: string,
  dexMod: number,
  bonus = 0
): Promise<number | null> {
  const { d20, total } = rollInitiativeFor(dexMod, bonus);

  const { data: partData } = await supabase
    .from('combat_participants')
    .update({ initiative: total })
    .eq('id', participantId)
    .select('encounter_id, campaign_id, name, participant_type, hidden_from_players')
    .single();

  if (!partData) return null;

  await recomputeTurnOrder(partData.encounter_id);

  await emitCombatEvent({
    campaignId: partData.campaign_id,
    encounterId: partData.encounter_id,
    actorType: partData.participant_type === 'character' ? 'player' : 'monster',
    actorName: partData.name,
    eventType: 'initiative_rolled',
    payload: { d20, total, dex_mod: dexMod, bonus },
    visibility: partData.hidden_from_players ? 'hidden_from_players' : 'public',
  });

  return total;
}

// ─── advanceTurn ─────────────────────────────────────────────────
// Advance to the next non-dead, visible-in-initiative participant.
// Wraps back to turn_order=0 and increments round_number on wrap.
// v2.278.0 — Returns a discriminated result so the UI can surface a
// toast on failure instead of silently swallowing the error. Pre-2.278
// the function returned void and any RLS / network / constraint
// failure was invisible to the user — a "button doesn't work" report
// would have no signal trail. The non-void return is non-breaking:
// existing callers `await advanceTurn(id)` just discard the value.
export type CombatActionResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function advanceTurn(encounterId: string): Promise<CombatActionResult> {
  const { data: enc, error: encErr } = await supabase
    .from('combat_encounters')
    .select('*')
    .eq('id', encounterId)
    .single();
  if (encErr) {
    console.error('[advanceTurn] encounter fetch failed:', encErr);
    return { ok: false, reason: encErr.message ?? 'Failed to load encounter' };
  }
  if (!enc) return { ok: false, reason: 'Encounter not found' };
  const encounter = enc as CombatEncounter;

  const { data: rowsRaw, error: rowsErr } = await (supabase as any)
    .from('combat_participants')
    .select(
      'id, combatant_id, turn_order, is_dead, is_stable, name, participant_type, hidden_from_players, campaign_id, current_hp, death_save_successes, death_save_failures, entity_id, legendary_actions_total, legendary_actions_remaining, ' +
        JOINED_COMBATANT_FIELDS
    )
    .eq('encounter_id', encounterId)
    .order('turn_order', { ascending: true });
  if (rowsErr) {
    console.error('[advanceTurn] participants fetch failed:', rowsErr);
    return { ok: false, reason: rowsErr.message ?? 'Failed to load participants' };
  }
  if (!rowsRaw || rowsRaw.length === 0) return { ok: false, reason: 'No participants in this encounter' };
  // v2.315: flatten the JOINed combatants object onto each row so
  // downstream code (r.is_dead, r.current_hp, r.death_save_*) reads
  // through to the combatant. Same shape, combatants is the source.
  const rows = rowsRaw.map(normalizeParticipantRow);

  // Filter out dead and rows without an initiative slot (shouldn't be many)
  // v2.315: rows came through (supabase as any) for the JOIN; type
  // the filter callback explicitly to avoid implicit any.
  const active = rows.filter((r: { is_dead?: boolean | null }) => !r.is_dead);
  if (active.length === 0) return { ok: false, reason: 'All participants are dead' };

  const currentIdx = encounter.current_turn_index ?? 0;
  let nextIdx = currentIdx + 1;
  let nextRound = encounter.round_number;
  let roundIncremented = false;
  if (nextIdx >= active.length) {
    nextIdx = 0;
    nextRound = encounter.round_number + 1;
    roundIncremented = true;
  }

  // Reset per-turn budgets for the incoming actor
  const incomingParticipant = active[nextIdx];

  // v2.126.0 — Phase J: refill legendary action pool on the creature's own
  // turn. RAW 2024: LA pool refills at the START of the legendary creature's
  // own turn (not at top of round). Only updates if the creature actually
  // has LAs configured.
  const laTotal = (incomingParticipant.legendary_actions_total as number | null) ?? 0;
  const laRemaining = (incomingParticipant.legendary_actions_remaining as number | null) ?? 0;
  const needsLaRefill = laTotal > 0 && laRemaining < laTotal;

  const { error: partUpdErr } = await supabase
    .from('combat_participants')
    .update({
      action_used: false,
      bonus_used: false,
      reaction_used: false,
      movement_used_ft: 0,
      leveled_spell_cast: false,
      dash_used_this_turn: false,
      disengaged_this_turn: false,
      ...(needsLaRefill ? { legendary_actions_remaining: laTotal } : {}),
    })
    .eq('id', incomingParticipant.id);
  if (partUpdErr) {
    console.error('[advanceTurn] participant turn-reset failed:', partUpdErr);
    return { ok: false, reason: partUpdErr.message ?? 'Failed to reset turn budgets' };
  }

  // v2.127.0 — Phase J: on round increment, reset lair_action_used_this_round
  // so the DM can fire another one. Only included in the UPDATE when the round
  // actually ticked over.
  const lairUpdates = roundIncremented ? { lair_action_used_this_round: false } : {};

  const { error: encUpdErr } = await supabase
    .from('combat_encounters')
    .update({
      current_turn_index: nextIdx,
      round_number: nextRound,
      ...lairUpdates,
    })
    .eq('id', encounterId);
  if (encUpdErr) {
    console.error('[advanceTurn] encounter turn-advance failed:', encUpdErr);
    return { ok: false, reason: encUpdErr.message ?? 'Failed to advance turn' };
  }

  // v2.127.0 — Phase J: lair action window opens at top of each round (RAW
  // 2024: initiative 20). Only emit when the encounter is flagged in_lair
  // AND has at least one configured action — otherwise the DM has no UI
  // surface to fire from and the event would be noise.
  if (roundIncremented) {
    const inLair = (encounter as any).in_lair === true;
    const lairActions = ((encounter as any).lair_actions_config ?? []) as unknown[];
    if (inLair && lairActions.length > 0) {
      await emitCombatEvent({
        campaignId: incomingParticipant.campaign_id,
        encounterId,
        chainId: newChainId(),
        sequence: 0,
        actorType: 'system',
        actorName: 'Lair',
        targetType: 'self',
        targetName: 'Encounter',
        eventType: 'lair_action_window_opened',
        payload: {
          round: nextRound,
          actions_available: lairActions.length,
        },
      });
    }
  }

  // v2.126.0 — Phase J: log refill for the DM
  if (needsLaRefill) {
    await emitCombatEvent({
      campaignId: incomingParticipant.campaign_id,
      encounterId,
      chainId: newChainId(),
      sequence: 0,
      actorType: 'system',
      actorName: 'System',
      targetType: incomingParticipant.participant_type === 'character' ? 'character' : 'monster',
      targetName: incomingParticipant.name,
      eventType: 'legendary_actions_refilled',
      payload: {
        refilled_from: laRemaining,
        refilled_to: laTotal,
      },
      visibility: incomingParticipant.hidden_from_players ? 'hidden_from_players' : 'public',
    });
  }

  // v2.120.0 — Phase I: death save at turn start.
  // Character at 0 HP, not stable, not dead → resolve automation:
  //   'off'    : no save this turn (DM will manage manually)
  //   'auto'   : roll now, update success/failure counters, emit events,
  //              flip stable/dead at thresholds
  //   'prompt' : v2.144.0 — Phase N pt 2: create a pending_death_saves
  //              row so the player's DeathSavePromptModal picks it up
  //              and they can roll via a single-click button.
  if (
    incomingParticipant.participant_type === 'character'
    && !incomingParticipant.is_dead
    && !incomingParticipant.is_stable
    && (incomingParticipant.current_hp ?? 1) === 0
  ) {
    const { data: campRow } = await supabase
      .from('campaigns')
      .select('automation_defaults')
      .eq('id', incomingParticipant.campaign_id)
      .maybeSingle();
    let charRow: any = null;
    if (incomingParticipant.entity_id) {
      const { data } = await supabase
        .from('characters')
        .select('automation_overrides, advanced_automations_unlocked')
        .eq('id', incomingParticipant.entity_id as string)
        .maybeSingle();
      charRow = data;
    }
    const { resolveAutomation } = await import('./automations');
    const dsSetting = resolveAutomation('death_save_on_turn_start', charRow, campRow as any);

    if (dsSetting === 'prompt') {
      // v2.144.0 — Phase N pt 2: create pending row, modal takes it from here.
      if (incomingParticipant.entity_id) {
        const { createPendingDeathSave } = await import('./deathSaves');
        await createPendingDeathSave({
          campaignId: incomingParticipant.campaign_id,
          encounterId,
          participantId: incomingParticipant.id,
          characterId: incomingParticipant.entity_id as string,
        });
      }
    } else if (dsSetting !== 'off') {
      // Roll the save. RAW 2024 p.195:
      //   d20 ≥ 10 → success, < 10 → failure
      //   nat 1    → 2 failures (cumulative)
      //   nat 20   → regain 1 HP + conscious (clears both counters)
      const d20 = Math.floor(Math.random() * 20) + 1;
      let successes = incomingParticipant.death_save_successes ?? 0;
      let failures = incomingParticipant.death_save_failures ?? 0;
      let isStable = false;
      let isDead = false;
      let currentHp = 0;
      let result: 'success' | 'failure' | 'crit_success' | 'crit_failure';

      if (d20 === 20) {
        // Wake with 1 HP
        successes = 0;
        failures = 0;
        currentHp = 1;
        result = 'crit_success';
      } else if (d20 === 1) {
        failures = Math.min(3, failures + 2);
        result = 'crit_failure';
      } else if (d20 >= 10) {
        successes = Math.min(3, successes + 1);
        result = 'success';
      } else {
        failures = Math.min(3, failures + 1);
        result = 'failure';
      }

      if (successes >= 3) isStable = true;
      if (failures >= 3) isDead = true;

      const updates: Record<string, any> = {
        death_save_successes: successes,
        death_save_failures: failures,
        is_stable: isStable,
        is_dead: isDead,
      };
      if (result === 'crit_success') updates.current_hp = currentHp;

      // v2.318: writes go to combatants. All fields in `updates` are mirrored.
      const combatantId = (incomingParticipant as any).combatant_id as string | null;
      if (!combatantId) {
        console.warn('[advanceTurn:deathSave] participant missing combatant_id; skipping write', incomingParticipant.id);
      } else {
        await (supabase as any)
          .from('combatants')
          .update(updates)
          .eq('id', combatantId);
      }

      // Emit a structured event for the log
      await emitCombatEvent({
        campaignId: incomingParticipant.campaign_id,
        encounterId,
        chainId: newChainId(),
        sequence: 0,
        actorType: 'player',
        actorName: incomingParticipant.name,
        targetType: 'self',
        targetName: incomingParticipant.name,
        eventType: 'death_save_rolled',
        payload: {
          d20,
          result,
          successes,
          failures,
          became_stable: isStable,
          became_dead: isDead,
          woke_up: result === 'crit_success',
          trigger: 'turn_start',
          automation_setting: dsSetting,
        },
        visibility: incomingParticipant.hidden_from_players ? 'hidden_from_players' : 'public',
      });
    } else {
      // 'off' — log that we skipped so DMs can see the automation chose silence
      await emitCombatEvent({
        campaignId: incomingParticipant.campaign_id,
        encounterId,
        chainId: newChainId(),
        sequence: 0,
        actorType: 'system',
        actorName: 'System',
        targetType: 'self',
        targetName: incomingParticipant.name,
        eventType: 'automation_skipped',
        payload: {
          automation: 'death_save_on_turn_start',
          reason: 'resolver_returned_off',
        },
        visibility: incomingParticipant.hidden_from_players ? 'hidden_from_players' : 'public',
      });
    }
  }

  // Emit turn_ended (for outgoing) + turn_started (for incoming)
  const outgoing = active[currentIdx] ?? null;
  const chain: Parameters<typeof emitCombatEventChain>[0] = [];
  if (outgoing) {
    chain.push({
      campaignId: outgoing.campaign_id,
      encounterId,
      actorType: outgoing.participant_type === 'character' ? 'player' : 'monster',
      actorName: outgoing.name,
      eventType: 'turn_ended',
      payload: { round: encounter.round_number },
      visibility: outgoing.hidden_from_players ? 'hidden_from_players' : 'public',
    });
  }
  chain.push({
    campaignId: incomingParticipant.campaign_id,
    encounterId,
    actorType: incomingParticipant.participant_type === 'character' ? 'player' : 'monster',
    actorName: incomingParticipant.name,
    eventType: 'turn_started',
    payload: { round: nextRound, turn_index: nextIdx },
    visibility: incomingParticipant.hidden_from_players ? 'hidden_from_players' : 'public',
  });
  await emitCombatEventChain(chain);
  return { ok: true };
}

// ─── endEncounter ────────────────────────────────────────────────
// v2.278.0 — Returns CombatActionResult for the same reason advanceTurn
// does: silent failure on RLS / network / missing-row used to leave
// the End Combat button looking unresponsive. emitCombatEvent at the
// end is fire-and-forget — log emission failing isn't a user-visible
// failure for the action itself.
export async function endEncounter(encounterId: string): Promise<CombatActionResult> {
  const { data: enc, error: encErr } = await supabase
    .from('combat_encounters')
    .select('campaign_id, started_at, round_number')
    .eq('id', encounterId)
    .single();
  if (encErr) {
    console.error('[endEncounter] fetch failed:', encErr);
    return { ok: false, reason: encErr.message ?? 'Failed to load encounter' };
  }

  const { error: updErr } = await supabase
    .from('combat_encounters')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', encounterId);
  if (updErr) {
    console.error('[endEncounter] update failed:', updErr);
    return { ok: false, reason: updErr.message ?? 'Failed to end encounter' };
  }

  if (enc) {
    const durationSec = enc.started_at
      ? Math.floor((Date.now() - new Date(enc.started_at).getTime()) / 1000)
      : 0;
    await emitCombatEvent({
      campaignId: enc.campaign_id,
      encounterId,
      actorType: 'system',
      actorName: 'System',
      eventType: 'combat_ended',
      payload: { rounds: enc.round_number, duration_seconds: durationSec },
    });
  }
  return { ok: true };
}

// ─── revealMonster ───────────────────────────────────────────────
export async function revealMonster(participantId: string, dexMod: number): Promise<void> {
  const { data: part } = await supabase
    .from('combat_participants')
    .select('encounter_id, campaign_id, initiative, name, participant_type')
    .eq('id', participantId)
    .single();
  if (!part) return;

  // Unhide
  await supabase
    .from('combat_participants')
    .update({ hidden_from_players: false })
    .eq('id', participantId);

  // Roll initiative if not already rolled
  if (part.initiative === null) {
    await rollInitiativeForParticipant(participantId, dexMod);
  }

  await emitCombatEvent({
    campaignId: part.campaign_id,
    encounterId: part.encounter_id,
    actorType: 'system',
    actorName: 'DM',
    eventType: 'monster_revealed',
    payload: { participant_id: participantId, name: part.name },
  });
}

// ─── Active encounter lookup ─────────────────────────────────────
export async function getActiveEncounter(campaignId: string): Promise<CombatEncounter | null> {
  const { data } = await supabase
    .from('combat_encounters')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CombatEncounter) ?? null;
}
