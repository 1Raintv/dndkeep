// v2.254.0 — Phase Q.8: SRD monster lookup for the roster builder.
//
// Wraps the public `monsters` table (334 SRD entries) and provides a
// mapping from MonsterRow → RosterEntryDraft so the builder modal's
// "Clone from SRD" flow can seed a new entry from a published monster
// stat block. The DM then tweaks (rename, recolor, adjust HP for
// scaling) and saves to their personal roster.
//
// Key derivation: monsters.saving_throws is a jsonb map of
// ABILITY → TOTAL save bonus (mod + PB combined). We derive which
// abilities are proficient by checking whether the stored bonus
// equals (mod + PB) — if it does, the monster is proficient in that
// save. PB itself is derived from CR via crToProficiencyBonus.
// This means cloning a monster carries its save proficiencies into
// the roster draft for free, without manual checkbox toggling.

import { supabase } from '../supabase';
import { abilityModifier, crToProficiencyBonus } from '../gameUtils';
import type { RosterEntryDraft } from './npcRoster';

/** Subset of the monsters row we need for the picker + mapper. The
 *  full row has 49 columns; we pull only what informs the draft. */
export interface SrdMonsterRow {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  cr: string;
  size: string;
  hp: number;
  ac: number;
  speed: number;
  str: number; dex: number; con: number;
  int: number; wis: number; cha: number;
  saving_throws: Record<string, number> | null;
  attack_name: string | null;
  attack_bonus: number | null;
  attack_damage: string | null;
  xp: number;
}

/** List the SRD monster catalog. We always pull all 334 — the table is
 *  small enough that client-side filtering beats per-keystroke server
 *  round-trips, and the picker is gated behind a deliberate "Clone
 *  from SRD" click so the load only happens on demand. */
export async function listSrdMonsters(): Promise<SrdMonsterRow[]> {
  const { data, error } = await supabase
    .from('monsters')
    .select('id, name, type, subtype, cr, size, hp, ac, speed, str, dex, con, int, wis, cha, saving_throws, attack_name, attack_bonus, attack_damage, xp')
    .eq('source', 'srd')
    .order('name', { ascending: true });
  if (error) {
    console.error('[srdMonsters] listSrdMonsters failed', error);
    return [];
  }
  return (data ?? []) as unknown as SrdMonsterRow[];
}

/** Derive which saves the monster is proficient in by comparing each
 *  saving_throws entry against the unproficient baseline (mod only).
 *  If saving_throws[ABILITY] > mod by exactly the proficiency bonus,
 *  the monster is proficient. Returns lowercase ability keys to match
 *  the v2.253 contract (dm_npc_roster.save_proficiencies stores
 *  lowercase). */
function deriveSaveProficiencies(monster: SrdMonsterRow): string[] {
  if (!monster.saving_throws) return [];
  const pb = crToProficiencyBonus(monster.cr);
  const scores: Record<string, number> = {
    STR: monster.str, DEX: monster.dex, CON: monster.con,
    INT: monster.int, WIS: monster.wis, CHA: monster.cha,
  };
  const profs: string[] = [];
  for (const [ability, totalBonus] of Object.entries(monster.saving_throws)) {
    const score = scores[ability.toUpperCase()];
    if (typeof score !== 'number') continue;
    const mod = abilityModifier(score);
    // Proficient if the stored save bonus is at least mod + pb. We use
    // >= rather than === to be generous about quirky stat blocks (e.g.
    // a monster with both prof and a feat-style bonus). False positives
    // here are recoverable — the DM can uncheck in the form.
    if (totalBonus >= mod + pb) {
      profs.push(ability.toLowerCase());
    }
  }
  return profs;
}

/** Convert an SRD monster row into a RosterEntryDraft ready for the
 *  builder's edit form. The DM can tweak any field before saving. */
export function monsterToRosterDraft(monster: SrdMonsterRow): RosterEntryDraft {
  return {
    name: monster.name,
    type: monster.type,
    cr: monster.cr,
    size: monster.size,
    hp: monster.hp,
    max_hp: monster.hp,
    ac: monster.ac,
    speed: monster.speed,
    str: monster.str, dex: monster.dex, con: monster.con,
    int: monster.int, wis: monster.wis, cha: monster.cha,
    attack_name: monster.attack_name ?? 'Strike',
    attack_bonus: monster.attack_bonus ?? 0,
    attack_damage: monster.attack_damage ?? '1d6',
    xp: monster.xp,
    description: '',
    // The traits column on monsters is jsonb (structured). Roster's
    // traits is plain text. Skip the import — DM can paste in if
    // wanted. Avoiding the conversion keeps this mapper pure.
    traits: '',
    immunities: '',
    image_url: null,
    // No emoji in the SRD data; default to empty so the color is the
    // visual differentiator (matches the v2.252 pattern).
    emoji: '',
    // Default to red to match other hostile NPCs in the picker.
    color: '#ef4444',
    source_monster_id: monster.id,
    save_proficiencies: deriveSaveProficiencies(monster),
  };
}
