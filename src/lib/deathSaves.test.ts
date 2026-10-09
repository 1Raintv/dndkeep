import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({part:{} as Record<string,unknown>,writes:[] as {table:string,value:unknown}[],roll:vi.fn(),event:vi.fn()}));
vi.mock('../rules/dice',()=>({rollDie:m.roll}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>{
 interface Builder { select:()=>Builder; eq:()=>Builder; single:()=>Builder; update:(value:unknown)=>Builder; then:(resolve:(v:unknown)=>void)=>Promise<void> }
 const b={} as Builder;for(const op of ['select','eq','single'] as const)b[op]=()=>b;
 b.update=(value:unknown)=>{m.writes.push({table,value});return b;};
 b.then=(resolve:(v:unknown)=>void)=>Promise.resolve({data:table==='pending_death_saves'?{id:'save',state:'pending',participant_id:'p'}:{id:'p',combatant_id:'cb',combatants:m.part},error:null}).then(resolve);
 return b;
}}}));
import {resolvePendingDeathSave} from './deathSaves';
beforeEach(()=>{m.writes=[];vi.clearAllMocks();m.part={current_hp:0,is_stable:false,is_dead:false,death_save_successes:0,death_save_failures:0};});
it.each([{current_hp:1},{is_stable:true},{is_dead:true},{death_save_failures:3},{death_save_successes:3}])('expires an obsolete prompt without dice, life writes or events: %j',async state=>{
 Object.assign(m.part,state);expect(await resolvePendingDeathSave('save')).toBeNull();
 expect(m.roll).not.toHaveBeenCalled();expect(m.event).not.toHaveBeenCalled();
 expect(m.writes).toHaveLength(1);expect(m.writes[0]).toMatchObject({table:'pending_death_saves',value:{state:'expired'}});
});
