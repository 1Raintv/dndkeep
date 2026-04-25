// v2.242.0 — Phase Q.1 pt 30: npcs batch-create API.
//
// The roster picker creates N NPC instances per roster entry (e.g.,
// 4 goblins from a "Goblin" roster row). Each instance gets its own
// row in `npcs` so HP/conditions can diverge per token (Goblin 1
// dies, Goblin 2 lives). They're linked from scene_tokens via npc_id.
//
// The `npcs` table is shared with the v1 NPCManager (named NPCs with
// social-graph fields like faction/relationship). The bulk-add path
// fills only the combat-relevant subset; unused fields fall back to
// their column defaults.

import { supabase } from '../supabase';
import type { RosterEntry } from './npcRoster';

export interface NpcInstanceSpec {
  /** Already-disambiguated display name, e.g. "Goblin 3". */
  name: string;
  /** Source roster entry — provides type/hp/ac/etc. */
  roster: RosterEntry;
  /** Campaign the npc belongs to (RLS scope). */
  campaignId: string;
}

/** Batch insert N npc instances. Returns the inserted rows (with
 *  server-generated ids) on success, or null on failure of the batch.
 *  Single insert call to minimize round-trips. */
export async function createNpcInstances(specs: NpcInstanceSpec[]): Promise<Array<{ id: string; name: string }> | null> {
  if (specs.length === 0) return [];
  const rows = specs.map(s => ({
    campaign_id: s.campaignId,
    name: s.name,
    role: '',                // Combat-throwaway monsters have no role text
    race: s.roster.type,     // Best-effort: type doubles as race
    location: '',
    faction: '',
    relationship: 'hostile', // Combat default; DM can change later
    status: 'alive',
    description: s.roster.description ?? '',
    notes: '',
    last_seen: '',
    avatar_url: s.roster.image_url,
    is_alive: true,
    visible_to_players: false, // DM-only by default; reveal mid-combat
    in_combat: true,
    hp: s.roster.hp,
    max_hp: s.roster.max_hp,
    ac: s.roster.ac,
    initiative: null,
    conditions: [],
    // v2.251.0 — snapshot the roster's ability scores so getTargetSaveBonus
    // can compute real save modifiers for this NPC. The npcs table doesn't
    // carry per-ability columns (it's shared with v1's social/named NPCs);
    // jsonb keeps it flexible. Shape: { str, dex, con, int, wis, cha }.
    // Snapshot, not reference: if the DM later edits the roster's stats,
    // already-spawned NPCs keep the values they were spawned with — same
    // contract as hp/ac/etc. above.
    ability_scores: {
      str: s.roster.str,
      dex: s.roster.dex,
      con: s.roster.con,
      int: s.roster.int,
      wis: s.roster.wis,
      cha: s.roster.cha,
    },
    // v2.253.0 — snapshot which saves the NPC is proficient in. Stored
    // as a jsonb array (not a Postgres array) for symmetry with
    // ability_scores. Empty array on legacy roster entries that
    // pre-date the column. Read by getTargetSaveBonus, which adds the
    // CR-derived proficiency bonus when the requested ability key
    // appears in this list.
    save_proficiencies: s.roster.save_proficiencies ?? [],
  }));
  const { data, error } = await supabase
    .from('npcs')
    .insert(rows)
    .select('id, name');
  if (error || !data) {
    console.error('[npcs] createNpcInstances failed', error);
    return null;
  }
  return data;
}
