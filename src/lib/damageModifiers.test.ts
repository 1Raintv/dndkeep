import {expect,it} from 'vitest';
import {applyDamageTypeModifiers} from './damageModifiers';
const target={species:'Human',damage_resistances:['psychic'],damage_vulnerabilities:['psychic'],damage_immunities:[]};
it('routes odd typed damage through ordered resistance/vulnerability math',()=>{
 expect(applyDamageTypeModifiers(23,'psychic',target)).toEqual({final:22,modifier:'resistant-vulnerable'});
});
it('normalizes stored damage type names without affecting untyped damage',()=>{
 expect(applyDamageTypeModifiers(23,' Psychic ',{...target,damage_resistances:['PSYCHIC']} ).final).toBe(22);
 expect(applyDamageTypeModifiers(23,null,target)).toEqual({final:23,modifier:'none'});
});
it('merges species resistance once and preserves immunity priority',()=>{
 expect(applyDamageTypeModifiers(15,'poison',{...target,species:'Dwarf',damage_resistances:['poison'],damage_vulnerabilities:['poison']})).toEqual({final:14,modifier:'resistant-vulnerable'});
 expect(applyDamageTypeModifiers(23,'psychic',{...target,damage_immunities:['Psychic']})).toEqual({final:0,modifier:'immune'});
});
it('keeps successful-save rounding before resistance and vulnerability',()=>{
 expect(applyDamageTypeModifiers(Math.floor(47/2),'psychic',target).final).toBe(22);
});
