import {getTargetSaveBonus} from './pendingAttack';
export class UnverifiedSaveBonusError extends Error {}
/** v2.869: preflight every target before declaring a batch or spending recharge.
 * An unverified zero is a review placeholder, never an automated modifier. */
export async function verifiedTargetSaves(targets:readonly {id:string;name:string}[],ability:string){
 const entries=await Promise.all(targets.map(async target=>{
  const result=await getTargetSaveBonus(target.id,ability);
  if(result.confidence!=='high'||!Number.isSafeInteger(result.bonus))throw new UnverifiedSaveBonusError(`Review ${target.name}’s ${ability} saving throw bonus before resolving.`);
  return [target.id,result] as const;
 }));
 return new Map(entries);
}
