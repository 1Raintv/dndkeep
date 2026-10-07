import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({log:vi.fn()}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
import {offerPsionicSurge} from './offerPsionicSurge';
import type {Character} from '../../../types';
const character={id:'psion',name:'Psion',class_name:'Psion',level:7,hit_dice_spent:0} as Character;
afterEach(()=>vi.resetAllMocks());
it('returns the paid improved roll without waiting for history delivery',async()=>{
 let finish!:()=>void;mocks.log.mockReturnValue(new Promise<void>(resolve=>{finish=resolve;}));
 const update=vi.fn(),warn=vi.fn();let result:unknown;
 const pending=offerPsionicSurge({roll:2,sides:8,feature:'Biofeedback',current:()=>character,active:()=>true,eligible:()=>true,update,confirm:async()=>true,warn}).then(value=>{result=value;});
 // Flush the confirmation and result microtasks while history is still pending.
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 try {expect(update).toHaveBeenCalledWith({hit_dice_spent:1});expect(result).toEqual({roll:4,rolls:[4],usedSurge:true});}
 finally {finish();await pending;}
});
it('keeps the paid result and reports a rejected history write',async()=>{
 mocks.log.mockRejectedValue(new Error('offline'));const warn=vi.fn(),update=vi.fn();
 const result=await offerPsionicSurge({roll:2,sides:8,feature:'Biofeedback',current:()=>character,active:()=>true,eligible:()=>true,update,confirm:async()=>true,warn});
 expect(result).toEqual({roll:4,rolls:[4],usedSurge:true});expect(update).toHaveBeenCalledTimes(1);expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be saved'));
});
