// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import PsionicPowerButton from './PsionicPowerButton';
import {ModalProvider} from '../../shared/Modal';
import type {Character} from '../../../types';
vi.mock('../../../rules/dice',()=>({rollDie:()=>4}));
afterEach(cleanup);
const character={id:'psion',class_name:'Psion',level:5,class_resources:{'psionic-energy-dice':2},feature_uses:{}} as unknown as Character;
it('cancels without rolling/submitting, then submits one free extension',async()=>{
 const onUse=vi.fn().mockResolvedValue(undefined);
 render(<ModalProvider><PsionicPowerButton character={character} kind="connection" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend (free)'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Extend (free)'}) as HTMLButtonElement).disabled).toBe(false));expect(onUse).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Extend (free)'}));fireEvent.click(screen.getByRole('button',{name:'Extend telepathy'}));
 await waitFor(()=>expect(onUse).toHaveBeenCalledTimes(1));expect(onUse).toHaveBeenCalledWith({kind:'connection',free:true,roll:4});
});
it('at zero dice offers free Propel and blocks powered Propel',()=>{
 render(<PsionicPowerButton character={{...character,class_resources:{'psionic-energy-dice':0}}} kind="propel" onUse={vi.fn()}/>);
 expect((screen.getByRole('button',{name:'Free 5 ft'}) as HTMLButtonElement).disabled).toBe(false);
 expect((screen.getByRole('button',{name:'Powered (1 die)'}) as HTMLButtonElement).disabled).toBe(true);
});
it('does not silently charge a free use when resources change during confirmation',async()=>{
 const onUse=vi.fn().mockResolvedValue(undefined);
 const view=render(<ModalProvider><PsionicPowerButton character={character} kind="connection" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend (free)'}));
 view.rerender(<ModalProvider><PsionicPowerButton character={{...character,feature_uses:{'Telepathic Connection':1}}} kind="connection" onUse={onUse}/></ModalProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Extend telepathy'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Extend (1 die)'}) as HTMLButtonElement).disabled).toBe(false));expect(onUse).not.toHaveBeenCalled();
});
