import type {PropelTechniqueChoice} from './api/propelTechniques';
export interface PendingPropelTechnique {declarationId:string;choice:PropelTechniqueChoice}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const prefix=(character:string)=>{if(!uuid(character))throw new Error('Invalid technique character.');return `dndkeep:propel-technique:${character}:`;};
const valid=(v:unknown):v is PendingPropelTechnique=>{
 const p=v as PendingPropelTechnique|null;return !!p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===2&&uuid(p.declarationId)&&['boost','disorient','bolt','none'].includes(p.choice);
};
const interrupted=()=>new Error('A saved technique choice could not be recovered. Keep this browser data and confirm the original Propel use.');
function read(key:string):PendingPropelTechnique|null{
 const raw=localStorage.getItem(key);if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw interrupted();}
 if(!valid(value)||!key.endsWith(':'+value.declarationId))throw interrupted();return value;
}
/** v2.869 — save before sending. A lost reply must not invite a new technique. */
export function rememberPropelTechnique(character:string,input:PendingPropelTechnique){
 if(!valid(input))throw new Error('Invalid technique choice.');
 const key=prefix(character)+input.declarationId,prior=read(key);
 if(prior&&prior.choice!==input.choice)throw new Error('Confirm the original technique choice before changing it.');
 localStorage.setItem(key,JSON.stringify({declarationId:input.declarationId,choice:input.choice}));
}
export function pendingPropelTechniques(character:string):PendingPropelTechnique[]{
 const scope=prefix(character),result:PendingPropelTechnique[]=[];
 for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);if(!key?.startsWith(scope))continue;
  const value=read(key);if(value)result.push(value);
 }
 return result;
}
/** Clear only the exact attempted choice after an authoritative receipt. A
 * failed cleanup is safe: the same request can be read/replayed next time. */
export function forgetPropelTechnique(character:string,confirmed:PendingPropelTechnique):boolean{
 if(!valid(confirmed))return false;
 try{const key=prefix(character)+confirmed.declarationId,prior=read(key);
  if(prior&&prior.choice!==confirmed.choice)return false;
  localStorage.removeItem(key);return true;
 }catch{return false;}
}
