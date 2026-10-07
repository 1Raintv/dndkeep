// @vitest-environment happy-dom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../../lib/supabase',()=>({supabase:{}}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:vi.fn()})}));
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
