// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),die:vi.fn(),groups:vi.fn(),bonus:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('../pendingAttack',()=>({getTargetSaveBonus:m.bonus}));
vi.mock('../../rules/dice',()=>({rollDie:m.die,rollDiceGroups:m.groups}));
import {resolveConditionTurnSave,savedConditionTurnSave,reviewConditionTurnSave} from './conditionTurnSaves';
const id={participantId:'part',turnId:'turn',condition:'Poisoned'};
const context={...id,ability:'INT',dc:12,state:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[]}};
const receipt={...id,requestId:'request',passed:true,d20:12,total:12,bonus:0,reviewedBonus:0,exhaustion:0,dc:12,dice:[12],advantage:false,disadvantage:false,automaticFailure:false,removed:['Poisoned'],replayed:true,penalty:{saveId:'request',saveKind:'feature',penalty:0,die:null,consumedIds:[],expiredIds:[]}};
let committed=false;
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();committed=false;m.bonus.mockResolvedValue({bonus:0,confidence:'high'});m.die.mockImplementation((n:number)=>n===20?12:3);m.groups.mockReturnValue({total:2});
 m.rpc.mockImplementation(async(name:string)=>name==='get_condition_turn_save'?(committed?structuredClone(receipt):null):name==='get_condition_turn_save_context'?structuredClone(context):structuredClone(receipt));
});
it('persists dice before settlement and clears after verified acknowledgement',async()=>{
 m.rpc.mockImplementation(async(name:string)=>{if(name==='get_condition_turn_save')return null;if(name==='get_condition_turn_save_context')return context;expect(savedConditionTurnSave(id)?.dice).toEqual([12]);return receipt;});
 await resolveConditionTurnSave(id);expect(savedConditionTurnSave(id)).toBeNull();
});
it('lost committed response recovers by receipt without rolling again',async()=>{
 m.rpc.mockImplementation(async(name:string)=>{if(name==='get_condition_turn_save')return committed?receipt:null;if(name==='get_condition_turn_save_context')return context;committed=true;throw new Error('Lost response');});
 await expect(resolveConditionTurnSave(id)).rejects.toThrow('Lost response');expect(savedConditionTurnSave(id)?.dice).toEqual([12]);await resolveConditionTurnSave(id);expect(m.die).toHaveBeenCalledTimes(2);expect(savedConditionTurnSave(id)).toBeNull();
});
it('uncommitted failure retries the same proposal',async()=>{
 let attempts=0;m.rpc.mockImplementation(async(name:string)=>{if(name==='get_condition_turn_save')return null;if(name==='get_condition_turn_save_context')return context;if(++attempts===1)throw new Error('offline');return receipt;});
 await expect(resolveConditionTurnSave(id)).rejects.toThrow();await resolveConditionTurnSave(id);
 const requests=m.rpc.mock.calls.filter(c=>c[0]==='settle_condition_turn_save');expect(requests[0]).toEqual(requests[1]);expect(m.die).toHaveBeenCalledTimes(2);
});
it('an existing receipt needs neither fresh context nor dice',async()=>{committed=true;await resolveConditionTurnSave(id);expect(m.die).not.toHaveBeenCalled();expect(m.bonus).not.toHaveBeenCalled();});
it('coalesces overlapping resolutions',async()=>{const a=resolveConditionTurnSave(id),b=resolveConditionTurnSave(id);expect(a).toBe(b);await a;expect(m.rpc.mock.calls.filter(c=>c[0]==='settle_condition_turn_save')).toHaveLength(1);});
it('unknown bonus prevents rolling or settlement',async()=>{m.bonus.mockResolvedValue({bonus:0,confidence:'low'});await expect(resolveConditionTurnSave(id)).rejects.toThrow('Review');expect(m.die).not.toHaveBeenCalled();});
it('a receipt read failure prevents rerolling',async()=>{m.rpc.mockRejectedValue(new Error('offline'));await expect(resolveConditionTurnSave(id)).rejects.toThrow();expect(m.die).not.toHaveBeenCalled();});
it('malformed stored proposal fails closed',async()=>{localStorage.setItem('dndkeep:condition-save:part:turn:Poisoned','{}');await expect(resolveConditionTurnSave(id)).rejects.toThrow('verified');expect(m.die).not.toHaveBeenCalled();});
it('invalid acknowledgement keeps original dice',async()=>{m.rpc.mockImplementation(async(name:string)=>name==='get_condition_turn_save'?null:name==='get_condition_turn_save_context'?context:{...receipt,total:13});await expect(resolveConditionTurnSave(id)).rejects.toThrow('verified');expect(savedConditionTurnSave(id)).not.toBeNull();});
it('review retains compatible dice and buff rolls',async()=>{
 const c={...context,state:{...context.state,buffs:[{key:'bless',saveBonus:'1d4'}]}};
 m.rpc.mockImplementation(async(name:string)=>{if(name==='get_condition_turn_save')return null;if(name==='get_condition_turn_save_context')return c;throw new Error('changed');});
 await expect(resolveConditionTurnSave(id)).rejects.toThrow();await reviewConditionTurnSave(id,3);expect(savedConditionTurnSave(id)).toMatchObject({dice:[12],bonus:5});expect(m.groups).toHaveBeenCalledTimes(1);expect(m.die).toHaveBeenCalledTimes(2);
});
it('storage failure prevents settlement',async()=>{const spy=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('storage');});try{await expect(resolveConditionTurnSave(id)).rejects.toThrow('storage');expect(m.rpc.mock.calls.some(c=>c[0]==='settle_condition_turn_save')).toBe(false);}finally{spy.mockRestore();}});

it('automatic failure creates no dice and needs no target bonus lookup',async()=>{
 const c={...context,state:{...context.state,autoFail:true}};
 const r={...receipt,automaticFailure:true,passed:false,dice:[],d20:null,total:null,removed:[]};
 m.rpc.mockImplementation(async(name:string)=>name==='get_condition_turn_save'?null:name==='get_condition_turn_save_context'?c:r);
 await resolveConditionTurnSave(id);expect(m.die).not.toHaveBeenCalled();expect(m.bonus).not.toHaveBeenCalled();
 expect(m.rpc.mock.calls.find(c=>c[0]==='settle_condition_turn_save')?.[1]).toMatchObject({p_dice:[],p_penalty_d4:null});
});
it('advantage persists both d20s before settlement',async()=>{
 const c={...context,state:{...context.state,advantage:true}},r={...receipt,advantage:true,dice:[12,12]};
 m.rpc.mockImplementation(async(name:string)=>name==='get_condition_turn_save'?null:name==='get_condition_turn_save_context'?c:r);
 await resolveConditionTurnSave(id);expect(m.die).toHaveBeenCalledTimes(3);
 expect(m.rpc.mock.calls.find(c=>c[0]==='settle_condition_turn_save')?.[1]).toMatchObject({p_dice:[12,12]});
});

it('review recovers a committed result before reading corrupt dice or changed context',async()=>{
 localStorage.setItem('dndkeep:condition-save:part:turn:Poisoned','{}');committed=true;
 expect(await reviewConditionTurnSave(id,4)).toEqual(receipt);
 expect(m.die).not.toHaveBeenCalled();expect(m.rpc.mock.calls.map(c=>c[0])).toEqual(['get_condition_turn_save']);
 expect(savedConditionTurnSave(id)).toBeNull();
});
it('failed receipt lookup during review preserves original dice',async()=>{
 m.rpc.mockImplementation(async(name:string)=>name==='get_condition_turn_save'?null:name==='get_condition_turn_save_context'?context:Promise.reject(new Error('offline')));
 await expect(resolveConditionTurnSave(id)).rejects.toThrow();const original=savedConditionTurnSave(id);
 m.rpc.mockRejectedValue(new Error('offline'));await expect(reviewConditionTurnSave(id,4)).rejects.toThrow('offline');
 expect(savedConditionTurnSave(id)).toEqual(original);expect(m.die).toHaveBeenCalledTimes(2);
});
it('review blocks competing settlement while checking its receipt',async()=>{
 let finish!:(value:unknown)=>void;m.rpc.mockImplementation(()=>new Promise(r=>{finish=r;}));
 const review=reviewConditionTurnSave(id,4);await expect(resolveConditionTurnSave(id)).rejects.toThrow('Wait');
 await expect(reviewConditionTurnSave(id,4)).rejects.toThrow('Wait');finish(receipt);await review;
 expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('storage cleanup failure does not hide a verified committed result',async()=>{
 committed=true;const spy=vi.spyOn(localStorage,'removeItem').mockImplementation(()=>{throw new Error('storage');});
 try{expect(await resolveConditionTurnSave(id)).toEqual(receipt);expect(m.die).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
