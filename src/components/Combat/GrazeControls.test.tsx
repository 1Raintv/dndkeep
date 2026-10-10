// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../../types';
const api=vi.hoisted(()=>({readGrazeDamageContext:vi.fn(),recordGrazeDamage:vi.fn(),applyGrazeDamage:vi.fn()}));
vi.mock('../../lib/api/grazeDamage',()=>api);
import GrazeChoiceControls from './GrazeChoiceControls';
import GrazeDamagePanel from './GrazeDamagePanel';
const attack={id:'a',attack_name:'Greatsword',attack_kind:'attack_roll',attack_source:'weapon',attacker_type:'character',hit_result:'miss',graze_resolution_version:1,attack_ability_modifier:4,damage_raw:4,damage_type:'Slashing'} as PendingAttack;
const context=()=>({attack,attacker:{definition:{weapon_masteries:['Greatsword']}},target:{definitionType:'custom',definition:{damage_immunities:[],damage_resistances:['slashing from nonmagical attacks'],damage_vulnerabilities:[]}}});
const runAction=async(fn:()=>Promise<unknown>)=>{await fn();};
beforeEach(()=>{vi.clearAllMocks();api.readGrazeDamageContext.mockResolvedValue(context());});afterEach(cleanup);
it.each([true,false])('records the explicit choice %s without applying HP',async(use)=>{
 render(<GrazeChoiceControls attack={attack} disabled={false} runAction={runAction} onSkip={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:use?'Use Graze':'Decline Graze'}));
 expect(api.recordGrazeDamage).toHaveBeenCalledWith(attack,use);expect(api.applyGrazeDamage).not.toHaveBeenCalled();
});
it('does not guess legacy or missing attack modifiers',async()=>{
 render(<GrazeChoiceControls attack={{...attack,attack_ability_modifier:null}} disabled={false} runAction={runAction} onSkip={vi.fn()}/>);
 await screen.findByText(/modifier was not saved/);expect(screen.queryByRole('button',{name:'Use Graze'})).toBeNull();
});
it('failed mastery reads cannot look like no mastery',async()=>{
 api.readGrazeDamageContext.mockRejectedValueOnce(new Error('offline'));render(<GrazeChoiceControls attack={attack} disabled={false} runAction={runAction} onSkip={vi.fn()}/>);
 await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Continue without Graze'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Refresh mastery'}));await screen.findByRole('button',{name:'Use Graze'});
});
it('sends a defense ruling with the exact inspected context',async()=>{
 render(<GrazeDamagePanel attack={attack} choice disabled={false} runAction={runAction}/>);
 await screen.findByText(/slashing from nonmagical/);fireEvent.click(screen.getByLabelText('Review conditional or unrecorded defenses'));
 expect((screen.getByRole('button',{name:'Apply Graze'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByLabelText('Resistant'));fireEvent.change(screen.getByLabelText('Reason for ruling'),{target:{value:'Nonmagical weapon'}});
 fireEvent.click(screen.getByRole('button',{name:'Apply Graze'}));await waitFor(()=>expect(api.applyGrazeDamage).toHaveBeenCalledWith(attack,{context:context(),decision:{immune:false,resistant:true,vulnerable:false,note:'Nonmagical weapon'}}));
});
it('reaction waiting disables application and review controls',async()=>{
 render(<GrazeDamagePanel attack={attack} choice disabled runAction={runAction}/>);await screen.findByText(/slashing from nonmagical/);
 fireEvent.click(screen.getByRole('button',{name:'Apply Graze'}));expect(api.applyGrazeDamage).not.toHaveBeenCalled();
});
