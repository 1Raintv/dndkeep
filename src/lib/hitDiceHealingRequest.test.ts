import {expect,it} from 'vitest';
import type {Character} from '../types';
import {createHitDiceHealingRequest,validHitDiceHealingRequest} from './hitDiceHealingRequest';
const character={current_hp:1,max_hp:20,hit_point_revision:3,psionic_hit_dice_revision:2,constitution:4,inventory:[{id:'item',equipped:true}]} as unknown as Character;
it('freezes the selected size, rolls and effective-CON input context',()=>{
 const c=structuredClone(character),rolls=[1,6];const request=createHitDiceHealingRequest(c,6,rolls,-3,'11111111-1111-4111-8111-111111111111');
 rolls[0]=5;c.current_hp=12;c.inventory[0].equipped=false;
 expect(request).toMatchObject({hitDie:6,rolls:[1,6],constitutionModifier:-3,expected:{current_hp:1,hit_point_revision:3,inventory:[{equipped:true}]}});
 expect(validHitDiceHealingRequest(JSON.parse(JSON.stringify(request)))).toBe(true);
});
it.each([{current_hp:0},{current_hp:20},{max_hp:0},{hit_point_revision:undefined},{hit_point_revision:-1},{psionic_hit_dice_revision:undefined}])('refuses an ineligible or incomplete snapshot %j',patch=>{
 expect(()=>createHitDiceHealingRequest({...character,...patch},6,[1],-3,'11111111-1111-4111-8111-111111111111')).toThrow(/Reload the sheet/);
});
it('rejects corrupted saved dice, snapshots and modifier values',()=>{
 const request=createHitDiceHealingRequest(character,6,[1],-3,'11111111-1111-4111-8111-111111111111');
 for(const patch of [{rolls:[]},{rolls:[0]},{rolls:[7]},{rolls:Array(21).fill(1)},{hitDie:7},{hitDie:'6'},{constitutionModifier:1.5},{constitutionModifier:11},{sourceFeature:'Other'},{expected:{...request.expected,extra:true}}])expect(validHitDiceHealingRequest({...request,...patch})).toBe(false);
});
