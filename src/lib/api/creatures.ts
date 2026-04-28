// v2.351.0 — Unified Creature API.
//
// Post-v2.350, `homebrew_monsters` is the canonical home for ALL
// creatures: story NPCs, custom monsters, named family members,
// generic mooks. The old per-purpose tables (npcs, dm_npc_roster)
// are gone. This API exposes the full creature shape with all the
// fields v2.351 UI needs.
//
// Backwards compat: src/lib/api/homebrewMonsters.ts still exists for
// the v2.261 "save as homebrew" picker flow. That helper has a
// narrower shape and predates the v2.350 columns; new code should
// use this one.

import { supabase } from '../supabase';

export interface CreatureRow {
  id: string;
  name: string;
  // Ownership / scope
  user_id: string | null;
  owner_id: string | null;
  campaign_id: string | null;
  folder_id: string | null;
  source_monster_id: string | null;
  // Visual + identity
  image_url: string | null;
  type: string | null;
  cr: string | null;
  size: string | null;
  race: string | null;
  // Combat stats
  hp: number | null;
  max_hp: number | null;
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
  initiative: number | null;
  // Story fields
  description: string | null;
  notes: string | null;
  role: string | null;
  location: string | null;
  faction: string | null;
  relationship: string | null;
  status: string | null;
  last_seen: string | null;
  // Combat-runtime jsonb (kept loose; UI normalizes shape)
  conditions: unknown;
  save_proficiencies: unknown;
  ability_scores: unknown;
  // State flags
  visible_to_players: boolean;
  is_alive: boolean;
  in_combat: boolean;
  is_public: boolean | null;
  // Misc
  traits: string | null;
  created_at: string | null;
  updated_at: string;
}

/** List creatures the calling user can see. Filtering supported by
 *  campaign (member visibility via RLS), folder, search, alive-only.
 *  Returns flat rows; UI groups by folder. */
export async function listCreatures(opts: {
  campaignId?: string | null;
  folderId?: string | null;
  ownerOnly?: boolean;
} = {}): Promise<CreatureRow[]> {
  let q = supabase.from('homebrew_monsters').select('*');
  if (opts.campaignId !== undefined) {
    if (opts.campaignId === null) {
      q = q.is('campaign_id', null);
    } else {
      q = q.eq('campaign_id', opts.campaignId);
    }
  }
  if (opts.folderId !== undefined) {
    if (opts.folderId === null) {
      q = q.is('folder_id', null);
    } else {
      q = q.eq('folder_id', opts.folderId);
    }
  }
  if (opts.ownerOnly) {
    const { data: userResp } = await supabase.auth.getUser();
    if (userResp?.user) q = q.eq('owner_id', userResp.user.id);
  }
  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CreatureRow[];
}

/** Create a new creature. Defaults set sensible values for fields
 *  the user didn't specify so the row is usable. owner_id is forced
 *  to the calling user (RLS WITH CHECK enforces this too). */
export async function createCreature(input: Partial<CreatureRow> & { name: string }): Promise<CreatureRow> {
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp?.user) throw new Error('Not authenticated');
  const userId = userResp.user.id;
  const { data, error } = await supabase
    .from('homebrew_monsters')
    .insert({
      user_id: userId,
      owner_id: userId,
      name: input.name.trim(),
      type: input.type ?? 'humanoid',
      cr: input.cr ?? '0',
      size: input.size ?? 'medium',
      hp: input.hp ?? 10,
      max_hp: input.max_hp ?? input.hp ?? 10,
      ac: input.ac ?? 10,
      speed: input.speed ?? 30,
      str: input.str ?? 10,
      dex: input.dex ?? 10,
      con: input.con ?? 10,
      int: input.int ?? 10,
      wis: input.wis ?? 10,
      cha: input.cha ?? 10,
      attack_name: input.attack_name ?? null,
      attack_bonus: input.attack_bonus ?? null,
      attack_damage: input.attack_damage ?? null,
      xp: input.xp ?? 0,
      campaign_id: input.campaign_id ?? null,
      folder_id: input.folder_id ?? null,
      source_monster_id: input.source_monster_id ?? null,
      image_url: input.image_url ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      role: input.role ?? 'neutral',
      race: input.race ?? null,
      location: input.location ?? null,
      faction: input.faction ?? null,
      relationship: input.relationship ?? 'neutral',
      status: input.status ?? null,
      last_seen: input.last_seen ?? null,
      visible_to_players: input.visible_to_players ?? true,
      is_alive: input.is_alive ?? true,
      in_combat: false,
      conditions: input.conditions ?? [],
      save_proficiencies: input.save_proficiencies ?? [],
      ability_scores: input.ability_scores ?? null,
      traits: input.traits ?? '',
    })
    .select()
    .single();
  if (error) throw error;
  return data as CreatureRow;
}

/** Update an existing creature. Pass only the fields you want to change. */
export async function updateCreature(id: string, patch: Partial<CreatureRow>): Promise<void> {
  // Strip fields that shouldn't be touched on update.
  const { id: _id, created_at: _ca, user_id: _uid, owner_id: _oid, ...safe } = patch;
  void _id; void _ca; void _uid; void _oid;
  const { error } = await supabase
    .from('homebrew_monsters')
    .update(safe)
    .eq('id', id);
  if (error) throw error;
}

/** Delete a creature. RLS enforces owner-only. */
export async function deleteCreature(id: string): Promise<void> {
  const { error } = await supabase
    .from('homebrew_monsters')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** Import a creature from the system monsters catalog. Copies the
 *  catalog row's stats into a new homebrew_monsters row, preserves
 *  the source linkage via source_monster_id, and drops it into the
 *  specified folder + campaign (or unfiled / personal if null).
 *  The user can then edit the copy without affecting the catalog. */
export async function importFromCatalog(input: {
  catalogMonsterId: string; // monsters.id (slug)
  campaignId?: string | null;
  folderId?: string | null;
  nameOverride?: string;
}): Promise<CreatureRow> {
  const { data: catalogRow, error: catalogErr } = await supabase
    .from('monsters')
    .select('*')
    .eq('id', input.catalogMonsterId)
    .single();
  if (catalogErr) throw catalogErr;
  if (!catalogRow) throw new Error('Catalog monster not found');
  // Build the homebrew row from the catalog row. We map only the
  // shared fields; the catalog has more (saving_throws, skills, etc.)
  // that homebrew_monsters doesn't store yet.
  const c = catalogRow as Record<string, unknown>;
  return createCreature({
    name: input.nameOverride ?? (c.name as string),
    type: (c.type as string) ?? null,
    cr: (c.cr as string) ?? null,
    size: (c.size as string) ?? null,
    hp: (c.hp as number) ?? null,
    max_hp: (c.hp as number) ?? null,
    ac: (c.ac as number) ?? null,
    speed: (c.speed as number) ?? null,
    str: (c.str as number) ?? null,
    dex: (c.dex as number) ?? null,
    con: (c.con as number) ?? null,
    int: (c.int as number) ?? null,
    wis: (c.wis as number) ?? null,
    cha: (c.cha as number) ?? null,
    xp: (c.xp as number) ?? null,
    attack_name: (c.attack_name as string) ?? null,
    attack_bonus: (c.attack_bonus as number) ?? null,
    attack_damage: (c.attack_damage as string) ?? null,
    source_monster_id: input.catalogMonsterId,
    campaign_id: input.campaignId ?? null,
    folder_id: input.folderId ?? null,
    role: 'enemy',
    relationship: 'hostile',
  });
}
