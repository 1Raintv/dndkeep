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

const downed={...character,active_conditions:['Unconscious','Prone','Incapacitated'],condition_sources:{
 Unconscious:{source:'damage:test'},Prone:{source:'cascade:Unconscious'},Incapacitated:{source:'cascade:Unconscious'},
}} as Character;
it.each(['roll','regain'])('waking through %s ends derived incapacity while staying prone',mode=>{
 const update=vi.fn();render(<DeathSaves character={{...downed,is_stable:mode==='regain'}} onUpdate={update}/>);
 if(mode==='regain')fireEvent.click(screen.getByRole('button',{name:'Regain 1 HP'}));
 else {fireEvent.click(screen.getByRole('button',{name:'Roll d20'}));m.roll.mock.calls[0][0].onResult([20],20);}
 expect(update).toHaveBeenCalledWith(expect.objectContaining({current_hp:1,active_conditions:['Prone'],condition_sources:{Prone:{source:'fall:Unconscious'}}}));
});
it('waking preserves incapacity required by a separate Stunned condition',()=>{
 const update=vi.fn();render(<DeathSaves character={{...downed,active_conditions:[...downed.active_conditions!,'Stunned'],condition_sources:{...downed.condition_sources,Stunned:{source:'spell:stun'}}}} onUpdate={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'Roll d20'}));m.roll.mock.calls[0][0].onResult([20],20);
 expect(update).toHaveBeenCalledWith(expect.objectContaining({active_conditions:['Prone','Incapacitated','Stunned'],condition_sources:{Prone:{source:'fall:Unconscious'},Stunned:{source:'spell:stun'},Incapacitated:{source:'cascade:Stunned'}}}));
});
it('stabilizing without HP leaves the unconscious condition untouched',()=>{
 const update=vi.fn();render(<DeathSaves character={downed} onUpdate={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'Roll d20'}));m.roll.mock.calls[0][0].onResult([10],10);
 expect(update.mock.calls[0][0]).not.toHaveProperty('active_conditions');expect(update.mock.calls[0][0]).not.toHaveProperty('condition_sources');
});
