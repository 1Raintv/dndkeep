// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {rememberPsionicPayment,forgetPsionicPayment,pendingPsionicPayments} from '../../../lib/psionicPaymentRecovery';
import PsionicPaymentRecoveryPanel from './PsionicPaymentRecoveryPanel';
import {ModalProvider} from '../../shared/Modal';
const payment={kind:'enkindled' as const,request:{requestId:'saved',turn:{soloTurn:0},count:2,baseRolls:[2,3],extraRolls:[4,6],sourceFeature:'Biofeedback',recoveryNote:'Add Intelligence 4 once.'}};
const receipt={requestId:'saved',extraRolls:[4,6],hitDiceSpent:2,hitDiceRevision:1,replayed:true};
function service():PsionicEnhancementPersistence{return {getTurn:vi.fn(),surge:vi.fn(),spend:vi.fn(async()=>{forgetPsionicPayment('hero','saved');return receipt;})};}
const ui=(persistence:PsionicEnhancementPersistence,id='hero')=><ModalProvider><PsionicPaymentRecoveryPanel characterId={id} persistence={persistence}/></ModalProvider>;
afterEach(cleanup);beforeEach(()=>{localStorage.clear();rememberPsionicPayment('hero',payment);});
it('keeps the base and extra rolls visible after confirmation for manual resolution',async()=>{
 const persistence=service();render(ui(persistence));fireEvent.click(screen.getByRole('button',{name:'Confirm dice cost'}));
 await screen.findByText(/dice cost confirmed/);expect(screen.getByText(/Base rolls: 2, 3/)).toBeTruthy();expect(screen.getByText(/Extra rolls: 4, 6/)).toBeTruthy();expect(screen.getByText(/Add Intelligence 4 once/)).toBeTruthy();expect(persistence.spend).toHaveBeenCalledWith(payment.request);
});
it('keeps an unknown payment available and retries the same saved request',async()=>{
 const persistence=service();vi.mocked(persistence.spend).mockRejectedValue(new Error('Still offline'));render(ui(persistence));fireEvent.click(screen.getByRole('button',{name:'Confirm dice cost'}));
 await screen.findByText(/Still offline/);expect(pendingPsionicPayments('hero')).toEqual([payment]);fireEvent.click(screen.getByRole('button',{name:'Confirm dice cost'}));
 await waitFor(()=>expect(persistence.spend).toHaveBeenCalledTimes(2));expect(vi.mocked(persistence.spend).mock.calls[0]).toEqual(vi.mocked(persistence.spend).mock.calls[1]);
});
it('does not show another characters late receipt',async()=>{
 const persistence=service();let finish!:(v:typeof receipt)=>void;vi.mocked(persistence.spend).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const view=render(ui(persistence));fireEvent.click(screen.getByRole('button',{name:'Confirm dice cost'}));
 view.rerender(ui(persistence,'other'));await act(async()=>finish(receipt));expect(screen.queryByRole('status')).toBeNull();
});
it('dismissal removes only the local recovery entry and never sends a payment',async()=>{
 const persistence=service();render(ui(persistence));fireEvent.click(screen.getByRole('button',{name:'Dismiss recovery'}));
 const dialog=screen.getByRole('dialog',{name:'Dismiss saved roll?'});fireEvent.click(within(dialog).getByRole('button',{name:'Dismiss recovery'}));
 await waitFor(()=>expect(pendingPsionicPayments('hero')).toEqual([]));expect(persistence.spend).not.toHaveBeenCalled();
});

