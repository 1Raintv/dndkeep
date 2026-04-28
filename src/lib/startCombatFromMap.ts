// v2.355.0 — Start Combat from map tokens.
//
// User's stated flow: "When we click start combat it should just roll
// initiative for everyone as opposed to it opening a window — anyone
// on the battle map will then roll initiative."
//
// One function, one click. Reads tokens from the active scene, builds
// SeedSources by fetching their backing rows in two batched queries
// (one for characters, one for creatures), then calls startEncounter
// in auto_all mode so initiative rolls for everyone immediately.
//
// Tokens with no character_id and no creature_id are skipped — they
// can't be combat participants anyway. Post-v2.353 there's no way to
// create such tokens, but legacy production rows might exist.

import { supabase } from './supabase';
import { useBattleMapStore } from './stores/battleMapStore';
import {
  startEncounter, characterToSeed,
  type SeedSource, type StartEncounterResult,
} from './combatEncounter';
import { abilityModifier } from './gameUtils';
import type { Character } from '../types';

export type StartCombatFromMapResult =
  | { ok: true; result: StartEncounterResult; participantCount: number }
  | { ok: false; reason: 'no_scene' | 'no_tokens' | 'start_failed'; message?: string };

export async function startCombatFromMapTokens(
  campaignId: string,
): Promise<StartCombatFromMapResult> {
  const state = useBattleMapStore.getState();
  const sceneId = state.currentSceneId;
  if (!sceneId) {
    return { ok: false, reason: 'no_scene' };
  }

  // Pull tokens for the active scene only. The store may carry tokens
  // from other scenes if the user has switched scenes during this
  // session; the sceneId filter is essential.
  const tokens = Object.values(state.tokens).filter(t => t.sceneId === sceneId);
  if (tokens.length === 0) {
    return { ok: false, reason: 'no_tokens' };
  }

  // Split into character-linked vs creature-linked. A token that has
  // both (shouldn't happen post-v2.350 but defensively) routes to
  // character — that's the canonical link for player tokens.
  const characterIds = new Set<string>();
  const creatureIds = new Set<string>();
  for (const t of tokens) {
    if (t.characterId) characterIds.add(t.characterId);
    else if (t.creatureId) creatureIds.add(t.creatureId);
    // tokens with neither are skipped silently.
  }

  // Bulk-fetch character rows. Need full shape for characterToSeed.
  let characters: Character[] = [];
  if (characterIds.size > 0) {
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .in('id', Array.from(characterIds));
    if (error) {
      console.error('[startCombatFromMap] character fetch failed', error);
      return { ok: false, reason: 'start_failed', message: 'Failed to load character data.' };
    }
    characters = (data ?? []) as unknown as Character[];
  }

  // Bulk-fetch creature rows from homebrew_monsters.
  type CreatureLite = {
    id: string; name: string;
    ac: number | null; hp: number | null; max_hp: number | null;
    dex: number | null; speed: number | null;
    visible_to_players: boolean | null;
  };
  let creatures: CreatureLite[] = [];
  if (creatureIds.size > 0) {
    const { data, error } = await supabase
      .from('homebrew_monsters')
      .select('id,name,ac,hp,max_hp,dex,speed,visible_to_players')
      .in('id', Array.from(creatureIds));
    if (error) {
      console.error('[startCombatFromMap] creature fetch failed', error);
      return { ok: false, reason: 'start_failed', message: 'Failed to load creature data.' };
    }
    creatures = (data ?? []) as CreatureLite[];
  }

  // Build seeds. Order matters for initiative tie-break consistency
  // between sessions, so we sort characters first (alphabetical), then
  // creatures (alphabetical). Initiative roll randomization happens
  // inside startEncounter regardless of seed order.
  const seeds: SeedSource[] = [];
  for (const c of characters.sort((a, b) => a.name.localeCompare(b.name))) {
    seeds.push(characterToSeed(c));
  }
  for (const cr of creatures.sort((a, b) => a.name.localeCompare(b.name))) {
    seeds.push({
      type: 'creature',
      entityId: cr.id,
      name: cr.name,
      ac: cr.ac ?? null,
      hp: cr.hp ?? cr.max_hp ?? null,
      maxHp: cr.max_hp ?? cr.hp ?? null,
      dexMod: abilityModifier(cr.dex ?? 10),
      initiativeBonus: 0,
      hiddenFromPlayers: !(cr.visible_to_players ?? true),
      maxSpeedFt: cr.speed ?? 30,
    });
  }

  if (seeds.length === 0) {
    // Tokens existed but none had character/creature linkage — orphan
    // placeholder tokens from before v2.353. Surface as no_tokens so
    // the UI shows a clean message.
    return { ok: false, reason: 'no_tokens' };
  }

  const result = await startEncounter({
    campaignId,
    name: 'Encounter',
    initiativeMode: 'auto_all',
    seeds,
  });
  if (!result) {
    return { ok: false, reason: 'start_failed', message: 'startEncounter returned null.' };
  }
  return { ok: true, result, participantCount: seeds.length };
}
