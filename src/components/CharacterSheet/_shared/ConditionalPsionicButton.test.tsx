// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../../rules/dice',()=>({rollDie:()=>mocks.roll}));
const mocks=vi.hoisted(()=>({log:vi.fn(),toast:vi.fn(),roll:4}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
import ConditionalPsionicButton from './ConditionalPsionicButton';
import {ModalProvider} from '../../shared/Modal';
import {findDiscipline} from '../../../data/psionDisciplines';
import type {Character} from '../../../types';
afterEach(cleanup);beforeEach(()=>{vi.clearAllMocks();mocks.roll=4;});
const discipline=findDiscipline('inerrant-aim')!;
const character={id:'psion',name:'Psion',class_name:'Psion',level:5,class_resources:{'psion-disciplines':['Inerrant Aim'],'psionic-energy-dice':2,other:9},feature_uses:{other:2}} as unknown as Character;
const ui=(c:Character,onUpdate:ReturnType<typeof vi.fn>)=><ModalProvider><ConditionalPsionicButton character={c} discipline={discipline} onUpdate={onUpdate}/></ModalProvider>;
it('rolls without spending; a confirmed changed hit spends exactly one',async()=>{
 const onUpdate=vi.fn();render(ui(character,onUpdate));fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));
 expect(onUpdate).not.toHaveBeenCalled();expect(screen.getByText(/Rolled 4 on 1d8/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Changed to hit · spend 1'}));
 await waitFor(()=>expect(onUpdate).toHaveBeenCalledTimes(1));
 expect(onUpdate).toHaveBeenCalledWith({class_resources:{...character.class_resources,'psionic-energy-dice':1}});
});
it('keeps the die when the bonus does not change the outcome',async()=>{
 const onUpdate=vi.fn();render(ui(character,onUpdate));fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));
 fireEvent.click(screen.getByRole('button',{name:'Keep die'}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalled());expect(onUpdate).not.toHaveBeenCalled();
});
it('settles against current resources and does not overdraw after another spend',async()=>{
 const onUpdate=vi.fn();const view=render(ui(character,onUpdate));fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));
 view.rerender(ui({...character,class_resources:{...character.class_resources,'psionic-energy-dice':0}},onUpdate));
 fireEvent.click(screen.getByRole('button',{name:'Changed to hit · spend 1'}));
 await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Resources changed'),'warn'));expect(onUpdate).not.toHaveBeenCalled();
});
it('does not apply a pending bonus to a different character',async()=>{
 const onUpdate=vi.fn();const view=render(ui(character,onUpdate));fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));
 view.rerender(ui({...character,id:'other'},onUpdate));fireEvent.click(screen.getByRole('button',{name:'Changed to hit · spend 1'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Roll bonus'}) as HTMLButtonElement).disabled).toBe(false));expect(onUpdate).not.toHaveBeenCalled();
});
it('requires an available die',()=>{
 render(ui({...character,class_resources:{...character.class_resources,'psionic-energy-dice':0}},vi.fn()));
 expect((screen.getByRole('button',{name:'Roll bonus'}) as HTMLButtonElement).disabled).toBe(true);
});

const highLevel={...character,level:7,hit_dice_spent:2};
it('offers Surge after a low roll, charges Hit Point Die even when Energy Die is kept',async()=>{
 mocks.roll=2;const onUpdate=vi.fn();render(ui(highLevel,onUpdate));
 fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));
 expect(screen.getByRole('dialog',{name:'Psionic Surge'})).toBeTruthy();expect(onUpdate).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await screen.findByRole('dialog',{name:'Inerrant Aim'});
 expect(screen.getByText(/Surge treats it as 4/)).toBeTruthy();
 expect(onUpdate).toHaveBeenCalledTimes(1);expect(onUpdate).toHaveBeenCalledWith({hit_dice_spent:3});
 fireEvent.click(screen.getByRole('button',{name:'Keep die'}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledTimes(2));
 expect(onUpdate).toHaveBeenCalledTimes(1);
 expect(mocks.log).toHaveBeenLastCalledWith(expect.objectContaining({total:4,individualResults:[2],notes:expect.stringContaining('No die spent.')}));
});
it('charges the Energy Die separately when a surged bonus changes the outcome',async()=>{
 mocks.roll=1;const onUpdate=vi.fn();render(ui(highLevel,onUpdate));
 fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await screen.findByRole('dialog',{name:'Inerrant Aim'});fireEvent.click(screen.getByRole('button',{name:'Changed to hit · spend 1'}));
 await waitFor(()=>expect(onUpdate).toHaveBeenCalledTimes(2));
 expect(onUpdate).toHaveBeenNthCalledWith(1,{hit_dice_spent:3});
 expect(onUpdate).toHaveBeenNthCalledWith(2,{class_resources:{...character.class_resources,'psionic-energy-dice':1}});
});
it('declining Surge keeps the original roll and costs no Hit Point Die',async()=>{
 mocks.roll=3;const onUpdate=vi.fn();render(ui(highLevel,onUpdate));
 fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));fireEvent.click(screen.getByRole('button',{name:'Keep roll of 3'}));
 await screen.findByRole('dialog',{name:'Inerrant Aim'});expect(screen.getByText(/Rolled 3 on 1d8/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Keep die'}));await waitFor(()=>expect(mocks.log).toHaveBeenCalledTimes(1));
 expect(onUpdate).not.toHaveBeenCalled();
});
it('rechecks Hit Point Dice before spending after a concurrent use',async()=>{
 mocks.roll=1;const onUpdate=vi.fn();const view=render(ui(highLevel,onUpdate));
 fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));view.rerender(ui({...highLevel,hit_dice_spent:7},onUpdate));
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Surge was not applied'),'warn'));
 expect(onUpdate).not.toHaveBeenCalled();expect(mocks.log).not.toHaveBeenCalled();
});
it('cannot spend Surge after the character changes',async()=>{
 mocks.roll=1;const onUpdate=vi.fn();const view=render(ui(highLevel,onUpdate));
 fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));view.rerender(ui({...highLevel,id:'different'},onUpdate));
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Roll bonus'}) as HTMLButtonElement).disabled).toBe(false));
 expect(onUpdate).not.toHaveBeenCalled();
});
it.each([{...highLevel,level:6},{...highLevel,hit_dice_spent:7}])('skips unavailable Surge',c=>{
 mocks.roll=1;render(ui(c,vi.fn()));fireEvent.click(screen.getByRole('button',{name:'Roll bonus'}));
 expect(screen.getByRole('dialog',{name:'Inerrant Aim'})).toBeTruthy();
});
