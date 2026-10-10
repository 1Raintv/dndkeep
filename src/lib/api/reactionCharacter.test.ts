import {beforeEach,expect,it,vi} from 'vitest';
import {loadTelepathCandidates,loadReactionCharacter} from './reactionCharacter';
const db=vi.hoisted(()=>({responses:[] as {data:unknown;error:unknown}[],tables:[] as string[]}));
vi.mock('../supabase',()=>({supabase:{from:(table:string)=>{
 db.tables.push(table);const query={select:()=>query,eq:()=>query,in:()=>query,then:(resolve:(v:unknown)=>void)=>Promise.resolve(db.responses.shift()).then(resolve),single:async()=>db.responses.shift()};return query;
}}}));
beforeEach(()=>{db.responses=[];db.tables=[];});
it('loads only the character belonging to the selected participant',async()=>{
 db.responses=[{data:{entity_id:'hero'},error:null},{data:{id:'hero'},error:null}];
 expect(await loadReactionCharacter('participant')).toEqual({id:'hero'});
 expect(db.tables).toEqual(['combat_participants','characters']);
});
it.each([{data:null,error:new Error('offline')},{data:null,error:null}])('fails closed when participant lookup fails',async response=>{
 db.responses=[response];await expect(loadReactionCharacter('participant')).rejects.toThrow();expect(db.tables).toEqual(['combat_participants']);
});
it.each([{data:null,error:new Error('offline')},{data:null,error:null}])('fails closed when character lookup fails',async response=>{
 db.responses=[{data:{entity_id:'hero'},error:null},response];await expect(loadReactionCharacter('participant')).rejects.toThrow();
});

it('discovers only encounter Telepaths, including secondary-class Psions',async()=>{
 db.responses=[{data:[{entity_id:'hero'},{entity_id:'second'},{entity_id:'fighter'}],error:null},{data:[{id:'hero',name:'First',class_name:'Psion',subclass:'Telepath',level:3},{id:'second',name:'Second',class_name:'Fighter',level:1,secondary_class:'Psion',secondary_subclass:'Telepath',secondary_level:10},{id:'fighter',class_name:'Fighter',level:5}],error:null}];
 expect(await loadTelepathCandidates('campaign','encounter')).toEqual([{id:'hero',name:'First'},{id:'second',name:'Second'}]);
});
it('does not query characters without encounter candidates',async()=>{
 db.responses=[{data:[],error:null}];expect(await loadTelepathCandidates('campaign','encounter')).toEqual([]);expect(db.tables).toEqual(['combat_participants']);
});
it('does not hide discovery failures as an empty roster',async()=>{
 db.responses=[{data:null,error:new Error('offline')}];await expect(loadTelepathCandidates('campaign','encounter')).rejects.toThrow('offline');
});
