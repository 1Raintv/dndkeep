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
/** Store before sending; an uncertain reply must retain the exact roll/outcome. */
export function rememberPropel(characterId:string,pending:PendingPropel){
 if(!valid(pending))throw new Error('Invalid saved Propel request.');
 const key=prefix(characterId)+pending.request.requestId+':'+pending.kind,encoded=JSON.stringify(pending),prior=localStorage.getItem(key);
 if(prior!==null&&prior!==encoded)throw new Error('Confirm the original Propel request before changing it.');
 localStorage.setItem(key,encoded);
}
export function forgetPropel(characterId:string,pending:PendingPropel){try{localStorage.removeItem(prefix(characterId)+pending.request.requestId+':'+pending.kind);}catch{/* Exact replay remains safe. */}}
export function pendingPropel(characterId:string):PendingPropel[]{
 const result:PendingPropel[]=[];
 for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);if(!key?.startsWith(prefix(characterId)))continue;
  try{const value:unknown=JSON.parse(localStorage.getItem(key)??'null');if(valid(value)&&key===prefix(characterId)+value.request.requestId+':'+value.kind)result.push(value);}catch{/* Never execute malformed storage. */}
 }
 return result;
}
