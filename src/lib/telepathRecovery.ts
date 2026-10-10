import {beginTelepathReaction,enhanceTelepathReaction,finishTelepathReaction,validTelepathRequest,validTelepathEnhancementRequest,validTelepathRecord,type TelepathRequest,type TelepathEnhancementRequest,type TelepathRecord} from './api/telepathLifecycle';
import {psionicDieSides} from '../rules/psionicRestoration';
export type PendingTelepath={kind:'begin';request:TelepathRequest}|{kind:'enhance';request:TelepathEnhancementRequest}|{kind:'finish'|'cancel';request:{declarationId:string}};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const key=(character:string)=>`dndkeep:telepath:${character}`;
const interrupted=()=>new Error('A saved Telepath request needs recovery. Keep this browser data; do not roll again.');
const valid=(value:unknown,character:string):value is PendingTelepath=>{
 const p=value as PendingTelepath|null;
 return !!p&&!!p.request&&(p.kind==='begin'?validTelepathRequest(p.request,character):p.kind==='enhance'?validTelepathEnhancementRequest(p.request):['finish','cancel'].includes(p.kind)&&uuid((p.request as {declarationId:string}).declarationId));
};
function identity(character:string){if(!uuid(character))throw new Error('Invalid Telepath character.');}
/** One pending request per character blocks contradictory outcomes and new dice.
 * Web Locks serialize both preparation and submission across tabs on this origin. */
async function locked<T>(character:string,task:()=>Promise<T>|T):Promise<T>{
 identity(character);if(typeof navigator==='undefined'||!navigator.locks)throw new Error('This browser cannot safely save Telepath requests. Use a supported secure browser.');
 return navigator.locks.request(key(character),task);
}
export function pendingTelepath(character:string):PendingTelepath|null{
 identity(character);const raw=localStorage.getItem(key(character));if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw interrupted();}
 if(!valid(value,character))throw interrupted();return value;
}
function remember(character:string,pending:PendingTelepath){
 if(!valid(pending,character))throw new Error('Invalid Telepath request.');
 const prior=localStorage.getItem(key(character)),encoded=JSON.stringify(pending);
 if(prior!==null&&prior!==encoded)throw interrupted();localStorage.setItem(key(character),encoded);
}
/** Marker is written before RNG. If a later write fails, reload cannot erase the
 * fact that dice were rolled. No network request starts during preparation. */
export function prepareTelepath(character:string,input:Omit<TelepathRequest,'roll'>,roll:()=>number){
 const request=structuredClone(input);
 return locked(character,()=>{
  if(!validTelepathRequest({...request,roll:1},character))throw new Error('Review the Telepath target before rolling.');
  if(pendingTelepath(character))throw interrupted();
  localStorage.setItem(key(character),JSON.stringify({kind:'preparing',requestId:request.requestId}));
  const pending:PendingTelepath={kind:'begin',request:{...request,roll:roll()}};
  if(!valid(pending,character))throw interrupted();localStorage.setItem(key(character),JSON.stringify(pending));return pending;
 });
}
export function prepareTelepathEnkindled(character:string,row:TelepathRecord,requestId:string,count:1|2,roll:()=>number){
 const saved=structuredClone(row);
 return locked(character,()=>{
  if(!validTelepathRecord(saved,character)||saved.result!==null||saved.psion_level!==20||saved.enhancements.length||!uuid(requestId)||requestId===saved.request_id||![1,2].includes(count))throw new Error('Review the saved Telepath enhancement before rolling.');
  if(pendingTelepath(character))throw interrupted();
  localStorage.setItem(key(character),JSON.stringify({kind:'preparing',requestId}));
  const extraRolls=Array.from({length:count},roll);
  const pending:PendingTelepath={kind:'enhance',request:{declarationId:saved.request_id,requestId,kind:'enkindled',extraRolls,hitDie:null}};
  if(!valid(pending,character)||extraRolls.some(n=>n>psionicDieSides(saved.psion_level)))throw interrupted();
  localStorage.setItem(key(character),JSON.stringify(pending));return pending;
 });
}
/** Every failure retains the draft: a later permission denial cannot prove that
 * an earlier lost reply did not commit. Only verified success clears this draft. */
export function sendTelepath(character:string,input:PendingTelepath){
 const pending=structuredClone(input);
 return locked(character,async()=>{
  remember(character,pending);
  const result=pending.kind==='begin'?await beginTelepathReaction(character,pending.request):pending.kind==='enhance'?await enhanceTelepathReaction(character,pending.request):await finishTelepathReaction(character,pending.request.declarationId,pending.kind==='cancel');
  if(localStorage.getItem(key(character))===JSON.stringify(pending)){
   try{localStorage.removeItem(key(character));}catch{/* The verified request can be replayed safely. */}
  }
  return result;
 });
}
