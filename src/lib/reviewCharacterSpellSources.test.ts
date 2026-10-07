import {expect,it} from 'vitest';
import type {Character} from '../types';
import {reviewCharacterSpellSources} from './reviewCharacterSpellSources';
const character={class_name:'Psion',level:1,known_spells:['charm-person','fireball','telekinesis'],prepared_spells:[],spell_slots:{'1':{total:2,used:0}},intelligence:16} as unknown as Character;
it('reviews a legal legacy choice without inventing readiness',()=>{
 expect(reviewCharacterSpellSources(character,'charm-person',['class:Psion'],[])).toMatchObject({ok:true,patch:{spell_sources:{'charm-person':['class:Psion']},prepared_spells:[],spell_preparation_sources:{'charm-person':[]}}});
});
it('can prepare a legal reviewed choice but rejects off-list and excessive-level choices',()=>{
 expect(reviewCharacterSpellSources(character,'charm-person',['class:Psion'],['class:Psion']).ok).toBe(true);
 expect(reviewCharacterSpellSources(character,'fireball',['class:Psion'],['class:Psion']).ok).toBe(false);
 expect(reviewCharacterSpellSources(character,'telekinesis',['class:Psion'],['class:Psion']).ok).toBe(false);
});
it('cannot use review to add spells or unrelated class ownership',()=>{
 expect(reviewCharacterSpellSources(character,'mage-armor',['class:Psion'],[]).ok).toBe(false);
 expect(reviewCharacterSpellSources(character,'charm-person',['class:Wizard'],[]).ok).toBe(false);
 expect(reviewCharacterSpellSources(character,'charm-person',[],[]).ok).toBe(false);
});
it('preserves unrelated source records while reviewing a shared choice',()=>{
 const result=reviewCharacterSpellSources({...character,secondary_class:'Wizard',secondary_level:3,spell_sources:{fireball:['other']}},'charm-person',['class:Psion','class:Wizard'],['class:Wizard']);
 expect(result).toMatchObject({ok:true,patch:{spell_sources:{fireball:['other'],'charm-person':['class:Psion','class:Wizard']},prepared_spells:['charm-person'],spell_preparation_sources:{'charm-person':['class:Wizard']}}});
});
it('protects automatic grants and rejects cantrip preparation',()=>{
 const c={...character,known_spells:['mage-hand','minor-illusion']};
 expect(reviewCharacterSpellSources(c,'mage-hand',['other'],[]).ok).toBe(false);
 expect(reviewCharacterSpellSources(c,'minor-illusion',['class:Psion'],['class:Psion']).ok).toBe(false);
});

it('rejects Psion readiness when a secondary Psion level is missing',()=>{
 expect(reviewCharacterSpellSources({...character,class_name:'Wizard',secondary_class:'Psion',secondary_level:null},'charm-person',['class:Psion'],['class:Psion']).ok).toBe(false);
});
