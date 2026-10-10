import type {PropelRecord} from './api/psionicPropel';
import {availablePropelTechniques,choosePropelTechnique,closePropelTechnique,type PropelTechniqueChoice,type PropelTechniqueReceipt} from './api/propelTechniques';
import {forgetPropelTechnique,pendingPropelTechniques,rememberPropelTechnique,requestPropelTechniqueClosure} from './propelTechniqueRecovery';
/** v2.869 — persistence precedes the network request. Any uncertain failure
 * keeps its choice; an authoritative server receipt alone clears recovery. */
export async function confirmPropelTechnique(input:PropelRecord,choice:PropelTechniqueChoice):Promise<PropelTechniqueReceipt>{
 const row=structuredClone(input),options=availablePropelTechniques(row);
 if(!options.length||(choice!=='none'&&!options.some(o=>o.kind===choice)))throw new Error('This saved Propel cannot use that technique.');
 const pending={declarationId:row.request_id,choice};rememberPropelTechnique(row.character_id,pending);
 const receipt=await choosePropelTechnique(row,choice);
 if(!receipt)throw new Error('The saved technique could not be confirmed. Retry the original choice.');
 forgetPropelTechnique(row.character_id,pending);return receipt;
}
/** Read before resending: another tab may already have saved a different
 * technique. Show that immutable result rather than retrying a losing choice. */
export async function resumePropelTechnique(input:PropelRecord):Promise<PropelTechniqueReceipt|null>{
 const row=structuredClone(input),pending=pendingPropelTechniques(row.character_id).find(p=>p.declarationId===row.request_id);
 const receipt=await choosePropelTechnique(row);
 if(receipt){if(pending)forgetPropelTechnique(row.character_id,pending);return receipt;}
 if(pending?.closeRequested)return closePendingPropelTechnique(row);
 return pending?confirmPropelTechnique(row,pending.choice):null;
}

export async function closePendingPropelTechnique(input:PropelRecord):Promise<PropelTechniqueReceipt>{
 const row=structuredClone(input),pending=requestPropelTechniqueClosure(row.character_id,row.request_id);
 const receipt=await closePropelTechnique(row);
 forgetPropelTechnique(row.character_id,pending);return receipt;
}
