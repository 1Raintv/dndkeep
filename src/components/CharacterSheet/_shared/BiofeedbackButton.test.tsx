// @vitest-environment happy-dom
vi.mock('../../../lib/supabase',()=>({supabase:{}}));
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({roll:2,log:vi.fn().mockResolvedValue(undefined),toast:vi.fn()}));
vi.mock('../../../rules/dice',()=>({rollDie:()=>mocks.roll}));
vi.mock('../../../lib/gameUtils',()=>({computeStats:(c:{intelligence:number})=>({modifiers:{intelligence:Math.floor((c.intelligence-10)/2)}})}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
import RealBiofeedbackButton from './BiofeedbackButton';
import {withTestPsionicPersistence} from './psionicPersistence.testSupport';
const BiofeedbackButton=withTestPsionicPersistence(RealBiofeedbackButton);
import {ModalProvider} from '../../shared/Modal';
import type {Character} from '../../../types';
const character={id:'psion',name:'Psion',class_name:'Psion',level:5,intelligence:18,temp_hp:0,class_resources:{'psion-disciplines':['Biofeedback'],'psionic-energy-dice':6,other:9}} as unknown as Character;
const ui=(c:Character,update:ReturnType<typeof vi.fn>)=><ModalProvider><BiofeedbackButton character={c} onUpdate={update}/></ModalProvider>;
afterEach(cleanup);beforeEach(()=>{vi.clearAllMocks();mocks.roll=2;mocks.log.mockResolvedValue(undefined);});
async function choose(count:string){fireEvent.click(screen.getByRole('button',{name:'Gain temp HP'}));fireEvent.change(screen.getByRole('textbox'),{target:{value:count}});fireEvent.click(screen.getByRole('button',{name:'Spend and roll'}));}
it('spends the chosen dice once, adds Intelligence once, and preserves other resources',async()=>{
 const update=vi.fn();render(ui(character,update));await choose('3');
 await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
 expect(update).toHaveBeenNthCalledWith(1,{class_resources:{...character.class_resources,'psionic-energy-dice':3}});
 expect(update).toHaveBeenNthCalledWith(2,{temp_hp:10});
 expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({actionName:'Biofeedback',individualResults:[2,2,2],total:10}));
});
it('keeps higher existing temporary HP',async()=>{
 const update=vi.fn();render(ui({...character,temp_hp:20},update));await choose('2');
 await waitFor(()=>expect(update).toHaveBeenLastCalledWith({temp_hp:20}));
});
it.each(['0','5','1.5','no'])('does not roll or spend for invalid count %s',async count=>{
 const update=vi.fn();render(ui(character,update));await choose(count);
 await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());expect(update).not.toHaveBeenCalled();expect(mocks.log).not.toHaveBeenCalled();
});
it('cancellation costs nothing',async()=>{
 const update=vi.fn();render(ui(character,update));fireEvent.click(screen.getByRole('button',{name:'Gain temp HP'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Gain temp HP'}) as HTMLButtonElement).disabled).toBe(false));expect(update).not.toHaveBeenCalled();
});
it('rechecks resources after the count prompt',async()=>{
 const update=vi.fn();const view=render(ui(character,update));fireEvent.click(screen.getByRole('button',{name:'Gain temp HP'}));
 view.rerender(ui({...character,class_resources:{...character.class_resources,'psionic-energy-dice':0}},update));
 fireEvent.click(screen.getByRole('button',{name:'Spend and roll'}));await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());expect(update).not.toHaveBeenCalled();
});
it('Surge upgrades all low rolls for one Hit Point Die, even after the last Energy Dice are paid',async()=>{
 const update=vi.fn();render(ui({...character,level:7,hit_dice_spent:0,class_resources:{...character.class_resources,'psionic-energy-dice':2}},update));await choose('2');
 await screen.findByRole('dialog',{name:'Psionic Surge'});expect(update).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(update).toHaveBeenCalledTimes(3));
 expect(update).toHaveBeenNthCalledWith(2,{hit_dice_spent:1});expect(update).toHaveBeenNthCalledWith(3,{temp_hp:12});
 expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({actionName:'Biofeedback',individualResults:[2,2],total:12}));
 expect(mocks.log).toHaveBeenCalledTimes(1); // Surge history belongs to its server transaction.
});

it('still grants the paid original result if Hit Point Dice run out before Surge confirmation',async()=>{
 const update=vi.fn();const c={...character,level:7,hit_dice_spent:0};const view=render(ui(c,update));await choose('2');
 await screen.findByRole('dialog',{name:'Psionic Surge'});
 view.rerender(ui({...c,hit_dice_spent:7,class_resources:{...c.class_resources,'psionic-energy-dice':4}},update));
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(update).toHaveBeenLastCalledWith({temp_hp:8}));
 expect(update).toHaveBeenCalledTimes(2);
});

it('releases the ability after applying HP even when history delivery stalls',async()=>{
 mocks.log.mockReturnValue(new Promise(()=>{}));const update=vi.fn();render(ui(character,update));await choose('2');
 await waitFor(()=>expect(update).toHaveBeenLastCalledWith({temp_hp:8}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Gain temp HP'}) as HTMLButtonElement).disabled).toBe(false));
});
it('records paid dice for manual recovery if the sheet closes during Surge',async()=>{
 const update=vi.fn();const view=render(ui({...character,level:7,hit_dice_spent:0},update));await choose('2');await screen.findByRole('dialog',{name:'Psionic Surge'});view.unmount();
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({actionName:'Biofeedback',total:8,notes:expect.stringContaining('Apply manually')})));
 expect(update).toHaveBeenCalledTimes(1);
});

it.each(['rejection','error result'])('warns without undoing paid temporary HP after a history %s',async mode=>{
 if(mode==='rejection')mocks.log.mockRejectedValue(new Error('offline'));else mocks.log.mockResolvedValue({error:{message:'offline'}});
 const update=vi.fn();render(ui(character,update));await choose('2');
 await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('log could not be saved'),'warn'));
 expect(update).toHaveBeenCalledTimes(2);expect(update).toHaveBeenLastCalledWith({temp_hp:8});
 expect((screen.getByRole('button',{name:'Gain temp HP'}) as HTMLButtonElement).disabled).toBe(false);
});

it('adds two free capstone dice and Surges all five rolls, adding Intelligence only once',async()=>{
 const update=vi.fn();render(ui({...character,level:20,hit_dice_spent:0,class_resources:{...character.class_resources,'psionic-energy-dice':12}},update));await choose('3');
 await screen.findByRole('dialog',{name:'Enkindled Life Force'});fireEvent.change(screen.getByRole('textbox'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Continue'}));
 await screen.findByRole('dialog',{name:'Psionic Surge'});fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(update).toHaveBeenLastCalledWith({temp_hp:24}));expect(update.mock.calls.slice(0,3)).toEqual([[{class_resources:{...character.class_resources,'psionic-energy-dice':9}}],[{hit_dice_spent:2}],[{hit_dice_spent:3}]]);
 expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({actionName:'Biofeedback',diceExpression:'5d12',individualResults:[2,2,2,2,2],total:24}));
});
