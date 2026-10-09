// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import RealPsionicPowerButton from './PsionicPowerButton';
import {withTestPsionicPersistence} from './psionicPersistence.testSupport';
const PsionicPowerButton=withTestPsionicPersistence(RealPsionicPowerButton);
import {ModalProvider} from '../../shared/Modal';
import type {Character} from '../../../types';
const mocks=vi.hoisted(()=>({roll:4,log:vi.fn().mockResolvedValue(undefined).mockResolvedValue(undefined),toast:vi.fn()}));
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
 expect((screen.getByRole('button',{name:'Roll Energy Die'}) as HTMLButtonElement).disabled).toBe(true);
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
 fireEvent.click(screen.getByRole('button',{name:'Roll Energy Die'}));
 fireEvent.click(await screen.findByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledWith({kind:'propel',mode:'powered',roll:4,originalRoll:1,surged:true}));
 expect(onUpdate).toHaveBeenCalledTimes(1);expect(onUpdate).toHaveBeenCalledWith({hit_dice_spent:1});
 expect(mocks.log).not.toHaveBeenCalled(); // The server transaction owns Surge history.
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
 fireEvent.click(screen.getByRole('button',{name:'Roll Energy Die'}));
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
 const view=render(ui(highLevel));fireEvent.click(screen.getByRole('button',{name:'Roll Energy Die'}));
 await screen.findByRole('dialog',{name:'Psionic Surge'});
 view.rerender(ui({...highLevel,class_resources:{'psionic-energy-dice':0}}));
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Surge was not applied'),'warn'));
 expect(onUse).not.toHaveBeenCalled();expect(onUpdate).not.toHaveBeenCalled();
});

it('carries a capstone total above one die into power settlement',async()=>{
 mocks.roll=6;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 render(<ModalProvider><PsionicPowerButton character={{...character,level:20,hit_dice_spent:0}} onUpdate={onUpdate} kind="propel" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Roll Energy Die'}));await screen.findByRole('dialog',{name:'Enkindled Life Force'});
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Continue'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledWith({kind:'propel',mode:'powered',roll:18,originalRoll:6,enkindledRolls:[6,6]}));
 expect(onUpdate).toHaveBeenCalledTimes(1);expect(onUpdate).toHaveBeenCalledWith({hit_dice_spent:2});
});
it('Warp submits the same Propel save flow with an explicit teleport choice',async()=>{
 const onUse=vi.fn().mockResolvedValue(undefined);
 render(<PsionicPowerButton warp onUpdate={vi.fn()} character={{...character,subclass:'Psi Warper'}} kind="propel" onUse={onUse}/>);
 fireEvent.click(screen.getByRole('button',{name:'Teleport (no die)'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledWith({kind:'propel',movement:'warp',mode:'free',roll:0}));
 expect(screen.getByRole('button',{name:'Roll Energy Die'})).toBeTruthy();
});

// A pending enhancement belongs to the exact feature/progression that opened it.
it.each(['subclass','level','campaign','power'] as const)('does not spend or submit after %s changes during Surge',async change=>{
 mocks.roll=1;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 const original={...highLevel,subclass:'Psi Warper',campaign_id:'campaign-a'};
 const ui=(c:Character,warp=true)=><ModalProvider><PsionicPowerButton character={c} warp={warp} onUpdate={onUpdate} kind="propel" onUse={onUse}/></ModalProvider>;
 const view=render(ui(original));fireEvent.click(screen.getByRole('button',{name:'Roll Energy Die'}));
 await screen.findByRole('dialog',{name:'Psionic Surge'});
 view.rerender(ui({...original,...(change==='subclass'?{subclass:'Telepath'}:change==='level'?{level:11}:change==='campaign'?{campaign_id:'campaign-b'}:{})},change!=='power'));
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Roll Energy Die'}) as HTMLButtonElement).disabled).toBe(change==='subclass'));
 expect(onUse).not.toHaveBeenCalled();expect(onUpdate).not.toHaveBeenCalled();
});
it('does not redirect a Connection confirmation into a new power callback',async()=>{
 const onUse=vi.fn().mockResolvedValue(undefined),newUse=vi.fn().mockResolvedValue(undefined);
 const view=render(<ModalProvider><PsionicPowerButton character={character} onUpdate={vi.fn()} kind="connection" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend (free)'}));
 view.rerender(<ModalProvider><PsionicPowerButton character={character} onUpdate={vi.fn()} kind="propel" onUse={newUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend telepathy'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Free 5 ft'}) as HTMLButtonElement).disabled).toBe(false));
 expect(onUse).not.toHaveBeenCalled();expect(newUse).not.toHaveBeenCalled();
});

it('rejects an old dialog after changing away from and back to its feature',async()=>{
 mocks.roll=1;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 const ui=(warp:boolean)=><ModalProvider><PsionicPowerButton character={{...highLevel,subclass:'Psi Warper'}} warp={warp} onUpdate={onUpdate} kind="propel" onUse={onUse}/></ModalProvider>;
 const view=render(ui(true));fireEvent.click(screen.getByRole('button',{name:'Roll Energy Die'}));
 await screen.findByRole('dialog',{name:'Psionic Surge'});view.rerender(ui(false));view.rerender(ui(true));
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Roll Energy Die'}) as HTMLButtonElement).disabled).toBe(false));
 expect(onUse).not.toHaveBeenCalled();expect(onUpdate).not.toHaveBeenCalled();
});
it('keeps a valid power through unrelated HP and available-pool changes',async()=>{
 mocks.roll=1;const onUse=vi.fn().mockResolvedValue(undefined),onUpdate=vi.fn();
 const ui=(c:Character)=><ModalProvider><PsionicPowerButton character={c} onUpdate={onUpdate} kind="propel" onUse={onUse}/></ModalProvider>;
 const view=render(ui(highLevel));fireEvent.click(screen.getByRole('button',{name:'Roll Energy Die'}));
 await screen.findByRole('dialog',{name:'Psionic Surge'});
 view.rerender(ui({...highLevel,current_hp:7,class_resources:{'psionic-energy-dice':1}}));
 fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledTimes(1));
 expect(onUpdate).toHaveBeenCalledTimes(1);
});
