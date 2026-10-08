// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import type {DisciplineTurn,DisciplineReceipt,DisciplineUse} from '../../../lib/api/psionicDisciplines';
import {rememberPsionicPayment} from '../../../lib/psionicPaymentRecovery';
import PsionicDisciplineTurnPanel from './PsionicDisciplineTurnPanel';
const emptyCombat=():import('../../../lib/stores/combatStore').CombatState=>({encounter:null,participants:[],loading:false,hasLoaded:true,load:async()=>{}});
const combat={state:emptyCombat()};
vi.mock('../../../context/CombatContext',()=>({useCombatSelector:(selector:(s:typeof combat.state)=>unknown)=>selector(combat.state)}));
const use={requestId:'saved',discipline:'inerrant-aim',sourceFeature:'Inerrant Aim',rolls:[3],count:1,turn:{soloTurn:0},conditional:true,energy:null,outcome:null} as DisciplineUse;
const turn={turn:{soloTurn:1},uses:[],pending:[use]} as DisciplineTurn;
function service(){return {getDisciplineTurn:vi.fn(async()=>turn),finishDiscipline:vi.fn(async()=>({...use,outcome:{spent:false,energy:null}} as DisciplineReceipt)),energy:vi.fn(),getTurn:vi.fn(),surge:vi.fn(),spend:vi.fn()};}
const ui=(persistence:PsionicEnhancementPersistence,id='hero',frozen=false)=><PsionicDisciplineTurnPanel characterId={id} persistence={persistence} frozen={frozen}/>;
afterEach(cleanup);beforeEach(()=>{localStorage.clear();combat.state=emptyCombat();});
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

it('refreshes on a remote turn or rewind, but not on unrelated combat changes',async()=>{
 const persistence=service();const view=render(ui(persistence));await screen.findByText('Inerrant Aim · outcome pending');
 const encounter={id:'enc',status:'active',round_number:1,current_turn_index:0,psionic_turn_id:'first'} as NonNullable<typeof combat.state.encounter>;
 combat.state.encounter=encounter;view.rerender(ui(persistence));await waitFor(()=>expect(persistence.getDisciplineTurn).toHaveBeenCalledTimes(2));
 combat.state.encounter={...encounter,name:'Renamed'};view.rerender(ui(persistence));expect(persistence.getDisciplineTurn).toHaveBeenCalledTimes(2);
 // Same index/round, new server identity after a rewind or a coalesced update.
 combat.state.encounter={...encounter,psionic_turn_id:'rewound'};view.rerender(ui(persistence));await waitFor(()=>expect(persistence.getDisciplineTurn).toHaveBeenCalledTimes(3));
 combat.state.encounter=null;view.rerender(ui(persistence));await waitFor(()=>expect(persistence.getDisciplineTurn).toHaveBeenCalledTimes(4));
});
it('refreshes when this character joins or leaves the encounter',async()=>{
 const persistence=service();const view=render(ui(persistence));await screen.findByText('Inerrant Aim · outcome pending');
 const participant={id:'p',participant_type:'character',entity_id:'hero',current_hp:12} as typeof combat.state.participants[number];
 combat.state.participants=[participant];view.rerender(ui(persistence));await waitFor(()=>expect(persistence.getDisciplineTurn).toHaveBeenCalledTimes(2));
 combat.state.participants=[{...participant,current_hp:9}];view.rerender(ui(persistence));expect(persistence.getDisciplineTurn).toHaveBeenCalledTimes(2);
 combat.state.participants=[];view.rerender(ui(persistence));await waitFor(()=>expect(persistence.getDisciplineTurn).toHaveBeenCalledTimes(3));
});
it('keeps an earlier outcome locked while a remote turn changes during confirmation',async()=>{
 const persistence=service();let resolve!:(v:DisciplineReceipt)=>void;
 persistence.finishDiscipline.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const view=render(ui(persistence));await screen.findByText('Inerrant Aim · outcome pending');fireEvent.click(screen.getByRole('button',{name:'No change · keep die'}));
 combat.state.encounter={id:'enc',status:'active',round_number:2,current_turn_index:1,psionic_turn_id:'next'} as NonNullable<typeof combat.state.encounter>;
 view.rerender(ui(persistence));await waitFor(()=>expect(persistence.getDisciplineTurn).toHaveBeenCalledTimes(2));
 expect((screen.getByRole('button',{name:'Changed outcome · spend 1'}) as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>resolve({...use,outcome:{spent:false,energy:null}} as DisciplineReceipt));
 await screen.findByText(/Energy Die kept/);expect(persistence.finishDiscipline).toHaveBeenCalledTimes(1);
});

it('keeps active Guards visible on another turn with no current discipline use, then clears expiry',async()=>{
 const persistence=service(),guards={requestId:'guard',startToken:'start'};
 persistence.getDisciplineTurn.mockResolvedValue({...turn,pending:[],guards});
 render(ui(persistence));await screen.findByRole('status',{name:'Psionic Guards protection'});
 expect(screen.getByText(/Roll Intelligence saves with Advantage/)).toBeTruthy();
 persistence.getDisciplineTurn.mockResolvedValue({...turn,pending:[],guards:null});
 await act(async()=>window.dispatchEvent(new Event('focus')));
 await waitFor(()=>expect(screen.queryByRole('status',{name:'Psionic Guards protection'})).toBeNull());
});
it('does not retain an active-protection claim after its refresh fails',async()=>{
 const persistence=service();persistence.getDisciplineTurn.mockResolvedValue({...turn,pending:[],guards:{requestId:'guard',startToken:'start'}});
 render(ui(persistence));await screen.findByRole('status',{name:'Psionic Guards protection'});
 persistence.getDisciplineTurn.mockRejectedValue(new Error('Unable to confirm protection'));
 await act(async()=>window.dispatchEvent(new Event('focus')));await screen.findByRole('alert');
 expect(screen.queryByRole('status',{name:'Psionic Guards protection'})).toBeNull();
});

it('refreshes protection when another device commits a resource recovery',async()=>{
 const persistence=service();persistence.getDisciplineTurn.mockResolvedValue({...turn,pending:[],guards:{requestId:'guard',startToken:'start'}});
 const result=render(<PsionicDisciplineTurnPanel characterId="hero" persistence={persistence} resourceRevision={1}/>);
 await screen.findByRole('status',{name:'Psionic Guards protection'});
 persistence.getDisciplineTurn.mockResolvedValue({...turn,pending:[],guards:null});
 result.rerender(<PsionicDisciplineTurnPanel characterId="hero" persistence={persistence} resourceRevision={2}/>);
 await waitFor(()=>expect(screen.queryByRole('status',{name:'Psionic Guards protection'})).toBeNull());
});
