import {beforeEach,expect,it,vi} from 'vitest';
import type {Character} from '../types';
import {acceptReaction} from './pendingReaction';
import {declareAttack} from './pendingAttack';
const db=vi.hoisted(()=>({character:{} as Record<string,unknown>,castState:'declared',writes:[] as {table:string;value:Record<string,unknown>}[]}));
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>{
 const query:Record<string,unknown>={};let write=false;
 for(const method of ['select','eq'])query[method]=()=>query;
 query.update=(value:Record<string,unknown>)=>{write=true;db.writes.push({table,value});return query;};
 const result=()=>({data:write?null:table==='pending_reactions'?{id:'offer',state:'offered',reaction_key:'counterspell',reactor_type:'character',reactor_participant_id:'reactor',reactor_name:'Hero'}:
  table==='characters'?db.character:table==='pending_spell_casts'?{id:'cast',state:db.castState,spell_level:9,spell_name:'Wish',campaign_id:'campaign',caster_participant_id:'caster',caster_name:'Target'}:{entity_id:'hero',name:'Target',participant_type:'character'},error:null});
 query.single=query.maybeSingle=async()=>result();
 query.then=(resolve:(value:unknown)=>void)=>Promise.resolve(result()).then(resolve);
 return query;
}}}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn(),newChainId:()=> 'chain'}));
vi.mock('./pendingAttack',()=>({declareAttack:vi.fn().mockResolvedValue({id:'attack'})}));
beforeEach(()=>{
 vi.clearAllMocks();db.writes=[];db.castState='declared';
 db.character={id:'hero',class_name:'Fighter',level:3,secondary_class:'Psion',secondary_level:5,
 intelligence:18,wisdom:10,charisma:12,spell_sources:{counterspell:['class:Psion']},
 spell_preparation_sources:{counterspell:['class:Psion']},prepared_spells:['counterspell'],spell_slots:{3:{total:2,used:0},5:{total:1,used:0}}};
});
it.each([3,5])('uses source DC 15 against a ninth-level spell even with slot %i',async level=>{
 await acceptReaction('offer',{spell_cast_id:'cast',spell_level_used:level,casting_source:'Psion',save_dc:99});
 expect(declareAttack).toHaveBeenCalledWith(expect.objectContaining({saveDC:15,saveAbility:'CON',attackKind:'save'}));
 expect(db.writes.find(write=>write.table==='characters')?.value).toEqual({spell_slots:{3:{total:2,used:level===3?1:0},5:{total:1,used:level===5?1:0}}});
});
it.each([0,2,4,10,3.5])('rejects unavailable or invalid slot %i before any writes',async level=>{
 await expect(acceptReaction('offer',{spell_cast_id:'cast',spell_level_used:level})).rejects.toThrow('slot');
 expect(db.writes).toEqual([]);expect(declareAttack).not.toHaveBeenCalled();
});
it('rejects a stale casting source before spending anything',async()=>{
 await expect(acceptReaction('offer',{spell_cast_id:'cast',casting_source:'Wizard'})).rejects.toThrow('source');
 expect(db.writes).toEqual([]);
});
it('rejects an unprepared known Counterspell before spending anything',async()=>{
 db.character.spell_preparation_sources={counterspell:[]};db.character.known_spells=['counterspell'];
 await expect(acceptReaction('offer',{spell_cast_id:'cast'})).rejects.toThrow('source');expect(db.writes).toEqual([]);
});
it('rejects a spell that resolved while the prompt was open before spending',async()=>{
 db.castState='resolved';
 await expect(acceptReaction('offer',{spell_cast_id:'cast'})).rejects.toThrow('no longer');expect(db.writes).toEqual([]);
});
it('requires a choice for shared sources and honors the chosen class',async()=>{
 Object.assign(db.character,{class_name:'Sorcerer',charisma:20,spell_sources:{counterspell:['class:Sorcerer','class:Psion']},spell_preparation_sources:{counterspell:['class:Sorcerer','class:Psion']}} as Partial<Character>);
 await expect(acceptReaction('offer',{spell_cast_id:'cast'})).rejects.toThrow('source');expect(db.writes).toEqual([]);
 await acceptReaction('offer',{spell_cast_id:'cast',casting_source:'Sorcerer'});
 expect(declareAttack).toHaveBeenCalledWith(expect.objectContaining({saveDC:16}));
});
