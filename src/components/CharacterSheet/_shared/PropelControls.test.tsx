// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {Character} from '../../../types';
const m=vi.hoisted(()=>({begin:vi.fn(),finish:vi.fn(),context:vi.fn(),list:vi.fn(),resume:vi.fn(),roll:vi.fn(),combat:vi.fn()}));
vi.mock('../../../lib/supabase',()=>({supabase:{}}));
vi.mock('./PropelMovementRecoveryList',()=>({default:()=>null}));
vi.mock('./PropelTechniqueRecoveryList',()=>({default:()=>null}));
vi.mock('./PropelTechniqueControls',()=>({default:()=>null}));
vi.mock('../../../lib/api/psionicPropel',async()=>({...await vi.importActual('../../../lib/api/psionicPropel'),beginPropel:m.begin,finishPropel:m.finish,getPropelContext:m.context,listPropel:m.list}));
vi.mock('../../../lib/api/psionicDamage',()=>({loadPsionicDamageContext:m.combat}));
vi.mock('../../../lib/gameUtils',()=>({classSaveDC:(c:Character)=>c.intelligence}));
vi.mock('../../../rules/dice',()=>({rollDie:m.roll}));
vi.mock('./continuePropel',()=>({continuePropel:m.resume}));
import PropelControls from './PropelControls';
import {pendingPropel,rememberPropel} from '../../../lib/propelRecovery';
const character={id:'00000000-0000-4000-8000-000000000001',name:'Hero',class_name:'Psion',level:5,intelligence:16,class_resources:{'psionic-energy-dice':2}} as unknown as Character;
const row={turn_context:{soloTurn:0},request_id:'00000000-0000-4000-8000-000000000002',target:{name:'Goblin'},caster_snapshot:{...character,intelligence:15},mode:'powered',movement:'push',base_roll:3,roll_result:{total:3},outcome:null};
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();m.context.mockResolvedValue({bonusAvailable:true,turnId:'turn',encounterId:null});m.list.mockResolvedValue({items:[],nextCursor:null});m.roll.mockReturnValue(3);m.begin.mockResolvedValue(row);m.resume.mockResolvedValue(row);m.finish.mockResolvedValue({...row,outcome:'passed',result:{energyCost:0}});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function open(){fireEvent.click(screen.getByRole('button',{name:'Use / resume'}));await waitFor(()=>expect((screen.getByLabelText('Target') as HTMLInputElement).disabled).toBe(false));}
async function choose(){await open();fireEvent.change(screen.getByLabelText('Target'),{target:{value:'Goblin'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.change(screen.getByLabelText('Movement'),{target:{value:'powered'}});}
it('does not roll or declare before a legal target is confirmed',async()=>{render(<PropelControls character={character}/>);await open();expect((screen.getByRole('button',{name:'Declare Bonus Action'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Close for later'}));expect(m.roll).not.toHaveBeenCalled();expect(m.begin).not.toHaveBeenCalled();});
it('declares once, freezes target and uses the saved caster DC',async()=>{render(<PropelControls character={character}/>);await choose();const button=screen.getByRole('button',{name:'Declare Bonus Action'});fireEvent.click(button);fireEvent.click(button);await screen.findByText(/Strength save DC 15/);expect(m.begin).toHaveBeenCalledTimes(1);expect(m.begin.mock.calls[0][1]).toMatchObject({mode:'powered',roll:3,target:{name:'Goblin',legalTargetConfirmed:true}});expect(m.roll).toHaveBeenCalledTimes(1);expect(pendingPropel(character.id)).toEqual([]);fireEvent.click(screen.getByRole('button',{name:'Save passed'}));await screen.findByRole('status');expect(m.finish).toHaveBeenCalledWith(character.id,row.request_id,'passed',null);});
it('keeps an uncertain declaration and retries the exact saved roll',async()=>{m.begin.mockRejectedValueOnce(new Error('Lost reply'));render(<PropelControls character={character}/>);await choose();fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));await screen.findByRole('button',{name:'Confirm saved use'});expect(pendingPropel(character.id)).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Confirm saved use'}));await screen.findByText(/Strength save DC 15/);expect(m.begin.mock.calls[0]).toEqual(m.begin.mock.calls[1]);expect(m.roll).toHaveBeenCalledTimes(1);});
it('keeps an uncertain save outcome instead of permitting a different outcome',async()=>{m.finish.mockRejectedValueOnce(new Error('Lost reply'));render(<PropelControls character={character}/>);await choose();fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));await screen.findByRole('button',{name:'Save failed'});fireEvent.click(screen.getByRole('button',{name:'Save failed'}));await screen.findByRole('button',{name:'Confirm saved failed result'});expect((screen.getByRole('button',{name:'Save passed'}) as HTMLButtonElement).disabled).toBe(true);expect(pendingPropel(character.id)).toMatchObject([{kind:'finish',request:{outcome:'failed'}}]);});
it('rejects a turn change before any roll or declaration',async()=>{render(<PropelControls character={character}/>);await choose();m.context.mockResolvedValue({bonusAvailable:true,turnId:'later',encounterId:null});fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));await screen.findByRole('alert');expect(m.begin).not.toHaveBeenCalled();expect(m.roll).not.toHaveBeenCalled();});

it('rechecks available Energy Dice after the turn read, before rolling',async()=>{
 const view=render(<PropelControls character={character}/>);await choose();
 let finishRead!:(value:unknown)=>void;
 m.context.mockImplementationOnce(()=>new Promise(resolve=>{finishRead=resolve;}));
 fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));
 view.rerender(<PropelControls character={{...character,class_resources:{'psionic-energy-dice':0}}}/>);
 finishRead({bonusAvailable:true,turnId:'turn',encounterId:null});
 await screen.findByRole('alert');expect(m.roll).not.toHaveBeenCalled();expect(m.begin).not.toHaveBeenCalled();
});
it('does not start a second roll when another tab saves an uncertain use during the turn read',async()=>{
 render(<PropelControls character={character}/>);await choose();
 m.context.mockImplementationOnce(async()=>{
  rememberPropel(character.id,{kind:'begin',request:{requestId:row.request_id,turnId:'turn',mode:'powered',movement:'push',roll:3,target:{name:'Goblin',legalTargetConfirmed:true}}});
  return {bonusAvailable:true,turnId:'turn',encounterId:null};
 });
 fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));
 await screen.findByRole('alert');expect(m.roll).not.toHaveBeenCalled();expect(m.begin).not.toHaveBeenCalled();
 expect(pendingPropel(character.id)).toHaveLength(1);
});
it.each(['encounterId','participantId','actorId','ownerTurnId'])('rejects a changed %s even if the turn identifier is unchanged',async field=>{
 render(<PropelControls character={character}/>);await choose();
 m.context.mockResolvedValue({bonusAvailable:true,turnId:'turn',encounterId:null,[field]:'changed'});
 fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));
 await screen.findByRole('alert');expect(m.roll).not.toHaveBeenCalled();expect(m.begin).not.toHaveBeenCalled();
});

for(const movement of ['push','warp'] as const){
 it.each([null,'passed','cancelled','failed'] as const)(`${movement}: only a settled failure instructs movement (%s)`,async outcome=>{
  const result={...row,movement,outcome,result:outcome?{feet:movement==='warp'?30:25,energyCost:outcome==='failed'?1:0}:null};
  m.begin.mockResolvedValue(result);m.resume.mockResolvedValue(result);
  render(<PropelControls character={character}/>);await choose();
  fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));
  await screen.findByText(/Strength save DC 15/);
  if(outcome==='failed')expect(screen.getByTestId('propel-movement').textContent).toContain(movement==='warp'?'within 30 ft of you, horizontal to you':'25 ft straight toward or away from you');
  else{
   expect(screen.queryByTestId('propel-movement')).toBeNull();
   expect(screen.getByText(outcome===null?'Resolve and confirm the saving throw before moving the target.':outcome==='passed'?'Save succeeded. Do not move the target.':'Use cancelled. Do not move the target.')).toBeTruthy();
  }
 });
}
it('explains the conditional cost before rolling and the fixed Warp distance',async()=>{
 render(<PropelControls character={{...character,subclass:'Psi Warper'}} warp/>);await choose();
 expect(screen.getByText(/Roll one Energy Die now; spend it only if the target fails/).textContent).toContain('rolling does not extend it');
 expect(m.roll).not.toHaveBeenCalled();
});

it('blocks declaration without rolling if browser storage cannot save the interruption marker',async()=>{
 render(<PropelControls character={character}/>);await choose();
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage unavailable');});
 fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));
 await screen.findByRole('alert');expect(m.roll).not.toHaveBeenCalled();expect(m.begin).not.toHaveBeenCalled();
});
it('keeps a damaged saved declaration visible as an error and never rolls again',async()=>{
 localStorage.setItem(`dndkeep:propel:${character.id}:bad:begin`,'{broken');
 render(<PropelControls character={character}/>);fireEvent.click(screen.getByRole('button',{name:'Use / resume'}));
 expect((await screen.findByRole('alert')).textContent).toContain('do not roll or declare again');
 expect((screen.getByRole('button',{name:'Declare Bonus Action'}) as HTMLButtonElement).disabled).toBe(true);
 expect(m.roll).not.toHaveBeenCalled();expect(m.begin).not.toHaveBeenCalled();
});

it.each([false,true])('declares the no-die option with an empty pool (Warp=%s)',async warp=>{
 const hero={...character,subclass:'Psi Warper',class_resources:{'psionic-energy-dice':0}};
 render(<PropelControls character={hero} warp={warp}/>);await open();
 fireEvent.change(screen.getByLabelText('Target'),{target:{value:'Goblin'}});
 fireEvent.click(screen.getByRole('checkbox'));
 expect(screen.getByRole('heading',{name:`${warp?'Warp Propel':'Telekinetic Propel'} · Bonus Action`})).toBeTruthy();
 expect((screen.getByRole('option',{name:'Roll Energy Die (d8)'}) as HTMLOptionElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Declare Bonus Action'}));
 await waitFor(()=>expect(m.begin).toHaveBeenCalledTimes(1));
 expect(m.begin.mock.calls[0][1]).toMatchObject({mode:'free',movement:'push',deferred:true,roll:0,target:{name:'Goblin',legalTargetConfirmed:true}});
 expect(m.roll).not.toHaveBeenCalled();
});
