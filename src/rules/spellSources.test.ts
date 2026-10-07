import {expect,it} from 'vitest';
import {isSpellSources,spellSourceIncludesClass,learnClassSpell,forgetClassSpell} from './spellSources';
it.each([{}, {spell:[]}, {spell:['class:Psion','class:Wizard','feat','species','other']}, {spell:['class:Eldritch Knight']}])('accepts explicit or unknown sources %j',value=>{
 expect(isSpellSources(value)).toBe(true);
});
it.each([null,[],true,1,'bad',{'':[]},{spell:null},{spell:'class:Psion'},{spell:[1]},{spell:[{}]},{spell:['class:']},{spell:['class: Wizard']},{spell:['class:Wizard ']},{spell:['unknown']}])('rejects malformed sources %j',value=>{
 expect(isSpellSources(value)).toBe(false);
});

it('distinguishes explicit class ownership from unrelated and unreviewed sources',()=>{
 const sources={shared:['class:Psion','class:Wizard'],wizard:['class:Wizard'],feat:['feat'],unknown:[]} as const;
 expect(spellSourceIncludesClass(sources,'shared','Psion')).toBe(true);
 expect(spellSourceIncludesClass(sources,'shared','Wizard')).toBe(true);
 expect(spellSourceIncludesClass(sources,'wizard','Psion')).toBe(false);
 expect(spellSourceIncludesClass(sources,'feat','Psion')).toBe(false);
 expect(spellSourceIncludesClass(sources,'unknown','Psion')).toBeUndefined();
 expect(spellSourceIncludesClass(sources,'missing','Psion')).toBeUndefined();
});

it('records a newly learned spell without changing prior data',()=>{
 const sources={old:['feat']} as const;
 expect(learnClassSpell(['old'],sources,'next','Psion')).toEqual({ok:true,known:['old','next'],sources:{old:['feat'],next:['class:Psion']}});
 expect(sources).toEqual({old:['feat']});
});
it('adds another class source without duplicating a shared spell',()=>{
 expect(learnClassSpell(['shared'],{shared:['class:Wizard']},'shared','Psion')).toEqual({ok:true,known:['shared'],sources:{shared:['class:Wizard','class:Psion']}});
});
it('does not invent sources for already-known unreviewed spells',()=>{
 expect(learnClassSpell(['old'],{},'old','Psion').ok).toBe(false);
});
it('preserves another class when removing a Psion choice',()=>{
 expect(forgetClassSpell(['shared'],{shared:['class:Psion','class:Wizard']},'shared','Psion')).toEqual({ok:true,known:['shared'],sources:{shared:['class:Wizard']}});
});
it('removes the final source and permits explicit legacy removal',()=>{
 expect(forgetClassSpell(['old'],{old:['class:Psion']},'old','Psion')).toEqual({ok:true,known:[],sources:{}});
 expect(forgetClassSpell(['old'],{},'old','Psion')).toEqual({ok:true,known:[],sources:{}});
});
it('cannot remove an explicitly unrelated spell',()=>{
 expect(forgetClassSpell(['old'],{old:['feat']},'old','Psion').ok).toBe(false);
});

it('accepts automatic grant tags but rejects incomplete grant sources',()=>{
 expect(isSpellSources({hand:['grant:class:Psion'],darkness:['grant:species']})).toBe(true);
 for(const tag of ['grant:','grant:class:','grant:class: Psion','grant:feat','grant:other'])expect(isSpellSources({spell:[tag]})).toBe(false);
});
