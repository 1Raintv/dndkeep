// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import type {Character} from '../../../types';
import {useHitDieChoice} from './useHitDieChoice';
const hero={id:'hero',class_name:'Psion',level:7,secondary_class:'Fighter',secondary_level:3,hit_dice_spent:2,hit_dice_spent_by_type:{'6':1,'10':1}} as unknown as Character;
let api:ReturnType<typeof useHitDieChoice>;
function Sheet(){api=useHitDieChoice();return api.dialog;}
afterEach(cleanup);
it('shows actual availability and resolves the selected size',async()=>{
 render(<Sheet/>);let request!:Promise<6|8|10|12|null>;act(()=>{request=api.choose(hero,'Spend one die to improve the roll.');});
 expect(screen.getByRole('button',{name:'Spend 1d6 · 6 available'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Spend 1d10 · 2 available'}));
 await expect(request).resolves.toBe(10);expect(screen.queryByRole('dialog')).toBeNull();
});
it('replacement and navigation cancel only their own pending choices',async()=>{
 const {unmount}=render(<Sheet/>);let first!:Promise<6|8|10|12|null>,second!:Promise<6|8|10|12|null>;
 act(()=>{first=api.choose(hero,'First');});act(()=>{second=api.choose(hero,'Second');});
 await expect(first).resolves.toBeNull();unmount();await expect(second).resolves.toBeNull();
});
it('Escape cancels without returning a default die',async()=>{
 render(<Sheet/>);let request!:Promise<6|8|10|12|null>;act(()=>{request=api.choose(hero,'Choose a pool.');});
 fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:false,cancelable:true}));await expect(request).resolves.toBeNull();
});
