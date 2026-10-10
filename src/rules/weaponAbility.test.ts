import {expect,it} from 'vitest';
import {weaponAbilityModifier,parseWeaponAbilityModifier} from './weaponAbility';
it.each([
 {str:4,dex:-1,melee:4,ranged:-1,finesse:4},
 {str:-1,dex:4,melee:-1,ranged:4,finesse:4},
 {str:0,dex:0,melee:0,ranged:0,finesse:0},
 {str:-3,dex:-1,melee:-3,ranged:-1,finesse:-1},
 {str:10,dex:2,melee:10,ranged:2,finesse:10},
])('selects weapon abilities for STR $str / DEX $dex',({str,dex,melee,ranged,finesse})=>{
 expect(weaponAbilityModifier(str,dex,{ranged:false})).toBe(melee);
 expect(weaponAbilityModifier(str,dex,{ranged:true})).toBe(ranged);
 expect(weaponAbilityModifier(str,dex,{ranged:false,finesse:true})).toBe(finesse);
 expect(weaponAbilityModifier(str,dex,{ranged:true,finesse:true})).toBe(finesse);
});

it.each([['',undefined],['  ',undefined],['+4',4],['0',0],['-2',-2]])('accepts an explicit modifier %s without guessing', (text,value)=>{
 expect(parseWeaponAbilityModifier(text as string)).toEqual({valid:true,value});
});
it.each(['1.5','4abc','1e3','NaN','Infinity','2147483648','-2147483649'])('refuses invalid modifier %s',text=>{
 expect(parseWeaponAbilityModifier(text)).toEqual({valid:false});
});
