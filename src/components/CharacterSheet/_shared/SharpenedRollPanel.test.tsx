vi.mock('../../../context/CombatContext',()=>({useCombatSelector:()=>''}));
// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({confirm:vi.fn(),pending:vi.fn()}));
vi.mock('../../shared/Modal',()=>({useModal:()=>({confirm:mocks.confirm})}));
vi.mock('../../../lib/psionicPaymentRecovery',()=>({pendingPsionicPayments:mocks.pending,PSIONIC_PAYMENT_CHANGED:'payment-changed'}));
import SharpenedRollPanel from './SharpenedRollPanel';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
const row={durationTracked:true,remainingSeconds:60,expiredByDuration:false,incapacitationTracked:true,endedByIncapacitation:false,requestId:'activation',characterId:'hero',originalRolls:[2],rolls:[4],total:4,activatedAt:'2026-10-08T12:00:00Z',turn:{soloTurn:0},finalized:false};
const setup=()=>({getSharpenedRolls:vi.fn(async()=>[row]),finalizeSharpenedRoll:vi.fn(async()=>({...row,replayed:false}))});
afterEach(cleanup);beforeEach(()=>{vi.resetAllMocks();mocks.pending.mockReturnValue([]);mocks.confirm.mockResolvedValue(true);});
it('confirms the same activation and clearly labels the saved number',async()=>{
 const p=setup();render(<SharpenedRollPanel characterId="hero" persistence={p as unknown as PsionicEnhancementPersistence}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Confirm saved roll'}));await waitFor(()=>expect(p.finalizeSharpenedRoll).toHaveBeenCalledWith('activation'));
 expect(screen.getByText(/does not mean it is still active/)).toBeTruthy();
});
it('blocks finalizing an activation with a saved enhancement payment',async()=>{
 mocks.pending.mockReturnValue([{request:{requestId:'surge',activationId:'activation'}}]);const p=setup();render(<SharpenedRollPanel characterId="hero" persistence={p as unknown as PsionicEnhancementPersistence}/>);
 expect((await screen.findByRole('button',{name:'Confirm saved roll'}) as HTMLButtonElement).disabled).toBe(true);expect(p.finalizeSharpenedRoll).not.toHaveBeenCalled();
});
it('does not finalize after the sheet changes while confirmation is open',async()=>{
 let finish!:(v:boolean)=>void;mocks.confirm.mockImplementation(()=>new Promise(r=>{finish=r;}));const p=setup();
 const view=render(<SharpenedRollPanel characterId="hero" persistence={p as unknown as PsionicEnhancementPersistence}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Confirm saved roll'}));view.rerender(<SharpenedRollPanel characterId="other" persistence={p as unknown as PsionicEnhancementPersistence}/>);
 await act(async()=>finish(true));expect(p.finalizeSharpenedRoll).not.toHaveBeenCalled();
});
it('rechecks frozen state after a delayed confirmation',async()=>{
 let finish!:(v:boolean)=>void;mocks.confirm.mockImplementation(()=>new Promise(r=>{finish=r;}));const p=setup();
 const view=render(<SharpenedRollPanel characterId="hero" persistence={p as unknown as PsionicEnhancementPersistence}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Confirm saved roll'}));view.rerender(<SharpenedRollPanel characterId="hero" persistence={p as unknown as PsionicEnhancementPersistence} frozen/>);
 await act(async()=>finish(true));expect(p.finalizeSharpenedRoll).not.toHaveBeenCalled();
});
it('shows read failure instead of keeping an unverified record',async()=>{
 const p=setup();p.getSharpenedRolls.mockRejectedValue(new Error('Unavailable'));
 render(<SharpenedRollPanel characterId="hero" persistence={p as unknown as PsionicEnhancementPersistence}/>);expect(await screen.findByRole('alert')).toHaveProperty('textContent','Unavailable');expect(screen.queryByRole('button',{name:'Confirm saved roll'})).toBeNull();
});

it('shows latched expiration separately from the saved number',async()=>{
 const p=setup();p.getSharpenedRolls.mockResolvedValue([{...row,endedByIncapacitation:true,finalized:true}]);render(<SharpenedRollPanel characterId="hero" persistence={p as unknown as PsionicEnhancementPersistence}/>);
 expect(await screen.findByText(/Effect ended on incapacitation/)).toBeTruthy();expect(screen.getByText('Recorded number: 4')).toBeTruthy();
});
