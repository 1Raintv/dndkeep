// @vitest-environment happy-dom
import {beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({rpc:vi.fn(),roll:vi.fn(()=>5)}));
vi.mock('./psionicTurns',()=>({psionicRpc:h.rpc}));
vi.mock('../../rules/dice',()=>({rollDie:h.roll}));
import {processSavedTurnRecharge,savedTurnRecharge} from './turnRecharges';
const user='11111111-1111-4111-8111-111111111111',id={participantId:'22222222-2222-4222-8222-222222222222',encounterId:'33333333-3333-4333-8333-333333333333',turnId:'44444444-4444-4444-8444-444444444444'};
const name='Breath (Recharge 5–6)',expected={entityId:'55555555-5555-4555-8555-555555555555',sourceId:'breath',expended:[name],actions:[{name,usage:'recharge on roll'}]};
const context=()=>({...id,userId:user,expected:structuredClone(expected)});
const reply=(args:Record<string,unknown>)=>({...id,requestId:args.p_request,remaining:[],rolls:[{name,min:5,max:6,roll:5,recharged:true}],eventCount:1,replayed:false});
const guard=()=>{};
beforeEach(()=>{localStorage.clear();h.rpc.mockReset();h.roll.mockReset().mockReturnValue(5);h.rpc.mockImplementation(async(fn:string,args:Record<string,unknown>)=>fn==='read_turn_recharge_batch'?null:fn==='get_turn_recharge_context'?context():reply(args));});
describe('saved turn recharge',()=>{
 it('persists the exact dice before submitting and clears only after confirmation',async()=>{
  h.rpc.mockImplementation(async(fn,args)=>{
   if(fn==='read_turn_recharge_batch')return null;if(fn==='get_turn_recharge_context')return context();
   expect(savedTurnRecharge(user,id)).toMatchObject({expected,requestId:args.p_request,rolls:[{name,min:5,max:6,roll:5}]});return reply(args);
  });
  expect(await processSavedTurnRecharge(user,id,guard)).toMatchObject({remaining:[],eventCount:1});expect(h.roll).toHaveBeenCalledTimes(1);expect(savedTurnRecharge(user,id)).toBeNull();
 });
 it('retains lost requests and retries identical dice without rereading context',async()=>{
  h.rpc.mockImplementation(async(fn)=>{if(fn==='read_turn_recharge_batch')return null;if(fn==='get_turn_recharge_context')return context();throw new Error('reply lost');});
  await expect(processSavedTurnRecharge(user,id,guard)).rejects.toThrow('reply lost');const saved=savedTurnRecharge(user,id)!;
  h.rpc.mockImplementation(async(fn,args)=>fn==='read_turn_recharge_batch'?null:reply(args));
  expect(await processSavedTurnRecharge(user,id,guard)).toMatchObject({requestId:saved.requestId});expect(h.roll).toHaveBeenCalledTimes(1);
  const writes=h.rpc.mock.calls.filter(c=>c[0]==='commit_turn_recharge_batch');expect(writes[1][1]).toEqual(writes[0][1]);
 });
 it('recovers an existing server winner without any dice or resource write',async()=>{
  const r={...reply({p_request:user}),replayed:true};h.rpc.mockResolvedValue(r);
  expect(await processSavedTurnRecharge(user,id,guard)).toEqual(r);expect(h.rpc).toHaveBeenCalledTimes(1);expect(h.roll).not.toHaveBeenCalled();
 });
 it('coalesces overlapping requests',async()=>{
  let release!:()=>void;const hold=new Promise<void>(r=>{release=r;});h.rpc.mockImplementation(async(fn,args)=>{if(fn==='read_turn_recharge_batch'){await hold;return null;}return fn==='get_turn_recharge_context'?context():reply(args);});
  const first=processSavedTurnRecharge(user,id,guard),second=processSavedTurnRecharge(user,id,guard);expect(second).toBe(first);release();await first;
  expect(h.roll).toHaveBeenCalledTimes(1);expect(h.rpc.mock.calls.filter(c=>c[0]==='commit_turn_recharge_batch')).toHaveLength(1);
 });
 it('stops before dice if scope changes during context loading',async()=>{
  let changed=false;h.rpc.mockImplementation(async fn=>{if(fn==='read_turn_recharge_batch')return null;changed=true;return context();});
  await expect(processSavedTurnRecharge(user,id,()=>{if(changed)throw new Error('scope changed');})).rejects.toThrow('scope changed');expect(h.roll).not.toHaveBeenCalled();expect(savedTurnRecharge(user,id)).toBeNull();
 });
 it('does not roll when storage is blocked',async()=>{
  const spy=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('storage blocked');});
  try{await expect(processSavedTurnRecharge(user,id,guard)).rejects.toThrow('storage blocked');expect(h.roll).not.toHaveBeenCalled();expect(h.rpc).toHaveBeenCalledTimes(1);}finally{spy.mockRestore();}
 });
 it('rejects unknown recharge thresholds before rolling or committing',async()=>{
  h.rpc.mockImplementation(async fn=>fn==='read_turn_recharge_batch'?null:{...context(),expected:{...expected,expended:['Breath'],actions:[{name:'Breath',usage:'recharge on roll'}]}});
  await expect(processSavedTurnRecharge(user,id,guard)).rejects.toThrow(/Review recharge/);expect(h.roll).not.toHaveBeenCalled();expect(savedTurnRecharge(user,id)).toBeNull();
 });
 it('rejects a foreign or malformed preparation snapshot',async()=>{
  h.rpc.mockImplementation(async fn=>fn==='read_turn_recharge_batch'?null:{...context(),userId:id.participantId});
  await expect(processSavedTurnRecharge(user,id,guard)).rejects.toThrow(/could not be verified/);expect(h.roll).not.toHaveBeenCalled();
 });
 it('retains a saved plan when the acknowledgement changes its dice',async()=>{
  h.rpc.mockImplementation(async(fn,args)=>fn==='read_turn_recharge_batch'?null:fn==='get_turn_recharge_context'?context():{...reply(args),rolls:[{name,min:5,max:6,roll:6,recharged:true}]});
  await expect(processSavedTurnRecharge(user,id,guard)).rejects.toThrow(/could not be verified/);expect(savedTurnRecharge(user,id)).not.toBeNull();
 });
 it('rejects a receipt whose outcome disagrees with the range',async()=>{
  h.rpc.mockResolvedValue({...reply({p_request:user}),remaining:[name],rolls:[{name,min:5,max:6,roll:5,recharged:false}]});
  await expect(processSavedTurnRecharge(user,id,guard)).rejects.toThrow(/could not be verified/);expect(h.roll).not.toHaveBeenCalled();
 });
 it('keeps corrupted saved data instead of rolling a replacement',async()=>{
  localStorage.setItem(`dndkeep:turn-recharge:${user}:${id.encounterId}:${id.participantId}:${id.turnId}`,'broken');
  await expect(processSavedTurnRecharge(user,id,guard)).rejects.toThrow(/could not be verified/);expect(h.roll).not.toHaveBeenCalled();expect(localStorage.length).toBe(1);
 });
 it('does not mistake receipt-read failure for no saved result',async()=>{
  h.rpc.mockRejectedValue(new Error('offline'));await expect(processSavedTurnRecharge(user,id,guard)).rejects.toThrow('offline');expect(h.roll).not.toHaveBeenCalled();expect(h.rpc).toHaveBeenCalledTimes(1);
 });
});
