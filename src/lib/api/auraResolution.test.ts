// @vitest-environment happy-dom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:h.rpc}));
import {auraDamageEvidence} from '../../rules/auraDamageEvidence';
import {processSavedAuraResolution,savedAuraResolution,processReviewedAuraResolution} from './auraResolution';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),identity={encounterId:id(2),turnId:id(3),originId:id(4),targetId:id(5),auraKey:'fixture'},guard=()=>{};
const context=()=>({encounterId:id(2),turnId:id(3),trigger:'turn_end',marker:`aura_save:${id(4)}:fixture`,origin:{participant:{id:id(4)}},
 target:{participant:{id:id(5),participant_type:'monster'},combatant:{current_hp:20,max_hp:20,temp_hp:0,active_conditions:[]}},
 aura:{aura:{key:'fixture',saveAbility:'WIS',saveDC:14,damageDice:'1d8',damageType:'radiant',halfOnSave:true}},
 save:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[]},legendaryResistance:{capacity:0,used:0},nextSaveEffects:[]});
const proposal=()=>({save:{baseBonus:0,dice:[1],effectRolls:[]},penaltyD4:2,damageRoll:{dice:[{die:8,value:5}],modifier:0,total:5},affinity:'normal',useResistance:false,concentrationId:id(6),conModifier:0,geometryConfirmed:true,defensesReviewed:true});
function reply(args:Record<string,unknown>){
 const d=auraDamageEvidence(args.p_expected,args.p_proposal,0);
 return {...identity,requestId:args.p_request,marker:context().marker,replayed:false,save:d.save,passed:d.passed,acceptedResistance:d.acceptedResistance,damage:d.damage,
  penalty:{saveId:args.p_request,saveKind:'feature',penalty:0,die:null,consumedIds:[],expiredIds:[],replayed:false},damageResult:d.pools?{...d.pools,checkId:null,concentrationBroken:false}:null};
}
const envelope=(requestId=id(9))=>({requestId,request:{expected:context(),proposal:proposal()},result:{...reply({p_request:requestId,p_expected:context(),p_proposal:proposal()}),replayed:true}});
beforeEach(()=>{
 localStorage.clear();h.rpc.mockReset();h.rpc.mockImplementation(async(fn,args)=>fn==='read_aura_resolution'?null:fn==='get_aura_resolution_context'?context():reply(args));
 const tails=new Map<string,Promise<unknown>>();
 vi.stubGlobal('navigator',{locks:{request:vi.fn((key:string,_options:unknown,fn:()=>Promise<unknown>)=>{
  const work=(tails.get(key)??Promise.resolve()).catch(()=>{}).then(fn);tails.set(key,work);return work;
 })}});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('persists the exact request before commit and clears only a verified receipt',async()=>{
 const prepare=vi.fn(proposal);
 h.rpc.mockImplementation(async(fn,args)=>{
  if(fn==='read_aura_resolution')return null;if(fn==='get_aura_resolution_context')return context();
  expect(savedAuraResolution(user,identity)).toMatchObject({requestId:args.p_request,expected:args.p_expected,proposal:args.p_proposal});return reply(args);
 });
 expect(await processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).toMatchObject({damage:5});
 expect(prepare).toHaveBeenCalledTimes(1);expect(savedAuraResolution(user,identity)).toBeNull();
});
it('retries the exact saved proposal across triggers after an unknown response',async()=>{
 const prepare=vi.fn(proposal);h.rpc.mockImplementation(async fn=>fn==='read_aura_resolution'?null:fn==='get_aura_resolution_context'?context():Promise.reject(new Error('offline')));
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow('offline');
 const saved=savedAuraResolution(user,identity)!;
 h.rpc.mockImplementation(async(fn,args)=>fn==='read_aura_resolution'?null:reply(args));
 expect(await processSavedAuraResolution(user,identity,'creature_entered',prepare,guard)).toMatchObject({requestId:saved.requestId});
 const writes=h.rpc.mock.calls.filter(c=>c[0]==='commit_aura_resolution');expect(writes[1][1]).toEqual(writes[0][1]);expect(prepare).toHaveBeenCalledTimes(1);
});
it('recovers a different server winner after commit fails',async()=>{
 const prepare=vi.fn(proposal);let committed=false;
 h.rpc.mockImplementation(async(fn)=>{if(fn==='read_aura_resolution')return committed?envelope():null;if(fn==='get_aura_resolution_context')return context();committed=true;throw new Error('other device won');});
 expect(await processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).toMatchObject({requestId:id(9),replayed:true});expect(savedAuraResolution(user,identity)).toBeNull();
});
it('reads historical results before preparing or requiring local storage',async()=>{
 h.rpc.mockResolvedValue(envelope());const prepare=vi.fn(proposal);vi.spyOn(localStorage,'getItem').mockImplementation(()=>{throw new Error('blocked');});
 expect(await processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).toMatchObject({replayed:true});expect(prepare).not.toHaveBeenCalled();expect(h.rpc).toHaveBeenCalledTimes(1);
});
it('keeps interruption markers when preparation throws, and never rerolls automatically',async()=>{
 const prepare=vi.fn(()=>{throw new Error('interrupted');});
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow('interrupted');
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow(/incomplete/);expect(prepare).toHaveBeenCalledTimes(1);
 h.rpc.mockResolvedValue(envelope());expect(await processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).toMatchObject({replayed:true});
});
it('does not prepare when writing the initial marker fails',async()=>{
 const prepare=vi.fn(proposal);vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('full');});
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow('full');expect(prepare).not.toHaveBeenCalled();
});
it('keeps the marker if saving the rolled proposal fails',async()=>{
 const prepare=vi.fn(proposal),set=localStorage.setItem.bind(localStorage);
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(JSON.parse(v).phase==='ready')throw new Error('quota');set(k,v);});
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow('quota');
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow(/incomplete/);expect(prepare).toHaveBeenCalledTimes(1);
});
it('coalesces same-tab requests',async()=>{
 const prepare=vi.fn(proposal),first=processSavedAuraResolution(user,identity,'turn_end',prepare,guard),second=processSavedAuraResolution(user,identity,'turn_end',prepare,guard);
 expect(second).toBe(first);await first;expect(prepare).toHaveBeenCalledTimes(1);
});
it('serializes separate module instances and reads the winner before preparing',async()=>{
 let winner:ReturnType<typeof envelope>|null=null;h.rpc.mockImplementation(async(fn,args)=>{
  if(fn==='read_aura_resolution')return winner;if(fn==='get_aura_resolution_context')return context();
  const result=reply(args);winner={requestId:args.p_request,request:{expected:args.p_expected,proposal:args.p_proposal},result:{...result,replayed:true}};return result;
 });
 vi.resetModules();const other=await import('./auraResolution');const prepare=vi.fn(proposal);
 await Promise.all([processSavedAuraResolution(user,identity,'turn_end',prepare,guard),other.processSavedAuraResolution(user,identity,'turn_end',prepare,guard)]);
 expect(prepare).toHaveBeenCalledTimes(1);expect(h.rpc.mock.calls.filter(c=>c[0]==='commit_aura_resolution')).toHaveLength(1);
});
it.each(['get_aura_resolution_context','commit_aura_resolution'])('stops when user scope changes during %s',stage=>{
 let changed=false;const prepare=vi.fn(proposal);h.rpc.mockImplementation(async(fn,args)=>{if(fn===stage)changed=true;return fn==='read_aura_resolution'?null:fn==='get_aura_resolution_context'?context():reply(args);});
 return expect(processSavedAuraResolution(user,identity,'turn_end',prepare,()=>{if(changed)throw new Error('scope changed');})).rejects.toThrow('scope changed');
});
it('retains a proposal when the server response changes damage',async()=>{
 h.rpc.mockImplementation(async(fn,args)=>fn==='read_aura_resolution'?null:fn==='get_aura_resolution_context'?context():{...reply(args),damage:99});
 await expect(processSavedAuraResolution(user,identity,'turn_end',proposal,guard)).rejects.toThrow(/could not be verified/);expect(savedAuraResolution(user,identity)).not.toBeNull();
});
it('does not prepare without browser locking or when reading receipts fails',async()=>{
 const prepare=vi.fn(proposal);h.rpc.mockRejectedValue(new Error('unavailable'));
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow('unavailable');
 vi.stubGlobal('navigator',{});await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow(/browser locking/);expect(prepare).not.toHaveBeenCalled();
});

it('saves dice before review and resumes a postponed decision without preparing again',async()=>{
 const prepare=vi.fn(proposal),review=vi.fn(async()=>null);
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard,review)).rejects.toThrow('postponed');
 expect(savedAuraResolution(user,identity)?.phase).toBe('review');
 expect(h.rpc.mock.calls.filter(c=>c[0]==='commit_aura_resolution')).toHaveLength(0);
 const saved=savedAuraResolution(user,identity)!;
 await expect(processSavedAuraResolution(user,identity,'turn_end',prepare,guard)).rejects.toThrow('requires review');
 await processSavedAuraResolution(user,identity,'turn_end',prepare,guard,async request=>{
  expect(request).toEqual(saved);return {useResistance:false};
 });
 expect(prepare).toHaveBeenCalledTimes(1);
});
it('review cannot mutate saved dice or identity and its decision is saved before submission',async()=>{
 h.rpc.mockImplementation(async(fn,args)=>{
  if(fn==='read_aura_resolution')return null;if(fn==='get_aura_resolution_context')return context();
  expect(savedAuraResolution(user,identity)).toMatchObject({phase:'ready',proposal:proposal()});return reply(args);
 });
 await processSavedAuraResolution(user,identity,'turn_end',proposal,guard,async request=>{
  request.requestId=id(99);request.proposal.save={baseBonus:99,dice:[20],effectRolls:[]};return {useResistance:false};
 });
});
it('never asks for a new decision after an ambiguous submitted response',async()=>{
 const review=vi.fn(async()=>({useResistance:false}));
 h.rpc.mockImplementation(async fn=>fn==='read_aura_resolution'?null:fn==='get_aura_resolution_context'?context():Promise.reject(new Error('offline')));
 await expect(processSavedAuraResolution(user,identity,'turn_end',proposal,guard,review)).rejects.toThrow('offline');
 expect(savedAuraResolution(user,identity)?.phase).toBe('ready');
 h.rpc.mockImplementation(async(fn,args)=>fn==='read_aura_resolution'?null:reply(args));
 await processSavedAuraResolution(user,identity,'turn_end',proposal,guard,review);expect(review).toHaveBeenCalledTimes(1);
});
it('keeps unsubmitted review when account scope changes while deciding',async()=>{
 let changed=false;
 await expect(processSavedAuraResolution(user,identity,'turn_end',proposal,()=>{if(changed)throw new Error('scope changed');},async()=>{changed=true;return {useResistance:false};})).rejects.toThrow('scope changed');
 expect(savedAuraResolution(user,identity)?.phase).toBe('review');expect(h.rpc.mock.calls.filter(c=>c[0]==='commit_aura_resolution')).toHaveLength(0);
});
it('does not submit if saving the reviewed choice fails',async()=>{
 const set=localStorage.setItem.bind(localStorage);
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(JSON.parse(v).phase==='ready')throw new Error('quota');set(k,v);});
 await expect(processSavedAuraResolution(user,identity,'turn_end',proposal,guard,async()=>({useResistance:false}))).rejects.toThrow('quota');
 expect(savedAuraResolution(user,identity)?.phase).toBe('review');expect(h.rpc.mock.calls.filter(c=>c[0]==='commit_aura_resolution')).toHaveLength(0);
});

it('real dice preparation survives postponement and ignores changed retry inputs',async()=>{
 const random=vi.spyOn(Math,'random').mockReturnValue(.5),inputs={baseBonus:0,conModifier:0,affinity:'normal' as const,geometryConfirmed:true,defensesReviewed:true};
 const review=vi.fn(async()=>null);await expect(processReviewedAuraResolution(user,identity,'turn_end',inputs,guard,review)).rejects.toThrow('postponed');
 const saved=savedAuraResolution(user,identity);expect(saved).toMatchObject({phase:'review',proposal:{save:{baseBonus:0,dice:[11]},penaltyD4:3,damageRoll:{total:5}}});const calls=random.mock.calls.length;
 const second=vi.fn(async(request:unknown)=>{expect(request).toEqual(saved);return {useResistance:false};});
 expect(await processReviewedAuraResolution(user,identity,'creature_entered',{...inputs,baseBonus:99,affinity:'immune'},guard,second)).toMatchObject({damage:5});expect(random).toHaveBeenCalledTimes(calls);
});
it('real preparation cannot bypass review',async()=>{
 await expect(processReviewedAuraResolution(user,identity,'turn_end',{baseBonus:0,conModifier:0,affinity:'normal',geometryConfirmed:true,defensesReviewed:true},guard,undefined as never)).rejects.toThrow('require a review');expect(h.rpc).not.toHaveBeenCalled();
});
