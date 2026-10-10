import {psionicRpc,PsionicRequestError} from './psionicTurns';
import {withCurrentTurnUser} from './liveTurnTransitions';
interface State {used:number;dashed:boolean;disengaged:boolean;revision:string}
interface Saved {version:1;userId:string;encounterId:string;participantId:string;turnId:string;requestId:string;expected:State}
export interface MovementResetReceipt {requestId:string;encounterId:string;participantId:string;turnId:string;previous:State;changed:boolean;replayed:boolean}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const state=(s:State):boolean=>!!s&&Number.isFinite(s.used)&&s.used>=0&&typeof s.dashed==='boolean'&&typeof s.disengaged==='boolean'&&typeof s.revision==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(s.revision)&&BigInt(s.revision)<=9223372036854775807n;
const same=(a:State,b:State)=>a.used===b.used&&a.dashed===b.dashed&&a.disengaged===b.disengaged&&a.revision===b.revision;
const invalid=()=>new Error('Movement reset could not be verified. Retry to recover its saved result.');
const active=new Map<string,Promise<MovementResetReceipt>>();
/** v2.869: persist the exact revision before sending. Lost replies must recover
 * that reset, including after a turn change, without erasing newer movement. */
export async function resetMovementAtomically(encounterId:string|null,participantId:string,turnId:string|undefined):Promise<MovementResetReceipt>{
 if(!uuid(encounterId)||!uuid(participantId)||!uuid(turnId))throw invalid();
 return withCurrentTurnUser(async(userId,guard)=>{
  const key=`dndkeep:movement-reset:${JSON.stringify([userId,encounterId,participantId])}`;
  const prior=active.get(key);if(prior)return prior;
  if(!navigator.locks?.request)throw new Error('Safe movement reset requires browser locking.');
  const work=Promise.resolve(navigator.locks.request(key,{mode:'exclusive'},async()=>{
   guard();const stored=localStorage.getItem(key);let request:Saved;
   if(stored!==null){
    try{request=JSON.parse(stored);}catch{throw invalid();}
    if(!request||request.version!==1||request.userId!==userId||request.encounterId!==encounterId||request.participantId!==participantId||!uuid(request.turnId)||!uuid(request.requestId)||!state(request.expected))throw invalid();
   }else{
    const expected=await psionicRpc('get_movement_reset_context',{p_encounter:encounterId,p_participant:participantId,p_turn:turnId},true) as State;guard();
    if(!state(expected))throw invalid();
    request={version:1,userId,encounterId,participantId,turnId,requestId:crypto.randomUUID(),expected};
    localStorage.setItem(key,JSON.stringify(request));
   }
   guard();let result:MovementResetReceipt;
   try{result=await psionicRpc('reset_movement_atomic',{p_request:request.requestId,p_encounter:encounterId,p_participant:participantId,p_turn:request.turnId,p_expected:request.expected},true) as MovementResetReceipt;}
   catch(error){guard();if(error instanceof PsionicRequestError&&error.definitelyNotPaid){try{localStorage.removeItem(key);}catch{/* Retaining an unchanged request is safe. */}}throw error;}
   guard();
   if(!result||result.requestId!==request.requestId||result.encounterId!==encounterId||result.participantId!==participantId||result.turnId!==request.turnId||!state(result.previous)||!same(result.previous,request.expected)||result.changed!==(request.expected.used!==0||request.expected.dashed||request.expected.disengaged)||typeof result.replayed!=='boolean')throw invalid();
   try{localStorage.removeItem(key);}catch{/* A remaining request replays its receipt. */}return result;
  }));
  active.set(key,work);try{return await work;}finally{if(active.get(key)===work)active.delete(key);}
 });
}
