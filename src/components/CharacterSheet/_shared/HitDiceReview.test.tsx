// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Character} from '../../../types';
import {HitDiceReview} from './HitDiceReview';
const hero={id:'hero',class_name:'Psion',level:7,secondary_class:'Fighter',secondary_level:3,hit_dice_spent:2,psionic_hit_dice_revision:4,hit_dice_spent_by_type:null} as Character;
afterEach(cleanup);
it('requires explicit valid counts with an unchanged total',async()=>{
 const save=vi.fn().mockResolvedValue(undefined);render(<HitDiceReview character={hero} disabled={false} onReview={save}/>);
 const button=screen.getByRole('button',{name:'Save Hit Dice review'});expect((button as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Spent d6'),{target:{value:'1'}});fireEvent.change(screen.getByLabelText('Spent d10'),{target:{value:'0'}});
 expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.change(screen.getByLabelText('Spent d10'),{target:{value:'1'}});
 fireEvent.click(button);await waitFor(()=>expect(save).toHaveBeenCalledWith(4,{'6':1,'10':1},2));
});
it('retains allocation after an error for an exact retry',async()=>{
 const save=vi.fn().mockRejectedValue(new Error('Hit Dice changed. Reload.'));render(<HitDiceReview character={hero} disabled={false} onReview={save}/>);
 fireEvent.change(screen.getByLabelText('Spent d6'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('Spent d10'),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:'Save Hit Dice review'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Hit Dice changed'));
 expect((screen.getByLabelText('Spent d6') as HTMLInputElement).value).toBe('2');
});
it('does not ask to review an unambiguous pool',()=>{
 render(<HitDiceReview character={{...hero,hit_dice_spent:0}} disabled={false} onReview={vi.fn()}/>);expect(screen.queryByRole('region')).toBeNull();
});
