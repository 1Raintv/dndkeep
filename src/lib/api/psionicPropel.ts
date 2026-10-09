import {notifyActionBudgetChanged} from './actionBudget';
import {validPropelSave,type PropelSaveDetails} from '../../rules/propelSaveDetails';
import type {Character} from '../../types';
import type {ActionClaim} from '../../rules/actionBudget';
import {psionProgression} from '../../rules/psionProgression';
import {psionicDieSides} from '../../rules/psionicRestoration';
import {psionicRpc,PsionicRequestError,type EnergyReceipt,type PsionicTurn} from './psionicTurns';
export interface PropelTarget {participantId?:string|null;name?:string;legalTargetConfirmed:true}
export interface PropelRequest {requestId:string;turnId:string;mode:'free'|'powered'|'technique';movement:'push'|'warp';roll:number;target:PropelTarget}
export interface PropelRoll {declarationId:string;originalRolls:number[];enkindledRolls:number[];usedSurge:boolean;rolls:number[];total:number}
export type PropelOutcome='passed'|'failed'|'cancelled';
export interface PropelRecord {
 request_id:string;character_id:string;request:Omit<PropelRequest,'requestId'>&{roll:number};
 source_feature:'Telekinetic Propel'|'Warp Propel';mode:PropelRequest['mode'];movement:PropelRequest['movement'];base_roll:number;psion_level:number;
 target:PropelTarget;caster_snapshot:Character;created_at:string;
 turn_context:PsionicTurn;
 action_receipt:{claim:ActionClaim;replayed:boolean;attackLimit:null};roll_result:PropelRoll|null;
 save_details:PropelSaveDetails|null;
 outcome:PropelOutcome|null;result:null|{declarationId:string;outcome:PropelOutcome;energyCost:number;energy:EnergyReceipt|null;feet:number;movement:PropelRequest['movement'];target:PropelTarget;roll:PropelRoll|null;action:PropelRecord['action_receipt'];replayed:boolean};
 replayed?:boolean;
}
export interface PropelContext {actorId:string;turnId:string;ownerTurnId:string;isOwnTurn:boolean;encounterId:string|null;participantId:string|null;bonusAvailable:boolean}
export interface PropelCursor {createdAt:string;requestId:string}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const date=(v:unknown):v is string=>text(v)&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
// Postgres cursors preserve microseconds; Date alone truncates them and can
// reject legitimate older rows in the same millisecond.
const micros=(v:string)=>Number((v.match(/\.(\d+)/)?.[1]??'').padEnd(6,'0').slice(3,6));
const timeOrder=(a:string,b:string)=>Date.parse(a)-Date.parse(b)||micros(a)-micros(b);
const older=(r:PropelRecord,c:PropelCursor)=>timeOrder(r.created_at,c.createdAt)<0||(timeOrder(r.created_at,c.createdAt)===0&&r.request_id<c.requestId);
const invalid=()=>new PsionicRequestError('The saved Propel result could not be verified. Keep its request; do not roll or spend again.',false);
function validateIds(character:string,id?:string){if(!uuid(character)||(id!==undefined&&!uuid(id)))throw new PsionicRequestError('Invalid Propel identity. No request was sent.',true);}
function validTarget(t:PropelTarget|null|undefined){return !!t&&t.legalTargetConfirmed===true&&(t.participantId!=null?uuid(t.participantId):text(t.name)&&t.name.length<=120);}
export function validPropelRequest(r:PropelRequest){return uuid(r.requestId)&&text(r.turnId)&&['free','powered','technique'].includes(r.mode)&&['push','warp'].includes(r.movement)&&integer(r.roll,r.mode==='free'?0:1,r.mode==='free'?0:r.mode==='technique'?4:12)&&validTarget(r.target);}
function validRoll(v:PropelRoll|null,record:PropelRecord):boolean{
 if(!v||v.declarationId!==record.request_id||typeof v.usedSurge!=='boolean'||!Array.isArray(v.enkindledRolls)||!Array.isArray(v.originalRolls)||!Array.isArray(v.rolls))return false;
 const sides=psionicDieSides(record.psion_level),base=record.mode==='free'?[]:[record.base_roll];
 if(v.enkindledRolls.length>2||(v.enkindledRolls.length>0&&(record.mode!=='powered'||record.psion_level!==20))
  ||v.enkindledRolls.some(n=>!integer(n,1,sides))||(v.usedSurge&&(record.mode!=='powered'||record.psion_level<7)))return false;
 const original=[...base,...v.enkindledRolls];return JSON.stringify(v.originalRolls)===JSON.stringify(original)&&v.rolls.length===original.length
  &&v.rolls.every((n,i)=>n===(v.usedSurge?Math.max(4,original[i]):original[i]))&&v.total===v.rolls.reduce((a,b)=>a+b,0);
}
/** A success is not an acknowledgement until its saved identity, action, dice
 * and conditional payment agree. Malformed successes stay recoverable. */
export function validPropelRecord(value:unknown,characterId:string):value is PropelRecord{
 const r=value as PropelRecord|null;
 if(!r||!uuid(r.request_id)||r.character_id!==characterId||!r.request||!validPropelRequest({...r.request,requestId:r.request_id})
  ||r.mode!==r.request.mode||r.movement!==r.request.movement||r.base_roll!==r.request.roll||!integer(r.psion_level,1,20)
  ||r.caster_snapshot?.id!==characterId||psionProgression(r.caster_snapshot)?.level!==r.psion_level||!date(r.created_at)
  ||!validTarget(r.target)||(r.target.participantId??null)!==(r.request.target.participantId??null)
  ||(r.target.participantId==null&&r.target.name!==r.request.target.name)||r.source_feature!==(r.movement==='warp'?'Warp Propel':'Telekinetic Propel')
  ||(r.mode==='powered'&&r.base_roll>psionicDieSides(r.psion_level))
  ||(r.movement==='warp'&&(r.psion_level<3||psionProgression(r.caster_snapshot)?.subclass!=='Psi Warper'))
  ||(r.mode==='technique'&&(r.psion_level<3||psionProgression(r.caster_snapshot)?.subclass!=='Psykinetic'))
  ||(r.replayed!==undefined&&typeof r.replayed!=='boolean'))return false;
 const context=r.turn_context;
 if(!context||typeof context!=='object'||('soloTurn' in context
  ? !integer(context.soloTurn,0,Number.MAX_SAFE_INTEGER)||r.request.turnId!==`solo:${characterId}:${context.soloTurn}`||r.target.participantId!=null
  : !uuid(context.encounterId)||context.turnId!==r.request.turnId||!integer(context.round,0,Number.MAX_SAFE_INTEGER)||!integer(context.index,0,Number.MAX_SAFE_INTEGER)||!uuid(r.target.participantId)))return false;
 const a=r.action_receipt,c=a?.claim;
 if(!c||c.requestId!==r.request_id||c.actorId!==characterId||c.turnId!==r.request.turnId||!text(c.ownerTurnId)
  ||c.kind!=='bonusAction'||c.grantId!=='normal:bonusAction'||c.grantSource!=='normal'||c.purpose!=='feature'||c.sourceId!==r.source_feature
  ||a.attackLimit!==null||typeof a.replayed!=='boolean')return false;
 if(r.roll_result!==null&&!validRoll(r.roll_result,r))return false;
 if(r.outcome===null)return r.result===null&&r.save_details==null;
 if(!validPropelSave(r.save_details,r.outcome,r.target.participantId))return false;
 if(!['passed','failed','cancelled'].includes(r.outcome)||!r.result||(r.outcome!=='cancelled'&&!r.roll_result))return false;
 const result=r.result,cost=r.outcome==='failed'&&r.mode==='powered'?1:0;
 const feet=r.outcome!=='failed'?0:r.movement==='warp'?30:r.mode==='free'?5:5*r.roll_result!.total;
 if(result.declarationId!==r.request_id||result.outcome!==r.outcome||result.energyCost!==cost||result.feet!==feet||result.movement!==r.movement
  ||typeof result.replayed!=='boolean'||JSON.stringify(result.target)!==JSON.stringify(r.target)||JSON.stringify(result.action)!==JSON.stringify(a)
  ||JSON.stringify(result.roll)!==JSON.stringify(r.roll_result))return false;
 if(!cost)return result.energy===null;
 const e=result.energy;
 return !!e&&e.requestId===r.request_id&&integer(e.remaining,0,12)&&integer(e.energyRevision,0,Number.MAX_SAFE_INTEGER)&&typeof e.replayed==='boolean'
  &&JSON.stringify(e.rolls)===JSON.stringify([r.base_roll])&&[e.restorationResource,e.restorationUsed].every(n=>n===null||integer(n,0,Number.MAX_SAFE_INTEGER));
}
async function call(characterId:string,operation:string,payload:Record<string,unknown>={}){validateIds(characterId);return psionicRpc('psionic_propel',{p_character:characterId,p_operation:operation,p_payload:structuredClone(payload)},true);}
async function readResult(character:string,id:string,operation:string,payload:Record<string,unknown>){validateIds(character,id);const data=await call(character,operation,payload);if(!validPropelRecord(data,character)||data.request_id!==id)throw invalid();return data;}
export async function getPropelContext(characterId:string):Promise<PropelContext>{
 const data=await call(characterId,'context') as PropelContext;
 if(!data||data.actorId!==characterId||!text(data.turnId)||!text(data.ownerTurnId)||typeof data.isOwnTurn!=='boolean'||typeof data.bonusAvailable!=='boolean'
  ||!((data.encounterId===null&&data.participantId===null)||(uuid(data.encounterId)&&uuid(data.participantId))))throw invalid();return data;
}
export async function beginPropel(character:string,input:PropelRequest){
 const request=structuredClone(input);if(!validPropelRequest(request))throw new PsionicRequestError('Choose a valid Propel roll and confirm its target.',true);
 const result=await readResult(character,request.requestId,'begin',{...request});
 const {requestId:_id,...expected}=request;
 if(JSON.stringify(result.request)!==JSON.stringify(expected)){
  // JSONB sorts object keys. Compare the actual request fields, not key order.
  if(result.request.turnId!==expected.turnId||result.mode!==expected.mode||result.movement!==expected.movement||result.base_roll!==expected.roll
   ||result.request.target.participantId!==expected.target.participantId||result.request.target.name!==expected.target.name||result.request.target.legalTargetConfirmed!==expected.target.legalTargetConfirmed)throw invalid();
 }
 notifyActionBudgetChanged();return result;
}
export function readPropel(character:string,id:string){return readResult(character,id,'read',{declarationId:id});}
export async function finalizePropel(character:string,id:string){const record=await readResult(character,id,'finalize',{declarationId:id});if(!record.roll_result)throw invalid();return record;}
export async function finishPropel(character:string,id:string,outcome:PropelOutcome,save:PropelSaveDetails|null=null){
 if(!['passed','failed','cancelled'].includes(outcome)||!validPropelSave(save,outcome,save?.participantId))throw new PsionicRequestError('Choose a Propel outcome.',true);
 const evidence=save===null?null:structuredClone(save);
 const record=await readResult(character,id,'finish',{declarationId:id,outcome,save:evidence});
 if(record.outcome!==outcome||!validPropelSave(evidence,outcome,record.target.participantId)||JSON.stringify(record.save_details??null)!==JSON.stringify(evidence)){
  // JSONB normalizes key order; exact field equality still preserves the saved request.
  const actual=record.save_details??null;
  if(record.outcome!==outcome||!validPropelSave(evidence,outcome,record.target.participantId)||!actual||!evidence||Object.keys({...actual,...evidence}).some(k=>JSON.stringify(actual[k as keyof PropelSaveDetails])!==JSON.stringify(evidence[k as keyof PropelSaveDetails])))throw invalid();
 }return record;
}
export async function listPropel(character:string,cursor:PropelCursor|null=null):Promise<{items:PropelRecord[];nextCursor:PropelCursor|null}>{
 if(cursor&&(!date(cursor.createdAt)||!uuid(cursor.requestId)))throw new PsionicRequestError('Invalid Propel recovery cursor.',true);
 const page=await call(character,'list',{beforeTime:cursor?.createdAt??null,beforeId:cursor?.requestId??null}) as {items:PropelRecord[];nextCursor:PropelCursor|null};
 if(!page||!Array.isArray(page.items)||page.items.length>25||page.items.some(r=>!validPropelRecord(r,character)||r.outcome!==null)
  ||new Set(page.items.map(r=>r.request_id)).size!==page.items.length)throw invalid();
 const last=page.items[page.items.length-1];
 if(page.items.length===25){if(!page.nextCursor||page.nextCursor.createdAt!==last?.created_at||page.nextCursor.requestId!==last.request_id)throw invalid();}
 else if(page.nextCursor!==null)throw invalid();
 if(cursor&&page.items.some(r=>!older(r,cursor)))throw invalid();
 if(page.items.some((r,i)=>i>0&&!older(r,{createdAt:page.items[i-1].created_at,requestId:page.items[i-1].request_id})))throw invalid();
 return page;
}

/** Read paid choices before resuming an unfinished roll. Never recreate extras. */
export async function getPropelEnhancements(record:PropelRecord):Promise<{declarationId:string;extraRolls:number[];usedSurge:boolean}>{
 const data=await call(record.character_id,'enhancements',{declarationId:record.request_id}) as {declarationId:string;extraRolls:number[];usedSurge:boolean};
 if(!data||data.declarationId!==record.request_id||!Array.isArray(data.extraRolls)||typeof data.usedSurge!=='boolean')throw invalid();
 const original=[...(record.mode==='free'?[]:[record.base_roll]),...data.extraRolls];
 const rolls=original.map(n=>data.usedSurge?Math.max(4,n):n);
 if(!validRoll({declarationId:data.declarationId,originalRolls:original,enkindledRolls:data.extraRolls,usedSurge:data.usedSurge,rolls,total:rolls.reduce((a,b)=>a+b,0)},record))throw invalid();
 return data;
}
