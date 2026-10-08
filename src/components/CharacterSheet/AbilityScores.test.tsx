// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character,ComputedStats} from '../../types';
const m=vi.hoisted(()=>({read:vi.fn(),roll:vi.fn(),insert:vi.fn()}));
vi.mock('../../lib/supabase',()=>({supabase:{from:()=>({insert:m.insert})}}));
vi.mock('../../lib/api/checked',()=>({checkedWrite:vi.fn()}));
vi.mock('../../lib/api/psionicDisciplines',()=>({getPsionicGuardsSaveAdvantage:m.read}));
vi.mock('../../lib/attunement',()=>({getActiveAbilityOverrides:()=>[]}));
vi.mock('../../lib/gameUtils',()=>({formatModifier:(n:number)=>String(n),rollDie:()=>10}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:m.roll})}));
import AbilityScores from './AbilityScores';
const character={id:'hero',user_id:'owner',class_name:'Psion',level:5,strength:10,dexterity:10,constitution:10,intelligence:18,wisdom:10,charisma:10,active_conditions:[],saving_throw_proficiencies:['intelligence']} as unknown as Character;
const computed={modifiers:{strength:0,dexterity:0,constitution:0,intelligence:4,wisdom:0,charisma:0},proficiency_bonus:3} as ComputedStats;
const view=(c=character)=><AbilityScores character={c} computed={computed}/>;
const click=()=>fireEvent.click(screen.getByRole('button',{name:/^intelligence saving throw/}));
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue(false);});afterEach(cleanup);
it('uses confirmed Guards Advantage and logs both dice with the effective save bonus',async()=>{
 m.read.mockResolvedValue(true);render(view());click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));
 expect(m.read).toHaveBeenCalledWith('hero','intelligence');const roll=m.roll.mock.calls[0][0];
 expect(roll).toMatchObject({advantage:true,modifier:7,label:'Intelligence Save (Advantage · Psionic Guards)'});
 roll.onResult([{die:20,value:4},{die:20,value:16}],23);
 expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({individual_results:[4,16],dice_expression:'2d20kh1',total:23,modifier:7}));
});
it('uses a normal save after protection expires',async()=>{
 render(view());click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));expect(m.roll.mock.calls[0][0]).toMatchObject({advantage:false,label:'Intelligence Save'});
});
it('blocks duplicate clicks while protection is being checked',async()=>{
 let resolve!:(v:boolean)=>void;m.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));render(view());click();click();
 expect(m.read).toHaveBeenCalledTimes(1);expect(m.roll).not.toHaveBeenCalled();
 await act(async()=>resolve(true));expect(m.roll).toHaveBeenCalledTimes(1);
});
it('does not roll on an unreadable protection state and permits a retry',async()=>{
 m.read.mockRejectedValueOnce(new Error('Protection unavailable'));render(view());click();await screen.findByRole('alert');expect(m.roll).not.toHaveBeenCalled();
 click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));expect(screen.queryByRole('alert')).toBeNull();
});
it('ignores a late lookup after switching characters',async()=>{
 let resolve!:(v:boolean)=>void;m.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const result=render(view());click();
 result.rerender(view({...character,id:'other'}));await act(async()=>resolve(true));expect(m.roll).not.toHaveBeenCalled();
});
it('ignores a late lookup after the sheet unmounts',async()=>{
 let resolve!:(v:boolean)=>void;m.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const result=render(view());click();result.unmount();
 await act(async()=>resolve(true));expect(m.roll).not.toHaveBeenCalled();
});
it('auto-failed saves never look up Guards or roll an extra die',()=>{
 render(view({...character,active_conditions:['Paralyzed']}));fireEvent.click(screen.getByRole('button',{name:/^dexterity saving throw/}));
 expect(m.read).not.toHaveBeenCalled();expect(m.roll).toHaveBeenCalledWith(expect.objectContaining({label:'Dexterity Save (Auto-Fail)'}));
});
