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
/** v2.869: persist a marker before RNG. A failed final write must not let a
 * reload replace dice that were already rolled. No server request starts here. */
export function preparePropel(characterId:string,input:Omit<PropelRequest,'roll'>,roll:()=>number):PendingPropel {
 const declaration=structuredClone(input);
 if(!validPropelRequest({...declaration,roll:declaration.mode==='free'?0:1}))throw new Error('Invalid Propel declaration.');
 if(pendingPropel(characterId).length)throw new Error('Confirm the original Propel request before declaring again.');
 const key=prefix(characterId)+declaration.requestId+':begin';
 localStorage.setItem(key,JSON.stringify({kind:'preparing',requestId:declaration.requestId}));
 const pending:PendingPropel={kind:'begin',request:{...declaration,roll:declaration.mode==='free'?0:roll()}};
 if(!valid(pending))throw interrupted();
 // Replace only our interruption marker. Generic rememberPropel deliberately
 // refuses overwriting any existing request with different dice or outcomes.
 localStorage.setItem(key,JSON.stringify(pending));
 return pending;
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
  let value:unknown;try{value=JSON.parse(localStorage.getItem(key)??'null');}catch{throw interrupted();}
  if(!valid(value)||key!==prefix(characterId)+value.request.requestId+':'+value.kind)throw interrupted();
  result.push(value);
 }
 return result;
}
