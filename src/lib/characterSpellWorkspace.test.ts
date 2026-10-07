import {expect,it} from 'vitest';
import type {Character} from '../types';
import {hasCharacterSpellWorkspace} from './characterSpellWorkspace';
const pc={class_name:'Psion',level:1,subclass:null,known_spells:[],prepared_spells:[],spell_slots:{}} as unknown as Character;
it.each(['Psion','Wizard','Paladin','Ranger'])('keeps %s controls without recorded slots',class_name=>{
 expect(hasCharacterSpellWorkspace({...pc,class_name})).toBe(true);
 expect(pc.spell_slots).toEqual({});
});
it('keeps secondary-class and species/feat spell controls accessible',()=>{
 expect(hasCharacterSpellWorkspace({...pc,class_name:'Fighter',secondary_class:'Psion',secondary_level:1})).toBe(true);
 expect(hasCharacterSpellWorkspace({...pc,class_name:'Fighter',known_spells:['mage-hand']})).toBe(true);
 expect(hasCharacterSpellWorkspace({...pc,class_name:'Fighter',prepared_spells:['darkness']})).toBe(true);
});
it('does not classify an empty martial character as a caster',()=>{
 expect(hasCharacterSpellWorkspace({...pc,class_name:'Fighter'})).toBe(false);
});
it('keeps unlocked subclass casting accessible without slot data',()=>{
 expect(hasCharacterSpellWorkspace({...pc,class_name:'Fighter',subclass:'Eldritch Knight',level:3})).toBe(true);
 expect(hasCharacterSpellWorkspace({...pc,class_name:'Fighter',subclass:'Eldritch Knight',level:2})).toBe(false);
});
