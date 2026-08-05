/**
 * Pins for deriveCurrentActor (audit 4.6 prep) — the exact semantics
 * CombatContext has shipped with. If the state move changes any of
 * these, it changed COMBAT behavior, not plumbing.
 */
import { describe, it, expect } from 'vitest';
import { deriveCurrentActor } from './combatSelectors';
import type { CombatParticipant } from '../types';

const p = (id: string, turn_order: number, over: Partial<CombatParticipant> = {}) =>
  ({ id, name: id, turn_order, is_dead: false, ...over }) as unknown as CombatParticipant;

describe('deriveCurrentActor', () => {
  it('null encounter → null', () => {
    expect(deriveCurrentActor(null, [p('a', 0)])).toBeNull();
  });

  it('indexes into participants sorted by turn_order, not array order', () => {
    const parts = [p('slow', 2), p('fast', 0), p('mid', 1)];
    expect(deriveCurrentActor({ current_turn_index: 0 }, parts)?.id).toBe('fast');
    expect(deriveCurrentActor({ current_turn_index: 2 }, parts)?.id).toBe('slow');
  });

  it('dead participants are excluded BEFORE indexing (death shifts the index target)', () => {
    const parts = [p('a', 0, { is_dead: true }), p('b', 1), p('c', 2)];
    // index 0 lands on b (a is dead), index 1 lands on c
    expect(deriveCurrentActor({ current_turn_index: 0 }, parts)?.id).toBe('b');
    expect(deriveCurrentActor({ current_turn_index: 1 }, parts)?.id).toBe('c');
  });

  it('hidden participants are NOT excluded (only death filters)', () => {
    const parts = [p('hidden', 0, { hidden_from_players: true } as never), p('b', 1)];
    expect(deriveCurrentActor({ current_turn_index: 0 }, parts)?.id).toBe('hidden');
  });

  it('out-of-range index → null, never a wrap-around', () => {
    expect(deriveCurrentActor({ current_turn_index: 5 }, [p('a', 0)])).toBeNull();
  });

  it('does not mutate the input array order', () => {
    const parts = [p('z', 1), p('a', 0)];
    deriveCurrentActor({ current_turn_index: 0 }, parts);
    expect(parts.map(x => x.id)).toEqual(['z', 'a']);
  });
});
