import type {PsionicEffectRoll} from './api/psionicEffectRolls';
import type {CombatParticipant} from '../types';
import type {PsionicDamageContext} from './api/psionicDamage';
import {readPsionicDamageDice,psionicDamageComponent,type PsionicDamageDice} from '../rules/psionicDamageDice';
export interface PaidPsionicDamage {effectRollId?:string;requestId:string;characterId:string;characterName:string;amount:number;psionicDamageDice:PsionicDamageDice;targetName:string;target:CombatParticipant|null;context:PsionicDamageContext|null;queued:boolean}
const key=(id:string)=>`dndkeep:psionic-final-damage:${id}`;
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200;
function participant(v:unknown):v is CombatParticipant {const p=v as CombatParticipant|null;return !!p&&text(p.id)&&text(p.entity_id)&&['character','creature','monster','npc'].includes(p.participant_type)&&(p.combatant_id==null||text(p.combatant_id));}
function valid(v:unknown,id:string):v is PaidPsionicDamage {
 const r=v as PaidPsionicDamage|null,d=readPsionicDamageDice(r?.psionicDamageDice);
 if(!r||(r.effectRollId!==undefined&&r.effectRollId!==r.requestId)||r.characterId!==id||!text(r.requestId)||!text(r.characterName)||!text(r.targetName)||typeof r.queued!=='boolean'||!d||psionicDamageComponent(d).rawTotal!==r.amount)return false;
 if(r.context===null)return r.target===null&&!r.queued;
 const c=r.context;
 return !!c&&text(c.campaignId)&&text(c.encounterId)&&participant(c.self)&&c.self.participant_type==='character'&&c.self.entity_id===id&&participant(r.target)&&Array.isArray(c.participants)&&c.participants.some(p=>participant(p)&&p.id===r.target!.id&&p.entity_id===r.target!.entity_id&&p.participant_type===r.target!.participant_type&&(p.combatant_id??null)===(r.target!.combatant_id??null));
}
function compact(p:CombatParticipant):CombatParticipant {return {id:p.id,entity_id:p.entity_id,participant_type:p.participant_type,combatant_id:p.combatant_id??null,name:p.name} as CombatParticipant;}
/** v2.851: keep finalized dice and declaration identity before delivery. This
 * journal is recovery data, never evidence of payment or permission to write HP. */
export function readPaidPsionicDamage(id:string):PaidPsionicDamage|null {
 const raw=localStorage.getItem(key(id));if(raw===null)return null;
 let result:unknown;try{result=JSON.parse(raw);}catch{throw new Error('Saved Psychic damage could not be read. Keep your recorded result before rolling again.');}
 if(!valid(result,id))throw new Error('Saved Psychic damage could not be verified. Keep your recorded result before rolling again.');return result;
}
export function rememberPaidPsionicDamage(result:PaidPsionicDamage){
 if(!valid(result,result.characterId))throw new Error('The finalized Psychic damage could not be saved. Keep the displayed result.');
 const saved=readPaidPsionicDamage(result.characterId);
 if(saved&&saved.requestId!==result.requestId&&(result.queued||saved.context&&!saved.queued))throw new Error('Resolve the earlier saved Psychic damage before rolling again.');
 const target=result.target?compact(result.target):null;
 const value={...result,target,context:result.context?{campaignId:result.context.campaignId,encounterId:result.context.encounterId,self:compact(result.context.self),participants:[compact(result.context.self),target!]}:null};
 // Never substitute a different roll/target under an already-saved retry ID.
 if(saved?.requestId===result.requestId&&JSON.stringify({...saved,queued:false})!==JSON.stringify({...value,queued:false}))throw new Error('The saved Psychic damage changed. Keep the original result.');
 localStorage.setItem(key(result.characterId),JSON.stringify(value));
}
export function forgetPaidPsionicDamage(id:string,requestId:string){
 const saved=readPaidPsionicDamage(id);if(saved?.requestId!==requestId)throw new Error('The saved Psychic damage changed. Reopen the sheet before clearing it.');localStorage.removeItem(key(id));
}

export function psionicDamageEffectContext(characterName:string,targetName:string,target:CombatParticipant|null,context:PsionicDamageContext|null):Record<string,unknown>{
 const t=target?compact(target):null;return {characterName,targetName,target:t,context:context&&t?{campaignId:context.campaignId,encounterId:context.encounterId,self:compact(context.self),participants:[compact(context.self),t]}:null};
}
export function paidDamageFromEffect(row:PsionicEffectRoll):PaidPsionicDamage{
 const r={...row.context,effectRollId:row.requestId,requestId:row.requestId,characterId:row.characterId,amount:row.total,psionicDamageDice:{version:1,sides:row.sides,originalRolls:row.originalRolls,rolls:row.rolls,modifier:row.modifier},queued:false};
 if(row.discipline!=='destructive-thoughts'||!valid(r,row.characterId))throw new Error('The saved damage target could not be verified. Keep the dice for manual resolution.');return r;
}
