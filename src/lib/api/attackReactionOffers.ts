import {psionicRpc,PsionicRequestError} from './psionicTurns';
export type AttackReactionWindow='post_attack_roll'|'post_damage_roll'|'pre_damage_applied';
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** v2.869: null keys read a saved batch; [] records a verified empty batch.
 * Retries return the current outcome revision’s committed batch. A changed roll
 * needs a new check; existing offer decisions and deadlines are never reset. */
export async function attackReactionOffers(attackId:string,triggerPoint:AttackReactionWindow,updatedAt:string|null,keys:readonly string[]|null):Promise<number|null>{
 if(!uuid(attackId)||!['post_attack_roll','post_damage_roll','pre_damage_applied'].includes(triggerPoint)
  ||keys!==null&&(!updatedAt||!Number.isFinite(Date.parse(updatedAt))||keys.length>4||keys.some(k=>!(triggerPoint==='post_attack_roll'?k==='shield':triggerPoint==='post_damage_roll'&&['uncanny_dodge','absorb_elements','hellish_rebuke'].includes(k)))))
  throw new PsionicRequestError('Invalid attack reaction request.',true);
 const result=await psionicRpc('attack_reaction_offers',{p_attack_id:attackId,p_trigger:triggerPoint,p_expected_updated_at:updatedAt,p_keys:keys===null?null:[...new Set(keys)].sort()},true);
 if(result===null&&keys===null)return null;
 const r=result as {attackId?:unknown;triggerPoint?:unknown;offerCount?:unknown}|null;
 if(!r||r.attackId!==attackId||r.triggerPoint!==triggerPoint||!Number.isSafeInteger(r.offerCount)||Number(r.offerCount)<0||Number(r.offerCount)>4)
  throw new PsionicRequestError('Reaction offers could not be confirmed. Review this attack before continuing.',false);
 return Number(r.offerCount);
}
