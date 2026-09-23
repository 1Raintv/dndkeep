// v2.746.0 — per-token HP state now that participants are per instance.
import { describe, expect, it } from 'vitest';
import { buildTokenStateByTokenId, type TokenCombatState } from './tokenCombatState';

const state = (hp: number, over: Partial<TokenCombatState> = {}): TokenCombatState =>
  ({ current_hp: hp, max_hp: 7, conditions: [], is_dead: false, ...over });

describe('buildTokenStateByTokenId', () => {
  it('three tokens sharing one definition get three distinct entries keyed by token id', () => {
    const participants = [
      { combatant_id: 'cmb-1', current_hp: 7, max_hp: 7, active_conditions: [], is_dead: false },
      { combatant_id: 'cmb-2', current_hp: 3, max_hp: 7, active_conditions: ['Prone'], is_dead: false },
      { combatant_id: 'cmb-3', current_hp: 0, max_hp: 7, active_conditions: [], is_dead: true },
    ];
    const tokens = {
      t1: { id: 't1', combatantId: 'cmb-1' },
      t2: { id: 't2', combatantId: 'cmb-2' },
      t3: { id: 't3', combatantId: 'cmb-3' },
    };
    const out = buildTokenStateByTokenId(participants, undefined, tokens);
    expect(out.get('t1')).toEqual(state(7));
    expect(out.get('t2')).toEqual(state(3, { conditions: ['Prone'] }));
    expect(out.get('t3')).toEqual(state(0, { is_dead: true }));
    expect(out.size).toBe(3);
    // Same answer when tokens arrive as an array.
    expect(buildTokenStateByTokenId(participants, undefined, Object.values(tokens)).get('t2')).toEqual(state(3, { conditions: ['Prone'] }));
  });

  it('tokens without combatantId are untouched and null HP fields are normalised', () => {
    const participants = [{ combatant_id: 'cmb-1', current_hp: null, max_hp: undefined, active_conditions: null, is_dead: null }];
    const tokens = [
      { id: 'legacy' },
      { id: 'nul', combatantId: null },
      { id: 'linked', combatantId: 'cmb-1' },
    ];
    const out = buildTokenStateByTokenId(participants, null, tokens);
    expect(out.has('legacy')).toBe(false);
    expect(out.has('nul')).toBe(false);
    expect(out.get('linked')).toEqual({ current_hp: null, max_hp: null, conditions: [], is_dead: false });
  });

  it('preserves existing tokenStateMap entries, re-keys combatant-keyed ones, and lets a live participant override', () => {
    const upstream = new Map<string, TokenCombatState>([
      ['untouched', state(5)],          // a token not in the encounter, keyed by token id
      ['cmb-out', state(2)],            // keyed by combatants.id ≠ token.id (sync trigger did not fire)
      ['t-live', state(9, { conditions: ['stale'] })], // stale flat-SELECT row for a token in combat
    ]);
    const participants = [{ combatant_id: 'cmb-live', current_hp: 1, max_hp: 9, active_conditions: ['Blinded'], is_dead: false }];
    const tokens = [
      { id: 'untouched', combatantId: 'cmb-untouched' },
      { id: 't-out', combatantId: 'cmb-out' },
      { id: 't-live', combatantId: 'cmb-live' },
    ];
    const out = buildTokenStateByTokenId(participants, upstream, tokens);
    expect(out.get('untouched')).toEqual(state(5));
    expect(out.get('t-out')).toEqual(state(2));
    expect(out.get('cmb-out')).toEqual(state(2)); // original key kept for legacy readers
    expect(out.get('t-live')).toEqual(state(1, { max_hp: 9, conditions: ['Blinded'] }));
    // Input map is never mutated.
    expect(upstream.get('t-live')).toEqual(state(9, { conditions: ['stale'] }));
    expect(upstream.has('t-out')).toBe(false);
  });
});
