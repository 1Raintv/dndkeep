// src/lib/participantForToken.ts — resolve a battle-map token to its combat
// participant.
//
// v2.746.0 — Combat participants are now PER INSTANCE (one per token) rather
// than per creature definition: three Goblin Scout tokens sharing one
// homebrew_monsters row become three participants, each carrying the
// combatant_id of its own token (startCombatFromMap / combatEncounter
// seedToRow). Every "token ↔ participant" lookup that keyed on entity_id
// alone (NpcTokenQuickPanel initiative edits, InitiativeStrip tile→token pan,
// BattleMapV2 activeTokenInfo, TokenLayer's fallback) therefore became
// ambiguous — goblin 2 would edit goblin 1's initiative. This is the one
// shared resolver so those call sites cannot drift:
//   1. combatant_id === token.combatantId  → that participant, always.
//   2. else, a definition match (character_id, or creatureId ?? npcId for
//      creatures) ONLY when exactly one participant matches — the legacy
//      per-definition encounter, or a scene with a single copy.
//   3. else null. We never guess between two same-definition participants;
//      a wrong guess silently edits the wrong creature, null makes the UI
//      degrade visibly.
// Pure and DB-free so it is unit-testable and importable from anywhere.

import { isCharacterParticipantType, isCreatureParticipantType } from './participantType';

export interface TokenForParticipantLookup {
  combatantId?: string | null;
  characterId: string | null;
  creatureId: string | null;
  /** Legacy alias of creatureId (v2.354) — still populated on older
   *  realtime payloads, so it is honoured as a fallback definition id. */
  npcId: string | null;
}

export interface ParticipantForTokenLookup {
  id: string;
  participant_type: string;
  entity_id: string | null;
  /** Optional so the full CombatParticipant (combatant_id?: …) fits. */
  combatant_id?: string | null;
}

export function findParticipantForToken<P extends ParticipantForTokenLookup>(
  token: TokenForParticipantLookup,
  participants: readonly P[],
): P | null {
  // 1. Instance identity — the only unambiguous link.
  if (token.combatantId) {
    const exact = participants.find(p => p.combatant_id === token.combatantId);
    if (exact) return exact;
  }
  // 2. Definition identity, accepted only when it cannot be wrong.
  let matches: P[];
  if (token.characterId) {
    const id = token.characterId;
    matches = participants.filter(p => isCharacterParticipantType(p.participant_type) && p.entity_id === id);
  } else {
    const id = token.creatureId ?? token.npcId;
    if (!id) return null;
    matches = participants.filter(p => isCreatureParticipantType(p.participant_type) && p.entity_id === id);
  }
  return matches.length === 1 ? matches[0] : null;
}
