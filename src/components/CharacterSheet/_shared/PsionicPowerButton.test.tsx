// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import PsionicPowerButton from './PsionicPowerButton';
import {ModalProvider} from '../../shared/Modal';
import type {Character} from '../../../types';
const mocks=vi.hoisted(()=>({roll:4,log:vi.fn().mockResolvedValue(undefined),toast:vi.fn()}));
vi.mock('../../../rules/dice',()=>({rollDie:()=>mocks.roll}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
afterEach(()=>{cleanup();mocks.roll=4;vi.clearAllMocks();});
const character={id:'psion',class_name:'Psion',level:5,class_resources:{'psionic-energy-dice':2},feature_uses:{}} as unknown as Character;
it('cancels without rolling/submitting, then submits one free extension',async()=>{
 const onUse=vi.fn().mockResolvedValue(undefined);
 render(<ModalProvider><PsionicPowerButton onUpdate={vi.fn()} character={character} kind="connection" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend (free)'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Extend (free)'}) as HTMLButtonElement).disabled).toBe(false));expect(onUse).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Extend (free)'}));fireEvent.click(screen.getByRole('button',{name:'Extend telepathy'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledTimes(1));expect(onUse).toHaveBeenCalledWith({kind:'connection',free:true,roll:4});
});
it('at zero dice offers free Propel and blocks powered Propel',()=>{
 render(<PsionicPowerButton onUpdate={vi.fn()} character={{...character,class_resources:{'psionic-energy-dice':0}}} kind="propel" onUse={vi.fn()}/>);
 expect((screen.getByRole('button',{name:'Free 5 ft'}) as HTMLButtonElement).disabled).toBe(false);
 expect((screen.getByRole('button',{name:'Powered (1 die)'}) as HTMLButtonElement).disabled).toBe(true);
});
it('does not silently charge a free use when resources change during confirmation',async()=>{
 const onUse=vi.fn().mockResolvedValue(undefined);
 const view=render(<ModalProvider><PsionicPowerButton onUpdate={vi.fn()} character={character} kind="connection" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend (free)'}));
 view.rerender(<ModalProvider><PsionicPowerButton onUpdate={vi.fn()} character={{...character,feature_uses:{'Telepathic Connection':1}}} kind="connection" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend telepathy'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Extend (1 die)'}) as HTMLButtonElement).disabled).toBe(false));expect(onUse).not.toHaveBeenCalled();
});

const highLevel={...character,level:7,hit_dice_spent:0};
it('Surge spends a Hit Point Die before submitting powered Propel',async()=>{
 mocks.roll=1;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 render(<ModalProvider><PsionicPowerButton character={highLevel} onUpdate={onUpdate} kind="propel" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Powered (1 die)'}));
 fireEvent.click(await screen.findByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledWith({kind:'propel',mode:'powered',roll:4,originalRoll:1,surged:true}));
 expect(onUpdate).toHaveBeenCalledTimes(1);expect(onUpdate).toHaveBeenCalledWith({hit_dice_spent:1});
 expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({actionName:'Psionic Surge',individualResults:[1]}));
});
it('offers Surge after the free Connection confirmation without spending an Energy Die',async()=>{
 mocks.roll=2;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 render(<ModalProvider><PsionicPowerButton character={highLevel} onUpdate={onUpdate} kind="connection" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend (free)'}));
 fireEvent.click(screen.getByRole('button',{name:'Extend telepathy'}));
 fireEvent.click(await screen.findByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledWith({kind:'connection',free:true,roll:4,originalRoll:2,surged:true}));
 expect(onUpdate).toHaveBeenCalledTimes(1);expect(onUpdate).toHaveBeenCalledWith({hit_dice_spent:1});
});
it('keeps the original roll when Surge is declined',async()=>{
 mocks.roll=3;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 render(<ModalProvider><PsionicPowerButton character={highLevel} onUpdate={onUpdate} kind="propel" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Powered (1 die)'}));
 fireEvent.click(await screen.findByRole('button',{name:'Keep roll of 3'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledWith({kind:'propel',mode:'powered',roll:3}));
 expect(onUpdate).not.toHaveBeenCalled();
});
it('does not offer Surge for the free Psykinetic d4',async()=>{
 mocks.roll=1;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 render(<ModalProvider><PsionicPowerButton character={{...highLevel,subclass:'Psykinetic'}} onUpdate={onUpdate} kind="propel" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Free d4'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledWith({kind:'propel',mode:'technique',roll:1}));
 expect(screen.queryByRole('dialog')).toBeNull();expect(onUpdate).not.toHaveBeenCalled();
});
it('rechecks the pool before spending Surge after concurrent depletion',async()=>{
 mocks.roll=1;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 const ui=(c:Character)=><ModalProvider><PsionicPowerButton character={c} onUpdate={onUpdate} kind="propel" onUse={onUse}/></ModalProvider>;
 const view=render(ui(highLevel));fireEvent.click(screen.getByRole('button',{name:'Powered (1 die)'}));
 await screen.findByRole('dialog',{name:'Psionic Surge'});
 view.rerender(ui({...highLevel,class_resources:{'psionic-energy-dice':0}}));
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Surge was not applied'),'warn'));
 expect(onUse).not.toHaveBeenCalled();expect(onUpdate).not.toHaveBeenCalled();
});
