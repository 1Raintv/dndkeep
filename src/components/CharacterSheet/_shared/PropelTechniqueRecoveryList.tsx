import {useEffect,useState} from 'react';
import {readPropel,type PropelRecord} from '../../../lib/api/psionicPropel';
import {listPropelTechniques} from '../../../lib/api/propelTechniques';
import {pendingPropelTechniques} from '../../../lib/propelTechniqueRecovery';
/** Server discovery survives a new browser; local uncertain choices survive
 * their original turn and remain explicit instead of silently disappearing. */
export default function PropelTechniqueRecoveryList({characterId,onSelect,disabled=false,selectedId}:{characterId:string;onSelect:(row:PropelRecord)=>void;disabled?:boolean;selectedId?:string}){
 const [rows,setRows]=useState<PropelRecord[]>([]),[error,setError]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;setLoading(true);setError('');void(async()=>{try{
  const local=pendingPropelTechniques(characterId),server=await listPropelTechniques(characterId);
  const missing=local.filter(p=>!server.some(row=>row.request_id===p.declarationId));
  const recovered=await Promise.all(missing.map(p=>readPropel(characterId,p.declarationId)));
  if(live)setRows([...server,...recovered]);
 }catch(e){if(live)setError(e instanceof Error?e.message:'Could not load technique choices.');}finally{if(live)setLoading(false);}})();return()=>{live=false;};},[characterId,revision]);
 const visible=rows.filter(row=>row.request_id!==selectedId);
 return <section aria-label="Recover technique choices">
  {loading?<p role="status">Checking unfinished technique choices…</p>:error?<><p role="alert">{error}</p><button className="btn-ghost" disabled={disabled} onClick={()=>setRevision(n=>n+1)}>Reload technique choices</button></>:visible.length>0?<><h4>Technique choices to review</h4>{visible.map(row=><button key={row.request_id} className="btn-ghost" disabled={disabled} style={{display:'block',margin:'6px 0',whiteSpace:'normal'}} onClick={()=>onSelect(row)}>Review technique · {row.target.name??'Selected creature'} · {new Date(row.created_at).toLocaleString()}</button>)}</>:null}
 </section>;
}
