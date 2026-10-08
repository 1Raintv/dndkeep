import {expect,it,vi} from 'vitest';
import type {Character} from '../types';
import {counterspellCasting,selectedCounterspellCasting} from './counterspellCasting';
vi.mock('./supabase',()=>({supabase:{}}));
const hero={id:'hero',class_name:'Fighter',level:3,secondary_class:'Psion',secondary_level:5,
 strength:10,dexterity:10,constitution:12,intelligence:18,wisdom:10,charisma:12,
 known_spells:['counterspell'],prepared_spells:['counterspell'],
 spell_sources:{counterspell:['class:Psion']},spell_preparation_sources:{counterspell:['class:Psion']},inventory:[]} as unknown as Character;
it('uses secondary Psion INT and total-level proficiency (DC 15)',()=>{
 expect(selectedCounterspellCasting(hero)).toMatchObject({className:'Psion',ability:'intelligence',saveDC:15});
});
it('requires preparation, not merely a known spell',()=>{
 expect(counterspellCasting({...hero,prepared_spells:[],spell_preparation_sources:{counterspell:[]}}).options).toEqual([]);
});
it('requires an explicit source when both prepared classes own Counterspell',()=>{
 const shared={...hero,class_name:'Sorcerer',charisma:20,spell_sources:{counterspell:['class:Sorcerer','class:Psion']},spell_preparation_sources:{counterspell:['class:Sorcerer','class:Psion']}} as Character;
 expect(selectedCounterspellCasting(shared)).toBeNull();
 expect(selectedCounterspellCasting(shared,'Sorcerer')?.saveDC).toBe(16);
 expect(selectedCounterspellCasting(shared,'Psion')?.saveDC).toBe(15);
 expect(selectedCounterspellCasting(shared,'Wizard')).toBeNull();
});
it('uses an active Headband, including total multiclass proficiency',()=>{
 const item={id:'headband',magic_item_id:'headband-of-intellect',equipped:true,attuned:true};
 const character={...hero,level:8,intelligence:10,inventory:[item]} as unknown as Character;
 expect(selectedCounterspellCasting(character)?.saveDC).toBe(17);
 expect(selectedCounterspellCasting({...character,inventory:[{...item,attuned:false}]} as unknown as Character)?.saveDC).toBe(13);
});
it('does not invent ownership for legacy or stale character records',()=>{
 expect(selectedCounterspellCasting({...hero,spell_sources:{}})).toBeNull();
 expect(selectedCounterspellCasting({...hero,secondary_level:0})).toBeNull();
});
