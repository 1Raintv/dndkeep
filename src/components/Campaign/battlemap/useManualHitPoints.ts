import {useCallback,useEffect,useRef,useState} from 'react';
import {adjustedHitPointPools,parseHitPointAdjustment,type HitPointAdjustmentMode} from '../../../rules/hp';
import {acknowledgeHitPointAdjustment,cancelHitPointAdjustment,HIT_POINT_ADJUSTMENT_CHANGED,loadHitPointSnapshot,savedHitPointAdjustment,submitHitPointAdjustment,type HitPointAdjustmentRequest,type HitPointSnapshot} from '../../../lib/api/manualHitPoints';
import {SAVE_TIMEOUT_MS,withTimeout} from './saveTimeout';
/** v2.806: an explicit adjustment keeps the same identity through reload/retry.
 * A late response cannot update another character or undo a newer HP revision. */
export function useManualHitPoints(userId:string,characterId:string,refreshKey:string){
 const scope=JSON.stringify([userId,characterId]),live=useRef(scope);live.current=scope;
 const mounted=useRef(true),operation=useRef<symbol|null>(null),reads=useRef(0);
 const [pools,setPools]=useState<{scope:string;value:HitPointSnapshot}|null>(null),[pending,setPending]=useState<HitPointAdjustmentRequest|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[storageError,setStorageError]=useState(''),[message,setMessage]=useState('');
 const current=()=>mounted.current&&live.current===scope;
 const accept=useCallback((value:HitPointSnapshot)=>setPools(old=>old?.scope===scope&&old.value.hit_point_revision>value.hit_point_revision?old:{scope,value}),[scope]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const refresh=useCallback(async()=>{
  if(!userId)return;const sequence=++reads.current;setLoading(true);
  try{const value=await withTimeout<HitPointSnapshot|null>(loadHitPointSnapshot(characterId),SAVE_TIMEOUT_MS,()=>null);
   if(!mounted.current||live.current!==scope||sequence!==reads.current)return;
   if(!value)throw new Error('Loading HP took too long. Retry loading before changing HP.');accept(value);
  }catch(e){if(mounted.current&&live.current===scope&&sequence===reads.current)setError(e instanceof Error?e.message:'Could not load HP.');}
  finally{if(mounted.current&&live.current===scope&&sequence===reads.current)setLoading(false);}
 },[userId,characterId,scope,accept]);
 useEffect(()=>{
  operation.current=null;setBusy(false);setError('');setMessage('');
  const update=()=>{try{setPending(savedHitPointAdjustment(userId,characterId));setStorageError('');}catch(e){setPending(null);setStorageError(e instanceof Error?e.message:'Saved HP adjustment unavailable.');}};
  update();window.addEventListener(HIT_POINT_ADJUSTMENT_CHANGED,update);window.addEventListener('storage',update);
  return()=>{window.removeEventListener(HIT_POINT_ADJUSTMENT_CHANGED,update);window.removeEventListener('storage',update);};
 },[userId,characterId,scope]);
 useEffect(()=>{void refresh();},[refresh,refreshKey]);
 async function run(request:HitPointAdjustmentRequest,cancel=false){
  if(operation.current||!userId||!current())return;const token=Symbol();operation.current=token;setBusy(true);setError('');setMessage('');
  try{
   if(cancel){
    const canceled=await withTimeout<boolean|null>(cancelHitPointAdjustment(request),SAVE_TIMEOUT_MS,()=>null);
    if(!current())return;if(canceled===null)throw new Error('Cancellation is unconfirmed. Retry the saved adjustment or cancellation.');
    if(canceled){setMessage('Adjustment canceled before it was applied.');await refresh();return;}
   }
   const receipt=await withTimeout<Awaited<ReturnType<typeof submitHitPointAdjustment>>|null>(submitHitPointAdjustment(request),SAVE_TIMEOUT_MS,()=>null);
   if(!current())return;if(!receipt)throw new Error('HP confirmation took too long. Retry or cancel this saved adjustment.');
   accept(receipt.character);acknowledgeHitPointAdjustment(request);setMessage(receipt.replayed?'Saved HP adjustment confirmed.':'HP updated.');
  }catch(e){if(current())setError(e instanceof Error?e.message:'HP adjustment was not confirmed.');}
  finally{if(operation.current===token)operation.current=null;if(current())setBusy(false);}
 }
 const visible=pools?.scope===scope?pools.value:null;
 return {pools:visible,pending:pending?.userId===userId&&pending.characterId===characterId?pending:null,busy,loading,error:storageError||error,message,
  blocked:!userId||busy||loading||!visible||!!pending||!!storageError,
  reload:()=>{setError('');void refresh();},
  apply:(mode:HitPointAdjustmentMode,text:string)=>{
   if(!visible||busy||loading||operation.current||storageError)return;
   try{if(savedHitPointAdjustment(userId,characterId))return;}catch(e){setStorageError(e instanceof Error?e.message:'Saved HP adjustment unavailable.');return;}
   const amount=parseHitPointAdjustment(text,mode);if(amount===null||!adjustedHitPointPools(visible,mode,amount)){setError('Enter a valid whole-number HP adjustment. Set HP can be zero.');return;}
   void run({requestId:crypto.randomUUID(),characterId,userId,mode,amount,expectedRevision:visible.hit_point_revision});
  },
  retry:()=>{if(pending)void run(pending);},cancel:()=>{if(pending)void run(pending,true);},
 };
}
