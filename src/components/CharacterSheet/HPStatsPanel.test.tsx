// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../lib/supabase',()=>({supabase:{}}));
const m=vi.hoisted(()=>({recover:vi.fn(),roll:vi.fn()}));
vi.mock('../../lib/api/psionicReserves',()=>({recoverPsionicReserves:m.recover}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:m.roll})}));
beforeEach(()=>{vi.clearAllMocks();m.recover.mockResolvedValue(2);});
vi.mock('./ConditionPickerModal',()=>({default:()=>null}));
import HPStatsPanel from './HPStatsPanel';
import type {Character,ComputedStats} from '../../types';
afterEach(cleanup);
const character={class_name:'Psion',intelligence:10,armor_class:12,speed:30,active_conditions:[]} as unknown as Character;
const computed={modifiers:{dexterity:0},proficiency_bonus:3,spell_attack_bonus:7,spell_save_dc:15} as ComputedStats;
it('shows Psion spell stats from effective scores, not the base INT score',()=>{
 render(<HPStatsPanel character={character} computed={computed}/>);
 expect(screen.getByText('Spell Attack').parentElement?.textContent).toBe('+7Spell Attack');
 expect(screen.getByText('Spell DC').parentElement?.textContent).toBe('15Spell DC');
});
it('keeps a zero spell attack visible and respects supplied spell stats',()=>{
 render(<HPStatsPanel character={character} computed={{...computed,spell_attack_bonus:0,spell_save_dc:8}}/>);
 expect(screen.getByText('Spell Attack').parentElement?.textContent).toBe('+0Spell Attack');
});
it('does not invent spell stats for a noncaster',()=>{
 render(<HPStatsPanel character={{...character,class_name:'Fighter'}} computed={{...computed,spell_attack_bonus:null,spell_save_dc:null}}/>);
 expect(screen.queryByText('Spell Attack')).toBeNull();expect(screen.queryByText('Spell DC')).toBeNull();
});

it('prevents overlapping recovery calls for one initiative click',async()=>{
 let resolve!:(n:number)=>void;m.recover.mockReturnValue(new Promise<number>(r=>{resolve=r;}));
 render(<HPStatsPanel character={{...character,id:'hero',level:18}} computed={computed}/>);
 fireEvent.click(screen.getByText('Initiative'));fireEvent.click(screen.getByText('Initiative'));
 expect(m.recover).toHaveBeenCalledTimes(1);resolve(2);
 await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));
 expect(screen.getByRole('status').textContent).toContain('4 remaining');
});
it('still rolls initiative and shows an actionable warning if recovery fails',async()=>{
 m.recover.mockRejectedValue(new Error('offline'));
 render(<HPStatsPanel character={{...character,id:'hero',level:18}} computed={computed}/>);
 fireEvent.click(screen.getByText('Initiative'));
 await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));
 expect(screen.getByRole('status').textContent).toContain('could not sync');
});
it('does not request recovery below Psion level eighteen',()=>{
 render(<HPStatsPanel character={{...character,level:17}} computed={computed}/>);
 fireEvent.click(screen.getByText('Initiative'));
 expect(m.recover).not.toHaveBeenCalled();expect(m.roll).toHaveBeenCalledTimes(1);
});
