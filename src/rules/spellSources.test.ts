import {expect,it} from 'vitest';
import {isSpellSources} from './spellSources';
it.each([{}, {spell:[]}, {spell:['class:Psion','class:Wizard','feat','species','other']}, {spell:['class:Eldritch Knight']}])('accepts explicit or unknown sources %j',value=>{
 expect(isSpellSources(value)).toBe(true);
});
it.each([null,[],true,1,'bad',{'':[]},{spell:null},{spell:'class:Psion'},{spell:[1]},{spell:[{}]},{spell:['class:']},{spell:['class: Wizard']},{spell:['class:Wizard ']},{spell:['unknown']}])('rejects malformed sources %j',value=>{
 expect(isSpellSources(value)).toBe(false);
});
