import {expect,it} from 'vitest';
import type {Character} from '../types';
import {acceptPsionicRestReceipt,acceptPsionicEnergyReceipt,reconcileCharacterUpdate} from './characterRealtime';
const character={id:'pc',current_hp:20,hit_dice_spent:2,feature_uses:{'Telepathic Connection':1},class_resources:{'psionic-energy-dice':2}} as unknown as Character;
it('accepts consecutive echoes before a React render, including a return to the original value',()=>{
 const ref={current:character};
 expect(reconcileCharacterUpdate(ref,{feature_uses:{}},{}).patch).toEqual({feature_uses:{}});
 expect(reconcileCharacterUpdate(ref,{feature_uses:character.feature_uses},{}).patch).toEqual({feature_uses:character.feature_uses});
 expect(ref.current.feature_uses).toEqual({'Telepathic Connection':1});
});
it('preserves queued local resource values while applying unrelated remote damage',()=>{
 const ref={current:character};
 const {previous,patch}=reconcileCharacterUpdate(ref,{current_hp:12,feature_uses:{},hit_dice_spent:0},
  {feature_uses:character.feature_uses,hit_dice_spent:3});
 expect(previous).toBe(character);
 expect(patch).toEqual({current_hp:12,hit_dice_spent:3});
 expect(ref.current.feature_uses).toEqual(character.feature_uses);
});
it('ignores non-syncable fields and unchanged objects; applies zero, null and empty arrays',()=>{
 const ref={current:character};
 expect(reconcileCharacterUpdate(ref,{name:'remote rename',feature_uses:{'Telepathic Connection':1}},{}).patch).toEqual({});
 expect(ref.current).toBe(character);
 expect(reconcileCharacterUpdate(ref,{current_hp:0,concentration_rounds_remaining:null,active_conditions:[]},{}).patch)
  .toEqual({current_hp:0,concentration_rounds_remaining:null,active_conditions:[]});
});

it('ignores delayed Hit Point Dice receipts but accepts newer rest recovery',()=>{
 const ref={current:{...character,hit_dice_spent:3,psionic_hit_dice_revision:2}};
 expect(reconcileCharacterUpdate(ref,{hit_dice_spent:2,psionic_hit_dice_revision:1},{}).patch).toEqual({});
 expect(reconcileCharacterUpdate(ref,{hit_dice_spent:0,psionic_hit_dice_revision:3},{}).patch).toEqual({hit_dice_spent:0,psionic_hit_dice_revision:3});
 expect(reconcileCharacterUpdate(ref,{hit_dice_spent:3,psionic_hit_dice_revision:2},{}).patch).toEqual({});
});
it('keeps a queued local rest while recording the paid receipt revision',()=>{
 const ref={current:{...character,psionic_hit_dice_revision:0}};
 expect(reconcileCharacterUpdate(ref,{hit_dice_spent:3,psionic_hit_dice_revision:1},{hit_dice_spent:0}).patch).toEqual({hit_dice_spent:0,psionic_hit_dice_revision:1});
});

it('accepts Energy Dice payments without replacing unrelated resources or feature uses',()=>{
 const ref={current:{...character,class_resources:{'psionic-energy-dice':6,Other:8},psionic_energy_revision:1}};
 acceptPsionicEnergyReceipt(ref,{remaining:4,energyRevision:2,restorationResource:null,restorationUsed:null});
 expect(ref.current.class_resources).toEqual({'psionic-energy-dice':4,Other:8});expect(ref.current.feature_uses).toEqual({'Telepathic Connection':1});
 acceptPsionicEnergyReceipt(ref,{remaining:5,energyRevision:1,restorationResource:0,restorationUsed:1});
 expect(ref.current.class_resources).toEqual({'psionic-energy-dice':4,Other:8});expect(ref.current.feature_uses).toEqual({'Telepathic Connection':1});
});
it('keeps newer Restoration recovery while accepting unrelated changes from an older echo',()=>{
 const ref={current:{...character,psionic_energy_revision:3}};
 acceptPsionicEnergyReceipt(ref,{remaining:6,energyRevision:4,restorationResource:0,restorationUsed:1});
 reconcileCharacterUpdate(ref,{class_resources:{'psionic-energy-dice':1,Other:9},feature_uses:{Other:2},psionic_energy_revision:3},{});
 expect(ref.current.class_resources).toEqual({'psionic-energy-dice':6,'psionic-restoration':0,Other:9});
 expect(ref.current.feature_uses).toEqual({'Psionic Restoration':1,'Telepathic Connection':1,Other:2});expect(ref.current.psionic_energy_revision).toBe(4);
 acceptPsionicEnergyReceipt(ref,{remaining:6,energyRevision:5,restorationResource:1,restorationUsed:null,connectionUsed:null});
 expect(ref.current.feature_uses).toEqual({Other:2});expect(ref.current.class_resources?.['psionic-restoration']).toBe(1);
});

it('a delayed rest preserves newer HP, exhaustion and sibling resources while acknowledging its dice',()=>{
 const ref={current:{...character,current_hp:12,exhaustion_level:1,class_resources:{'psionic-energy-dice':2,Other:9},psionic_energy_revision:1}};
 const expected={current_hp:20,exhaustion_level:2,class_resources:{'psionic-energy-dice':2,Other:7},feature_uses:character.feature_uses};
 const saved={...character,current_hp:40,exhaustion_level:1,class_resources:{'psionic-energy-dice':6,Other:7},feature_uses:{},psionic_energy_revision:2};
 acceptPsionicRestReceipt(ref,{character:saved,expected});
 expect(ref.current).toMatchObject({current_hp:12,exhaustion_level:1,class_resources:{'psionic-energy-dice':6,Other:9},feature_uses:{}});
});
it('rest receipts restore unchanged captured fields, preserve pending edits and reject old dice revisions',()=>{
 const ref={current:{...character,psionic_energy_revision:5,psionic_hit_dice_revision:4}};
 acceptPsionicRestReceipt(ref,{character:{...character,current_hp:40,hit_dice_spent:0,psionic_energy_revision:4,psionic_hit_dice_revision:3,class_resources:{'psionic-energy-dice':6}},expected:{current_hp:20,hit_dice_spent:2,class_resources:character.class_resources}},{current_hp:17});
 expect(ref.current).toMatchObject({current_hp:17,hit_dice_spent:2,psionic_energy_revision:5,class_resources:{'psionic-energy-dice':2}});
});
