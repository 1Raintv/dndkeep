// @vitest-environment happy-dom
import {cleanup,render,fireEvent,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {WeaponItem} from '../../types';
const m=vi.hoisted(()=>({attack:vi.fn(),roll:vi.fn(),log:vi.fn(),trigger:vi.fn()}));
vi.mock('../Combat/PlayerAttackButton',()=>({default:(props:unknown)=>{m.attack(props);return null;}}));
vi.mock('../../lib/supabase',()=>({supabase:{}}));
vi.mock('../../lib/gameUtils',()=>({rollDie:m.roll,computeActiveBonuses:()=>({attackBonus:0,damageBonus:0})}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:m.trigger})}));
vi.mock('../shared/ActionLog',()=>({logAction:m.log}));
import WeaponsTracker from './WeaponsTracker';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it.each([{id:'unarmed',damageDice:'flat',source:'ability',expression:'4'},{id:'unarmed',damageDice:'1d8',source:'ability',expression:'1d8+4'},{id:'bow',damageDice:'1d8',source:'weapon',expression:'1d8+4'}])('declares $id with its actual source and valid damage expression',({id,damageDice,source,expression})=>{
 const weapon:WeaponItem={id,name:id,damageDice,damageBonus:4,attackBonus:5,damageType:'bludgeoning',range:id==='bow'?'Ranged':'Melee',properties:'',notes:''};
 render(<WeaponsTracker weapons={[weapon]} attacksPerAction={1} onUpdate={vi.fn()} historyCharacterId="hero"/>);
 expect(m.attack).toHaveBeenCalledWith(expect.objectContaining({source,damageDice:expression,attackMode:id==='bow'?'ranged':'melee'}));
});

const unarmed:WeaponItem={id:'unarmed',name:'Unarmed Strike',attackBonus:5,damageDice:'flat',damageBonus:4,damageType:'bludgeoning',range:'Melee',properties:'',notes:'',unarmedModes:true,unarmedSaveDC:13,athleticsBonus:17};
it.each([{label:/^Grapple/,effect:'Grappled'},{label:/^Shove — Push/,effect:'5 feet away'},{label:/^Shove — Knock/,effect:'Prone'}])('requests a target save for $effect without rolling attacker Athletics',async({label,effect})=>{
 render(<WeaponsTracker weapons={[unarmed]} attacksPerAction={2} onUpdate={vi.fn()} historyCharacterId="hero"/>);
 fireEvent.click(screen.getByRole('button',{name:'STRIKE'}));fireEvent.click(screen.getByRole('button',{name:label}));
 await waitFor(()=>expect(m.log).toHaveBeenCalled());expect(m.roll).not.toHaveBeenCalled();
 const entry=m.log.mock.calls[0][0];expect(entry).toMatchObject({actionType:'standard-action',actionName:expect.stringContaining('save requested')});
 expect(entry.notes).toContain('Strength or Dexterity saving throw against DC 13');expect(entry.notes).toContain(effect);
 expect(entry.individualResults).toBeUndefined();expect(entry.total).toBeUndefined();await screen.findByRole('status');
});
it('does not infer a save DC from Athletics when the base DC is missing',()=>{
 render(<WeaponsTracker weapons={[{...unarmed,unarmedSaveDC:undefined}]} attacksPerAction={1} onUpdate={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'STRIKE'}));expect((screen.getByRole('button',{name:/^Grapple/}) as HTMLButtonElement).disabled).toBe(true);
});
it('failed logging keeps the request visible and never claims a completed save',async()=>{
 m.log.mockResolvedValueOnce({error:{message:'offline'}});
 render(<WeaponsTracker weapons={[unarmed]} attacksPerAction={1} onUpdate={vi.fn()} historyCharacterId="hero"/>);
 fireEvent.click(screen.getByRole('button',{name:'STRIKE'}));fireEvent.click(screen.getByRole('button',{name:/^Grapple/}));
 expect((await screen.findByRole('alert')).textContent).toContain('could not be logged');expect(screen.queryByRole('status')).toBeNull();expect(m.roll).not.toHaveBeenCalled();
});

it.each([12,20])('unarmed damage waits for hit confirmation after natural %i and flat critical damage stays flat',async nat=>{
 m.roll.mockReturnValue(nat);render(<WeaponsTracker weapons={[unarmed]} attacksPerAction={1} onUpdate={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'STRIKE'}));fireEvent.click(screen.getByRole('button',{name:/^Damage/}));
 expect(m.trigger).toHaveBeenCalledTimes(1);expect(m.trigger.mock.calls[0][0].total).toBe(nat+5);
 expect(screen.getByText(new RegExp('Attack total: '+(nat+5)))).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/^Confirm hit/}));
 expect(m.trigger).toHaveBeenCalledTimes(2);expect(m.trigger.mock.calls[1][0].total).toBe(4);
});
it('natural 1 closes without producing damage',()=>{
 m.roll.mockReturnValue(1);render(<WeaponsTracker weapons={[unarmed]} attacksPerAction={1} onUpdate={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'STRIKE'}));fireEvent.click(screen.getByRole('button',{name:/^Damage/}));
 fireEvent.click(screen.getByRole('button',{name:/^Miss — close/}));expect(m.trigger).toHaveBeenCalledTimes(1);
});
it('cancelling after the hit roll never produces damage and the next strike starts fresh',()=>{
 m.roll.mockReturnValue(12);render(<WeaponsTracker weapons={[unarmed]} attacksPerAction={1} onUpdate={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'STRIKE'}));fireEvent.click(screen.getByRole('button',{name:/^Damage/}));
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(m.trigger).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'STRIKE'}));expect(screen.getByRole('button',{name:/^Damage/})).toBeTruthy();
});

it.each([0,-2])('flat unarmed damage %i is floored at zero, including critical hits',damageBonus=>{
 m.roll.mockReturnValue(20);render(<WeaponsTracker weapons={[{...unarmed,damageBonus}]} attacksPerAction={1} onUpdate={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'STRIKE'}));fireEvent.click(screen.getByRole('button',{name:/^Damage/}));
 fireEvent.click(screen.getByRole('button',{name:/^Confirm hit/}));expect(m.trigger.mock.calls[1][0].total).toBe(0);
});
