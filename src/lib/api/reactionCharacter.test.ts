import {beforeEach,expect,it,vi} from 'vitest';
import {loadReactionCharacter} from './reactionCharacter';
const db=vi.hoisted(()=>({responses:[] as {data:unknown;error:unknown}[],tables:[] as string[]}));
vi.mock('../supabase',()=>({supabase:{from:(table:string)=>{
 db.tables.push(table);const query={select:()=>query,eq:()=>query,single:async()=>db.responses.shift()};return query;
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
