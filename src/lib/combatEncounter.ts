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

export function monsterToSeed(m: MonsterData, hiddenFromPlayers = false): SeedSource {
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
export async function advanceTurn(encounterId: string): Promise<void> {
  const { data: enc } = await supabase
    .from('combat_encounters')
    .select('*')
    .eq('id', encounterId)
    .single();
  if (!enc) return;
  const encounter = enc as CombatEncounter;

  const { data: rows } = await supabase
    .from('combat_participants')
    .select('id, turn_order, is_dead, is_stable, name, participant_type, hidden_from_players, campaign_id, current_hp, death_save_successes, death_save_failures, entity_id, legendary_actions_total, legendary_actions_remaining')
    .eq('encounter_id', encounterId)
    .order('turn_order', { ascending: true });
  if (!rows || rows.length === 0) return;

  // Filter out dead and rows without an initiative slot (shouldn't be many)
  const active = rows.filter(r => !r.is_dead);
  if (active.length === 0) return;

  const currentIdx = encounter.current_turn_index ?? 0;
  let nextIdx = currentIdx + 1;
  let nextRound = encounter.round_number;
  if (nextIdx >= active.length) {
    nextIdx = 0;
    nextRound = encounter.round_number + 1;
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

  await supabase
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

  await supabase
    .from('combat_encounters')
    .update({
      current_turn_index: nextIdx,
      round_number: nextRound,
    })
    .eq('id', encounterId);

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
  //   'prompt' : falls through to 'auto' for now; v2.121 will add the
  //              pending_death_saves table + modal for real prompting
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

    if (dsSetting !== 'off') {
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

      await supabase
        .from('combat_participants')
        .update(updates)
        .eq('id', incomingParticipant.id);

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
}

// ─── endEncounter ────────────────────────────────────────────────
export async function endEncounter(encounterId: string): Promise<void> {
  const { data: enc } = await supabase
    .from('combat_encounters')
    .select('campaign_id, started_at, round_number')
    .eq('id', encounterId)
    .single();

  await supabase
    .from('combat_encounters')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', encounterId);

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
