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
