import {beginTelepathReaction,enhanceTelepathReaction,finishTelepathReaction,validTelepathRequest,validTelepathEnhancementRequest,validTelepathRecord,type TelepathRequest,type TelepathEnhancementRequest,type TelepathRecord} from './api/telepathLifecycle';
import {replaySeededDice} from '../rules/dice';
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
type Preparation={kind:'preparing';version:2;attemptId:string}&(
 {operation:'begin';request:Omit<TelepathRequest,'roll'>}|
 {operation:'enkindled';requestId:string;count:1|2;declaration:TelepathRecord});
/** v2.869: only the versioned seed format is recoverable. Legacy markers have
 * no known dice; never manufacture faces or infer that a prior request failed. */
function prepared(character:string,value:unknown):PendingTelepath|null {
 const p=value as Preparation|null;if(!p||p.kind!=='preparing'||p.version!==2)return null;
 if(p.operation==='begin'){
  if(!p.request||!validTelepathRequest({...p.request,roll:1},character))return null;
  const faces=replaySeededDice(p.attemptId,psionicDieSides(p.request.expected.psionLevel),1);
  return faces?{kind:'begin',request:{...p.request,roll:faces[0]}}:null;
 }
 if(p.operation==='enkindled'){
  const r=p.declaration;
  if(!validTelepathRecord(r,character)||r.result!==null||r.psion_level!==20||r.enhancements.length||!uuid(p.requestId)||p.requestId===r.request_id||![1,2].includes(p.count))return null;
  const faces=replaySeededDice(p.attemptId,psionicDieSides(r.psion_level),p.count);
  return faces?{kind:'enhance',request:{declarationId:r.request_id,requestId:p.requestId,kind:'enkindled',extraRolls:faces,hitDie:null}}:null;
 }
 return null;
}
function decode(character:string,raw:string):PendingTelepath {
 let value:unknown;try{value=JSON.parse(raw);}catch{throw interrupted();}
 if(valid(value,character))return value;
 const restored=prepared(character,value);if(!restored)throw interrupted();return restored;
}
export function pendingTelepath(character:string):PendingTelepath|null{
 identity(character);const raw=localStorage.getItem(key(character));return raw===null?null:decode(character,raw);
}
const storageInterrupted=()=>new Error('Your saved Telepath request is still recoverable. Use the in-app Refresh and Retry saved request when browser storage is available. Do not clear site data.');
function remember(character:string,pending:PendingTelepath){
 if(!valid(pending,character))throw new Error('Invalid Telepath request.');
 const prior=localStorage.getItem(key(character)),encoded=JSON.stringify(pending);
 if(prior!==null&&JSON.stringify(decode(character,prior))!==encoded)throw interrupted();
 try{localStorage.setItem(key(character),encoded);}catch(cause){if(prior!==null)throw storageInterrupted();throw cause;}
}
/** Persist the entropy and reviewed context BEFORE calculating any die faces.
 * After the seed write succeeds, a crash is recoverable without a new seed.
 * No network request starts until the complete request is durably saved. */
function savePreparation(character:string,preparation:Preparation):PendingTelepath {
 localStorage.setItem(key(character),JSON.stringify(preparation));
 const pending=prepared(character,preparation);if(!pending)throw interrupted();
 remember(character,pending);return pending;
}
export function prepareTelepath(character:string,input:Omit<TelepathRequest,'roll'>){
 const request=structuredClone(input);
 return locked(character,()=>{
  if(!validTelepathRequest({...request,roll:1},character))throw new Error('Review the Telepath target before rolling.');
  if(pendingTelepath(character))throw interrupted();
  return savePreparation(character,{kind:'preparing',version:2,attemptId:crypto.randomUUID(),operation:'begin',request});
 });
}
export function prepareTelepathEnkindled(character:string,row:TelepathRecord,requestId:string,count:1|2){
 const saved=structuredClone(row);
 return locked(character,()=>{
  if(!validTelepathRecord(saved,character)||saved.result!==null||saved.psion_level!==20||saved.enhancements.length||!uuid(requestId)||requestId===saved.request_id||![1,2].includes(count))throw new Error('Review the saved Telepath enhancement before rolling.');
  if(pendingTelepath(character))throw interrupted();
  return savePreparation(character,{kind:'preparing',version:2,attemptId:crypto.randomUUID(),operation:'enkindled',requestId,count,declaration:saved});
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
