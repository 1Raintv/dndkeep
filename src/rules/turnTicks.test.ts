import { describe, expect, it, vi } from 'vitest';
import { planTurnTicks, type TickingBuff, type TurnTick, type TurnTickState } from './turnTicks';
const buff = (key: string, tick: Partial<TurnTick> = {}): TickingBuff => ({
  key, name: key, turnTick: {kind: 'damage', timing: 'turn_end', flat: 5, ...tick},
});
const state = (patch: Partial<TurnTickState<TickingBuff>> = {}): TurnTickState<TickingBuff> => ({
  current_hp: 10, max_hp: 20, temp_hp: 2, death_save_failures: 0,
  death_save_successes: 0, is_stable: false, is_dead: false, active_buffs: [], ...patch,
});

describe('ordered turn-effect proposals', () => {
  it('rolls only matching effects and preserves unrelated buff metadata without mutation', () => {
    const buffs = [buff('start', {timing: 'turn_start', dice: '1d6'}),
      {...buff('end', {dice: '2d4', flat: 3, oneShot: true}), source: 'caster'},
      {key: 'bless', name: 'Bless', saveBonus: '1d4'}];
    const before = state({active_buffs: buffs});
    const original = structuredClone(before);
    Object.freeze(before); buffs.forEach(Object.freeze); Object.freeze(buffs);
    const roll = vi.fn(() => 6);
    const result = planTurnTicks(before, true, 'turn_end', roll);
    expect(roll.mock.calls).toEqual([['2d4']]);
    expect(result.updates.current_hp).toBe(3);
    expect(result.updates.temp_hp).toBe(0);
    expect(result.updates.active_buffs).toEqual([buffs[0], buffs[2]]);
    expect(result.events.map(e => e.eventType)).toEqual(['damage_applied', 'spell_effect_removed']);
    expect(before).toEqual(original);
  });
  it('processes damage, save request and one-shot removal in that order', () => {
    const result = planTurnTicks(state({active_buffs: [buff('fire', {
      saveEnds: {ability: 'con', dc: 15}, oneShot: true,
    })]}), true, 'turn_end');
    expect(result.events.map(e => e.eventType)).toEqual(['damage_applied', 'save_requested', 'spell_effect_removed']);
    expect(result.events[1].payload).toMatchObject({ability: 'con', dc: 15});
  });
  it('stops before later dice, healing or save requests after lethal damage', () => {
    const roll = vi.fn(() => 99);
    const result = planTurnTicks(state({current_hp: 0, active_buffs: [
      buff('lethal', {flat: 20, oneShot: true, saveEnds: {ability: 'con', dc: 15}}),
      buff('healing', {kind: 'heal', dice: '1d8', oneShot: true}),
    ]}), true, 'turn_end', roll);
    expect(roll).not.toHaveBeenCalled();
    expect(result.updates).toMatchObject({current_hp: 0, is_dead: true, death_save_failures: 3});
    expect(result.updates.active_buffs.map(b => b.key)).toEqual(['healing']);
    expect(result.events.map(e => e.eventType)).toEqual(['damage_at_0_hp_failure_added', 'spell_effect_removed']);
  });
  it('ordinary creature death stops later healing and save requests',()=>{
    const roll=vi.fn(()=>7);
    const result=planTurnTicks(state({current_hp:3,temp_hp:2,active_buffs:[
      buff('lethal',{flat:5,saveEnds:{ability:'con',dc:15}}),buff('heal',{kind:'heal',dice:'1d8'}),
    ]}),false,'turn_end',roll);
    expect(result.updates).toMatchObject({current_hp:0,is_dead:true,death_save_failures:0});
    expect(result.events.map(e=>e.eventType)).toEqual(['damage_applied']);expect(roll).not.toHaveBeenCalled();
  });
  it('healing from zero resets counters before a later nonlethal hit', () => {
    const result = planTurnTicks(state({current_hp: 0, temp_hp: 0, is_stable: true,
      death_save_failures: 2, death_save_successes: 2, active_buffs: [
        buff('heal', {kind: 'heal', flat: 6}), buff('damage', {flat: 4}),
      ]}), true, 'turn_end');
    expect(result.updates).toMatchObject({current_hp: 2, death_save_failures: 0, death_save_successes: 0, is_stable: false});
    expect(result.events[0].payload).toMatchObject({amount: 6, woke_up: true});
    expect(result.events[1].eventType).toBe('damage_applied');
  });
  it('caps healing and reports only HP actually restored', () => {
    const result = planTurnTicks(state({current_hp: 19, active_buffs: [buff('heal', {kind: 'heal', flat: 10})]}), true, 'turn_end');
    expect(result.updates).toMatchObject({current_hp: 20, temp_hp: 2});
    expect(result.events[0].payload.amount).toBe(1);
  });
  it('preserves the existing higher-temp-HP policy without stacking', () => {
    const result = planTurnTicks(state({temp_hp: 6, active_buffs: [
      buff('lower', {kind: 'temp_hp', flat: 4}), buff('higher', {kind: 'temp_hp', flat: 8}),
    ]}), true, 'turn_end');
    expect(result.updates.temp_hp).toBe(8);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].payload).toMatchObject({amount: 8, source_buff: 'higher'});
  });
  it('does not roll or resurrect an already dead creature', () => {
    const roll = vi.fn(() => 5);
    const result = planTurnTicks(state({is_dead: true, current_hp: 0, active_buffs: [
      buff('heal', {kind: 'heal', dice: '1d6', oneShot: true}),
    ]}), true, 'turn_end', roll);
    expect(roll).not.toHaveBeenCalled(); expect(result.events).toEqual([]);
    expect(result.updates).toMatchObject({current_hp: 0, is_dead: true});
    expect(result.updates.active_buffs).toHaveLength(1);
  });
  it('does not assign character death-save failures to a creature at zero', () => {
    const result = planTurnTicks(state({current_hp: 0, active_buffs: [buff('acid')]}), false, 'turn_end');
    expect(result.updates.death_save_failures).toBe(0);
    expect(result.events[0].eventType).toBe('damage_applied');
  });
  it('removes a fired one-shot even when its amount is zero', () => {
    const result = planTurnTicks(state({active_buffs: [buff('zero', {flat: 0, oneShot: true})]}), true, 'turn_end');
    expect(result.updates.active_buffs).toEqual([]);
    expect(result.events.map(e => e.eventType)).toEqual(['spell_effect_removed']);
  });
  it('returns a complete unchanged proposal when there are no buffs', () => {
    const before = state({active_buffs: null});
    const result = planTurnTicks(before, true, 'turn_start');
    expect(result.updates).toEqual({current_hp: 10, temp_hp: 2,
      death_save_failures: 0, death_save_successes: 0,
      is_stable: false, is_dead: false, active_buffs: []});
    expect(result.events).toEqual([]);
  });
});
