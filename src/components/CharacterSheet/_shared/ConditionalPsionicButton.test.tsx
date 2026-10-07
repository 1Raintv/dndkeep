// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../../rules/dice',()=>({rollDie:()=>4}));
const mocks=vi.hoisted(()=>({log:vi.fn(),toast:vi.fn()}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
import ConditionalPsionicButton from './ConditionalPsionicButton';
import {ModalProvider} from '../../shared/Modal';
import {findDiscipline} from '../../../data/psionDisciplines';
import type {Character} from '../../../types';
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
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
