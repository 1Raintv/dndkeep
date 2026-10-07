// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({roll:vi.fn(()=>2),log:vi.fn(),toast:vi.fn()}));
vi.mock('../../../rules/dice',()=>({rollDie:mocks.roll}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
import PsionicDieRollButton from './PsionicDieRollButton';
import {ModalProvider} from '../../shared/Modal';
import type {Character} from '../../../types';
const character={id:'psion',name:'Psion',class_name:'Psion',level:20,hit_dice_spent:18,class_resources:{'psionic-energy-dice':1,other:9}} as unknown as Character;
afterEach(cleanup);beforeEach(()=>{vi.clearAllMocks();mocks.log.mockResolvedValue(undefined);});
it('spends its last Energy Die once and buys extra dice only with Hit Point Dice',async()=>{
 const update=vi.fn(),rolled=vi.fn();render(<ModalProvider><PsionicDieRollButton character={character} onUpdate={update} feature="Psionic Energy Dice" label="Spend die" onRolled={rolled}/></ModalProvider>);
 const button=screen.getByRole('button',{name:'Spend die'});fireEvent.click(button);fireEvent.click(button);
 await screen.findByRole('dialog',{name:'Enkindled Life Force'});fireEvent.change(screen.getByRole('textbox'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Continue'}));
 await waitFor(()=>expect(rolled).toHaveBeenCalledWith(6,12));expect(update.mock.calls).toEqual([[{class_resources:{'psionic-energy-dice':0,other:9}}],[{hit_dice_spent:20}]]);
 expect(mocks.roll).toHaveBeenCalledTimes(3);expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({actionName:'Spent Psionic Energy Die (1d12)',total:6,diceExpression:'3d12'}));
});
it('blocks malformed pools and wrong classes without spending',()=>{
 const update=vi.fn();render(<ModalProvider><PsionicDieRollButton character={{...character,class_name:'Fighter'}} onUpdate={update} feature="Psionic Energy Dice" label="Spend die" onRolled={vi.fn()}/></ModalProvider>);
 expect((screen.getByRole('button',{name:'Spend die'}) as HTMLButtonElement).disabled).toBe(true);expect(update).not.toHaveBeenCalled();
});
