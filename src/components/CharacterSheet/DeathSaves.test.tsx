// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
const m=vi.hoisted(()=>({roll:vi.fn()}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:m.roll})}));
vi.mock('../../lib/characterHistory',()=>({logHistoryEvent:vi.fn().mockResolvedValue(undefined)}));
import DeathSaves from './DeathSaves';
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
const character={id:'hero',name:'Hero',current_hp:0,is_stable:false,death_saves_successes:2,death_saves_failures:2} as Character;
it('shows stable with zero counters and offers delayed HP recovery',()=>{
 const update=vi.fn();render(<DeathSaves character={{...character,is_stable:true,death_saves_successes:0,death_saves_failures:0}} onUpdate={update}/>);
 expect(screen.queryByRole('button',{name:'Roll d20'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Regain 1 HP'}));
 expect(update).toHaveBeenCalledWith({current_hp:1,is_stable:false,death_saves_successes:0,death_saves_failures:0});
});
it('third success stays unconscious at zero HP and resets both counters',()=>{
 const update=vi.fn();render(<DeathSaves character={character} onUpdate={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'Roll d20'}));m.roll.mock.calls[0][0].onResult([10],10);
 expect(update).toHaveBeenCalledWith({current_hp:0,is_stable:true,death_saves_successes:0,death_saves_failures:0});
});
it('natural one reaches death rather than stabilization',()=>{
 const update=vi.fn();render(<DeathSaves character={character} onUpdate={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'Roll d20'}));m.roll.mock.calls[0][0].onResult([1],1);
 expect(update).toHaveBeenCalledWith({current_hp:0,is_stable:false,death_saves_successes:2,death_saves_failures:3});
});
it('natural twenty restores one HP and clears counters',()=>{
 const update=vi.fn();render(<DeathSaves character={character} onUpdate={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'Roll d20'}));m.roll.mock.calls[0][0].onResult([20],20);
 expect(update).toHaveBeenCalledWith({current_hp:1,is_stable:false,death_saves_successes:0,death_saves_failures:0});
});
