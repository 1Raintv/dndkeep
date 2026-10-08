import {hoursToRounds} from '../buffDuration';
import {psionicRpc,PsionicRequestError} from './psionicTurns';
export interface CampaignTimeRequest {requestId:string;campaignId:string;unit:'rounds'|'seconds';amount:number;scale:number}
export interface CampaignTimeReceipt {requestId:string;campaignId:string;beforeRounds:number;afterRounds:number;advancedRounds:number;secondsPerRound:number;replayed:boolean}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2147483647;
export function validCampaignTimeRequest(value:unknown):value is CampaignTimeRequest {
 const r=value as CampaignTimeRequest|null;
 return !!r&&uuid(r.requestId)&&uuid(r.campaignId)&&['rounds','seconds'].includes(r.unit)
  &&count(r.amount)&&r.amount>=1&&r.amount<=86400&&count(r.scale)&&r.scale>=1&&r.scale<=600;
}
/** v2.834: retry only the identical saved request; never create a replacement ID here. */
export async function advanceCampaignTime(input:CampaignTimeRequest):Promise<CampaignTimeReceipt>{
 if(!validCampaignTimeRequest(input))throw new PsionicRequestError('Invalid saved time advance. No request was sent.',true);
 const r=structuredClone(input);
 const value=await psionicRpc('advance_campaign_time',{p_campaign_id:r.campaignId,p_request_id:r.requestId,p_unit:r.unit,p_amount:r.amount,p_expected_scale:r.scale},true) as CampaignTimeReceipt|null;
 const expected=r.unit==='rounds'?r.amount:hoursToRounds(r.amount/3600,r.scale);
 if(!value||value.requestId!==r.requestId||value.campaignId!==r.campaignId||typeof value.replayed!=='boolean'
  ||!count(value.beforeRounds)||!count(value.afterRounds)||value.advancedRounds!==expected||expected<1
  ||value.afterRounds!==value.beforeRounds+expected||value.secondsPerRound!==r.scale)
  throw new PsionicRequestError('Time advance could not be confirmed. Keep the saved request and retry it.',false);
 if(typeof window!=='undefined')window.dispatchEvent(new Event('dndkeep:sharpened-roll-changed'));
 return value;
}
