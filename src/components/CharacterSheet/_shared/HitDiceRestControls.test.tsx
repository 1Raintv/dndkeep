// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Character} from '../../../types';
import {HitDiceRestControls} from './HitDiceRestControls';
const hero={id:'hero',class_name:'Psion',level:7,secondary_class:'Fighter',secondary_level:3,hit_dice_spent:2,hit_dice_spent_by_type:{'6':1,'10':1},current_hp:10,max_hp:30} as unknown as Character;
afterEach(cleanup);
const props={character:hero,conModifier:0,disabled:false,restSaving:false,gained:0,onRoll:vi.fn(),onDone:vi.fn()};
it('shows both pools and sends the deliberately selected die size',()=>{
 const roll=vi.fn();render(<HitDiceRestControls {...props} onRoll={roll}/>);
 expect(screen.getByText('6 / 7 d6')).toBeTruthy();expect(screen.getByText('2 / 3 d10')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Hit Die size'),{target:{value:'10'}});fireEvent.change(screen.getByLabelText('Hit Dice to spend'),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'Roll Hit Dice (d10+0)'}));expect(roll).toHaveBeenCalledWith(2,10);
});
it.each(['-1','0','1.5','3'])('does not clamp an invalid request %s into a different payment',count=>{
 render(<HitDiceRestControls {...props}/>);fireEvent.change(screen.getByLabelText('Hit Die size'),{target:{value:'10'}});
 fireEvent.change(screen.getByLabelText('Hit Dice to spend'),{target:{value:count}});expect((screen.getByRole('button',{name:'Roll Hit Dice (d10+0)'}) as HTMLButtonElement).disabled).toBe(true);
});
it('blocks ambiguous old mixed-pool totals before healing',()=>{
 render(<HitDiceRestControls {...props} character={{...hero,hit_dice_spent_by_type:null}}/>);expect((screen.getByRole('button',{name:'Review Hit Dice first'}) as HTMLButtonElement).disabled).toBe(true);
});
it('keeps an exhausted selected size visible instead of silently switching the payment',()=>{
 const {rerender}=render(<HitDiceRestControls {...props}/>);fireEvent.change(screen.getByLabelText('Hit Die size'),{target:{value:'10'}});
 rerender(<HitDiceRestControls {...props} character={{...hero,hit_dice_spent:4,hit_dice_spent_by_type:{'6':1,'10':3}}}/>);
 expect((screen.getByRole('button',{name:'Roll Hit Dice (d10+0)'}) as HTMLButtonElement).disabled).toBe(true);
});
