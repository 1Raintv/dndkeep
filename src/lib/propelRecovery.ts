import {replaySeededDice} from '../rules/dice';
import {validPropelSave,type PropelSaveDetails} from '../rules/propelSaveDetails';
import type {PropelRequest,PropelOutcome} from './api/psionicPropel';
import {validPropelRequest} from './api/psionicPropel';
export type PendingPropel={kind:'begin';request:PropelRequest}|{kind:'finish';request:{requestId:string;outcome:PropelOutcome;save?:PropelSaveDetails|null}};
const prefix=(characterId:string)=>`dndkeep:propel:${characterId}:`;
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function valid(v:unknown):v is PendingPropel{
 const p=v as PendingPropel|null;
 return !!p&&!!p.request&&(p.kind==='begin'?validPropelRequest(p.request):p.kind==='finish'&&uuid(p.request.requestId)&&['passed','failed','cancelled'].includes(p.request.outcome)&&validPropelSave(p.request.save,p.request.outcome,p.request.save?.participantId));
}
const interrupted=()=>new Error('A saved Propel use could not be recovered. Keep this browser data; do not roll or declare again.');
type Preparation={kind:'preparing';version:2;attemptId:string;sides:number;request:Omit<PropelRequest,'roll'>};
function decode(raw:string):PendingPropel {
 let value:unknown;try{value=JSON.parse(raw);}catch{throw interrupted();}
 if(valid(value))return value;
 const p=value as Preparation|null;
 if(!p||p.kind!=='preparing'||p.version!==2||!p.request||!validPropelRequest({...p.request,roll:1})
  ||!(p.request.mode==='technique'?p.sides===4:p.request.mode==='powered'&&[6,8,10,12].includes(p.sides)))throw interrupted();
 const faces=replaySeededDice(p.attemptId,p.sides,1);if(!faces)throw interrupted();
 return {kind:'begin',request:{...p.request,roll:faces[0]}};
}
const recoverable=()=>new Error('Your original Propel roll is saved. Reopen Propel and confirm the saved use when browser storage is available. Do not clear site data.');
/** v2.869: save entropy and target BEFORE deriving a die face. A reload can
 * reconstruct the original request after the final storage write fails.
 * Legacy seedless markers stay blocked; no replacement roll is invented. */
export function preparePropel(characterId:string,input:Omit<PropelRequest,'roll'>,sides:number):PendingPropel {
 const declaration=structuredClone(input);
 if(!validPropelRequest({...declaration,roll:declaration.mode==='free'?0:1})
  ||(declaration.mode==='powered'&&![6,8,10,12].includes(sides))
  ||(declaration.mode==='technique'&&sides!==4))throw new Error('Invalid Propel declaration.');
 if(pendingPropel(characterId).length)throw new Error('Confirm the original Propel request before declaring again.');
 if(declaration.mode==='free'){
  const pending:PendingPropel={kind:'begin',request:{...declaration,roll:0}};
  rememberPropel(characterId,pending);return pending;
 }
 const key=prefix(characterId)+declaration.requestId+':begin';
 const preparation:Preparation={kind:'preparing',version:2,attemptId:crypto.randomUUID(),sides,request:declaration};
 const encoded=JSON.stringify(preparation);
 localStorage.setItem(key,encoded);
 const pending=decode(encoded);
 try{localStorage.setItem(key,JSON.stringify(pending));}catch{throw recoverable();}
 return pending;
}
/** Store before sending; an uncertain reply must retain the exact roll/outcome. */
export function rememberPropel(characterId:string,pending:PendingPropel){
 if(!valid(pending))throw new Error('Invalid saved Propel request.');
 const key=prefix(characterId)+pending.request.requestId+':'+pending.kind,encoded=JSON.stringify(pending),prior=localStorage.getItem(key);
 if(prior!==null&&JSON.stringify(decode(prior))!==encoded)throw new Error('Confirm the original Propel request before changing it.');
 try{localStorage.setItem(key,encoded);}catch(cause){if(prior!==null)throw recoverable();throw cause;}
}
export function forgetPropel(characterId:string,pending:PendingPropel){try{localStorage.removeItem(prefix(characterId)+pending.request.requestId+':'+pending.kind);}catch{/* Exact replay remains safe. */}}
export function pendingPropel(characterId:string):PendingPropel[]{
 const result:PendingPropel[]=[];
 for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);if(!key?.startsWith(prefix(characterId)))continue;
  const value=decode(localStorage.getItem(key)??'null');
  if(key!==prefix(characterId)+value.request.requestId+':'+value.kind)throw interrupted();
  result.push(value);
 }
 return result;
}
