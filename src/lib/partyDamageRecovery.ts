import {partyDamageUuid,validPartyDamageRequest,type PartyDamageRequest} from './partyDamageRequest';
export interface PartyDamageBatch {version:1;id:string;userId:string;campaignId:string;requests:PartyDamageRequest[]}
export const PARTY_DAMAGE_CHANGED='dndkeep:party-damage-changed';
const prefix=(user:string,campaign:string)=>`dndkeep:party-damage:${user}:${campaign}:`;
const key=(b:PartyDamageBatch)=>prefix(b.userId,b.campaignId)+b.id;
const notify=()=>window.dispatchEvent(new Event(PARTY_DAMAGE_CHANGED));
function valid(value:unknown,user:string,campaign:string):value is PartyDamageBatch {
 const b=value as PartyDamageBatch|null;
 return !!b&&b.version===1&&partyDamageUuid(b.id)&&partyDamageUuid(user)&&partyDamageUuid(campaign)&&b.userId===user&&b.campaignId===campaign
  &&Array.isArray(b.requests)&&b.requests.length>0&&b.requests.every(r=>validPartyDamageRequest(r)&&r.campaignId===campaign)
  &&new Set(b.requests.map(r=>r.characterId)).size===b.requests.length
  &&new Set(b.requests.flatMap(r=>[r.requestId,r.saveId])).size===b.requests.length*2;
}
export function savedPartyDamage(user:string,campaign:string):PartyDamageBatch[]{
 const result:PartyDamageBatch[]=[];
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);if(!k?.startsWith(prefix(user,campaign)))continue;
  let value:unknown;try{value=JSON.parse(localStorage.getItem(k)??'null');}catch{throw new Error('Saved party damage is unreadable. No new damage was sent.');}
  if(!valid(value,user,campaign)||key(value)!==k)throw new Error('Saved party damage could not be verified. No new damage was sent.');result.push(value);
 }
 return result.sort((a,b)=>a.id.localeCompare(b.id));
}
/** Unique keys preserve BOTH batches if two tabs create at the same instant. */
export function savePartyDamage(userId:string,campaignId:string,requests:PartyDamageRequest[]):PartyDamageBatch {
 if(savedPartyDamage(userId,campaignId).length)throw new Error('Confirm or cancel the saved damage first.');
 const batch:PartyDamageBatch={version:1,id:crypto.randomUUID(),userId,campaignId,requests:structuredClone(requests)};
 if(!valid(batch,userId,campaignId))throw new Error('The party damage could not be saved.');localStorage.setItem(key(batch),JSON.stringify(batch));notify();return batch;
}
export function forgetPartyDamage(batch:PartyDamageBatch){
 const existing=localStorage.getItem(key(batch));if(existing!==null&&existing!==JSON.stringify(batch))throw new Error('The saved damage changed. Refresh before continuing.');
 localStorage.removeItem(key(batch));notify();
}
