import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../types';
import type {ConcentrationCastingContext} from '../../rules/concentrationCasting';
import {recordConcentrationCast,saveConcentrationCastRequest,savedConcentrationCast,discardConcentrationRecording,type ConcentrationCastRequest,type ConcentrationCastReceipt} from '../api/concentrationCasting';
interface Queue {flush:()=>Promise<void>;getSnapshot:()=>{pending:boolean;error:string|null}}
/** The recording is retried independently of spell slots, dice and action costs. */
export function useConcentrationRecording(characterRef:{current:Character},queue:Queue,accept:(receipt:ConcentrationCastReceipt,request:ConcentrationCastRequest)=>void,frozen=false){
 const id=characterRef.current.id;const [pending,setPending]=useState<ConcentrationCastRequest|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const running=useRef(false),saved=useRef<ConcentrationCastRequest|null>(null),mounted=useRef(true);
 const live=useRef({id,accept,frozen});live.current={id,accept,frozen};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  try{saved.current=savedConcentrationCast(id);setPending(saved.current);setError('');}
  catch(e){saved.current=null;setPending(null);setError(e instanceof Error?e.message:'Cannot read the saved casting.');}
 },[id]);
 async function send(request:ConcentrationCastRequest){
  if(running.current||live.current.frozen||live.current.id!==request.characterId)return false;
  running.current=true;setBusy(true);setError('');saved.current=request;setPending(request);
  try{
   saveConcentrationCastRequest(request);
   if(queue.getSnapshot().error)throw new Error('Retry the failed character save before recording concentration.');
   await queue.flush();
   if(queue.getSnapshot().pending||queue.getSnapshot().error)throw new Error('Save pending character changes before recording concentration.');
   if(!mounted.current||live.current.id!==request.characterId||live.current.frozen)return false;
   // Keep the revision captured when this cast completed, even if another tab
   // changes concentration while the ordinary save queue is flushing.
   const receipt=await recordConcentrationCast(request);
   if(mounted.current&&live.current.id===request.characterId){live.current.accept(receipt,request);saved.current=null;setPending(null);}
   return true;
  }catch(e){if(mounted.current&&live.current.id===request.characterId)setError(e instanceof Error?e.message:'Concentration was not confirmed. Retry the saved recording.');return false;}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 }
 return {pending,busy,error,blocked:busy||!!pending||!!error,
  record:(context:Omit<ConcentrationCastingContext,'requestId'>)=>{
   if(saved.current||running.current)return Promise.resolve(false);
   const revision=characterRef.current.concentration_revision;
   if(!Number.isSafeInteger(revision)||revision!<0){setError('Reload the sheet to confirm the current concentration.');return Promise.resolve(false);}
   return send({characterId:id,expectedRevision:revision!,previousSpell:characterRef.current.concentration_spell??null,context:{...context,requestId:crypto.randomUUID()}});
  },retry:()=>saved.current?send(saved.current):Promise.resolve(false),
  discard:()=>{
   if(running.current)return;
   try{discardConcentrationRecording(id,saved.current?.context.requestId);saved.current=null;setPending(null);setError('');}
   catch(e){setError(e instanceof Error?e.message:'Could not discard the recording.');}
  }};
}
