import {useEffect,useRef,useState} from 'react';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';
import {useToast} from '../../shared/Toast';

/** v2.718 — false (including a zero-row save) is a failure, not just exceptions. */
export function useTokenMenuSave(tokenId:string,onClose:()=>void) {
  const pending=useRef(false),mounted=useRef(true),current=useRef(tokenId);
  current.current=tokenId;
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const {showToast}=useToast();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>setError(''),[tokenId]);
  async function run(label:string,request:()=>Promise<boolean>,commit:()=>void) {
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    const scene=useBattleMapStore.getState().currentSceneId;
    try {
      if(await request()!==true)throw new Error('Save rejected');
      // Changing scenes while a request is in flight must not inject old tokens.
      if(useBattleMapStore.getState().currentSceneId===scene)commit();
      if(mounted.current && current.current===tokenId)onClose();
    }catch {
      const message=`${label} failed. The change wasn't confirmed. Try again.`;
      if(mounted.current && current.current===tokenId)setError(message);
      else showToast(message,'error');
    }finally {pending.current=false;if(mounted.current)setBusy(false);}
  }
  return {busy,pending,error,setError,run};
}
