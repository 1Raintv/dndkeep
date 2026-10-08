import {useCallback,useEffect,useRef,useState} from 'react';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import type {PsionicEffectRecord} from '../../../lib/api/psionicEffectRolls';
import {PSIONIC_PAYMENT_CHANGED} from '../../../lib/psionicPaymentRecovery';
export default function PsionicEffectRecoveryPanel({characterId,persistence,discipline,disabled,onResume,currentResultId}:{characterId:string;persistence?:PsionicEnhancementPersistence;discipline:PsionicEffectRecord['discipline'];disabled:boolean;currentResultId?:string;onResume:(id:string)=>void}){
 const read=persistence?.getEffectRolls,serial=useRef(0),[rows,setRows]=useState<PsionicEffectRecord[]>([]),[error,setError]=useState('');
 const refresh=useCallback(async()=>{const ticket=++serial.current;if(!read)return;try{const result=await read();if(ticket===serial.current){setRows(result.filter(r=>r.characterId===characterId&&r.discipline===discipline));setError('');}}catch(e){if(ticket===serial.current){setRows([]);setError(e instanceof Error?e.message:'Saved rolls unavailable.');}}},[read,characterId,discipline]);
 useEffect(()=>{setRows([]);setError('');void refresh();const update=()=>{void refresh();};window.addEventListener(PSIONIC_PAYMENT_CHANGED,update);window.addEventListener('dndkeep:psionic-effect-roll-changed',update);window.addEventListener('focus',update);return()=>{serial.current++;window.removeEventListener(PSIONIC_PAYMENT_CHANGED,update);window.removeEventListener('dndkeep:psionic-effect-roll-changed',update);window.removeEventListener('focus',update);};},[refresh]);
 if(!read)return null;
 return <div aria-label="Saved Psion effect rolls" style={{maxWidth:'100%',fontSize:11,display:'grid',gap:4}}>
  {error&&<div role="alert">{error}</div>}
  {rows.filter(row=>!row.applied&&row.requestId!==currentResultId).map(row=><button key={row.requestId} className="btn-ghost" disabled={disabled||row.expiredByLongRest} style={{minHeight:36,whiteSpace:'normal',overflowWrap:'anywhere',textAlign:'right'}} onClick={()=>onResume(row.requestId)}>{row.expiredByLongRest?'Expired after Long Rest':row.finalized?'Recover saved result':'Resume paid roll'} · {row.total}{typeof row.context.targetName==='string'?` · ${row.context.targetName}`:''}</button>)}
  {error&&<button className="btn-ghost" disabled={disabled} onClick={()=>void refresh()}>Refresh saved rolls</button>}
 </div>;
}
