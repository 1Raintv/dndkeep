// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Character} from '../../../types';
import type {EnergyReceipt,PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import PsionicDicePool from './PsionicDicePool';
import {ModalProvider} from '../../shared/Modal';
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:vi.fn()})}));
afterEach(cleanup);
const character={id:'hero',class_name:'Psion',level:5,class_resources:{'psionic-energy-dice':4}} as unknown as Character;
const receipt:EnergyReceipt={requestId:'payment',remaining:3,restorationResource:null,restorationUsed:null,energyRevision:1,rolls:[],replayed:false};
const service=():PsionicEnhancementPersistence=>({energy:vi.fn(),spend:vi.fn(),surge:vi.fn(),getTurn:vi.fn()});
it('blocks repeated pool toggles while a one-die payment is pending',async()=>{
 const persistence=service();let finish!:(r:EnergyReceipt)=>void;vi.mocked(persistence.energy).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 render(<ModalProvider><PsionicDicePool character={character} total={6} used={2} persistence={persistence}/></ModalProvider>);
 const button=screen.getByRole('button',{name:'Psionic Energy Die 1 (available)'});fireEvent.click(button);fireEvent.click(button);
 expect(persistence.energy).toHaveBeenCalledTimes(1);expect(persistence.energy).toHaveBeenCalledWith(expect.objectContaining({operation:'spend',count:1,rolls:[]}));
 expect((button as HTMLButtonElement).disabled).toBe(true);await act(async()=>finish(receipt));await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
});
it('restores exactly one die through an explicit manual recovery request',async()=>{
 const persistence=service();vi.mocked(persistence.energy).mockResolvedValue({...receipt,remaining:5});
 render(<ModalProvider><PsionicDicePool character={character} total={6} used={2} persistence={persistence}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Psionic Energy Die 6 (used)'}));
 await waitFor(()=>expect(persistence.energy).toHaveBeenCalledWith(expect.objectContaining({operation:'recover-die',count:1,rolls:[],sourceFeature:'Manual Energy Die recovery'})));
});
