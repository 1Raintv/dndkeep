import {expect,it} from 'vitest';
import {characterProficiencyBonus,proficiencyBonus} from './proficiency';
it.each([[1,2],[4,2],[5,3],[8,3],[9,4],[12,4],[13,5],[16,5],[17,6],[20,6]])('total level %i gives +%i',(level,pb)=>{
 expect(proficiencyBonus(level)).toBe(pb);
 if(level>1)expect(characterProficiencyBonus({level:1,secondary_class:'Psion',secondary_level:level-1})).toBe(pb);
});
it('ignores stale secondary levels without a secondary class',()=>expect(characterProficiencyBonus({level:4,secondary_level:16})).toBe(2));
it.each([null,undefined,-1,1.5,NaN])('ignores invalid secondary level %s',secondary_level=>expect(characterProficiencyBonus({level:4,secondary_class:'Psion',secondary_level})).toBe(2));
it('retains level bounds and a finite fallback',()=>{
 expect(proficiencyBonus(0)).toBe(2);expect(proficiencyBonus(25)).toBe(6);expect(proficiencyBonus(NaN)).toBe(2);
});
