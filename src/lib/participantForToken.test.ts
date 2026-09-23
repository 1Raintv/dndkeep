// v2.746.0 — token ↔ participant resolution now that participants are per
// instance. The rule under test: instance match wins, a definition match is
// only accepted when unique, and we never guess between two.
import { describe, expect, it } from 'vitest';
import { findParticipantForToken, type ParticipantForTokenLookup } from './participantForToken';

const p = (id: string, type: string, entity: string, combatant: string | null): ParticipantForTokenLookup =>
  ({ id, participant_type: type, entity_id: entity, combatant_id: combatant });

describe('findParticipantForToken', () => {
  it('combatant_id match wins over a definition match', () => {
    const g1 = p('p1', 'creature', 'goblin-def', 'cmb-1');
    const g2 = p('p2', 'creature', 'goblin-def', 'cmb-2');
    const token = { combatantId: 'cmb-2', characterId: null, creatureId: 'goblin-def', npcId: null };
    expect(findParticipantForToken(token, [g1, g2])).toBe(g2);
    // Even when the combatant-linked participant has a DIFFERENT definition
    // (e.g. a re-skinned token), the instance link is authoritative.
    const other = p('p3', 'creature', 'orc-def', 'cmb-x');
    expect(findParticipantForToken({ ...token, combatantId: 'cmb-x' }, [g1, other])).toBe(other);
  });

  it('two same-definition participants with no combatant match → null (never guess)', () => {
    const g1 = p('p1', 'creature', 'goblin-def', 'cmb-1');
    const g2 = p('p2', 'creature', 'goblin-def', 'cmb-2');
    // Token whose combatant is not in the encounter (e.g. duplicated after
    // combat started) — the definition matches both, so no answer.
    expect(findParticipantForToken({ combatantId: 'cmb-9', characterId: null, creatureId: 'goblin-def', npcId: null }, [g1, g2])).toBeNull();
    expect(findParticipantForToken({ characterId: null, creatureId: 'goblin-def', npcId: null }, [g1, g2])).toBeNull();
  });

  it('a character token never matches a creature participant sharing the same entity_id', () => {
    const creature = p('p1', 'creature', 'shared-id', 'cmb-1');
    const token = { combatantId: null, characterId: 'shared-id', creatureId: null, npcId: null };
    expect(findParticipantForToken(token, [creature])).toBeNull();
    const character = p('p2', 'character', 'shared-id', 'cmb-2');
    expect(findParticipantForToken(token, [creature, character])).toBe(character);
    // And a creature token does not match a character participant either
    // (legacy 'monster'/'npc' aliases still count as creatures).
    const legacy = p('p3', 'npc', 'shared-id', null);
    expect(findParticipantForToken({ combatantId: null, characterId: null, creatureId: 'shared-id', npcId: null }, [character, legacy])).toBe(legacy);
  });

  it('a token without combatantId falls back to the unique definition match (creatureId, then legacy npcId)', () => {
    const goblin = p('p1', 'creature', 'goblin-def', 'cmb-1');
    const orc = p('p2', 'creature', 'orc-def', 'cmb-2');
    expect(findParticipantForToken({ characterId: null, creatureId: 'goblin-def', npcId: null }, [goblin, orc])).toBe(goblin);
    expect(findParticipantForToken({ characterId: null, creatureId: null, npcId: 'orc-def' }, [goblin, orc])).toBe(orc);
    // Nothing to match on at all → null, not a throw.
    expect(findParticipantForToken({ characterId: null, creatureId: null, npcId: null }, [goblin, orc])).toBeNull();
    expect(findParticipantForToken({ combatantId: 'cmb-1', characterId: null, creatureId: null, npcId: null }, [])).toBeNull();
  });
});
