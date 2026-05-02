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
//
// v2.385.0 — Cold-start fallback. The original implementation read
// scene + tokens out of useBattleMapStore, which is only populated
// after the user has opened the Battle Map tab. If a DM clicked
// Start Combat without ever visiting the map, the call returned
// no_scene and the UI nagged them to "open the battle map first."
// Now: if the store is empty, we hit Postgres directly for the
// most-recent scene + its scene_tokens. The store path stays as the
// fast path when it's primed.

import { supabase } from './supabase';
import { useBattleMapStore } from './stores/battleMapStore';
import * as scenesApi from './api/scenes';
import {
  startEncounter, characterToSeed,
  type SeedSource, type StartEncounterResult,
} from './combatEncounter';
import { abilityModifier } from './gameUtils';
import type { Character } from '../types';

export type StartCombatFromMapResult =
  | { ok: true; result: StartEncounterResult; participantCount: number }
  | { ok: false; reason: 'no_scene' | 'no_tokens' | 'start_failed'; message?: string };

// Minimal token shape we need to build seeds. Both the store path
// and the DB-fallback path normalize into this.
type TokenLite = {
  characterId: string | null;
  creatureId: string | null;
};

async function loadTokensFromDb(campaignId: string): Promise<TokenLite[] | null> {
  // v2.389.0 — Pick the same scene BattleMapV2 will auto-load on
  // mount, not "most recently updated". Previously this chose by
  // updated_at DESC; BattleMapV2 mounts and picks `listScenes()[0]`,
  // which orders by created_at ASC (oldest first). When those
  // disagreed (DM has multiple scenes; recently edited Scene B but
  // Scene A is older), Start Combat would seed an encounter from
  // Scene B's tokens, then auto-navigate would load Scene A on the
  // map → DM sees the wrong scene during the encounter they just
  // started. Aligning heuristics fixes it: scene the DM ends up
  // looking at == scene whose tokens are in the encounter.
  //
  // Future polish: persist `last_scene_id` per-campaign so the
  // chosen scene tracks DM intent rather than creation order.
  // Out of scope here — would need a schema migration plus plumbing
  // through both BattleMapV2's mount and this fallback.
  const scenes = await scenesApi.listScenes(campaignId);
  if (scenes.length === 0) return null;
  const sceneId = scenes[0].id;

  const { data: rows, error: tokErr } = await supabase
    .from('scene_tokens')
    .select('character_id, creature_id')
    .eq('scene_id', sceneId);
  if (tokErr) {
    console.error('[startCombatFromMap] scene_tokens fetch failed', tokErr);
    return null;
  }
  return (rows ?? []).map(r => ({
    characterId: (r as { character_id: string | null }).character_id ?? null,
    creatureId: (r as { creature_id: string | null }).creature_id ?? null,
  }));
}

export async function startCombatFromMapTokens(
  campaignId: string,
): Promise<StartCombatFromMapResult> {
  const state = useBattleMapStore.getState();
  const sceneId = state.currentSceneId;

  // Fast path: store is primed (DM has the battle map mounted).
  // Cold path: store is empty — fall back to a direct DB read so
  // the click works regardless of which tab the DM is on.
  let tokens: TokenLite[];
  if (sceneId) {
    tokens = Object.values(state.tokens)
      .filter(t => t.sceneId === sceneId)
      .map(t => ({ characterId: t.characterId ?? null, creatureId: t.creatureId ?? null }));
  } else {
    const fromDb = await loadTokensFromDb(campaignId);
    if (fromDb === null) {
      // No scene exists for this campaign at all.
      return { ok: false, reason: 'no_scene' };
    }
    tokens = fromDb;
  }

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
