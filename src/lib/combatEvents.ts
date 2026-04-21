// v2.93.0 — Phase A of the Combat Backbone
//
// Unified event writer for the campaign-wide action log + per-character log.
// Every mechanically-relevant action routes through here and lands in the
// `combat_events` table. This replaces the dual-table model (action_logs +
// character_history) with a single source of truth.
//
// Legacy helpers (logAction in ActionLog.tsx and logHistoryEvent in
// characterHistory.ts) are KEPT and shim their writes here too, so existing
// read paths keep working during phased migration.
//
// Writes are fire-and-forget — a failed log must never break the UI.

import { supabase } from './supabase';

export type ActorType = 'player' | 'dm' | 'npc' | 'monster' | 'system';
export type TargetType = 'player' | 'monster' | 'npc' | 'object' | 'area' | 'self';
export type Visibility = 'public' | 'hidden_from_players';

export type CombatEventType =
  // Attack chain
  | 'attack_declared'
  | 'attack_roll'
  | 'damage_rolled'
  | 'damage_pending'
  | 'damage_applied'
  // Saves + checks
  | 'save_requested'
  | 'save_rolled'
  | 'ability_check_rolled'
  // Spells
  | 'spell_cast'
  | 'spell_effect_placed'
  | 'spell_effect_removed'
  | 'concentration_started'
  | 'concentration_broken'
  // HP / Healing
  | 'healing_applied'
  | 'temp_hp_gained'
  | 'temp_hp_changed'
  | 'hp_changed'
  | 'dropped_to_0_hp'
  | 'death_save_turn_prompt'
  | 'death_save_rolled'
  | 'damage_at_0_hp_failure_added'
  | 'stabilized'
  | 'revived'
  | 'died'
  // Conditions
  | 'condition_applied'
  | 'condition_removed'
  | 'exhaustion_changed'
  // Resources
  | 'spell_slot_used'
  | 'spell_slot_restored'
  | 'inspiration_changed'
  // Inventory
  | 'item_equipped'
  | 'item_unequipped'
  | 'item_used'
  | 'potion_consumed'
  // Reactions
  | 'reaction_used'
  // Movement + turns
  | 'movement'
  | 'initiative_rolled'
  | 'turn_started'
  | 'turn_ended'
  // Meta
  | 'combat_started'
  | 'combat_ended'
  | 'monster_revealed'
  | 'rest_taken'
  | 'leveled_up'
  | 'character_field_changed'
  | 'generic_roll'
  | 'standard_action_taken'
  // DM-only
  | 'dm_fudge'
  | 'dm_override'
  | 'friendly_fire_acknowledged';

export interface CombatEventInsert {
  campaignId?: string | null;
  encounterId?: string | null;
  chainId?: string;               // optional; auto-generated for single-event emits
  sequence?: number;              // default 0
  parentEventId?: string | null;

  actorType: ActorType;
  actorId?: string | null;
  actorName: string;

  targetType?: TargetType | null;
  targetId?: string | null;
  targetName?: string | null;

  eventType: CombatEventType;
  payload?: Record<string, unknown>;
  visibility?: Visibility;        // default 'public'
}

export interface CombatEventRow {
  id: string;
  campaign_id: string | null;
  encounter_id: string | null;
  chain_id: string;
  sequence: number;
  parent_event_id: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  actor_name: string;
  target_type: TargetType | null;
  target_id: string | null;
  target_name: string | null;
  event_type: CombatEventType;
  payload: Record<string, unknown>;
  visibility: Visibility;
  legacy_source: string | null;
  legacy_id: string | null;
  created_at: string;
}

/**
 * Generate a fresh chain_id. Each player-initiated action should start a new
 * chain; nested events (save → damage → apply) share the chain_id and bump
 * sequence.
 */
export function newChainId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC4122-ish v4 using Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Emit a single combat event. Fire-and-forget.
 * Returns the inserted row's id on success, or null on failure.
 */
export async function emitCombatEvent(evt: CombatEventInsert): Promise<string | null> {
  try {
    const chainId = evt.chainId ?? newChainId();
    const { data, error } = await supabase
      .from('combat_events')
      .insert({
        campaign_id: evt.campaignId ?? null,
        encounter_id: evt.encounterId ?? null,
        chain_id: chainId,
        sequence: evt.sequence ?? 0,
        parent_event_id: evt.parentEventId ?? null,
        actor_type: evt.actorType,
        actor_id: evt.actorId ?? null,
        actor_name: evt.actorName,
        target_type: evt.targetType ?? null,
        target_id: evt.targetId ?? null,
        target_name: evt.targetName ?? null,
        event_type: evt.eventType,
        payload: evt.payload ?? {},
        visibility: evt.visibility ?? 'public',
      })
      .select('id')
      .single();
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[combatEvents] insert failed:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[combatEvents] emit error:', e);
    return null;
  }
}

/**
 * Emit a batch of related events with an auto-assigned shared chain_id and
 * monotonic sequence numbers. All events land in one HTTP round-trip.
 * Returns array of inserted IDs (empty on failure).
 */
export async function emitCombatEventChain(
  events: Omit<CombatEventInsert, 'chainId' | 'sequence'>[],
): Promise<string[]> {
  if (!events.length) return [];
  try {
    const chainId = newChainId();
    const rows = events.map((e, i) => ({
      campaign_id: e.campaignId ?? null,
      encounter_id: e.encounterId ?? null,
      chain_id: chainId,
      sequence: i,
      parent_event_id: e.parentEventId ?? null,
      actor_type: e.actorType,
      actor_id: e.actorId ?? null,
      actor_name: e.actorName,
      target_type: e.targetType ?? null,
      target_id: e.targetId ?? null,
      target_name: e.targetName ?? null,
      event_type: e.eventType,
      payload: e.payload ?? {},
      visibility: e.visibility ?? 'public',
    }));
    const { data, error } = await supabase
      .from('combat_events')
      .insert(rows)
      .select('id');
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[combatEvents] chain insert failed:', error.message);
      return [];
    }
    return (data ?? []).map((r: { id: string }) => r.id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[combatEvents] chain emit error:', e);
    return [];
  }
}
