import {expect,it} from 'vitest';
import {speciesResistances} from './speciesResistances';
it.each([['abyssal','poison'],['chthonic','necrotic'],['infernal','fire']])('uses the %s legacy', (legacy,type)=>{
 expect(speciesResistances('Tiefling',{tieflingLegacy:legacy})).toEqual([type]);
});
it('does not guess a missing or unknown legacy',()=>{
 for(const choice of [undefined,{}, {tieflingLegacy:'unknown'}] as (Record<string,string>|undefined)[])expect(speciesResistances('Tiefling',choice)).toEqual([]);
});
it('2024 Goliath has no automatic Cold resistance, including Frost ancestry',()=>{
 expect(speciesResistances('Goliath')).toEqual([]);expect(speciesResistances('Goliath',{giantAncestry:'frost'})).toEqual([]);
});
it('does not grant traits to a custom species merely containing a known name',()=>{
 expect(speciesResistances('Not a Dwarf')).toEqual([]);expect(speciesResistances('Human',{tieflingLegacy:'infernal'})).toEqual([]);
});
it('preserves supported unconditional traits and normalizes names',()=>{
 expect(speciesResistances(' DWARF ')).toEqual(['poison']);expect(speciesResistances('Yuan-ti')).toEqual(['poison']);
});
