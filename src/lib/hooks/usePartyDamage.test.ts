// @vitest-environment happy-dom
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
const m=vi.hoisted(()=>({load:vi.fn(),submit:vi.fn(),cancel:vi.fn(),auto:vi.fn(),applied:vi.fn()}));
vi.mock('../api/partyDamage',()=>({loadPartyDamageContext:m.load,submitPartyDamage:m.submit,cancelPartyDamage:m.cancel,settlePartyAutomaticSave:m.auto}));
vi.mock('../hooks/useMagicItems',()=>({getMagicItemById:()=>null}));
import {usePartyDamage} from './usePartyDamage';
import {savedPartyDamage} from '../partyDamageRecovery';
import type {PartyDamageContext,PartyDamageRequest} from '../partyDamageRequest';
const first='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333',second='44444444-4444-4444-8444-444444444444';
const context=(id=first,campaignId=campaign):PartyDamageContext=>({character:{id,name:id===first?'First':'Second',species:'Human',strength:10,dexterity:10,constitution:14,intelligence:10,wisdom:10,charisma:10,inventory:[],damage_resistances:[],damage_vulnerabilities:[],damage_immunities:[],concentration_spell:'',hit_point_revision:0,active_conditions:[],automation_overrides:{},advanced_automations_unlocked:false},campaign:{id:campaignId,automation_defaults:{}},participant:null,combatant:null,pools:{current_hp:40,max_hp:50,temp_hp:5}});
const chars=[first,second].map(id=>({...context(id).character,...context(id).pools}) as Character);
const receipt=(r:PartyDamageRequest)=>({requestId:r.requestId,saveId:r.saveId,damage:10,damageType:null,beforeHP:40,beforeTempHP:5,afterHP:35,afterTempHP:0,checkId:null,concentrationBroken:false,automation:'prompt',participantId:null,replayed:false,character:{id:r.characterId,current_hp:35,max_hp:50,temp_hp:0,hit_point_revision:1}});
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();m.load.mockImplementation(async(c:string,id:string)=>context(id,c));m.submit.mockImplementation(async r=>receipt(r));m.auto.mockResolvedValue(null);m.cancel.mockResolvedValue(true);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const setup=()=>renderHook(({campaignId})=>usePartyDamage(user,campaignId,chars,true,m.applied),{initialProps:{campaignId:campaign}});
it('persists the entire group before sending and retries partial results with original identities',async()=>{
 let failed=false;m.submit.mockImplementation(async(r:PartyDamageRequest)=>{expect(savedPartyDamage(user,campaign)[0].requests).toHaveLength(2);if(r.characterId===second&&!failed){failed=true;throw new Error('Connection lost');}return receipt(r);});
 const {result}=setup();await waitFor(()=>expect(result.current.contexts[second]).toBeTruthy());
 await act(async()=>{expect(await result.current.apply([first,second],10,null,false)).toBe(false);});
 expect(result.current.results[0].receipt?.afterHP).toBe(35);expect(result.current.results[1].error).toBe('Connection lost');expect(result.current.saved).toHaveLength(1);
 await act(async()=>{expect(await result.current.confirm(result.current.saved[0])).toBe(true);});
 expect(m.submit.mock.calls[0][0]).toEqual(m.submit.mock.calls[2][0]);expect(m.submit.mock.calls[1][0]).toEqual(m.submit.mock.calls[3][0]);expect(result.current.saved).toEqual([]);
});
it('storage failure prevents any damage call',async()=>{
 const {result}=setup();await waitFor(()=>expect(result.current.contexts[first]).toBeTruthy());vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});
 await act(async()=>{await result.current.apply([first],10,null,false);});expect(m.submit).not.toHaveBeenCalled();expect(result.current.error).toBe('Storage full');
});
it('changing campaign during confirmation stops later targets and retains the original group',async()=>{
 let finish!:(v:unknown)=>void;m.submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const {result,rerender}=setup();await waitFor(()=>expect(result.current.contexts[second]).toBeTruthy());
 let job!:Promise<boolean>;act(()=>{job=result.current.apply([first,second],10,null,false);});await waitFor(()=>expect(m.submit).toHaveBeenCalledTimes(1));
 rerender({campaignId:second});await act(async()=>{finish(receipt(m.submit.mock.calls[0][0]));await job;});
 expect(m.submit).toHaveBeenCalledTimes(1);expect(savedPartyDamage(user,campaign)).toHaveLength(1);expect(result.current.results).toEqual([]);expect(result.current.saved).toEqual([]);
});
it('cancel preserves confirmed damage and cancels only unapplied targets',async()=>{
 m.submit.mockRejectedValue(new Error('Offline'));const {result}=setup();await waitFor(()=>expect(result.current.contexts[second]).toBeTruthy());
 await act(async()=>{await result.current.apply([first,second],10,null,false);});m.submit.mockImplementation(async r=>receipt(r));m.cancel.mockImplementation(async(r:PartyDamageRequest)=>r.characterId===second);
 await act(async()=>{await result.current.cancel(result.current.saved[0]);});
 expect(result.current.results[0].receipt?.afterHP).toBe(35);expect(result.current.results[1].canceled).toBe(true);expect(result.current.saved).toEqual([]);expect(m.submit).toHaveBeenCalledTimes(3);
});
it('an automatic save failure retains the paid damage for confirmation',async()=>{
 m.auto.mockRejectedValueOnce(new Error('Save not confirmed'));const {result}=setup();await waitFor(()=>expect(result.current.contexts[first]).toBeTruthy());
 await act(async()=>{await result.current.apply([first],10,null,false);});expect(result.current.results[0].receipt?.afterHP).toBe(35);expect(result.current.saved).toHaveLength(1);
 await act(async()=>{await result.current.confirm(result.current.saved[0]);});expect(m.submit.mock.calls[0][0].requestId).toBe(m.submit.mock.calls[1][0].requestId);expect(result.current.saved).toEqual([]);
});
