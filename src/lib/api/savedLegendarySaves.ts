import {declareSaveBatch,getSaveBatchTurn,type DeclareSaveBatchInput,type DeclareSaveBatchResult} from '../saveBatch';
import {PsionicRequestError} from './psionicTurns';
import {withCurrentTurnUser} from './liveTurnTransitions';
import {supabase} from '../supabase';
import type {PendingAttack} from '../../types';
export interface LegendarySaveIdentity {campaignId:string;encounterId:string;attacker:{id:string};attackName:string}
export interface SavedLegendarySave {version:1;userId:string;phase:'pending'|'complete';damageAttempts?:string[];input:DeclareSaveBatchInput & {savedDeclaration:{chainId:string;turnId:string}}}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const key=(user:string,i:LegendarySaveIdentity)=>`dndkeep:legendary-save:${JSON.stringify([user,i.campaignId,i.encounterId,i.attacker.id,i.attackName])}`;
const invalid=()=>new Error('The saved legendary action needs review before another can start.');
function read(user:string,i:LegendarySaveIdentity):SavedLegendarySave|null{
 const raw=localStorage.getItem(key(user,i));if(raw===null)return null;
 let s:SavedLegendarySave;try{s=JSON.parse(raw);}catch{throw invalid();}
 const r=s?.input;
 if(!s||s.version!==1||s.userId!==user||!['pending','complete'].includes(s.phase)||!r||r.campaignId!==i.campaignId||r.encounterId!==i.encounterId||r.attacker?.id!==i.attacker.id||r.attackName!==i.attackName
  ||!uuid(r.savedDeclaration?.chainId)||!uuid(r.savedDeclaration?.turnId)||!Number.isInteger(r.legendaryCost)||(r.legendaryCost??0)<1
  ||!Array.isArray(r.targets)||r.targets.length===0||r.targets.some(t=>!t||!uuid(t.id)||typeof t.name!=='string'||t.is_dead)
  ||(s.damageAttempts!==undefined&&(!Array.isArray(s.damageAttempts)||s.damageAttempts.some(id=>!uuid(id))))
  ||new Set(r.targets.map(t=>t.id)).size!==r.targets.length)throw invalid();
 return s;
}
export async function readSavedLegendarySave(i:LegendarySaveIdentity):Promise<SavedLegendarySave|null>{
 return withCurrentTurnUser(async(user,guard)=>{guard();return read(user,i);});
}
/** v2.869: hold one browser lock across declaration and resolution. A completed
 * marker prevents a second stale modal/tab from starting another charged action. */
export async function runSavedLegendarySave(input:DeclareSaveBatchInput,observedChain:string|null,work:(input:DeclareSaveBatchInput,batch:DeclareSaveBatchResult,guard:()=>void,beforeDamage:(attackId:string)=>void)=>Promise<boolean>):Promise<void>{
 return withCurrentTurnUser(async(user,guard)=>{
  if(!navigator.locks?.request)throw new Error('Safe legendary action recovery requires browser locking.');
  await navigator.locks.request(key(user,input),{mode:'exclusive'},async()=>{
   guard();let saved=read(user,input);let newlyCreated=false;
   if((saved?.input.savedDeclaration.chainId??null)!==observedChain)throw new Error('This legendary action changed in another window. Reopen it to recover the saved result.');
   if(!saved||saved.phase==='complete'){
    const turnId=await getSaveBatchTurn(input.encounterId);guard();
    const request=structuredClone(input);request.targets=request.targets.filter(t=>!t.is_dead);
    if(request.targets.length===0)throw new Error('Select a living target before declaring this action.');
    saved={version:1,userId:user,phase:'pending',input:{...request,savedDeclaration:{chainId:crypto.randomUUID(),turnId}}};
    localStorage.setItem(key(user,input),JSON.stringify(saved));newlyCreated=true;
   }
   guard();let batch:DeclareSaveBatchResult|null;
   try{batch=await declareSaveBatch(saved.input);}catch(error){
    guard();
    // Only a new request rejected before any ambiguous reply can be retired.
    // Historical recovery must keep its original identity even on rejection.
    if(newlyCreated&&error instanceof PsionicRequestError&&error.definitelyNotPaid)localStorage.setItem(key(user,input),JSON.stringify({...saved,phase:'complete'}));
    throw error;
   }
   guard();if(!batch)throw invalid();
   const beforeDamage=(attackId:string)=>{
    guard();if(!batch.rows.some(r=>r.pendingAttackId===attackId))throw invalid();
    if(saved!.damageAttempts?.includes(attackId))throw new Error('Damage application was interrupted. Review this target’s HP and finish its saved attack before resuming; damage will not be applied again automatically.');
    saved={...saved!,damageAttempts:[...(saved!.damageAttempts??[]),attackId]};
    localStorage.setItem(key(user,input),JSON.stringify(saved));
   };
   const complete=await work(saved.input,batch,guard,beforeDamage);guard();
   if(complete)localStorage.setItem(key(user,input),JSON.stringify({...saved,phase:'complete'}));
  });
 });
}
export async function readSavedBatchAttack(id:string,chainId:string):Promise<PendingAttack>{
 const {data,error}=await supabase.from('pending_attacks').select('*').eq('id',id).single();
 if(error||!data||data.id!==id||data.chain_id!==chainId||data.attack_kind!=='save')throw invalid();return data as PendingAttack;
}
