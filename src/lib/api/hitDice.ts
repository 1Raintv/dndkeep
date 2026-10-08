import {supabase} from '../supabase';
import {isHitDiceAllocation} from '../../rules/hitDice';
export interface HitDiceReceipt {hitDiceSpent:number;hitDiceSpentByType:Record<string,number>;hitDiceRevision:number}
/** Review changes allocation only. An exact retry acknowledges the same counts;
 * its captured revision must never be replaced with a newer sheet revision. */
export async function reviewHitDice(characterId:string,expectedRevision:number,counts:Record<string,number>,spent:number):Promise<HitDiceReceipt>{
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!isHitDiceAllocation(counts,spent))throw new Error('Check the spent Hit Dice before saving.');
 const args={p_character_id:characterId,p_expected_revision:expectedRevision,p_spent_by_type:counts};
 const {data,error}=await (supabase as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:Record<string,unknown>|null;error:{message:string}|null}>}).rpc('review_hit_dice_pool',args);
 if(error)throw new Error(error.message);
 if(!data||data.id!==characterId||data.hit_dice_spent!==spent||!Number.isSafeInteger(data.psionic_hit_dice_revision)||Number(data.psionic_hit_dice_revision)<expectedRevision
  ||!isHitDiceAllocation(data.hit_dice_spent_by_type,spent))throw new Error('The Hit Dice review could not be confirmed. Retry the same review or reload.');
 const allocation=data.hit_dice_spent_by_type;
 if(Object.keys({...counts,...allocation}).some(key=>(counts[key]??0)!==(allocation[key]??0)))throw new Error('The Hit Dice review could not be confirmed. Retry the same review or reload.');
 return {hitDiceSpent:spent,hitDiceSpentByType:data.hit_dice_spent_by_type,hitDiceRevision:Number(data.psionic_hit_dice_revision)};
}
