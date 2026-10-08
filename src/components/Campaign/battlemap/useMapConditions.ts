import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../../../context/AuthContext';
import {acknowledgeMapCondition,MAP_CONDITION_CHANGED,savedMapCondition,submitMapCondition,type MapConditionRequest} from '../../../lib/api/mapConditions';
import {SAVE_TIMEOUT_MS,withTimeout} from './saveTimeout';
export function useMapConditions(campaignId:string,targetType:'character'|'combatant',targetId:string,enabled:boolean){
 const {user}=useAuth();const scope={userId:user?.id??'',campaignId,targetType,targetId},identity=JSON.stringify(scope);
 const live=useRef(identity);live.current=identity;const mounted=useRef(true),operation=useRef<symbol|null>(null);
 const [pending,setPending]=useState<MapConditionRequest|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[storageError,setStorageError]=useState(''),[message,setMessage]=useState('');
 const current=()=>mounted.current&&live.current===identity;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  operation.current=null;setBusy(false);setError('');setMessage('');
  const update=()=>{try{setPending(savedMapCondition(scope));setStorageError('');}catch(e){setPending(null);setStorageError(e instanceof Error?e.message:'Saved condition is unavailable.');}};
  update();window.addEventListener(MAP_CONDITION_CHANGED,update);window.addEventListener('storage',update);
  return()=>{window.removeEventListener(MAP_CONDITION_CHANGED,update);window.removeEventListener('storage',update);};
  // Scope is represented by identity; rebuilding the object cannot restart recovery.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[identity]);
 async function run(request:MapConditionRequest,cancel=false){
  if(operation.current||!enabled||!scope.userId||!current())return;
  const token=Symbol();operation.current=token;setBusy(true);setError('');setMessage('');
  try{
   const receipt=await withTimeout<Awaited<ReturnType<typeof submitMapCondition>>|null>(submitMapCondition(request,cancel),SAVE_TIMEOUT_MS,()=>null);
   if(!current())return;if(!receipt)throw new Error('Confirmation took too long. Retry or cancel the saved condition change.');
   acknowledgeMapCondition(request);
   setMessage(receipt.canceled?'Condition change canceled.':receipt.replayed?'Saved condition change confirmed.':receipt.blocked?'Psionic Guards prevented this condition.':
    !request.present&&receipt.conditionPresent?'Condition remains while another condition requires it.':`Condition updated.${receipt.concentrationEnded?' Concentration ended.':''}`);
  }catch(e){if(current())setError(e instanceof Error?e.message:'Condition change is unconfirmed.');}
  finally{if(operation.current===token)operation.current=null;if(current())setBusy(false);}
 }
 const visible=pending&&pending.userId===scope.userId&&pending.campaignId===campaignId&&pending.targetType===targetType&&pending.targetId===targetId?pending:null;
 return {busy,blocked:!enabled||!scope.userId||!campaignId||busy||!!visible||!!storageError,pending:visible,error:storageError||error,message,
  change:(condition:string,present:boolean)=>{
   if(!enabled||busy||operation.current||storageError||!campaignId)return;
   try{if(savedMapCondition(scope))return;}catch(e){setStorageError(e instanceof Error?e.message:'Saved condition is unavailable.');return;}
   void run({...scope,requestId:crypto.randomUUID(),condition,present});
  },retry:()=>{if(visible)void run(visible);},cancel:()=>{if(visible)void run(visible,true);}};
}
