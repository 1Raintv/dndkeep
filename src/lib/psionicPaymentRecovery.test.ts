// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
import {forgetPsionicPayment,pendingPsionicPayments,rememberPsionicPayment,PSIONIC_PAYMENT_CHANGED} from './psionicPaymentRecovery';
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

