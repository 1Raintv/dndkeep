import {testPsionicPersistence} from './psionicPersistence.testSupport';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({roll:vi.fn(),log:vi.fn()}));
vi.mock('../../../rules/dice',()=>({rollDie:mocks.roll}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
import {offerPsionicRollEnhancements} from './offerPsionicRollEnhancements';
import type {Character} from '../../../types';
beforeEach(()=>{vi.resetAllMocks();mocks.roll.mockReturnValue(2);mocks.log.mockResolvedValue(undefined);});
function setup(spent=0){
 let character={id:'psion',name:'Psion',class_name:'Psion',level:20,hit_dice_spent:spent} as Character;
 const update=vi.fn(patch=>{character={...character,...patch};});
 return {roll:2,sides:12,feature:'Biofeedback',current:()=>character,active:()=>true,eligible:()=>true,update,persistence:testPsionicPersistence(()=>character),accept:(receipt:{hitDiceSpent:number})=>update({hit_dice_spent:receipt.hitDiceSpent}),prompt:vi.fn(async()=> '2'),confirm:vi.fn(async()=>true),warn:vi.fn()};
}
it('pays two Hit Point Dice, then one Surge for base and extra dice together',async()=>{
 const options=setup();const result=await offerPsionicRollEnhancements(options);
 expect(result).toEqual({roll:12,rolls:[4,4,4],originalRolls:[2,2,2],enkindledRolls:[2,2],usedSurge:true,unconfirmed:false});
 expect(options.update.mock.calls).toEqual([[{hit_dice_spent:2}],[{hit_dice_spent:3}]]);expect(mocks.roll).toHaveBeenCalledTimes(2);
});
it('uses the last Hit Point Dice without inventing another for Surge',async()=>{
 const options=setup(18);const result=await offerPsionicRollEnhancements(options);expect(result?.roll).toBe(6);expect(result?.usedSurge).toBe(false);expect(options.confirm).not.toHaveBeenCalled();expect(options.update).toHaveBeenCalledTimes(1);
});
it('declines extra dice without consuming them and still permits Surge',async()=>{
 const options=setup();options.prompt.mockResolvedValue('0');const result=await offerPsionicRollEnhancements(options);expect(result?.roll).toBe(4);expect(result?.enkindledRolls).toEqual([]);expect(options.update).toHaveBeenCalledWith({hit_dice_spent:1});expect(mocks.roll).not.toHaveBeenCalled();
});
it('rechecks resources during the choice and keeps the original roll',async()=>{
 const options=setup(19);options.prompt.mockImplementation(async()=>{options.update({hit_dice_spent:20});return '1';});const result=await offerPsionicRollEnhancements(options);expect(result?.roll).toBe(2);expect(mocks.roll).not.toHaveBeenCalled();expect(options.warn).toHaveBeenCalled();
});
it('leaves capstone history inside the saved transaction instead of duplicating it',async()=>{
 mocks.log.mockReturnValue(new Promise(()=>{}));const options=setup(18);expect((await offerPsionicRollEnhancements(options))?.roll).toBe(6);expect(mocks.log).not.toHaveBeenCalled();
});
it('keeps paid extra dice when the sheet closes during the later Surge decision',async()=>{
 const options=setup();let active=true;options.active=()=>active;options.confirm.mockImplementation(async()=>{active=false;return false;});
 expect((await offerPsionicRollEnhancements(options))?.roll).toBe(6);expect(options.update).toHaveBeenCalledTimes(1);
});

it('does not read another character or begin an enhancement after its caller closes',async()=>{
 const options=setup();options.active=()=>false;options.current=vi.fn(()=>{throw new Error('stale character read');});
 expect(await offerPsionicRollEnhancements(options)).toBeNull();expect(options.current).not.toHaveBeenCalled();
 expect(options.prompt).not.toHaveBeenCalled();expect(options.confirm).not.toHaveBeenCalled();expect(options.update).not.toHaveBeenCalled();
});

it('carries one Sharpened activation through both enhancement payments',async()=>{
 const options={...setup(),feature:'Sharpened Mind',activationId:'11111111-1111-4111-8111-111111111111'};
 options.persistence.spend=vi.fn(options.persistence.spend);options.persistence.surge=vi.fn(options.persistence.surge);
 expect((await offerPsionicRollEnhancements(options))?.roll).toBe(12);
 expect(options.persistence.spend).toHaveBeenCalledWith(expect.objectContaining({activationId:options.activationId,baseRolls:[2],extraRolls:[2,2]}));
 expect(options.persistence.surge).toHaveBeenCalledWith(expect.objectContaining({activationId:options.activationId,rolls:[2,2,2]}));
});
