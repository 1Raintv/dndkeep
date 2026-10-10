// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),die:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:m.rpc}}));
vi.mock('../../rules/dice',async original=>({...await original<typeof import('../../rules/dice')>(),rollDie:m.die}));
import {resolveAttackSave,reviewAttackSave,savedAttackSave} from './attackSaves';
const ctx=()=>({attack:{id:'attack',state:'declared',kind:'save',ability:'INT',dc:10,result:null},target:{},conditions:[],buffs:[],exhaustion:0,naturalExtremes:false,autoFail:false,advantage:false,disadvantage:false});
let context:ReturnType<typeof ctx>,failure:boolean,malformed:boolean;
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear();context=ctx();failure=false;malformed=false;m.die.mockImplementation((s:number)=>s===20?12:3);
 m.rpc.mockImplementation(async(name:string,p:Record<string,any>)=>{
  if(name==='get_pending_attack_save_context')return {data:structuredClone(context),error:null};
  if(failure)return {data:null,error:{message:'Offline; retry saved throw'}};
  if(malformed)return {data:{attack:{id:'other'}},error:null};
  const dice=p.p_dice as number[],chosen=context.autoFail?1:context.advantage?Math.max(...dice):context.disadvantage?Math.min(...dice):dice[0];
  const penalty=context.autoFail?0:p.p_penalty_d4;
  return {data:{attack:{id:'attack',save_d20:chosen,save_total:chosen+p.p_base_bonus+p.p_buff_total-penalty,save_result:'failed',pending_lr_decision:false},dice,penalty:{saveId:'attack',saveKind:'attack',penalty,die:penalty||null,consumedIds:['effect'],expiredIds:[]},replayed:false},error:null};
 });
});
it('stores the d20 and penalty die before requesting settlement',async()=>{
 const original=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name,p)=>{if(name==='settle_pending_attack_save')expect(savedAttackSave('attack')).toMatchObject({dice:[12],penaltyD4:3});return original(name,p);});
 expect(await resolveAttackSave('attack',2)).toMatchObject({save_total:11,save_penalty:{penalty:3}});expect(savedAttackSave('attack')).toBeNull();expect(m.die).toHaveBeenCalledTimes(2);
});
it('failed confirmation retains the exact dice on retry',async()=>{
 failure=true;await expect(resolveAttackSave('attack',0)).rejects.toThrow('Offline');const saved=savedAttackSave('attack');failure=false;await resolveAttackSave('attack',0);
 expect(m.die).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls.filter(c=>c[0]==='settle_pending_attack_save').map(c=>c[1].p_dice)).toEqual([saved!.dice,saved!.dice]);
});
it('malformed confirmation preserves recovery',async()=>{
 malformed=true;await expect(resolveAttackSave('attack',0)).rejects.toThrow('could not be verified');expect(savedAttackSave('attack')).not.toBeNull();
});
it('changing a modifier requires explicit review and never rerolls the original dice',async()=>{
 failure=true;await expect(resolveAttackSave('attack',0)).rejects.toThrow();await expect(resolveAttackSave('attack',5)).rejects.toThrow('Review changed settings');
 await reviewAttackSave('attack',5);expect(savedAttackSave('attack')).toMatchObject({dice:[12],baseBonus:5,penaltyD4:3});expect(m.die).toHaveBeenCalledTimes(2);
 failure=false;expect((await resolveAttackSave('attack',5)).save_total).toBe(14);
});
it('review adds only a newly required advantage die',async()=>{
 failure=true;await expect(resolveAttackSave('attack',0)).rejects.toThrow();context.advantage=true;m.die.mockReturnValue(17);
 await reviewAttackSave('attack',0);expect(savedAttackSave('attack')).toMatchObject({pool:[12,17],dice:[12,17],penaltyD4:3});expect(m.die).toHaveBeenCalledTimes(3);
 context.advantage=false;await reviewAttackSave('attack',0);context.advantage=true;await reviewAttackSave('attack',0);expect(m.die).toHaveBeenCalledTimes(3);
});
it('automatic failure uses no dice',async()=>{
 context.autoFail=true;expect(await resolveAttackSave('attack',0)).toMatchObject({save_d20:1,save_penalty:{penalty:0,die:null}});expect(m.die).not.toHaveBeenCalled();
});
it('an automatic-failure review does not discard earlier dice',async()=>{
 failure=true;await expect(resolveAttackSave('attack',0)).rejects.toThrow();context.autoFail=true;await reviewAttackSave('attack',0);expect(savedAttackSave('attack')?.dice).toEqual([]);
 context.autoFail=false;await reviewAttackSave('attack',0);expect(savedAttackSave('attack')).toMatchObject({dice:[12],penaltyD4:3});expect(m.die).toHaveBeenCalledTimes(2);
});
it('same-frame confirmations share one request',async()=>{
 const a=resolveAttackSave('attack',0),b=resolveAttackSave('attack',0);expect(a).toBe(b);await a;expect(m.rpc.mock.calls.filter(c=>c[0]==='settle_pending_attack_save')).toHaveLength(1);
});
it('unreadable storage never generates replacement dice',async()=>{
 localStorage.setItem('dndkeep:attack-save:attack','broken');await expect(resolveAttackSave('attack',0)).rejects.toThrow('unreadable');expect(m.die).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it('unverified settings never generate dice',async()=>{
 context.attack.dc=NaN;await expect(resolveAttackSave('attack',0)).rejects.toThrow('settings could not be verified');expect(m.die).not.toHaveBeenCalled();
});
it('an impossible total retains the saved proposal',async()=>{
 const original=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name,p)=>{const r=await original(name,p);if(name==='settle_pending_attack_save')r.data.attack.save_total=99;return r;});
 await expect(resolveAttackSave('attack',0)).rejects.toThrow('differs');expect(savedAttackSave('attack')).not.toBeNull();
});
it('a competing server winner is returned without client recalculation',async()=>{
 m.rpc.mockImplementation(async name=>name==='get_pending_attack_save_context'?{data:ctx(),error:null}:{data:{attack:{id:'attack',save_d20:19,save_total:15,save_result:'passed',pending_lr_decision:false},dice:[19],penalty:{saveId:'attack',saveKind:'attack',penalty:4,die:4,consumedIds:['effect'],expiredIds:[]},replayed:true},error:null});
 expect((await resolveAttackSave('attack',0)).save_total).toBe(15);
});

it('blocked storage never sends a settlement',async()=>{
 const write=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage blocked');});
 try{await expect(resolveAttackSave('attack',0)).rejects.toThrow('Storage blocked');expect(m.rpc.mock.calls.some(c=>c[0]==='settle_pending_attack_save')).toBe(false);}finally{write.mockRestore();}
});
it('module reload recovers the saved dice',async()=>{
 failure=true;await expect(resolveAttackSave('attack',0)).rejects.toThrow();vi.resetModules();failure=false;
 const fresh=await import('./attackSaves');await fresh.resolveAttackSave('attack',0);expect(m.die).toHaveBeenCalledTimes(2);
});
it('a failed context refresh leaves the previous saved proposal intact',async()=>{
 failure=true;await expect(resolveAttackSave('attack',0)).rejects.toThrow();const original=localStorage.getItem('dndkeep:attack-save:attack');
 m.rpc.mockResolvedValueOnce({data:null,error:{message:'Settings unavailable'}});await expect(reviewAttackSave('attack',2)).rejects.toThrow('Settings unavailable');expect(localStorage.getItem('dndkeep:attack-save:attack')).toBe(original);
});

