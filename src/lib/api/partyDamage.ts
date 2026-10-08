import {psionicRpc} from './psionicTurns';
import {readConcentrationResult,resolveConcentrationSave} from './concentrationSaves';
import {validPartyDamageContext,validPartyDamageRequest,verifyPartyDamageReceipt,type PartyDamageRequest,type PartyDamageReceipt} from '../partyDamageRequest';
export async function loadPartyDamageContext(campaignId:string,characterId:string){
 const value=await psionicRpc('get_party_damage_context',{p_campaign_id:campaignId,p_character_id:characterId},true);
 if(!validPartyDamageContext(value,campaignId,characterId))throw new Error('The damage preview could not be verified. Refresh before applying.');return value;
}
const args=(r:PartyDamageRequest)=>({p_campaign_id:r.campaignId,p_character_id:r.characterId,p_request_id:r.requestId,p_save_id:r.saveId,p_damage:r.damage,p_damage_type:r.damageType,p_modifier:r.modifier,p_expected:r.expected});
export async function submitPartyDamage(input:PartyDamageRequest):Promise<PartyDamageReceipt>{
 if(!validPartyDamageRequest(input))throw new Error('The saved damage is invalid. No new damage was sent.');const r=structuredClone(input);
 return verifyPartyDamageReceipt(await psionicRpc('apply_party_damage',args(r),true),r);
}
export async function cancelPartyDamage(input:PartyDamageRequest):Promise<boolean>{
 if(!validPartyDamageRequest(input))throw new Error('The saved damage is invalid.');const r=structuredClone(input);
 const v=await psionicRpc('cancel_party_damage',args(r),true) as {requestId?:string;characterId?:string;canceled?:boolean;replayed?:boolean}|null;
 if(!v||v.requestId!==r.requestId||v.characterId!==r.characterId||typeof v.canceled!=='boolean'||typeof v.replayed!=='boolean')throw new Error('Cancellation was not confirmed. Keep the saved damage.');return v.canceled;
}
/** v2.827: confirming a completed batch never rolls another concentration die. */
export async function settlePartyAutomaticSave(r:PartyDamageRequest,receipt:PartyDamageReceipt){
 if(receipt.automation!=='auto'||!receipt.checkId)return null;
 return await readConcentrationResult(r.characterId,receipt.checkId)??await resolveConcentrationSave(r.characterId,receipt.checkId,'player');
}
