// v2.261.0 — Phase R.1: Homebrew monster CRUD + roster integration.
//
// Bridges three things:
//   - homebrew_monsters table (per-user reusable templates, RLS-scoped
//     to user_id; is_public lets DMs mark some as community-shareable
//     in the future)
//   - dm_npc_roster (per-DM-per-campaign roster instances)
//   - the SRD monsters catalog (the v2.254 source-of-truth)
//
// The flow this enables:
//   1. DM opens "Clone from SRD" picker, picks Goblin
//   2. Builder modal seeds with the goblin stats; DM tweaks HP / name
//      ("Boss Goblin", HP 20)
//   3. NEW in v2.261: DM clicks "Save as Homebrew" → row lands in
//      homebrew_monsters scoped to their user_id
//   4. v2.262 (next ship) will add a Homebrew tab to the picker so
//      that template can be cloned again into future encounters
//
// The two existing flows (Save to Roster, Cancel) are unchanged. The
// homebrew save is independent and can be done in parallel with a
// roster save (the modal exposes both buttons in v2.261).

import { supabase } from '../supabase';
import type { RosterEntryDraft } from './npcRoster';

/** Subset of homebrew_monsters relevant to the modal. The table is
 *  leaner than `monsters` (no subtype, no saving_throws, no
 *  alignment) so the round-trip into RosterEntryDraft has to fill in
 *  defaults for fields the schema doesn't track. */
export interface HomebrewMonsterRow {
  id: string;
  user_id: string | null;
  name: string;
  type: string | null;
  cr: string | null;
  size: string | null;
  hp: number | null;
  ac: number | null;
  speed: number | null;
  str: number | null;
  dex: number | null;
  con: number | null;
  int: number | null;
  wis: number | null;
  cha: number | null;
  attack_name: string | null;
  attack_bonus: number | null;
  attack_damage: string | null;
  xp: number | null;
  traits: string | null;
  is_public: boolean | null;
  created_at: string | null;
}

/** List the calling user's homebrew monsters. RLS handles the user_id
 *  filter — we don't pass it explicitly. Sorted by name to match the
 *  v2.254 SRD picker UX. */
export async function listHomebrew(): Promise<HomebrewMonsterRow[]> {
  const { data, error } = await supabase
    .from('homebrew_monsters')
    .select('id, user_id, name, type, cr, size, hp, ac, speed, str, dex, con, int, wis, cha, attack_name, attack_bonus, attack_damage, xp, traits, is_public, created_at')
    .order('name', { ascending: true });
  if (error) {
    console.error('[homebrewMonsters] listHomebrew failed', error);
    return [];
  }
  return (data ?? []) as unknown as HomebrewMonsterRow[];
}

/** Insert a new homebrew monster from a roster draft. The draft has
 *  fields the homebrew table doesn't store (color, emoji,
 *  save_proficiencies, etc.) — those get dropped. Anything the
 *  homebrew schema requires that the draft doesn't carry gets a
 *  reasonable default.
 *
 *  Returns the inserted row on success, or null on failure. */
export async function createHomebrewFromDraft(
  userId: string,
  draft: RosterEntryDraft,
): Promise<HomebrewMonsterRow | null> {
  // Map RosterEntryDraft → homebrew_monsters insert. The traits field
  // exists in both; the rest of the per-roster cosmetic state
  // (color/emoji/image_url) doesn't carry forward — homebrew is the
  // platonic monster, roster is the per-encounter dressed-up instance.
  const row = {
    user_id: userId,
    name: draft.name,
    type: draft.type,
    cr: draft.cr,
    size: draft.size,
    hp: draft.hp,
    ac: draft.ac,
    speed: draft.speed,
    str: draft.str,
    dex: draft.dex,
    con: draft.con,
    int: draft.int,
    wis: draft.wis,
    cha: draft.cha,
    attack_name: draft.attack_name,
    attack_bonus: draft.attack_bonus,
    attack_damage: draft.attack_damage,
    xp: draft.xp,
    traits: draft.traits,
    // is_public defaults false — DMs mark public explicitly later
    // (no UI for that yet; future feature). RLS lets the row owner
    // see/manage regardless.
    is_public: false,
  };
  const { data, error } = await supabase
    .from('homebrew_monsters')
    .insert(row)
    .select()
    .single();
  if (error) {
    console.error('[homebrewMonsters] createHomebrewFromDraft failed', error);
    return null;
  }
  return data as unknown as HomebrewMonsterRow;
}

/** Convert a homebrew monster row into a RosterEntryDraft so it can
 *  feed the builder modal's edit form (next ship will use this for
 *  the Homebrew picker tab). Mirrors monsterToRosterDraft from
 *  srdMonsters.ts but fills in nullable fields with safe defaults
 *  since homebrew rows can have NULLs the SRD rows never do. */
export function homebrewToRosterDraft(monster: HomebrewMonsterRow): RosterEntryDraft {
  return {
    name: monster.name,
    type: monster.type ?? 'Humanoid',
    cr: monster.cr ?? '0',
    size: monster.size ?? 'Medium',
    hp: monster.hp ?? 1,
    max_hp: monster.hp ?? 1,
    ac: monster.ac ?? 10,
    speed: monster.speed ?? 30,
    str: monster.str ?? 10,
    dex: monster.dex ?? 10,
    con: monster.con ?? 10,
    int: monster.int ?? 10,
    wis: monster.wis ?? 10,
    cha: monster.cha ?? 10,
    attack_name: monster.attack_name ?? 'Strike',
    attack_bonus: monster.attack_bonus ?? 0,
    attack_damage: monster.attack_damage ?? '1d6',
    xp: monster.xp ?? 0,
    description: '',
    traits: monster.traits ?? '',
    immunities: '',
    image_url: null,
    emoji: '',
    // Default to red for hostile-mob-feel; matches the SRD picker.
    color: '#ef4444',
    // Track the homebrew origin so the roster row knows where it
    // came from. Same field that points to monsters.id from the SRD
    // path; reusing it for homebrew keeps the schema simple. The
    // string format `homebrew:<uuid>` distinguishes the origin if a
    // future query needs it.
    source_monster_id: `homebrew:${monster.id}`,
    // Homebrew schema doesn't track save proficiencies (DM can toggle
    // in the builder UI after cloning, same as a hand-built entry).
    save_proficiencies: [],
  };
}
