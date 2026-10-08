import {cloneElement} from 'react';
// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import ClassAbilityResolveModal from './ClassAbilityResolveModal';
import type {Character} from '../../types';
vi.mock('../../lib/supabase',()=>({supabase:{from:(table:string)=>{
 const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:table==='combat_encounters'?'enc':'caster'}}),order:async()=>({data:[{id:'one',name:'Goblin one',participant_type:mocks.character?'character':'creature',entity_id:'target-hero',current_hp:5},{id:'two',name:'Goblin two',participant_type:'creature',current_hp:5}]})};return query;
}}}));
vi.mock('../../lib/automations',()=>({resolveAutomation:()=> 'manual'}));
const mocks=vi.hoisted(()=>({roll:vi.fn(),bonus:vi.fn(),guards:vi.fn(),character:false}));
vi.mock('../../rules/dice',async original=>({...await original<typeof import('../../rules/dice')>(),rollDie:mocks.roll}));
vi.mock('../../lib/api/psionicDisciplines',()=>({getPsionicGuardsSaveAdvantage:mocks.guards}));
vi.mock('../../lib/pendingAttack',()=>({getTargetSaveBonus:mocks.bonus}));
beforeEach(()=>{mocks.character=false;mocks.guards.mockReset().mockResolvedValue(false);mocks.roll.mockReset().mockReturnValue(10);mocks.bonus.mockReset().mockResolvedValue({bonus:0,breakdown:'',confidence:'high'});});
vi.mock('../shared/ActionLog',()=>({logAction:vi.fn()}));
afterEach(cleanup);
it('Propel requires one chosen target and submits only that target save',async()=>{
 const onConfirmed=vi.fn();render(<ClassAbilityResolveModal open onClose={vi.fn()} character={{id:'hero'} as Character} campaign={null} campaignId="campaign" saveDC={13} onConfirmed={onConfirmed} ability={{name:'Telekinetic Propel',actionType:'bonus',minLevel:1,description:'',save:{ability:'STR',dc:'spell',targetMode:'any'},psionicUse:{kind:'propel',mode:'powered',roll:4}}}/>);
 const picker=await screen.findByRole('combobox',{name:'Propel target'});
 expect((screen.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(picker,{target:{value:'one'}});
 await waitFor(()=>expect(screen.getAllByRole('button',{name:/Mark Fail/})).toHaveLength(1));
 fireEvent.click(screen.getByRole('button',{name:/Mark Fail/}));
 fireEvent.change(picker,{target:{value:'two'}});
 expect((screen.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:/Mark Pass/}));fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
 expect(onConfirmed).toHaveBeenCalledWith([expect.objectContaining({participantId:'two',outcome:'passed'})]);
});


it.each([
 {die:1,bonus:12,dc:13,house:false,outcome:'passed',cost:0},
 {die:20,bonus:0,dc:21,house:false,outcome:'failed',cost:1},
 {die:1,bonus:12,dc:13,house:true,outcome:'failed',cost:1},
 {die:20,bonus:0,dc:21,house:true,outcome:'passed',cost:0},
])('Propel save $die + $bonus vs $dc (house=$house) spends $cost dice',async({die,bonus,dc,house,outcome,cost})=>{
 mocks.roll.mockReturnValue(die);
 mocks.bonus.mockResolvedValue({bonus,breakdown:'test',confidence:'high',naturalExtremes:house});
 const onConfirmed=vi.fn();
 render(<ClassAbilityResolveModal open onClose={vi.fn()} character={{id:'hero'} as Character} campaign={null} campaignId="campaign" saveDC={dc} onConfirmed={onConfirmed} ability={{name:'Telekinetic Propel',actionType:'bonus',minLevel:1,description:'',save:{ability:'STR',dc:'spell',targetMode:'any'},psionicUse:{kind:'propel',mode:'powered',roll:4}}}/>);
 fireEvent.change(await screen.findByRole('combobox',{name:'Propel target'}),{target:{value:'one'}});
 await waitFor(()=>expect((screen.getByRole('button',{name:'Roll Save'}) as HTMLButtonElement).disabled).toBe(false));
 // Editing the bonus must not erase the house-rule preference.
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:String(bonus+1)}});
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:String(bonus)}});
 fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
 fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
 expect(onConfirmed).toHaveBeenCalledWith([expect.objectContaining({participantId:'one',outcome,total:die+bonus})]);
 const {resolvePsionicPower}=await import('../../rules/psionicPowers');
 const settled=resolvePsionicPower({class_name:'Psion',level:5,class_resources:{'psionic-energy-dice':4}},{kind:'propel',mode:'powered',roll:4},outcome==='failed');
 expect(settled?.cost).toBe(cost);
 expect(settled?.patch.class_resources['psionic-energy-dice']).toBe(4-cost);
});
it('does not roll an unloaded target bonus; manual outcomes remain available',async()=>{
 mocks.bonus.mockReturnValue(new Promise(()=>{}));
 render(<ClassAbilityResolveModal open onClose={vi.fn()} character={{id:'hero'} as Character} campaign={null} campaignId="campaign" saveDC={13} onConfirmed={vi.fn()} ability={{name:'Telekinetic Propel',actionType:'bonus',minLevel:1,description:'',save:{ability:'STR',dc:'spell',targetMode:'any'},psionicUse:{kind:'propel',mode:'powered',roll:4}}}/>);
 fireEvent.change(await screen.findByRole('combobox',{name:'Propel target'}),{target:{value:'one'}});
 expect((screen.getByRole('button',{name:'Roll Save'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
 expect(mocks.roll).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Mark Fail'}));
 expect((screen.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(false);
});

const guardedView=(onConfirmed=vi.fn(),open=true)=><ClassAbilityResolveModal open={open} onClose={vi.fn()} character={{id:'hero'} as Character} campaign={null} campaignId="campaign" saveDC={18} onConfirmed={onConfirmed} ability={{name:'Mind trial',actionType:'action',minLevel:1,description:'',save:{ability:'INT',dc:'spell',targetMode:'any'},psionicUse:{kind:'propel',mode:'powered',roll:4}}}/>;
async function chooseGuardedTarget(){fireEvent.change(await screen.findByRole('combobox',{name:'Propel target'}),{target:{value:'one'}});await waitFor(()=>expect((screen.getByRole('button',{name:'Roll Save'}) as HTMLButtonElement).disabled).toBe(false));}
it('rolls both Guards dice for another character and submits the kept result',async()=>{
 mocks.character=true;mocks.guards.mockResolvedValue(true);mocks.bonus.mockResolvedValue({bonus:7});mocks.roll.mockReturnValueOnce(3).mockReturnValueOnce(17);
 const confirmed=vi.fn();render(guardedView(confirmed));await chooseGuardedTarget();fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
 await screen.findByText('Psionic Guards: 3 or 17 — keep highest');fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
 expect(mocks.guards).toHaveBeenCalledWith('target-hero','INT');expect(confirmed).toHaveBeenCalledWith([expect.objectContaining({outcome:'passed',d20:17,total:24,rolls:[3,17],advantage:true})]);
});
it('keeps manual controls and confirmation blocked during a lookup, and permits retry on failure',async()=>{
 mocks.character=true;let reject!:(e:Error)=>void;mocks.guards.mockImplementationOnce(()=>new Promise((_done,no)=>{reject=no;}));
 render(guardedView());await chooseGuardedTarget();fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
 expect(mocks.guards).toHaveBeenCalledTimes(1);for(const name of ['Mark Pass','Mark Fail','Confirm'])expect((screen.getByRole('button',{name}) as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>reject(new Error('Protection unavailable')));expect(screen.getByRole('alert').textContent).toBe('Protection unavailable');expect(mocks.roll).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));await waitFor(()=>expect(mocks.roll).toHaveBeenCalledTimes(1));
});
it('ignores late protection after closing and reopening the same dialog',async()=>{
 mocks.character=true;let resolve!:(v:boolean)=>void;mocks.guards.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const confirmed=vi.fn(),view=render(guardedView(confirmed));await chooseGuardedTarget();fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
 view.rerender(guardedView(confirmed,false));view.rerender(guardedView(confirmed,true));await act(async()=>resolve(true));expect(mocks.roll).not.toHaveBeenCalled();expect(confirmed).not.toHaveBeenCalled();
});
it('manual pass preserves the actual Guards faces in the submitted outcome',async()=>{
 mocks.character=true;mocks.guards.mockResolvedValue(true);mocks.roll.mockReturnValue(3);const confirmed=vi.fn();render(guardedView(confirmed));await chooseGuardedTarget();
 fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));await screen.findByText('Psionic Guards: 3 or 3 — keep highest');fireEvent.click(screen.getByRole('button',{name:'Mark Pass'}));fireEvent.click(screen.getByRole('button',{name:'Confirm'}));expect(confirmed).toHaveBeenCalledWith([expect.objectContaining({outcome:'passed',rolls:[3,3],advantage:true})]);
});

it('discards a response after the requested save DC changes',async()=>{
 mocks.character=true;let resolve!:(v:boolean)=>void;mocks.guards.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const view=render(guardedView());await chooseGuardedTarget();fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));view.rerender(cloneElement(guardedView(),{saveDC:19}));
 await act(async()=>resolve(true));expect(mocks.roll).not.toHaveBeenCalled();
});
it('discards a response after unmounting the dialog',async()=>{
 mocks.character=true;let resolve!:(v:boolean)=>void;mocks.guards.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const view=render(guardedView());await chooseGuardedTarget();fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));view.unmount();await act(async()=>resolve(true));expect(mocks.roll).not.toHaveBeenCalled();
});

it('replaces old resolved outcomes when the requested save changes',async()=>{
 const view=render(guardedView());await chooseGuardedTarget();fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
 expect((screen.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(false);
 view.rerender(cloneElement(guardedView(),{saveDC:19}));await chooseGuardedTarget();
 expect((screen.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(true);
});
