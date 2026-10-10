import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({catalog:{} as Record<string,unknown>,insert:vi.fn(),update:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},
 from:(table:string)=>({
  select:()=>({eq:()=>({single:async()=>({data:state.catalog,error:null})})}),
  insert:(value:unknown)=>{state.insert(table,value);return {select:()=>({single:async()=>({data:value,error:null})})};},
  update:(value:unknown)=>{state.update(table,value);return {eq:async()=>({error:null})};}
 })
}}));
import {createCreature,updateCreature,importFromCatalog} from './creatures';
beforeEach(()=>{vi.clearAllMocks();state.catalog={name:'Defense fixture',damage_resistances:['psychic','bludgeoning, piercing, and slashing from nonmagical attacks'],damage_immunities:['poison'],damage_vulnerabilities:['fire']};});
it('catalog import keeps each defense and its conditions on the saved copy',async()=>{
 await importFromCatalog({catalogMonsterId:'fixture'});
 expect(state.insert).toHaveBeenCalledWith('homebrew_monsters',expect.objectContaining({damage_resistances:state.catalog.damage_resistances,damage_immunities:['poison'],damage_vulnerabilities:['fire'],source_monster_id:'fixture'}));
});
it('canonical null lists import as explicit none, custom unspecified lists remain unknown',async()=>{
 state.catalog={name:'Plain',damage_resistances:null};await importFromCatalog({catalogMonsterId:'plain'});
 expect(state.insert.mock.calls[0][1]).toMatchObject({damage_resistances:[],damage_immunities:[],damage_vulnerabilities:[]});
 await createCreature({name:'Custom'});expect(state.insert.mock.calls[1][1]).toMatchObject({damage_resistances:null,damage_immunities:null,damage_vulnerabilities:null});
});
it('editing normalizes supplied defenses without clearing omitted fields',async()=>{
 await updateCreature('id',{name:'Renamed'});expect(state.update.mock.calls[0][1]).toEqual({name:'Renamed'});
 await updateCreature('id',{damage_resistances:[' Psychic ','psychic','']});expect(state.update.mock.calls[1][1]).toEqual({damage_resistances:['Psychic']});
 await updateCreature('id',{damage_immunities:[]});expect(state.update.mock.calls[2][1]).toEqual({damage_immunities:[]});
});
it('invalid catalog data fails before creating a partial creature',async()=>{
 state.catalog.damage_resistances=['psychic',42];await expect(importFromCatalog({catalogMonsterId:'bad'})).rejects.toThrow('text entries');expect(state.insert).not.toHaveBeenCalled();
});

it('imports exact save totals and scores without inventing proficiencies',async()=>{
 state.catalog={...state.catalog,int:18,wis:9,saving_throws:{Intelligence:9}};
 await importFromCatalog({catalogMonsterId:'fixture'});
 expect(state.insert.mock.calls[0][1]).toMatchObject({saving_throws:{Intelligence:9},save_proficiencies:null,ability_scores:{int:18,wis:9,str:null}});
});
it.each([null,{}])('preserves the difference between unknown and empty save maps %j',async saving_throws=>{
 state.catalog={...state.catalog,int:18,saving_throws};await importFromCatalog({catalogMonsterId:'fixture'});
 expect(state.insert.mock.calls[0][1]).toMatchObject({saving_throws,save_proficiencies:null});
});
it('retains explicit custom save totals on create and update',async()=>{
 await createCreature({name:'Custom',saving_throws:{str:8},save_proficiencies:null});
 expect(state.insert.mock.calls[0][1]).toMatchObject({saving_throws:{str:8},save_proficiencies:null});
 await updateCreature('id',{saving_throws:{str:9}});expect(state.update.mock.calls[0][1]).toEqual({saving_throws:{str:9}});
});

it('keeps unknown imported scores unknown even with an empty save map',async()=>{
 state.catalog={...state.catalog,int:null,saving_throws:{}};await importFromCatalog({catalogMonsterId:'fixture'});
 expect(state.insert.mock.calls[0][1]).toMatchObject({int:null,saving_throws:{},ability_scores:{int:null}});
});
