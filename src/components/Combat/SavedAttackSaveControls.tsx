import {useEffect,useState} from 'react';
import {ATTACK_SAVE_CHANGED,reviewAttackSave,savedAttackSave,type SavedAttackSave} from '../../lib/api/attackSaves';
/** A retry keeps the original dice. Updating settings is a separate, visible step. */
export default function SavedAttackSaveControls({attackId,bonus,disabled}:{attackId:string;bonus:number;disabled:boolean}){
 const [saved,setSaved]=useState<SavedAttackSave|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const read=()=>{try{setSaved(savedAttackSave(attackId));setError('');}catch(e){setError(e instanceof Error?e.message:'Saved throw unavailable.');}};
  read();window.addEventListener(ATTACK_SAVE_CHANGED,read);window.addEventListener('storage',read);
  return()=>{window.removeEventListener(ATTACK_SAVE_CHANGED,read);window.removeEventListener('storage',read);};
 },[attackId]);
 if(!saved&&!error)return null;
 return <div style={{padding:10,border:'1px solid var(--c-border)',borderRadius:8,fontSize:12,color:'var(--t-2)'}}>
  {saved&&<><div role="status">Saved throw: {saved.dice.length?`d20 ${saved.dice.join(', ')}`:'automatic failure'} · bonus {saved.baseBonus}. Confirming uses these saved dice.</div>
   <button disabled={disabled||busy} onClick={async()=>{setBusy(true);setError('');try{await reviewAttackSave(attackId,bonus);}catch(e){setError(e instanceof Error?e.message:'Settings could not be reviewed.');}finally{setBusy(false);}}} style={{marginTop:8}}>Review changed settings</button>
   <div style={{marginTop:6}}>Review keeps existing dice and adds only newly required dice. Check the saved throw, then confirm with Roll Save.</div></>}
  {error&&<div role="alert">{error}</div>}
 </div>;
}
