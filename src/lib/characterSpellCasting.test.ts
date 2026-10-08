import {expect,it} from 'vitest';
import type {Character,ComputedStats} from '../types';
import {characterSpellCasting} from './characterSpellCasting';
const character={class_name:'Cleric',level:11,secondary_class:'Psion',secondary_level:5,intelligence:10,wisdom:12,spell_sources:{spell:['class:Psion','class:Cleric']},spell_preparation_sources:{spell:['class:Psion','class:Cleric']},prepared_spells:['spell']} as unknown as Character;
const computed={modifiers:{intelligence:4,wisdom:1,charisma:-1},proficiency_bonus:5} as ComputedStats;
it('uses effective sheet modifiers and total proficiency for each class copy',()=>{
 const before=JSON.stringify(character);const result=characterSpellCasting(character,{id:'spell',level:1},computed);
 expect(result.options.map(({className,modifier,attack,saveDC})=>({className,modifier,attack,saveDC}))).toEqual([
  {className:'Psion',modifier:4,attack:9,saveDC:17},{className:'Cleric',modifier:1,attack:6,saveDC:14}]);
 expect(JSON.stringify(character)).toBe(before);
});
it('does not invent a second class from an orphaned level or allow a stale absent class source',()=>{
 const result=characterSpellCasting({...character,secondary_class:null,secondary_level:5},{id:'spell',level:1},computed);
 expect(result.options.map(o=>o.className)).toEqual(['Cleric']);expect(result.unresolvedSources).toEqual(['class:Psion']);
});

it('handles missing preparation arrays and a named zero-level secondary class without throwing',()=>{
 const imported={...character,prepared_spells:undefined,secondary_level:0,spell_sources:{spell:['class:Cleric']},spell_preparation_sources:{}} as unknown as Character;
 expect(characterSpellCasting(imported,{id:'spell',level:1},computed).options).toEqual([]);
 expect(characterSpellCasting(imported,{id:'spell',level:0},computed).options.map(o=>o.className)).toEqual(['Cleric']);
});
