// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately malformed RPC fixtures exercise boundary validation. */
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),die:vi.fn(),record:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('./psionicPropel',()=>({validPropelRecord:m.record}));
vi.mock('../../rules/dice',async original=>({...await original<typeof import('../../rules/dice')>(),rollDie:m.die}));
import {preparePropelSave,pendingPropelSaves,savedPropelSave,confirmPropelSave,getPropelSave,decidePropelResistance} from './propelSaves';
const ctx=()=>({declarationId:'use',characterId:'hero',encounterId:'enc',participantId:'target',legendaryResistanceRemaining:0,state:{target:{id:'target',entityId:'entity',type:'creature',combatantId:'combatant'},conditions:[],buffs:[],exhaustion:0,naturalExtremes:false,autoFail:false,advantage:false,disadvantage:false}});
let context:ReturnType<typeof ctx>,server:any,fail:boolean,pending:boolean;
const prepare=(bonus=0,review=false)=>preparePropelSave('hero','use','enc','target',10,bonus,review);
function receipt(p:any){
 const s=p.p_expected.state,dice=p.p_dice,face=s.autoFail?1:s.disadvantage?Math.min(...dice):dice[0],penalty=s.autoFail?0:p.p_penalty_d4;
 const bonus=p.p_base_bonus+p.p_buff_total-2*s.exhaustion-penalty,passed=!s.autoFail&&face+bonus>=p.p_dc,outcome=passed?'passed':'failed';
 const save={participantId:'target',outcome,dc:p.p_dc,d20:face,bonus,total:face+bonus,rolls:dice,advantage:s.advantage,disadvantage:s.disadvantage,automaticFailure:s.autoFail,naturalExtremes:s.naturalExtremes};
 return {declarationId:'use',save,penalty:{saveId:'use',saveKind:'feature',penalty,die:penalty||null,consumedIds:['effect'],expiredIds:[]},pendingResistance:pending,accepted:null,finalOutcome:pending?null:outcome,
  record:{request_id:'use',target:{participantId:'target'},turn_context:{encounterId:'enc'},outcome:pending?null:outcome,save_details:pending?null:save},
  request:{expected:p.p_expected,dc:p.p_dc,dice,baseBonus:p.p_base_bonus,buffTotal:p.p_buff_total,buffContributions:p.p_buff_contributions,penaltyD4:p.p_penalty_d4}};
}
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear();context=ctx();server=null;fail=false;pending=false;m.record.mockReturnValue(true);m.die.mockImplementation((s:number)=>s===20?12:3);
 m.rpc.mockImplementation(async(name:string,p:any)=>{
  if(name==='get_propel_save_context')return structuredClone(context);
  if(name==='get_propel_save')return server;
  if(name==='choose_propel_failure'){
   if(fail)throw new Error('Offline');const r=receipt({...p,p_dice:[1],p_base_bonus:0,p_buff_total:0,p_buff_contributions:[],p_penalty_d4:0});
   const save={participantId:'target',outcome:'auto-failed',dc:p.p_dc};return {...r,save,request:{...r.request,willing:true,confirmedBy:'dm',dice:[],penaltyD4:null},record:{...r.record,save_details:pending?null:save}};
  }
  if(name==='settle_propel_save'){if(fail)throw new Error('Offline');return receipt(p);}
  if(name==='decide_propel_resistance'){const r=structuredClone(server);r.pendingResistance=false;r.accepted=p.p_accept;r.finalOutcome=p.p_accept?'passed':'failed';r.record.outcome=r.finalOutcome;r.record.save_details=p.p_accept?null:r.save;return r;}
  throw new Error('Unexpected RPC');
 });
});
it('persists dice before settlement and verifies the paid receipt',async()=>{await prepare();expect(savedPropelSave('hero','use')).toMatchObject({dice:[12],penaltyD4:3});expect(m.rpc.mock.calls.some(c=>c[0]==='settle_propel_save')).toBe(false);expect(await confirmPropelSave('hero','use')).toMatchObject({save:{total:9,outcome:'failed'}});expect(savedPropelSave('hero','use')).toBeNull();});
it('offline confirmation retries identical dice',async()=>{await prepare();fail=true;await expect(confirmPropelSave('hero','use')).rejects.toThrow('Offline');fail=false;await confirmPropelSave('hero','use');expect(m.die).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls.filter(c=>c[0]==='settle_propel_save').map(c=>c[1].p_dice)).toEqual([[12],[12]]);});
it('lost success is recovered from the server without a second settlement',async()=>{await prepare();const original=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name,p)=>{if(name==='settle_propel_save'){server=receipt(p);throw new Error('Response lost');}return original(name,p);});await expect(confirmPropelSave('hero','use')).rejects.toThrow('Response lost');expect(await confirmPropelSave('hero','use')).toEqual(server);expect(m.rpc.mock.calls.filter(c=>c[0]==='settle_propel_save')).toHaveLength(1);expect(m.die).toHaveBeenCalledTimes(2);});
it('changed bonus requires explicit review and preserves the original dice',async()=>{await prepare();await expect(prepare(2)).rejects.toThrow('Review changed');await prepare(2,true);expect(savedPropelSave('hero','use')).toMatchObject({dice:[12],baseBonus:2,penaltyD4:3});expect(m.die).toHaveBeenCalledTimes(2);});
it('review adds only a newly required second die and keeps it for later reviews',async()=>{await prepare();context.state.disadvantage=true;m.die.mockReturnValue(4);await prepare(0,true);context.state.disadvantage=false;await prepare(0,true);context.state.disadvantage=true;await prepare(0,true);expect(savedPropelSave('hero','use')).toMatchObject({pool:[12,4],dice:[12,4]});expect(m.die).toHaveBeenCalledTimes(3);});
it('automatic failure uses no dice and preserves earlier dice on review',async()=>{context.state.autoFail=true;await prepare();expect(m.die).not.toHaveBeenCalled();context.state.autoFail=false;await prepare(0,true);context.state.autoFail=true;await prepare(0,true);expect(savedPropelSave('hero','use')).toMatchObject({pool:[12],dice:[],penaltyPool:3,penaltyD4:null});expect(await confirmPropelSave('hero','use')).toMatchObject({save:{automaticFailure:true},penalty:{penalty:0}});});
it('corrupt saved data refuses a replacement roll',async()=>{localStorage.setItem('dndkeep:propel-save:hero:use','broken');await expect(prepare()).rejects.toThrow('could not be verified');expect(m.die).not.toHaveBeenCalled();});
it('storage failure sends no settlement',async()=>{const spy=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage blocked');});await expect(prepare()).rejects.toThrow('Storage blocked');expect(m.rpc.mock.calls.some(c=>c[0]==='settle_propel_save')).toBe(false);spy.mockRestore();});
it('cannot confirm without a saved proposal or server receipt',async()=>{await expect(confirmPropelSave('hero','use')).rejects.toThrow('Roll and save');expect(m.die).not.toHaveBeenCalled();});
it('two confirmation clicks share one request',async()=>{await prepare();const [a,b]=await Promise.all([confirmPropelSave('hero','use'),confirmPropelSave('hero','use')]);expect(a).toEqual(b);expect(m.rpc.mock.calls.filter(c=>c[0]==='settle_propel_save')).toHaveLength(1);});
it('overlapping preparation cannot overwrite dice',async()=>{let release!:(v:unknown)=>void;m.rpc.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const first=prepare();await expect(prepare()).rejects.toThrow('Wait');await expect(confirmPropelSave('hero','use')).rejects.toThrow('Wait');release(context);await first;expect(m.die).toHaveBeenCalledTimes(2);});
it('changed bound target or DC cannot reuse a saved throw',async()=>{await prepare();await expect(preparePropelSave('hero','use','enc','other',10,0,true)).rejects.toThrow('could not be verified');await expect(preparePropelSave('hero','use','enc','target',11,0,true)).rejects.toThrow('could not be verified');});
it.each(['identity','penalty','total','conditions','record','finalOutcome'])('malformed %s keeps local recovery',async field=>{
 await prepare();const original=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name,p)=>{const r=await original(name,p);if(name==='settle_propel_save'){if(field==='identity')r.declarationId='other';if(field==='penalty')r.penalty.saveKind='attack';if(field==='total')r.save.total+=1;if(field==='conditions')r.save.automaticFailure=true;if(field==='record')m.record.mockReturnValue(false);if(field==='finalOutcome')r.finalOutcome='passed';}return r;});
 await expect(confirmPropelSave('hero','use')).rejects.toThrow('could not be verified');expect(savedPropelSave('hero','use')).not.toBeNull();
});
it('a pending receipt survives reload and an accepted decision preserves the original failed roll',async()=>{pending=true;context.legendaryResistanceRemaining=1;await prepare();server=await confirmPropelSave('hero','use');expect(savedPropelSave('hero','use')).toBeNull();expect(await getPropelSave('hero','use')).toEqual(server);expect(await decidePropelResistance('hero','use',true)).toMatchObject({save:{outcome:'failed',total:9},finalOutcome:'passed',accepted:true,record:{save_details:null}});expect(m.die).toHaveBeenCalledTimes(2);});
it('cannot accept a reply claiming a different resistance decision',async()=>{pending=true;context.legendaryResistanceRemaining=1;await prepare();server=await confirmPropelSave('hero','use');m.rpc.mockResolvedValue({...server,pendingResistance:false,accepted:false,finalOutcome:'failed',record:{...server.record,outcome:'failed',save_details:server.save}});await expect(decidePropelResistance('hero','use',true)).rejects.toThrow('could not be verified');});

it('an opposite concurrent resistance decision is not silently substituted',async()=>{pending=true;context.legendaryResistanceRemaining=1;await prepare();server=await confirmPropelSave('hero','use');const accepting=decidePropelResistance('hero','use',true);await expect(decidePropelResistance('hero','use',false)).rejects.toThrow('Wait for the current');await accepting;});

it('unconfirmed throws are discoverable after a completed use leaves the server list',async()=>{await prepare();expect(pendingPropelSaves('other')).toEqual([]);expect(pendingPropelSaves('hero')).toHaveLength(1);server=receipt({p_expected:context,p_dc:10,p_dice:[12],p_base_bonus:0,p_buff_total:0,p_buff_contributions:[],p_penalty_d4:3});await getPropelSave('hero','use');expect(pendingPropelSaves('hero')).toEqual([]);});

const prepareChoice=(review=false)=>preparePropelSave('hero','use','enc','target',10,0,review,true);
it('chosen failure saves and confirms without rolling any dice',async()=>{await prepareChoice();expect(savedPropelSave('hero','use')).toMatchObject({willing:true,dice:[],penaltyD4:null});expect(await confirmPropelSave('hero','use')).toMatchObject({save:{outcome:'auto-failed'},request:{willing:true}});expect(m.die).not.toHaveBeenCalled();});
it('chosen failure survives offline confirmation and context review',async()=>{await prepareChoice();fail=true;await expect(confirmPropelSave('hero','use')).rejects.toThrow('Offline');context.state.exhaustion=2;await prepareChoice(true);fail=false;expect(await confirmPropelSave('hero','use')).toMatchObject({save:{outcome:'auto-failed'}});expect(m.die).not.toHaveBeenCalled();});
it('saved rolls and chosen failures cannot silently replace each other',async()=>{await prepare();await expect(prepareChoice()).rejects.toThrow('different save method');localStorage.clear();await prepareChoice();await expect(prepare()).rejects.toThrow('different save method');});
it('a chosen-failure receipt must not invent a d20',async()=>{await prepareChoice();const original=m.rpc.getMockImplementation()!;m.rpc.mockImplementation(async(name,p)=>{const r=await original(name,p);return name==='choose_propel_failure'?{...r,save:{...r.save,d20:1}}:r;});await expect(confirmPropelSave('hero','use')).rejects.toThrow('could not be verified');expect(savedPropelSave('hero','use')).not.toBeNull();});
it('resistance acceptance preserves the no-roll choice',async()=>{pending=true;context.legendaryResistanceRemaining=1;await prepareChoice();server=await confirmPropelSave('hero','use');expect(await decidePropelResistance('hero','use',true)).toMatchObject({save:{outcome:'auto-failed'},finalOutcome:'passed'});expect(m.die).not.toHaveBeenCalled();});
