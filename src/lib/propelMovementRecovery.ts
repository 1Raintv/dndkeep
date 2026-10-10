import type {PropelMovementChoice} from './api/propelMovement';
export interface PendingPropelMovement {declarationId:string;choice:PropelMovementChoice|null;closing:boolean}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const prefix=(character:string)=>{if(!uuid(character))throw new Error('Invalid movement character.');return `dndkeep:propel-movement:${character}:`;};
const valid=(v:unknown):v is PendingPropelMovement=>{
 const p=v as PendingPropelMovement|null;return !!p&&Object.keys(p).length===3&&uuid(p.declarationId)&&typeof p.closing==='boolean'
  &&(['push','warp'].includes(p.choice??'')||p.choice===null&&p.closing);
};
function read(key:string){
 const raw=localStorage.getItem(key);if(raw===null)return null;
 let p:unknown;try{p=JSON.parse(raw);}catch{throw new Error('Saved movement is unreadable. Keep browser data and review the original use.');}
 if(!valid(p)||!key.endsWith(':'+p.declarationId))throw new Error('Saved movement could not be verified. Keep browser data.');return p;
}
/** Save intent before sending; closing preserves any earlier uncertain choice. */
export function rememberPropelMovement(character:string,id:string,choice:PropelMovementChoice|null):PendingPropelMovement{
 if(!uuid(id)||(choice!==null&&!['push','warp'].includes(choice)))throw new Error('Invalid movement choice.');
 const key=prefix(character)+id,prior=read(key);
 if(choice!==null&&prior&&(prior.closing||prior.choice!==choice))throw new Error('Confirm or close the original movement choice first.');
 const pending={declarationId:id,choice:choice??prior?.choice??null,closing:choice===null};
 localStorage.setItem(key,JSON.stringify(pending));return pending;
}
export function pendingPropelMovements(character:string):PendingPropelMovement[]{
 const scope=prefix(character),result:PendingPropelMovement[]=[];
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(scope)){const p=read(key);if(p)result.push(p);}}return result;
}
export function forgetPropelMovement(character:string,confirmed:PendingPropelMovement){
 try{const key=prefix(character)+confirmed.declarationId,prior=read(key);
  if(prior&&(prior.choice!==confirmed.choice||prior.closing!==confirmed.closing))return false;
  localStorage.removeItem(key);return true;
 }catch{return false;}
}
