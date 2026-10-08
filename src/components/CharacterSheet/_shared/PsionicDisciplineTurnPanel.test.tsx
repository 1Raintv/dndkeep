// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import type {DisciplineTurn,DisciplineReceipt,DisciplineUse} from '../../../lib/api/psionicDisciplines';
import {rememberPsionicPayment} from '../../../lib/psionicPaymentRecovery';
import PsionicDisciplineTurnPanel from './PsionicDisciplineTurnPanel';
const use={requestId:'saved',discipline:'inerrant-aim',sourceFeature:'Inerrant Aim',rolls:[3],count:1,turn:{soloTurn:0},conditional:true,energy:null,outcome:null} as DisciplineUse;
const turn={turn:{soloTurn:1},uses:[],pending:[use]} as DisciplineTurn;
function service(){return {getDisciplineTurn:vi.fn(async()=>turn),finishDiscipline:vi.fn(async()=>({...use,outcome:{spent:false,energy:null}} as DisciplineReceipt)),energy:vi.fn(),getTurn:vi.fn(),surge:vi.fn(),spend:vi.fn()};}
const ui=(persistence:PsionicEnhancementPersistence,id='hero',frozen=false)=><PsionicDisciplineTurnPanel characterId={id} persistence={persistence} frozen={frozen}/>;
afterEach(cleanup);beforeEach(()=>localStorage.clear());
it('shows an earlier-turn pending roll and confirms keeping its die without rerolling',async()=>{
 const persistence=service();render(ui(persistence));await screen.findByText('Inerrant Aim · outcome pending');
 expect(screen.getByText(/Original base roll: 3/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'No change · keep die'}));await screen.findByText(/Energy Die kept/);
 expect(persistence.finishDiscipline).toHaveBeenCalledWith({requestId:'saved',discipline:'inerrant-aim',sourceFeature:'Inerrant Aim',rolls:[3],count:1,turn:{soloTurn:0},changedOutcome:false});
 expect(persistence.energy).not.toHaveBeenCalled();
});
it('blocks an opposite decision while the original outcome is awaiting confirmation',async()=>{
 rememberPsionicPayment('hero',{kind:'discipline-finish',request:{...use,changedOutcome:true}});
 const persistence=service();render(ui(persistence));await screen.findByText(/Confirm the saved attempt/);
 expect((screen.getByRole('button',{name:'No change · keep die'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Changed outcome · spend 1'}) as HTMLButtonElement).disabled).toBe(true);
});
it('disables outcome changes on frozen sheets',async()=>{
 render(ui(service(),'hero',true));await screen.findByText('Inerrant Aim · outcome pending');
 expect((screen.getByRole('button',{name:'No change · keep die'}) as HTMLButtonElement).disabled).toBe(true);
});
it('shows read errors and retries without inventing an empty turn',async()=>{
 const persistence=service();persistence.getDisciplineTurn.mockRejectedValueOnce(new Error('Offline'));
 render(ui(persistence));await screen.findByRole('alert');expect(screen.queryByText(/Recorded this turn/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Refresh record'}));await screen.findByText('Inerrant Aim · outcome pending');
});
it('does not let an older read replace a refreshed result',async()=>{
 const persistence=service();let resolve!:(v:DisciplineTurn)=>void;
 persistence.getDisciplineTurn.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 render(ui(persistence));await act(async()=>window.dispatchEvent(new Event('focus')));
 await screen.findByText('Inerrant Aim · outcome pending');await act(async()=>resolve({...turn,pending:[]}));
 expect(screen.getByText('Inerrant Aim · outcome pending')).toBeTruthy();
});
it('does not show a different characters late outcome',async()=>{
 const persistence=service();let resolve!:(v:DisciplineReceipt)=>void;persistence.finishDiscipline.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const view=render(ui(persistence));await screen.findByText('Inerrant Aim · outcome pending');fireEvent.click(screen.getByRole('button',{name:'No change · keep die'}));
 persistence.getDisciplineTurn.mockResolvedValue({...turn,pending:[]});view.rerender(ui(persistence,'other'));
 await act(async()=>resolve({...use,outcome:{spent:false,energy:null}} as DisciplineReceipt));
 await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
});
