// v2.242.0 — Phase Q.1 pt 30: dm_npc_roster API layer.
//
// Thin wrappers for the DM's reusable monster roster (`dm_npc_roster`
// table). The roster is OWNER-scoped, not campaign-scoped — a DM can
// add the same goblin to encounters across multiple campaigns. The
// `campaign_id` column on the row is informational (the campaign the
// entry was originally created for); we don't filter by it here.
//
// v1's BattleMap.tsx had inline supabase calls for the roster. This
// module consolidates them so v2.242's roster picker (and future
// roster-builder UI) can share one source of truth.

import { supabase } from '../supabase';

/** Snake_case row from the DB. We don't reshape into camelCase here
 *  because the roster is also displayed in v1's BattleMap with its
 *  own type, and we want the two surfaces to stay in sync. Future
 *  refactor can collapse to a single canonical type. */
export interface RosterEntry {
  id: string;
  owner_id: string;
  campaign_id: string | null;
  name: string;
  type: string;          // 'Humanoid' | 'Beast' | 'Dragon' | etc.
  cr: string;            // CR can be '1/4', '1/8', '0', '1', etc.
  size: string;          // 'Tiny' | 'Small' | ... | 'Gargantuan'
  hp: number;
  max_hp: number;
  ac: number;
  speed: number;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  attack_name: string;
  attack_bonus: number;
  attack_damage: string;
  xp: number;
  description: string;
  traits: string;
  immunities: string;
  image_url: string | null;
  emoji: string;         // '👹' default
  color: string;         // '#ef4444' hex string
  source_monster_id: string | null;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** List the current DM's roster, most-recently-updated first. */
export async function listRoster(ownerId: string): Promise<RosterEntry[]> {
  const { data, error } = await supabase
    .from('dm_npc_roster')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[npcRoster] listRoster failed', error);
    return [];
  }
  return (data ?? []) as RosterEntry[];
}

/** Bump times_used + last_used_at on a roster entry — called after a
 *  successful bulk-add so the DM's "recently used" surface stays
 *  meaningful. Fire-and-forget; failure is non-fatal. */
export async function bumpRosterUsage(id: string, currentTimesUsed: number): Promise<void> {
  const { error } = await supabase
    .from('dm_npc_roster')
    .update({
      times_used: currentTimesUsed + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) console.error('[npcRoster] bumpRosterUsage failed', error);
}

// v2.252.0 — Roster builder helpers. Lifted from v1's BattleMap.tsx
// inline supabase calls so the new v2 builder modal and the legacy v1
// surface (still around for the deprecation window) can share one
// implementation.

/** Fields the builder UI lets the DM edit. id, owner_id, campaign_id,
 *  times_used, last_used_at, created_at, updated_at are managed by
 *  the helpers — the form never touches them directly. */
export type RosterEntryDraft = Omit<
  RosterEntry,
  'id' | 'owner_id' | 'campaign_id' | 'times_used' | 'last_used_at' | 'created_at' | 'updated_at'
>;

/** Create or update a roster entry. When `id` is provided we UPDATE
 *  (preserves times_used/last_used_at); otherwise we INSERT a new row
 *  scoped to the calling DM. Returns the saved row on success. */
export async function upsertRosterEntry(
  ownerId: string,
  campaignId: string,
  draft: RosterEntryDraft,
  id?: string,
): Promise<RosterEntry | null> {
  if (id) {
    // UPDATE path — preserves times_used / last_used_at / created_at.
    // updated_at is bumped explicitly because the DB default only fires
    // on INSERT.
    const { data, error } = await supabase
      .from('dm_npc_roster')
      .update({ ...draft, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[npcRoster] upsertRosterEntry UPDATE failed', error);
      return null;
    }
    return data as RosterEntry;
  }
  // INSERT path — owner_id is required; campaign_id is informational
  // (which campaign the DM was in when they created the entry). We
  // explicitly initialize times_used to 0 so the picker's sort-by-usage
  // surface treats freshly-created entries consistently.
  const { data, error } = await supabase
    .from('dm_npc_roster')
    .insert({
      ...draft,
      owner_id: ownerId,
      campaign_id: campaignId,
      times_used: 0,
    })
    .select()
    .single();
  if (error) {
    console.error('[npcRoster] upsertRosterEntry INSERT failed', error);
    return null;
  }
  return data as RosterEntry;
}

/** Hard-delete a roster entry. Spawned npcs rows that reference the
 *  same data via name match are NOT touched — the snapshot model means
 *  they keep functioning even after the source roster row is gone. */
export async function deleteRosterEntry(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('dm_npc_roster')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[npcRoster] deleteRosterEntry failed', error);
    return false;
  }
  return true;
}
