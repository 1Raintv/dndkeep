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
// v2.646 (audit 4.6 slice 3): this module no longer reaches into the UI
// store — the caller injects the map snapshot (StartCombatButton already
// subscribes to it for the token-count preview). Lib→store dependency
// inverted; module is unit-testable without React.
import type { Token } from './map/mapTypes';
import * as scenesApi from './api/scenes';
// v2.495.0 — Pre-v2.495 this file bypassed tokensApiRouter because its
// singleton cache was only set after BattleMapV2 mounted. The new
// router resolves the flag per-call (memoized per campaign), so the
// inline `useNewPath = await getUseCombatantsFlag(...)` branching is
// dropped in favor of a single `tokensApi.listTokens` call.
import * as tokensApi from './api/tokensApiRouter';
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
//
// v2.746.0 — one combat participant per TOKEN, not per definition. The
// old Set-of-creatureIds collapsed three Goblin Scout tokens (one
// homebrew_monsters row) into ONE participant, so two of the three
// goblins could never be targeted, never got their own HP bar, and the
// trigger's unordered LIMIT 1 could bind that one participant to a
// goblin on a different scene. Each token now seeds its own participant
// carrying its placement's combatantId (the combatants row the token
// IS) and the token's on-map name (a DM rename flows into initiative).
// Characters stay one per character regardless of token count.
type TokenLite = {
  id: string;
  name: string;
  characterId: string | null;
  creatureId: string | null;
  /** The placement's combatants.id (new path). Null on the legacy
   *  scene_tokens path, which has no per-instance key — those tokens
   *  keep the old one-per-definition dedupe. */
  combatantId: string | null;
};

const toLite = (t: Token): TokenLite => ({
  id: t.id,
  name: t.name ?? '',
  characterId: t.characterId ?? null,
  creatureId: t.creatureId ?? null,
  combatantId: t.combatantId ?? null,
});

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
  // v2.390.0 — Honor the use_combatants_for_battlemap flag.
  // v2.495.0 — Now flows through the router (whose new per-campaign
  // memoized flag cache works correctly here even though BattleMapV2
  // hasn't mounted: the router does its own lookup on the first
  // listTokens call and caches the result).
  const scenes = await scenesApi.listScenes(campaignId);
  if (scenes.length === 0) return null;
  const sceneId = scenes[0].id;

  // Both legacy and new path return the same Token shape with
  // characterId/creatureId populated — those two fields are all
  // we need here.
  const tokens = await tokensApi.listTokens(sceneId, { campaignId });

  return tokens.map(toLite);
}

export async function startCombatFromMapTokens(
  campaignId: string,
  /** The caller's live view of the map (v2.646: injected, not read from
   *  the store here). sceneId null = map never mounted → DB cold path. */
  map: { sceneId: string | null; tokens: Token[] },
): Promise<StartCombatFromMapResult> {
  const sceneId = map.sceneId;

  // Fast path: snapshot is primed (DM has the battle map mounted).
  // Cold path: no mounted scene — fall back to a direct DB read so
  // the click works regardless of which tab the DM is on.
  let tokens: TokenLite[];
  if (sceneId) {
    tokens = map.tokens
      .filter(t => t.sceneId === sceneId)
      .map(toLite);
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
  // v2.746: creature TOKENS are kept (one seed each); the definition
  // Set only drives the single batched homebrew_monsters fetch.
  const characterIds = new Set<string>();
  const creatureTokens: TokenLite[] = [];
  const creatureIds = new Set<string>();
  for (const t of tokens) {
    if (t.characterId) characterIds.add(t.characterId);
    else if (t.creatureId) { creatureTokens.push(t); creatureIds.add(t.creatureId); }
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
  // creatures (alphabetical by name, then token id so two tokens with
  // the same name still order deterministically). Initiative roll
  // randomization happens inside startEncounter regardless of seed order.
  const seeds: SeedSource[] = [];
  for (const c of characters.sort((a, b) => a.name.localeCompare(b.name))) {
    seeds.push(characterToSeed(c));
  }
  const creatureSeed = (cr: CreatureLite): SeedSource => ({
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
  const byDef = new Map(creatures.map(cr => [cr.id, cr]));
  // v2.746 — one seed per token that has a per-instance key. The seed
  // carries the token's combatantId (bypasses the trigger's guess) and
  // the token's own name, so "Goblin Scout (archer)" on the map reads
  // the same in the initiative strip and every target picker.
  const creatureSeeds: Array<{ seed: SeedSource; tokenId: string }> = [];
  const legacyDefs = new Set<string>();
  for (const t of creatureTokens) {
    const cr = t.creatureId ? byDef.get(t.creatureId) : undefined;
    if (!cr) continue; // definition missing (deleted creature) — token skipped
    if (t.combatantId) {
      creatureSeeds.push({
        seed: { ...creatureSeed(cr), combatantId: t.combatantId, name: t.name.trim() || cr.name },
        tokenId: t.id,
      });
    } else if (!legacyDefs.has(cr.id)) {
      // Legacy scene_tokens path: no combatant instance to bind to, so
      // the pre-v2.746 one-per-definition dedupe stays (nothing regresses).
      legacyDefs.add(cr.id);
      creatureSeeds.push({ seed: creatureSeed(cr), tokenId: t.id });
    }
  }
  creatureSeeds.sort((a, b) => a.seed.name.localeCompare(b.seed.name) || a.tokenId.localeCompare(b.tokenId));
  for (const { seed } of creatureSeeds) seeds.push(seed);

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
