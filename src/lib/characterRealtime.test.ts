import {expect,it} from 'vitest';
import type {Character} from '../types';
import {reconcileCharacterUpdate} from './characterRealtime';
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
