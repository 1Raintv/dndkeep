// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({advance:vi.fn(),turn:vi.fn(),solo:vi.fn(),toast:vi.fn(),encounter:null as null|{id:string;status:string},actor:null as null|{participant_type:string;entity_id:string}}));
vi.mock('../../context/CombatContext',()=>({useCombatSelector:(select:(s:unknown)=>unknown)=>select({encounter:mocks.encounter}),useCombatCurrentActor:()=>mocks.actor}));
vi.mock('../../lib/api/psionicTurns',()=>({getEnkindledTurn:mocks.turn,advancePsionicSoloTurn:mocks.solo,PsionicRequestError:class extends Error{definitelyNotPaid=true;}}));
vi.mock('../../lib/combatEncounter',()=>({advanceTurn:mocks.advance}));
vi.mock('../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
import ActionEconomy from './ActionEconomy';
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mocks.encounter={id:'fight',status:'active'};mocks.actor={participant_type:'character',entity_id:'psion'};mocks.advance.mockResolvedValue({ok:true});});
function mount(id='psion') {const reset=vi.fn();const view=render(<ActionEconomy speedFeet={30} characterId={id} actionUsedExternal onNewTurn={reset}/>);return {reset,...view};}
const end=()=>screen.getByRole('button',{name:/End Turn/});
it('keeps spent actions until combat advancement is confirmed, and ignores repeated clicks',async()=>{
 let finish!:(v:{ok:true})=>void;mocks.advance.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const {reset}=mount();fireEvent.click(end());fireEvent.click(screen.getByRole('button',{name:/Ending/}));
 expect(reset).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Action Used'})).toBeTruthy();expect(mocks.advance).toHaveBeenCalledTimes(1);
 await act(async()=>finish({ok:true}));expect(reset).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Action Available'})).toBeTruthy();
});
it.each(['returned','thrown'])('preserves trackers and reports a %s failure',async mode=>{
 if(mode==='returned')mocks.advance.mockResolvedValue({ok:false,reason:'Cannot advance combat'});else mocks.advance.mockRejectedValue(new Error('Network unavailable'));
 const {reset}=mount();fireEvent.click(end());await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());
 expect(reset).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Action Used'})).toBeTruthy();expect((end() as HTMLButtonElement).disabled).toBe(false);
});
it('does not reset another character after the sheet changes while advancement is pending',async()=>{
 let finish!:(v:{ok:true})=>void;mocks.advance.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const {reset,rerender}=mount();fireEvent.click(end());
 rerender(<ActionEconomy speedFeet={30} characterId="other" actionUsedExternal onNewTurn={reset}/>);
 await act(async()=>finish({ok:true}));expect(reset).not.toHaveBeenCalled();
});
it('does not reset a closed sheet after advancement completes',async()=>{
 let finish!:(v:{ok:true})=>void;mocks.advance.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const {reset,unmount}=mount();fireEvent.click(end());unmount();
 await act(async()=>finish({ok:true}));expect(reset).not.toHaveBeenCalled();
});
it('keeps the independent tabletop turn reset available outside combat',()=>{
 mocks.encounter=null;mocks.actor=null;const {reset}=mount();fireEvent.click(end());expect(reset).toHaveBeenCalledTimes(1);expect(mocks.advance).not.toHaveBeenCalled();
});

it('advances the saved tabletop turn before resetting an independent Psion',async()=>{
 mocks.encounter=null;mocks.actor=null;mocks.turn.mockResolvedValue({turn:{soloTurn:3},used:null});mocks.solo.mockResolvedValue(4);const reset=vi.fn();
 render(<ActionEconomy characterId="psion" speedFeet={30} trackPsionicTurns onNewTurn={reset}/>);fireEvent.click(end());
 await waitFor(()=>expect(reset).toHaveBeenCalledTimes(1));expect(mocks.solo).toHaveBeenCalledWith('psion',expect.any(String),3);expect(mocks.advance).not.toHaveBeenCalled();
});
it('retries an uncertain tabletop advance with the same request, without resetting early',async()=>{
 mocks.encounter=null;mocks.actor=null;mocks.turn.mockResolvedValue({turn:{soloTurn:0},used:null});mocks.solo.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce(1);const reset=vi.fn();
 render(<ActionEconomy characterId="psion" speedFeet={30} trackPsionicTurns actionUsedExternal onNewTurn={reset}/>);fireEvent.click(end());
 await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());expect(reset).not.toHaveBeenCalled();fireEvent.click(end());await waitFor(()=>expect(reset).toHaveBeenCalledTimes(1));
 expect(mocks.solo.mock.calls[0]).toEqual(mocks.solo.mock.calls[1]);
});
it('does not reset the shared Psion turn while another combatant is acting',async()=>{
 mocks.actor={participant_type:'creature',entity_id:'goblin'};mocks.turn.mockResolvedValue({turn:{encounterId:'fight',round:1,index:1,turnId:'turn'},used:null});const reset=vi.fn();
 render(<ActionEconomy characterId="psion" speedFeet={30} trackPsionicTurns onNewTurn={reset}/>);fireEvent.click(end());await waitFor(()=>expect(reset).toHaveBeenCalledTimes(1));expect(mocks.solo).not.toHaveBeenCalled();expect(mocks.advance).not.toHaveBeenCalled();
});
