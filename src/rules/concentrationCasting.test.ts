import {expect,it} from 'vitest';
import {concentrationCastingNumbers,isConcentrationCastingContext} from './concentrationCasting';
const context={requestId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',spellId:'detect-magic',slotLevel:1,rounds:100,source:'class:Psion',ability:'intelligence'};
it('reconstructs the active cast using its recorded ability rather than primary class',()=>{
 expect(concentrationCastingNumbers(context,'detect-magic',{intelligence:4,wisdom:1,charisma:-1},5)).toMatchObject({modifier:4,attack:9,saveDC:17});
 expect(concentrationCastingNumbers({...context,source:'class:Cleric',ability:'wisdom'},'detect-magic',{intelligence:4,wisdom:1,charisma:-1},5)).toMatchObject({modifier:1,saveDC:14});
});
it('leaves legacy, mismatched and malformed cast context unresolved',()=>{
 for(const c of [null,{}, {...context,requestId:'bad'}, {...context,ability:'strength'}, {...context,slotLevel:10}, {...context,source:'invented'}, {...context,rounds:0}])expect(isConcentrationCastingContext(c)).toBe(false);
 expect(concentrationCastingNumbers(context,'invisibility',{intelligence:4,wisdom:1,charisma:-1},5)).toBeNull();
});
