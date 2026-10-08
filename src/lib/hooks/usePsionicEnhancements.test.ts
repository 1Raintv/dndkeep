import {createDisciplineRequest} from '../psionicDisciplineRequest';
import {createHitDiceHealingRequest} from '../hitDiceHealingRequest';
import {createPsionicRestRequest} from '../psionicRestRequest';
import type {Character} from '../../types';
// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {pendingPsionicPayments,rememberPsionicPayment} from '../psionicPaymentRecovery';
import {usePsionicEnhancements} from './usePsionicEnhancements';
const request={requestId:'stable',turn:{soloTurn:0},count:2,baseRolls:[1],extraRolls:[2,3],sourceFeature:'Biofeedback'};
const receipt={requestId:'stable',extraRolls:[2,3],hitDiceSpent:2,hitDiceRevision:1,replayed:false};
const queue=()=>({flush:vi.fn(async()=>{}),getSnapshot:vi.fn(()=>({pending:false,error:null as string|null}))});
afterEach(cleanup);beforeEach(()=>{localStorage.clear();vi.resetAllMocks();mocks.rpc.mockResolvedValue({data:receipt,error:null});});
it('flushes prior edits then accepts a paid receipt without sending another character write',async()=>{
 let finish!:()=>void;const saves=queue();saves.flush.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const accept=vi.fn();
 const hook=renderHook(()=>usePsionicEnhancements('hero',saves,accept));const pending=hook.result.current.spend(request);
 expect(mocks.rpc).not.toHaveBeenCalled();await act(async()=>{finish();await pending;});
 expect(accept).toHaveBeenCalledWith(receipt);expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.rpc.mock.calls[0][0]).toBe('spend_enkindled_life_force');
});
it('does not replay an already failed character save as part of payment',async()=>{
 const saves=queue();saves.getSnapshot.mockReturnValue({pending:true,error:'Offline'});const hook=renderHook(()=>usePsionicEnhancements('hero',saves,vi.fn()));
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:true});expect(saves.flush).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
it('never pays while pending edits remain or the sheet is frozen',async()=>{
 const saves=queue();saves.getSnapshot.mockReturnValue({pending:true,error:null});const hook=renderHook(({frozen})=>usePsionicEnhancements('hero',saves,vi.fn(),frozen),{initialProps:{frozen:false}});
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:true});
 hook.rerender({frozen:true});await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
});
it('cancels unsent payment if the character changes while its edits save',async()=>{
 let finish!:()=>void;const saves=queue();saves.flush.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const accept=vi.fn();
 const hook=renderHook(({id})=>usePsionicEnhancements(id,saves,accept),{initialProps:{id:'hero'}});const pending=hook.result.current.spend(request);
 const rejection=expect(pending).rejects.toMatchObject({definitelyNotPaid:true});hook.rerender({id:'other'});await act(async()=>{finish();await rejection;});expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(['switch','close'])('retains a paid receipt without applying it to a changed sheet: %s',async mode=>{
 let finish!:(v:unknown)=>void;mocks.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const saves=queue(),accept=vi.fn();
 const hook=renderHook(({id})=>usePsionicEnhancements(id,saves,accept),{initialProps:{id:'hero'}});const pending=hook.result.current.spend(request);
 await act(async()=>{await Promise.resolve();});expect(mocks.rpc).toHaveBeenCalledTimes(1);
 if(mode==='switch')hook.rerender({id:'other'});else hook.unmount();
 await act(async()=>{finish({data:receipt,error:null});expect(await pending).toEqual(receipt);});expect(accept).not.toHaveBeenCalled();
});

it('retains unknown payment across navigation and a later rejection',async()=>{
 const saves=queue(),accept=vi.fn();mocks.rpc.mockRejectedValue(new Error('Offline'));
 const hook=renderHook(()=>usePsionicEnhancements('hero',saves,accept));
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:false});
 expect(pendingPsionicPayments('hero')).toEqual([{kind:'enkindled',request}]);expect(accept).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Turn changed'}});
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:false});expect(pendingPsionicPayments('hero')).toEqual([{kind:'enkindled',request}]);
});

it('does not mislabel an older unknown payment as unpaid when a retry is blocked',async()=>{
 rememberPsionicPayment('hero',{kind:'enkindled',request});const saves=queue();saves.getSnapshot.mockReturnValue({pending:true,error:'Offline'});
 const hook=renderHook(()=>usePsionicEnhancements('hero',saves,vi.fn()));
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:false});expect(mocks.rpc).not.toHaveBeenCalled();expect(pendingPsionicPayments('hero')).toHaveLength(1);
});

it('persists an unknown Energy Dice payment and confirms the exact original request later',async()=>{
 const saves=queue(),accept=vi.fn(),energy={requestId:'energy',operation:'spend' as const,count:1,rolls:[3],sourceFeature:'Manual'};
 mocks.rpc.mockRejectedValue(new Error('Lost response'));const hook=renderHook(()=>usePsionicEnhancements('hero',saves,accept));
 await expect(hook.result.current.energy(energy)).rejects.toMatchObject({definitelyNotPaid:false});
 expect(pendingPsionicPayments('hero')).toEqual([{kind:'energy',request:energy}]);expect(accept).not.toHaveBeenCalled();
 const paid={requestId:'energy',remaining:4,energyRevision:2,restorationResource:null,restorationUsed:null,rolls:[3],replayed:true};
 mocks.rpc.mockResolvedValue({data:paid,error:null});await act(async()=>{expect(await hook.result.current.energy(energy)).toEqual(paid);});
 expect(pendingPsionicPayments('hero')).toEqual([]);expect(accept).toHaveBeenCalledWith(paid);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[2]);
});

it('retains an interrupted rest snapshot and accepts its exact replay without another character save',async()=>{
 const c={id:'hero',class_name:'Psion',level:7,class_resources:{'psionic-energy-dice':2},feature_uses:{},spell_slots:{},psionic_energy_revision:1,psionic_hit_dice_revision:0} as unknown as Character;
 const request=createPsionicRestRequest(c,'short',{class_resources:{'psionic-energy-dice':3},feature_uses:{},spell_slots:{}},'rest');
 const saves=queue(),accept=vi.fn(),hook=renderHook(()=>usePsionicEnhancements('hero',saves,accept));mocks.rpc.mockRejectedValue(new Error('Lost response'));
 await expect(hook.result.current.rest!(request)).rejects.toMatchObject({definitelyNotPaid:false});expect(pendingPsionicPayments('hero')).toEqual([{kind:'rest',request}]);
 mocks.rpc.mockResolvedValue({data:{requestId:'rest',character:c,replayed:true},error:null});await act(async()=>{await hook.result.current.rest!(request);});
 expect(pendingPsionicPayments('hero')).toEqual([]);expect(accept).toHaveBeenCalledWith({requestId:'rest',character:c,replayed:true,expected:request.expected});
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[2]);
});

it('persists a complete healing request and confirms the original result after a lost response',async()=>{
 const c={id:'hero',current_hp:1,max_hp:20,temp_hp:0,constitution:10,inventory:[],hit_point_revision:0,psionic_hit_dice_revision:0} as unknown as Character;
 const healing=createHitDiceHealingRequest(c,6,[3],0,'11111111-1111-4111-8111-111111111111');
 const paid={requestId:healing.requestId,hitDie:6,rolls:[3],constitutionModifier:0,healing:3,gained:3,replayed:true,character:{...c,current_hp:2,hit_point_revision:2,hit_dice_spent:1,hit_dice_spent_by_type:{'6':1},psionic_hit_dice_revision:1}};
 const accept=vi.fn();mocks.rpc.mockRejectedValue(new Error('Lost response'));const hook=renderHook(()=>usePsionicEnhancements('hero',queue(),accept));
 await expect(hook.result.current.heal!(healing)).rejects.toMatchObject({definitelyNotPaid:false});expect(pendingPsionicPayments('hero')).toEqual([{kind:'healing',request:healing}]);expect(accept).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValue({data:paid,error:null});await expect(hook.result.current.heal!(healing)).resolves.toEqual(paid);expect(accept).toHaveBeenCalledWith(paid);expect(pendingPsionicPayments('hero')).toEqual([]);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[2]);
});

const disciplineHero={id:'hero',class_name:'Psion',level:5,intelligence:18,inventory:[],class_resources:{'psionic-energy-dice':6,'psion-disciplines':['inerrant-aim']},feature_uses:{},psionic_energy_revision:0} as unknown as Character;
const discipline=createDisciplineRequest(disciplineHero,{soloTurn:0},'inerrant-aim',[3],1,4,'attempt');
const disciplineReceipt={requestId:'attempt',turn:{soloTurn:0},discipline:'inerrant-aim',sourceFeature:'Inerrant Aim',rolls:[3],count:1,conditional:true,energy:null,outcome:null,replayed:false,character:disciplineHero};
it('saves a discipline claim before sending and retains it through unknown confirmation',async()=>{
 const accept=vi.fn();mocks.rpc.mockImplementation(async()=>{expect(pendingPsionicPayments('hero',true)).toEqual([{kind:'discipline-begin',request:discipline}]);throw new Error('Offline');});
 const hook=renderHook(()=>usePsionicEnhancements('hero',queue(),accept));
 await expect(hook.result.current.beginDiscipline!(discipline)).rejects.toMatchObject({definitelyNotPaid:false});
 expect(pendingPsionicPayments('hero')).toEqual([{kind:'discipline-begin',request:discipline}]);
 mocks.rpc.mockResolvedValue({data:{...disciplineReceipt,replayed:true},error:null});
 await hook.result.current.beginDiscipline!(discipline);expect(pendingPsionicPayments('hero')).toEqual([]);expect(accept).toHaveBeenCalledWith({...disciplineReceipt,replayed:true});
});
it('freezes the discipline before pending edits finish saving',async()=>{
 let resolve!:()=>void;const saves=queue();saves.flush.mockImplementation(()=>new Promise(done=>{resolve=done;}));
 const original=structuredClone(discipline),hook=renderHook(()=>usePsionicEnhancements('hero',saves,vi.fn()));mocks.rpc.mockResolvedValue({data:disciplineReceipt,error:null});
 const pending=hook.result.current.beginDiscipline!(original);original.rolls[0]=8;original.expected.intelligence=20;
 resolve();await pending;expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_rolls:[3],p_expected:{intelligence:18}});
});
it('persists a keep-die decision before sending and never substitutes a paid decision',async()=>{
 const outcome={...discipline,changedOutcome:false},hook=renderHook(()=>usePsionicEnhancements('hero',queue(),vi.fn()));
 mocks.rpc.mockRejectedValue(new Error('lost'));await expect(hook.result.current.finishDiscipline!(outcome)).rejects.toMatchObject({definitelyNotPaid:false});
 expect(pendingPsionicPayments('hero')).toEqual([{kind:'discipline-finish',request:outcome}]);
 mocks.rpc.mockResolvedValue({data:{...disciplineReceipt,outcome:{spent:false,energy:null}},error:null});await hook.result.current.finishDiscipline!(outcome);
 expect(mocks.rpc.mock.calls[2][1].p_changed_outcome).toBe(false);expect(pendingPsionicPayments('hero')).toEqual([]);
});

it('cannot overwrite an unknown paid outcome with a keep-die decision',async()=>{
 const original={...discipline,changedOutcome:true};rememberPsionicPayment('hero',{kind:'discipline-finish',request:original});
 const hook=renderHook(()=>usePsionicEnhancements('hero',queue(),vi.fn()));
 await expect(hook.result.current.finishDiscipline!({...original,changedOutcome:false})).rejects.toMatchObject({definitelyNotPaid:false});
 expect(mocks.rpc).not.toHaveBeenCalled();expect(pendingPsionicPayments('hero')).toEqual([{kind:'discipline-finish',request:original}]);
});
