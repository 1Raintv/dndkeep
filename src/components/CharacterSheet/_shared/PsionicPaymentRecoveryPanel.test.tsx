import type {DisciplineReceipt} from '../../../lib/api/psionicDisciplines';
// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {rememberPsionicPayment,forgetPsionicPayment,pendingPsionicPayments} from '../../../lib/psionicPaymentRecovery';
import PsionicPaymentRecoveryPanel from './PsionicPaymentRecoveryPanel';
import {ModalProvider} from '../../shared/Modal';
const payment={kind:'enkindled' as const,request:{requestId:'saved',turn:{soloTurn:0},count:2,baseRolls:[2,3],extraRolls:[4,6],sourceFeature:'Biofeedback',recoveryNote:'Add Intelligence 4 once.'}};
const receipt={requestId:'saved',extraRolls:[4,6],hitDiceSpent:2,hitDiceRevision:1,replayed:true};
function service():PsionicEnhancementPersistence{return {energy:vi.fn(),getTurn:vi.fn(),surge:vi.fn(),spend:vi.fn(async()=>{forgetPsionicPayment('hero','saved');return receipt;})};}
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


it('confirms Restoration as an already-applied recovery without telling the player to restore again',async()=>{
 localStorage.clear();const request={requestId:'restore',operation:'restore' as const,count:0,rolls:[],sourceFeature:'Psionic Restoration'};
 rememberPsionicPayment('hero',{kind:'energy',request});const persistence=service();
 vi.mocked(persistence.energy).mockImplementation(async()=>{forgetPsionicPayment('hero','restore');return {requestId:'restore',remaining:6,restorationResource:0,restorationUsed:1,energyRevision:1,rolls:[],replayed:true};});
 render(ui(persistence));fireEvent.click(screen.getByRole('button',{name:'Confirm dice cost'}));
 await screen.findByText(/Psionic Restoration confirmed/);expect(screen.getByText(/do not restore them again/)).toBeTruthy();expect(persistence.energy).toHaveBeenCalledWith(request);
});

it('confirms a saved discipline decision without offering to discard or reverse it',async()=>{
 localStorage.clear();const request={requestId:'attempt',sourceFeature:'Inerrant Aim',discipline:'inerrant-aim' as const,turn:{soloTurn:0},rolls:[3],count:1,changedOutcome:false};
 rememberPsionicPayment('hero',{kind:'discipline-finish',request});
 const persistence=service();persistence.finishDiscipline=vi.fn(async()=>{forgetPsionicPayment('hero','attempt');return {...request,outcome:{spent:false,energy:null}} as unknown as DisciplineReceipt;});
 render(ui(persistence));expect(screen.queryByRole('button',{name:'Dismiss recovery'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Confirm saved attempt'}));await screen.findByText(/Energy Die was kept/);
 expect(persistence.finishDiscipline).toHaveBeenCalledWith(request);expect(persistence.energy).not.toHaveBeenCalled();
});
