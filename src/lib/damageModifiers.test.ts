import {expect,it} from 'vitest';
import {applyDamageTypeModifiers,resolveResistances} from './damageModifiers';
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

it('all-damage resistance applies once and respects the untyped override',()=>{
 expect(applyDamageTypeModifiers(23,'psychic',target,{resistanceAll:true}).final).toBe(22);
 expect(applyDamageTypeModifiers(23,'fire',target,{resistanceAll:true}).final).toBe(11);
 expect(applyDamageTypeModifiers(23,null,target,{resistanceAll:true}).final).toBe(23);
});

it('uses selected legacy in damage math instead of giving every Tiefling fire resistance',()=>{
 const c={...target,species:'Tiefling',species_choices:{tieflingLegacy:'chthonic'}};
 expect(applyDamageTypeModifiers(23,'necrotic',c).final).toBe(11);expect(applyDamageTypeModifiers(23,'fire',c).final).toBe(23);
});
it('preserves manual resistance for legacy/custom characters and deduplicates normalized entries',()=>{
 expect(resolveResistances({...target,species:'Goliath',damage_resistances:[' Cold ','cold']})).toEqual(['cold']);
 expect(resolveResistances({...target,species:'Tiefling',species_choices:{tieflingLegacy:'abyssal'},damage_resistances:['POISON','fire']})).toEqual(['poison','fire']);
});
