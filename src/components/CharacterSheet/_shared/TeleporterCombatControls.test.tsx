// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character} from '../../../types';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../lib/api/teleporterCombat',()=>({getTeleporterFollowup:m.get}));
vi.mock('../../../lib/api/actionBudget',()=>({ACTION_BUDGET_CHANGED:'action-budget'}));
vi.mock('../../../lib/psionicPaymentRecovery',()=>({PSIONIC_PAYMENT_CHANGED:'payment'}));
vi.mock('../../../lib/hooks/useSavedSpellDeclaration',()=>({useSavedSpellDeclaration:()=>({blocked:false})}));
vi.mock('../../../data/spells',()=>({SPELLS:[{id:'mage-hand',name:'Mage Hand',level:0,casting_time:'1 Action'},{id:'mending',name:'Mending',level:0,casting_time:'1 minute'}]}));
vi.mock('../SpellCastButton',()=>({default:({teleporterCombatParent,onTeleporterDeclared}:{teleporterCombatParent:string;onTeleporterDeclared:()=>void})=><button onClick={onTeleporterDeclared}>Cast parent {teleporterCombatParent}</button>}));
import TeleporterCombatControls from './TeleporterCombatControls';
const character={id:'hero',class_name:'Psion',level:6,subclass:'Psi Warper',spell_sources:{'mage-hand':['class:Psion'],mending:['class:Psion']}} as unknown as Character;
const ready={parentId:'parent',characterId:'hero',status:'ready',kind:'free',encounterId:'combat'};
beforeEach(()=>{vi.resetAllMocks();m.get.mockResolvedValue(ready);});afterEach(cleanup);
const open=()=>fireEvent.click(screen.getByRole('button',{name:'Choose cantrip'}));
it('shows only eligible cantrips and hands the verified parent to casting',async()=>{
 render(<TeleporterCombatControls character={character} userId="owner"/>);open();
 const select=await screen.findByRole('combobox',{name:'Psion cantrip'});expect(screen.queryByRole('option',{name:'Mending'})).toBeNull();
 fireEvent.change(select,{target:{value:'mage-hand'}});fireEvent.click(screen.getByRole('button',{name:'Cast parent parent'}));
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('closes stale casting choices when an availability refresh fails',async()=>{
 render(<TeleporterCombatControls character={character} userId="owner"/>);open();await screen.findByRole('combobox');
 m.get.mockRejectedValue(new Error('offline'));act(()=>window.dispatchEvent(new Event('action-budget')));
 await screen.findByRole('alert');expect(screen.queryByRole('combobox')).toBeNull();expect(screen.getByRole('button',{name:'Retry'}).hasAttribute('disabled')).toBe(false);
});
it.each(['waiting','interrupted'])('never offers a cast while %s',async status=>{
 m.get.mockResolvedValue({...ready,status,kind:'slot'});render(<TeleporterCombatControls character={character} userId="owner"/>);open();
 await screen.findByText(status==='waiting'?'Finish resolving Misty Step before choosing the follow-up.':/Misty Step was countered/);
 expect(screen.queryByRole('combobox')).toBeNull();
});
it('ignores a late parent response after switching characters',async()=>{
 let resolve!:(v:unknown)=>void;m.get.mockReturnValue(new Promise(r=>{resolve=r;}));
 const view=render(<TeleporterCombatControls character={character} userId="owner"/>);open();
 view.rerender(<TeleporterCombatControls character={{...character,id:'other'}} userId="owner"/>);
 await act(async()=>resolve(ready));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});

