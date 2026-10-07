import {expect,it} from 'vitest';
import {spellStateKey} from './spellStateKey';
import type {SpellSources} from './spellSources';
const base={known:['b','a'],prepared:['b','a'],sources:{b:['class:Psion','class:Wizard'],a:[]} as SpellSources,preparationSources:{a:[],b:['class:Wizard']} as SpellSources};
it('ignores map, source and list order and duplicate entries',()=>{
 expect(spellStateKey({...base,known:['a','b','b'],prepared:['a','b'],sources:{a:[],b:['class:Wizard','class:Psion']},preparationSources:{b:['class:Wizard'],a:[]}})).toBe(spellStateKey(base));
});
it('distinguishes meaningful ownership, readiness and unknown-state changes',()=>{
 expect(spellStateKey({...base,sources:{...base.sources,b:['class:Wizard']}})).not.toBe(spellStateKey(base));
 expect(spellStateKey({...base,preparationSources:{b:['class:Wizard']}})).not.toBe(spellStateKey(base));
 expect(spellStateKey({...base,known:['a']})).not.toBe(spellStateKey(base));
});
