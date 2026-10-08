// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({roll:vi.fn(()=>2),log:vi.fn(),toast:vi.fn()}));
vi.mock('../../../rules/dice',()=>({rollDie:mocks.roll}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
import RealPsionicDieRollButton from './PsionicDieRollButton';
import {withTestPsionicPersistence} from './psionicPersistence.testSupport';
const PsionicDieRollButton=withTestPsionicPersistence(RealPsionicDieRollButton);
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

it('uses a secondary Psion die rather than the higher primary level',async()=>{
 const update=vi.fn(),rolled=vi.fn();const c={...character,class_name:'Fighter',level:11,secondary_class:'Psion',secondary_level:5,hit_dice_spent:0};
 render(<ModalProvider><PsionicDieRollButton character={c} onUpdate={update} feature="Psionic Energy Dice" label="Spend die" onRolled={rolled}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Spend die'}));
 await waitFor(()=>expect(rolled).toHaveBeenCalledWith(2,8));expect(mocks.roll).toHaveBeenCalledWith(8);
 expect(update).toHaveBeenCalledWith({class_resources:{'psionic-energy-dice':0,other:9}});
 expect(screen.queryByRole('dialog',{name:'Psionic Surge'})).toBeNull();
});

it('Guards spends one die without rolling or offering roll enhancements',async()=>{
 const update=vi.fn(),rolled=vi.fn(),c={...character,intelligence:10,inventory:[],class_resources:{'psion-disciplines':['psionic-guards'],'psionic-energy-dice':1}} as unknown as Character;
 render(<ModalProvider><PsionicDieRollButton character={c} onUpdate={update} feature="Psionic Guards" label="Activate Guards" onRolled={rolled}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Activate Guards'}));await waitFor(()=>expect(update).toHaveBeenCalledTimes(1));
 expect(update).toHaveBeenCalledWith({class_resources:{'psion-disciplines':['psionic-guards'],'psionic-energy-dice':0}});
 expect(mocks.roll).not.toHaveBeenCalled();expect(rolled).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();
});
it('Sharpened Mind records one base roll through the discipline path',async()=>{
 const update=vi.fn(),rolled=vi.fn(),c={...character,level:5,intelligence:10,inventory:[],class_resources:{'psion-disciplines':['sharpened-mind'],'psionic-energy-dice':1}} as unknown as Character;
 render(<ModalProvider><PsionicDieRollButton character={c} onUpdate={update} feature="Sharpened Mind" label="Use discipline" onRolled={rolled}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Use discipline'}));await waitFor(()=>expect(rolled).toHaveBeenCalledWith(2,8));expect(mocks.roll).toHaveBeenCalledTimes(1);
 expect(update).toHaveBeenCalledWith({class_resources:{'psion-disciplines':['sharpened-mind'],'psionic-energy-dice':0}});
});
