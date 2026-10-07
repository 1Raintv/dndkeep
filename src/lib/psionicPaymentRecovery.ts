import type {EnkindledRequest,SurgeRequest,EnergyRequest} from './api/psionicTurns';
export type PendingPsionicPayment={kind:'enkindled';request:EnkindledRequest}|{kind:'surge';request:SurgeRequest}|{kind:'energy';request:EnergyRequest};
export const PSIONIC_PAYMENT_CHANGED='dndkeep:psionic-payment-changed';
const activePayments=new Set<string>();
const prefix=(characterId:string)=>`dndkeep:psionic-payment:${characterId}:`;
const dice=(value:unknown,max:number)=>Array.isArray(value)&&value.length>0&&value.length<=max&&value.every(n=>Number.isInteger(n)&&n>=1&&n<=12);
function valid(value:unknown):value is PendingPsionicPayment{
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>,r=v.request as Record<string,unknown>|undefined;
 if(!r||typeof r!=='object'||typeof r.requestId!=='string'||!r.requestId||typeof r.sourceFeature!=='string'||r.sourceFeature.length>120)return false;
 if(r.recoveryNote!==undefined&&(typeof r.recoveryNote!=='string'||r.recoveryNote.length>1000))return false;
 if(v.kind==='surge')return dice(r.rolls,14);
 if(v.kind==='energy')return Array.isArray(r.rolls)&&(
  (r.operation==='recover-die'&&r.count===1&&r.rolls.length===0&&r.sourceFeature==='Manual Energy Die recovery')||
  ((r.operation==='refresh-misty-step'||r.operation==='use-misty-step'||r.operation==='recover-misty-step')&&r.count===(r.operation==='refresh-misty-step'?1:0)&&r.rolls.length===0&&r.sourceFeature==='Free Misty Step (Teleportation)')||
  (r.operation==='connection'&&(r.count===0||r.count===1)&&dice(r.rolls,1)&&r.sourceFeature==='Telepathic Connection')||
  (r.operation==='restore'&&r.count===0&&r.rolls.length===0&&r.sourceFeature==='Psionic Restoration')||
  (r.operation==='spend'&&Number.isInteger(r.count)&&Number(r.count)>=1&&Number(r.count)<=12&&
   (r.rolls.length===0||(dice(r.rolls,12)&&r.rolls.length===r.count))));
 if(v.kind!=='enkindled'||!Number.isInteger(r.count)||Number(r.count)<1||Number(r.count)>2||!dice(r.baseRolls,12)||!dice(r.extraRolls,2)||(r.extraRolls as unknown[]).length!==r.count)return false;
 const turn=r.turn as Record<string,unknown>|undefined;
 return !!turn&&typeof turn==='object'&&(
  (Number.isSafeInteger(turn.soloTurn)&&Number(turn.soloTurn)>=0)||
  (typeof turn.encounterId==='string'&&typeof turn.turnId==='string'&&Number.isSafeInteger(turn.round)&&Number(turn.round)>=0&&Number.isSafeInteger(turn.index)&&Number(turn.index)>=0));
}
export function setPsionicPaymentActive(characterId:string,requestId:string,active:boolean){
 const key=prefix(characterId)+requestId;if(active)activePayments.add(key);else activePayments.delete(key);
 window.dispatchEvent(new Event(PSIONIC_PAYMENT_CHANGED));
}
/** Save before sending payment. A closed tab must not lose the request ID or
 * roll values needed to safely confirm an ambiguous server response. */
export function rememberPsionicPayment(characterId:string,payment:PendingPsionicPayment){
 if(!valid(payment))throw new Error('Invalid saved Psion payment');
 localStorage.setItem(prefix(characterId)+payment.request.requestId,JSON.stringify(payment));
 window.dispatchEvent(new Event(PSIONIC_PAYMENT_CHANGED));
}
export function forgetPsionicPayment(characterId:string,requestId:string){
 // A leftover entry is safe: confirming it replays the identical transaction.
 try{localStorage.removeItem(prefix(characterId)+requestId);window.dispatchEvent(new Event(PSIONIC_PAYMENT_CHANGED));}catch{/* retain recovery rather than fail an already-paid result */}
}
export function pendingPsionicPayments(characterId:string):PendingPsionicPayment[]{
 const entries:PendingPsionicPayment[]=[];
 try{for(let index=0;index<localStorage.length;index++){
  const key=localStorage.key(index);if(!key?.startsWith(prefix(characterId))||activePayments.has(key))continue;
  try{const value:unknown=JSON.parse(localStorage.getItem(key)??'null');if(valid(value)&&key===prefix(characterId)+value.request.requestId)entries.push(value);}catch{/* malformed browser storage is not executable or a payment request */}
 }}catch{/* storage unavailable: payment is blocked before it is sent */}
 return entries;
}

/** A failed preflight cannot prove an earlier ambiguous request was unpaid. */
export function hasSavedPsionicPayment(characterId:string,requestId:string){
 try{return localStorage.getItem(prefix(characterId)+requestId)!==null;}catch{return true;}
}
