import {createHitDiceHealingRequest} from './hitDiceHealingRequest';
import type {Character} from '../types';
// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
import {setPsionicPaymentActive,forgetPsionicPayment,pendingPsionicPayments,rememberPsionicPayment,PSIONIC_PAYMENT_CHANGED} from './psionicPaymentRecovery';
const payment={kind:'surge' as const,request:{requestId:'saved',rolls:[1,3,6],sourceFeature:'Biofeedback'}};
beforeEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it('persists the exact request for its character across reads and notifies the same tab',()=>{
 const listener=vi.fn();window.addEventListener(PSIONIC_PAYMENT_CHANGED,listener);
 try{rememberPsionicPayment('hero',payment);expect(pendingPsionicPayments('hero')).toEqual([payment]);expect(pendingPsionicPayments('other')).toEqual([]);expect(listener).toHaveBeenCalledTimes(1);
 forgetPsionicPayment('hero','saved');expect(pendingPsionicPayments('hero')).toEqual([]);}finally{window.removeEventListener(PSIONIC_PAYMENT_CHANGED,listener);}
});
it('ignores malformed, mismatched and invalid saved requests',()=>{
 localStorage.setItem('dndkeep:psionic-payment:hero:bad','broken');
 localStorage.setItem('dndkeep:psionic-payment:hero:wrong',JSON.stringify(payment));
 localStorage.setItem('dndkeep:psionic-payment:hero:saved',JSON.stringify({...payment,request:{...payment.request,rolls:[99]}}));
 expect(pendingPsionicPayments('hero')).toEqual([]);
});
it('does not pretend recovery was saved when browser storage fails',()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Quota');});expect(()=>rememberPsionicPayment('hero',payment)).toThrow('Quota');
});
it('keeps an unremovable entry available for idempotent confirmation',()=>{
 rememberPsionicPayment('hero',payment);vi.spyOn(localStorage,'removeItem').mockImplementation(()=>{throw new Error('Unavailable');});expect(()=>forgetPsionicPayment('hero','saved')).not.toThrow();expect(pendingPsionicPayments('hero')).toEqual([payment]);
});


it('retains Energy Dice and Restoration requests but rejects malformed costs',()=>{
 const spend={kind:'energy' as const,request:{requestId:'base',operation:'spend' as const,count:2,rolls:[2,3],sourceFeature:'Biofeedback'}};
 const restore={kind:'energy' as const,request:{requestId:'restore',operation:'restore' as const,count:0,rolls:[],sourceFeature:'Psionic Restoration'}};
 rememberPsionicPayment('hero',spend);rememberPsionicPayment('hero',restore);expect(pendingPsionicPayments('hero')).toEqual([spend,restore]);
 for(const request of [{...spend.request,count:1},{...spend.request,rolls:[0,3]},{...restore.request,count:1},{...restore.request,sourceFeature:'Other'}])expect(()=>rememberPsionicPayment('hero',{kind:'energy',request})).toThrow('Invalid saved');
});

it('saves manual teleportation corrections with no Energy Dice cost',()=>{
 const correction={kind:'energy' as const,request:{requestId:'manual',operation:'recover-misty-step' as const,count:0,rolls:[],sourceFeature:'Free Misty Step (Teleportation)'}};
 rememberPsionicPayment('hero',correction);expect(pendingPsionicPayments('hero')).toEqual([correction]);
 for(const request of [{...correction.request,count:1},{...correction.request,rolls:[1]},{...correction.request,sourceFeature:'Other'}])expect(()=>rememberPsionicPayment('hero',{kind:'energy',request})).toThrow('Invalid saved');
});

it('retains a chosen Hit Die in saved Surge recovery and rejects invalid sizes',()=>{
 const selected={...payment,request:{...payment.request,hitDie:10 as const}};
 rememberPsionicPayment('hero',selected);expect(pendingPsionicPayments('hero')).toEqual([selected]);
 for(const hitDie of [4,20,0,null,'10']){
  localStorage.setItem('dndkeep:psionic-payment:hero:saved',JSON.stringify({...payment,request:{...payment.request,hitDie}}));
  expect(pendingPsionicPayments('hero')).toEqual([]);
 }
});

it('retains healing snapshots and lets mutation guards see active requests',()=>{
 const request=createHitDiceHealingRequest({current_hp:1,max_hp:20,hit_point_revision:0,psionic_hit_dice_revision:0,constitution:10,inventory:[]} as unknown as Character,6,[3],0,'11111111-1111-4111-8111-111111111111');
 const payment={kind:'healing' as const,request};rememberPsionicPayment('hero',payment);setPsionicPaymentActive('hero',request.requestId,true);
 try{expect(pendingPsionicPayments('hero')).toEqual([]);expect(pendingPsionicPayments('hero',true)).toEqual([payment]);}
 finally{setPsionicPaymentActive('hero',request.requestId,false);}
 expect(pendingPsionicPayments('hero')).toEqual([payment]);
});
