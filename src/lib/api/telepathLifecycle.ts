import {psionicRpc,PsionicRequestError,type EnergyReceipt} from './psionicTurns';
import {notifyActionBudgetChanged} from './actionBudget';
import {validTelepathAttackContext,type TelepathAttackContext} from './telepathReactions';
import type {ActionClaim} from '../../rules/actionBudget';
import {psionicDieSides} from '../../rules/psionicRestoration';
import {psionicSurge} from '../../rules/psionicSurge';
import {attackRollOutcome,type AttackRollOutcome} from '../../rules/attackRollOutcome';
export interface TelepathReview {distanceFeet:number;visible:boolean;confirmed:true}
export interface TelepathRequest {requestId:string;attackId:string;feature:TelepathAttackContext['feature'];expected:TelepathAttackContext;roll:number;review:TelepathReview}
export interface TelepathEnhancement {requestId:string;kind:'enkindled'|'surge';request:{declarationId:string;kind:'enkindled'|'surge';extraRolls:number[]|null;hitDie:number|null};originalRolls:number[];rolls:number[];extraRolls:number[]}
export interface TelepathResult {requestId:string;cancelled:boolean;reactionCost:1;energyCost:0|1;energy:EnergyReceipt|null;replayed:boolean;
 originalTotal?:number;total?:number;result?:AttackRollOutcome;changed?:boolean;roll?:number;originalRolls?:number[];enkindledRolls?:number[];usedSurge?:boolean;rolls?:number[]}
export interface TelepathRecord {request_id:string;character_id:string;attack_id:string;request:Omit<TelepathRequest,'requestId'>;context:TelepathAttackContext;review:TelepathReview;
 action_receipt:{claim:ActionClaim;replayed:boolean;attackLimit:null};base_roll:number;psion_level:number;source_feature:string;created_at:string;enhancements:TelepathEnhancement[];result:TelepathResult|null}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer=(v:unknown,min:number,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
// JSONB reorders object keys. Compare values recursively, preserving array order.
function same(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
 return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.prototype.hasOwnProperty.call(y,k)&&same(x[k],y[k]));
}
const invalid=()=>new PsionicRequestError('The saved Telepath reaction could not be verified. Keep its request; do not roll or spend again.',false);
function ids(character:string,id:string){if(!uuid(character)||!uuid(id))throw new PsionicRequestError('Invalid Telepath identity. No request was sent.',true);}
export function validTelepathRequest(value:unknown,character:string):value is TelepathRequest{
 const r=value as TelepathRequest|null,c=r?.expected,v=r?.review;
 return !!r&&uuid(r.requestId)&&!!c&&validTelepathAttackContext(c,character,r.attackId,r.feature)&&c.reactionAvailable&&c.energyRemaining>0&&c.rangeVerified
  &&integer(r.roll,1,psionicDieSides(c.psionLevel))&&!!v&&v.confirmed===true&&typeof v.visible==='boolean'&&Number.isFinite(v.distanceFeet)
  &&v.distanceFeet>=0&&v.distanceFeet<=c.telepathyRange!&&(!c.subject.self||v.distanceFeet===0)&&(v.visible||r.feature==='bolstering'&&c.subject.self);
}
/** v2.869: validate saved evidence, never current sheet state. A changed level
 * must not erase the player's ability to inspect or cancel an older declaration. */
export function validTelepathRecord(value:unknown,character:string):value is TelepathRecord{
 const r=value as TelepathRecord|null;
 if(!r||!uuid(character)||r.character_id!==character||!r.request||!validTelepathRequest({...r.request,requestId:r.request_id},character)
  ||r.attack_id!==r.request.attackId||r.base_roll!==r.request.roll||r.psion_level!==r.context?.psionLevel||!same(r.context,r.request.expected)||!same(r.review,r.request.review)
  ||typeof r.created_at!=='string'||!Number.isFinite(Date.parse(r.created_at))||!Array.isArray(r.enhancements)||r.enhancements.length>2)return false;
 const feature=r.request.feature==='distraction'?'Telepathic Distraction':'Telepathic Bolstering',a=r.action_receipt,c=a?.claim,turn=r.context.budget.context;
 if(r.source_feature!==feature||!c||c.requestId!==r.request_id||c.actorId!==character||c.turnId!==turn.turnId||c.ownerTurnId!==turn.ownerTurnId
  ||c.kind!=='reaction'||c.grantId!=='normal:reaction'||c.grantSource!=='normal'||c.purpose!=='feature'||c.sourceId!==feature||a.attackLimit!==null||typeof a.replayed!=='boolean')return false;
 let original=[r.base_roll],rolls=original,extra:number[]=[],surged=false;
 const seen=new Set<string>([r.request_id]),sides=psionicDieSides(r.psion_level);
 for(const e of r.enhancements){
  if(!e||!uuid(e.requestId)||seen.has(e.requestId)||!e.request||e.request.declarationId!==r.request_id||e.request.kind!==e.kind)return false;
  seen.add(e.requestId);
  if(e.kind==='enkindled'){
   if(r.psion_level!==20||extra.length||surged||!Array.isArray(e.extraRolls)||!integer(e.extraRolls.length,1,2)||e.extraRolls.some(n=>!integer(n,1,sides))
    ||e.request.hitDie!==null||!same(e.request.extraRolls,e.extraRolls))return false;
   extra=e.extraRolls;original=[r.base_roll,...extra];rolls=original;
  }else if(e.kind==='surge'){
   if(surged||e.request.extraRolls!==null||![6,8,10,12].includes(e.request.hitDie!)||!same(e.extraRolls,[]))return false;
   const adjusted=psionicSurge({class_name:'Psion',level:r.psion_level},original);if(!adjusted)return false;
   surged=true;rolls=adjusted.rolls;
  }else return false;
  if(!same(e.originalRolls,original)||!same(e.rolls,rolls))return false;
 }
 const out=r.result;if(out===null)return true;
 if(!out||out.requestId!==r.request_id||out.reactionCost!==1||typeof out.cancelled!=='boolean'||typeof out.replayed!=='boolean')return false;
 if(out.cancelled)return out.energyCost===0&&out.energy===null;
 const attack=r.context.attack,roll=rolls.reduce((sum,n)=>sum+n,0),total=attack.total+(r.request.feature==='distraction'?-roll:roll);
 const result=attackRollOutcome({...attack.snapshot,total,targetAC:attack.targetAC,automatic:attack.cover==='total'?'failure':attack.snapshot.automatic});
 const changed=['hit','crit'].includes(result??'')!==['hit','crit'].includes(attack.result),cost=changed?1:0;
 if(result===null||out.originalTotal!==attack.total||out.total!==total||out.result!==result||out.changed!==changed||out.roll!==roll||out.usedSurge!==surged
  ||!same(out.originalRolls,original)||!same(out.rolls,rolls)||!same(out.enkindledRolls,extra)||out.energyCost!==cost)return false;
 if(!cost)return out.energy===null;
 const e=out.energy;return !!e&&e.requestId===r.request_id&&integer(e.remaining,0,12)&&integer(e.energyRevision,0)&&typeof e.replayed==='boolean'
  &&same(e.rolls,[r.base_roll])&&[e.restorationResource,e.restorationUsed].every(n=>n===null||integer(n,0));
}
async function call(character:string,operation:string,payload:Record<string,unknown>){return psionicRpc('telepath_reaction',{p_character:character,p_operation:operation,p_payload:structuredClone(payload)},true);}
async function record(character:string,id:string,operation:string,payload:Record<string,unknown>){
 ids(character,id);const result=await call(character,operation,payload);if(!validTelepathRecord(result,character)||result.request_id!==id)throw invalid();return result;
}
export function readTelepathReaction(character:string,id:string){return record(character,id,'read',{declarationId:id});}
export async function listTelepathReactions(character:string,attack:string){
 ids(character,attack);const result=await call(character,'list',{attackId:attack});
 if(!Array.isArray(result)||result.some(r=>!validTelepathRecord(r,character)||r.attack_id!==attack)||new Set(result.map(r=>r.request_id)).size!==result.length)throw invalid();
 return result as TelepathRecord[];
}
export async function beginTelepathReaction(character:string,input:TelepathRequest){
 const request=structuredClone(input);if(!validTelepathRequest(request,character))throw new PsionicRequestError('Review the target, Reaction and die before declaring Telepath.',true);
 const result=await record(character,request.requestId,'begin',{...request});const {requestId:_id,...expected}=request;
 if(!same(result.request,expected))throw invalid();notifyActionBudgetChanged();return result;
}
export async function finishTelepathReaction(character:string,id:string,cancel=false){
 if(typeof cancel!=='boolean')throw new PsionicRequestError('Choose whether to finish or cancel the saved reaction.',true);
 const result=await record(character,id,cancel?'cancel':'finish',{declarationId:id});
 if(!result.result||result.result.cancelled!==cancel)throw invalid();notifyActionBudgetChanged();return result;
}

export interface TelepathEnhancementRequest {declarationId:string;requestId:string;kind:'enkindled'|'surge';extraRolls:number[]|null;hitDie:number|null}
/** Saved enhancement links prove which dice were paid for. Resource displays
 * should refresh from the character store; this response is not an absolute HP write. */
export async function enhanceTelepathReaction(character:string,input:TelepathEnhancementRequest){
 const request=structuredClone(input);ids(character,request.declarationId);
 if(!uuid(request.requestId)||request.requestId===request.declarationId||!(request.kind==='enkindled'
  ?request.hitDie===null&&Array.isArray(request.extraRolls)&&integer(request.extraRolls.length,1,2)&&request.extraRolls.every(n=>integer(n,1,12))
  :request.kind==='surge'&&request.extraRolls===null&&[6,8,10,12].includes(request.hitDie!)))throw new PsionicRequestError('Choose a valid saved Telepath enhancement.',true);
 const result=await record(character,request.declarationId,'enhance',{...request});const {requestId:_id,...expected}=request;
 const link=result.enhancements.find(e=>e.requestId===request.requestId);
 if(!link||!same(link.request,expected))throw invalid();return result;
}
