// @vitest-environment happy-dom
vi.mock('../../../lib/supabase',()=>({supabase:{}}));
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({roll:vi.fn(()=>2),log:vi.fn(),toast:vi.fn()}));
vi.mock('../../../rules/dice',()=>({rollDie:mocks.roll}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
import RealPsionicDieRollButton from './PsionicDieRollButton';
import {testPsionicPersistence,withTestPsionicPersistence} from './psionicPersistence.testSupport';
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

for(const feature of ['Psionic Energy Dice','Sharpened Mind'])for(const departure of ['switch','close'] as const)it(`keeps a late paid ${feature} roll on its original character after ${departure}`,async()=>{
 const original={...character,intelligence:10,inventory:[],class_resources:{...character.class_resources,'psion-disciplines':['sharpened-mind']}} as unknown as Character;
 const persistence=testPsionicPersistence(()=>original),pay=persistence.energy;
 let release!:()=>void;const delay=new Promise<void>(resolve=>{release=resolve;});
 persistence.energy=vi.fn(async request=>{await delay;return pay(request);});
 persistence.getTurn=vi.fn(persistence.getTurn);persistence.spend=vi.fn(persistence.spend);persistence.surge=vi.fn(persistence.surge);
 const rolled=vi.fn(),update=vi.fn();
 const props={persistence,character:original,onUpdate:update,feature,label:'Spend die',onRolled:rolled};
 const view=render(<ModalProvider><RealPsionicDieRollButton {...props}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Spend die'}));await waitFor(()=>expect(persistence.energy).toHaveBeenCalledTimes(1));
 if(departure==='switch')view.rerender(<ModalProvider><RealPsionicDieRollButton {...props} character={{...character,id:'other-psion',name:'Other'}}/></ModalProvider>);
 else view.unmount();
 await act(async()=>{release();await delay;});
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({characterId:'psion',total:2})));
 expect(persistence.getTurn).not.toHaveBeenCalled();expect(persistence.spend).not.toHaveBeenCalled();expect(persistence.surge).not.toHaveBeenCalled();
 expect(rolled).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();expect(mocks.roll).toHaveBeenCalledTimes(1);
});

for(const fails of [false,true])it(`automatically confirms Sharpened final number with failure=${fails}`,async()=>{
 const c={...character,level:5,intelligence:18,inventory:[],class_resources:{'psion-disciplines':['sharpened-mind'],'psionic-energy-dice':6}} as unknown as Character;
 const p=testPsionicPersistence(()=>c);p.beginDiscipline=vi.fn(p.beginDiscipline!);
 p.finalizeSharpenedRoll=vi.fn(async requestId=>{if(fails)throw new Error('Lost confirmation');return {requestId,characterId:c.id,originalRolls:[2],rolls:[2],total:2,activatedAt:'2026-10-08T12:00:00Z',turn:{soloTurn:0},replayed:false};});
 const rolled=vi.fn();render(<ModalProvider><RealPsionicDieRollButton persistence={p} character={c} onUpdate={vi.fn()} feature="Sharpened Mind" label="Use discipline" onRolled={rolled}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Use discipline'}));await waitFor(()=>expect(p.finalizeSharpenedRoll).toHaveBeenCalledTimes(1));
 expect(p.finalizeSharpenedRoll).toHaveBeenCalledWith(vi.mocked(p.beginDiscipline).mock.calls[0][0].requestId);
 if(fails){expect(rolled).not.toHaveBeenCalled();expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('final number is not confirmed'),'warn');}
 else await waitFor(()=>expect(rolled).toHaveBeenCalledWith(2,8));
 expect(mocks.roll).toHaveBeenCalledTimes(1);
});
