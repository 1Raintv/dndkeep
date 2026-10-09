import { canUseClassAbility } from '../rules/classAbilityEligibility';
import { describe, expect, it, vi } from 'vitest';
// classAbilities -> gameUtils -> attunement reaches the DB client. These tests
// inspect reference data only and must never initialize a real client.
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { CLASS_COMBAT_ABILITIES } from './classAbilities';
import { CLASS_MAP } from './classes';
import { CLASS_FEATURES } from './classFeatures';
import { CLASS_LEVEL_PROGRESSION } from './levelProgression';
import { TELEKINETIC_PROPEL_TEXT, TELEKINETIC_PROPEL_SUMMARY, WARP_PROPEL_TEXT, WARP_PROPEL_SUMMARY } from './psionFeatureDescriptions';

describe('Psion Propel reference consistency', () => {
  it('keeps all Warp Propel references tied to the supplied complete rule', () => {
    const action = CLASS_COMBAT_ABILITIES.Psion.find(a => a.name === 'Warp Propel')!;
    const feature = CLASS_MAP.Psion.subclasses.find(s => s.name === 'Psi Warper')!.features!.find(f => f.name === 'Warp Propel')!;
    expect(action.description).toBe(WARP_PROPEL_SUMMARY);
    expect(action.descriptionLong).toContain(WARP_PROPEL_TEXT);
    expect(action.descriptionLong).toContain(TELEKINETIC_PROPEL_TEXT);
    expect(feature.description).toBe(WARP_PROPEL_TEXT);
    for (const text of [WARP_PROPEL_TEXT, WARP_PROPEL_SUMMARY]) {
      expect(text).toContain('unoccupied space you can see');
      expect(text).toMatch(/within 30 (feet|ft) of you/);
      expect(text).toContain('horizontal to you');
      expect(text).not.toMatch(/prone|where it was|Mass Teleportation/);
    }
    expect(action.descriptionLong).not.toMatch(/prone|where it was|Mass Teleportation/);
    expect(action.minLevel).toBe(3);
  });
  it('preserves targeting, straight movement, roll timing and conditional cost', () => {
    expect(TELEKINETIC_PROPEL_TEXT).toContain('Large or smaller creature other than you');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('you can see within 30 feet of yourself');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('Strength saving throw');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('straight toward you or straight away from you');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('when you take this Bonus Action');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('5 times the number rolled');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('only if the target fails');
    const action = CLASS_COMBAT_ABILITIES.Psion.find(a => a.name === 'Telekinetic Propel')!;
    expect(action.description).toBe(TELEKINETIC_PROPEL_SUMMARY);
    expect(action.descriptionLong).toContain(TELEKINETIC_PROPEL_TEXT);
    expect(CLASS_FEATURES.Psion.find(f => f.name === 'Psionic Power')!.description).toContain(TELEKINETIC_PROPEL_TEXT);
    expect(CLASS_LEVEL_PROGRESSION.Psion[0].features).toContain(`Telekinetic Propel: ${TELEKINETIC_PROPEL_SUMMARY}`);
  });
});

it('restricts every Psi Warper action and keeps base powers unrestricted', () => {
  const restricted = CLASS_COMBAT_ABILITIES.Psion.filter(a => a.requiredSubclass);
  expect(restricted.map(a => a.name)).toEqual([
    'Free Misty Step (Teleportation)', 'Warp Propel', 'Warp Space',
    'Teleporter Combat', 'Duplicitous Target', 'Mass Teleportation',
  ]);
  expect(restricted.every(a => a.requiredSubclass === 'Psi Warper')).toBe(true);
  for (const ability of restricted) {
    expect(canUseClassAbility(ability, { level: ability.minLevel - 1, subclass: 'Psi Warper' })).toBe(false);
    expect(canUseClassAbility(ability, { level: ability.minLevel, subclass: 'Psi Warper' })).toBe(true);
    for (const subclass of ['Metamorph', 'Psykinetic', 'Telepath', null]) {
      expect(canUseClassAbility(ability, { level: 20, subclass })).toBe(false);
    }
  }
  expect(CLASS_COMBAT_ABILITIES.Psion.find(a => a.name === 'Telekinetic Propel')!.requiredSubclass).toBeUndefined();
});
it('preserves the optional invisibility and Somatic exception in every Subtle Telekinesis description', () => {
  const action = CLASS_COMBAT_ABILITIES.Psion.find(a => a.name === 'Subtle Telekinesis')!;
  const feature = CLASS_FEATURES.Psion.find(a => a.name === 'Subtle Telekinesis')!;
  expect(action.description).toBe(feature.description);
  expect(feature.description).toContain('without Somatic components');
  expect(feature.description).toContain('choose to make');
  expect(feature.description).not.toContain('control');
  expect(CLASS_LEVEL_PROGRESSION.Psion[0].features).toContain(`Subtle Telekinesis: ${feature.description}`);
});

it('keeps Psi Warper targeting and movement limits consistent across sheet and creation',()=>{
 for(const name of ['Warp Space','Teleporter Combat','Duplicitous Target','Mass Teleportation']){
  const action=CLASS_COMBAT_ABILITIES.Psion.find(a=>a.name===name)!;
  const feature=CLASS_MAP.Psion.subclasses.find(s=>s.name==='Psi Warper')!.features!.find(f=>f.name===name)!;
  expect(action.description).toBe(feature.description);expect(action.descriptionLong).toBeUndefined();
 }
 const text=(name:string)=>String(CLASS_COMBAT_ABILITIES.Psion.find(a=>a.name===name)!.description);
 expect(text('Duplicitous Target')).toContain('not Incapacitated');expect(text('Duplicitous Target')).toContain('attack’s target');
 expect(text('Duplicitous Target')).not.toMatch(/attack hits|ally takes|both.*sight|full cover/i);
 expect(text('Warp Space')).toContain('as close to the center as possible');expect(text('Warp Space')).not.toContain('pulled up to 10');
 expect(text('Mass Teleportation')).toContain('Huge or smaller');expect(text('Mass Teleportation')).toContain('minimum 1');
 expect(text('Mass Teleportation')).not.toContain('space you can see');
 expect(text('Teleporter Combat')).toContain('one of your Psion cantrips');expect(text('Teleporter Combat')).toContain('same Bonus Action');
});
