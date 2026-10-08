import {expect,it,vi} from 'vitest';
import {offerPsionicSurge} from './offerPsionicSurge';
import {testPsionicPersistence} from './psionicPersistence.testSupport';
import type {Character} from '../../../types';
const character={id:'psion',name:'Psion',class_name:'Psion',level:7,hit_dice_spent:0} as Character;
function setup(){return {roll:2,sides:8,feature:'Biofeedback',current:()=>character,active:()=>true,eligible:()=>true,persistence:testPsionicPersistence(()=>character),accept:vi.fn(),confirm:vi.fn(async()=>true),warn:vi.fn()};}
it('uses the confirmed server rolls and acknowledges the resource receipt',async()=>{
 const options=setup();expect(await offerPsionicSurge(options)).toMatchObject({roll:4,rolls:[4],usedSurge:true,unconfirmed:false});expect(options.accept).toHaveBeenCalledWith(expect.objectContaining({hitDiceSpent:1,hitDiceRevision:1}));
});
it('never grants improved dice when the server rejects the payment',async()=>{
 const options=setup();options.persistence.surge=vi.fn().mockRejectedValue(Object.assign(new Error('Not enough Hit Point Dice'),{definitelyNotPaid:true}));
 expect(await offerPsionicSurge(options)).toMatchObject({roll:2,usedSurge:false,unconfirmed:false});expect(options.accept).not.toHaveBeenCalled();expect(options.warn).toHaveBeenCalledWith('Not enough Hit Point Dice');
});
it('keeps the same request ID and rolls when confirming an unknown payment',async()=>{
 const options=setup(),pay=options.persistence.surge;options.persistence.surge=vi.fn().mockRejectedValueOnce(new Error('Lost response')).mockImplementation(pay);
 expect((await offerPsionicSurge(options))?.usedSurge).toBe(true);expect(options.persistence.surge).toHaveBeenCalledTimes(2);
 expect(vi.mocked(options.persistence.surge).mock.calls[0]).toEqual(vi.mocked(options.persistence.surge).mock.calls[1]);
});
it('marks unresolved payment so the parent cannot apply an uncertain result',async()=>{
 const options=setup();options.persistence.surge=vi.fn().mockRejectedValue(new Error('Offline'));options.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
 expect((await offerPsionicSurge(options))?.unconfirmed).toBe(true);expect(options.accept).not.toHaveBeenCalled();
});
it('retains a paid roll when its sheet closes during the server response',async()=>{
 const options=setup(),pay=options.persistence.surge;let active=true;options.active=()=>active;options.persistence.surge=async request=>{const receipt=await pay(request);active=false;return receipt;};
 expect((await offerPsionicSurge(options))?.usedSurge).toBe(true);expect(options.accept).not.toHaveBeenCalled();
});

const mixed={...character,secondary_class:'Fighter',secondary_level:3,hit_dice_spent:2,hit_dice_spent_by_type:{'6':1,'10':1}} as Character;
it('charges the explicitly selected size for a mixed pool',async()=>{
 const options=setup();options.current=()=>mixed;options.persistence.chooseHitDie=vi.fn(async()=>10 as const);
 options.persistence.surge=vi.fn(async request=>({requestId:request.requestId,rolls:[4],total:4,hitDiceSpent:3,hitDiceRevision:1,hitDiceSpentByType:{'6':1,'10':2},replayed:false}));
 expect((await offerPsionicSurge(options))?.usedSurge).toBe(true);
 expect(options.persistence.surge).toHaveBeenCalledWith(expect.objectContaining({hitDie:10}));expect(options.confirm).not.toHaveBeenCalled();
});
it('canceling the pool choice keeps the original roll and spends nothing',async()=>{
 const options=setup();options.current=()=>mixed;options.persistence.chooseHitDie=vi.fn(async()=>null);options.persistence.surge=vi.fn();
 expect(await offerPsionicSurge(options)).toMatchObject({roll:2,usedSurge:false});expect(options.persistence.surge).not.toHaveBeenCalled();
});
it('rechecks the chosen pool after another tab spends its last die',async()=>{
 let current=mixed;const options=setup();options.current=()=>current;options.persistence.surge=vi.fn();
 options.persistence.chooseHitDie=async()=>{current={...mixed,hit_dice_spent:4,hit_dice_spent_by_type:{'6':1,'10':3}};return 10;};
 expect(await offerPsionicSurge(options)).toBeNull();expect(options.persistence.surge).not.toHaveBeenCalled();expect(options.warn).toHaveBeenCalledWith('Resources changed. Psionic Surge was not applied.');
});
it('requires review before spending an ambiguous legacy mixed pool',async()=>{
 const options=setup();options.current=()=>({...mixed,hit_dice_spent_by_type:null});options.persistence.surge=vi.fn();
 expect(await offerPsionicSurge(options)).toMatchObject({usedSurge:false});expect(options.persistence.surge).not.toHaveBeenCalled();expect(options.warn).toHaveBeenCalledWith(expect.stringContaining('Review your spent Hit Dice'));
});
