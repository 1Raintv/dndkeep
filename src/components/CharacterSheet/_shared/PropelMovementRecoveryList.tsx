import {useEffect,useRef,useState} from 'react';
import type {PropelRecord,PropelCursor} from '../../../lib/api/psionicPropel';
import {readPropelMovement,listPropelMovements} from '../../../lib/api/propelMovement';
import {pendingPropelMovements} from '../../../lib/propelMovementRecovery';
export default function PropelMovementRecoveryList({characterId,selectedId,onSelect,disabled=false}:{characterId:string;selectedId?:string;onSelect:(row:PropelRecord)=>void;disabled?:boolean}){
 const [rows,setRows]=useState<PropelRecord[]>([]),[cursor,setCursor]=useState<PropelCursor|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0);
 const generation=useRef(0);
 useEffect(()=>{generation.current++;let live=true;setBusy(true);setError('');void(async()=>{try{
  const local=pendingPropelMovements(characterId),page=await listPropelMovements(characterId);
  const extra=await Promise.all(local.filter(p=>!page.items.some(r=>r.request_id===p.declarationId)).map(p=>readPropelMovement(characterId,p.declarationId)));
  if(live){setRows([...page.items,...extra]);setCursor(page.nextCursor);}
 }catch(e){if(live)setError(e instanceof Error?e.message:'Could not recover movement.');}finally{if(live)setBusy(false);}})();return()=>{live=false;generation.current++;};},[characterId,revision,selectedId]);
 async function more(){if(!cursor||busy)return;const current=generation.current;setBusy(true);try{const page=await listPropelMovements(characterId,cursor);if(current!==generation.current)return;setRows(old=>[...old,...page.items.filter(r=>!old.some(x=>x.request_id===r.request_id))]);setCursor(page.nextCursor);}catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Could not load older choices.');}finally{if(current===generation.current)setBusy(false);}}
 const visible=rows.filter(r=>r.request_id!==selectedId);
 return <section aria-label="Recover movement choices">{error?<><p role="alert">{error}</p><button className="btn-ghost" disabled={disabled||busy} onClick={()=>setRevision(n=>n+1)}>Reload movement choices</button></>:visible.length>0?<><h4>Movement choices to finish</h4>{visible.map(r=><button key={r.request_id} className="btn-ghost" disabled={disabled||busy} style={{display:'block',whiteSpace:'normal',margin:'8px 0'}} onClick={()=>onSelect(r)}>Resume movement · {r.target.name??'Selected creature'}</button>)}</>:null}{cursor&&<button className="btn-ghost" disabled={disabled||busy} onClick={()=>void more()}>Load older movement choices</button>}</section>;
}
