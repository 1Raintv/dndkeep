import type {CSSProperties} from 'react';
import {useAuth} from '../../context/AuthContext';
import {useCampaignTime} from '../../lib/hooks/useCampaignTime';
import {hoursToRounds} from '../../lib/buffDuration';
interface Props {campaignId:string;active:boolean;style?:CSSProperties}
const intervals=[{label:'1 round',unit:'rounds',amount:1},{label:'1 minute',unit:'seconds',amount:60},{label:'10 minutes',unit:'seconds',amount:600},{label:'1 hour',unit:'seconds',amount:3600},{label:'8 hours',unit:'seconds',amount:28800},{label:'24 hours',unit:'seconds',amount:86400}] as const;
export default function CampaignTimePanel({campaignId,active,style}:Props){
 const {user}=useAuth();const state=useCampaignTime(user?.id??'',campaignId,active);
 const locked=!user||!state.clock||state.busy||!!state.storageError||state.saved.length>0;
 return <section role="region" aria-label="Campaign time" style={{...style,padding:'14px 16px',background:'var(--c-card)',border:'1px solid rgba(34,211,238,0.3)',borderRadius:12,display:'flex',flexDirection:'column',gap:12,minWidth:0,boxSizing:'border-box'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong style={{color:'#67e8f9'}}>Advance time</strong><button className="btn-secondary" disabled={state.busy} onClick={()=>void state.refresh()}>Refresh clock</button></div>
  <p style={{margin:0,fontSize:12}}>Advance game time for this campaign. Timed buffs and immunities expire together. This does not take a rest or restore resources.</p>
  <div aria-label="Campaign clock" style={{fontSize:13}}>{state.clock?`${state.clock.rounds} rounds elapsed · ${state.clock.scale} seconds per round`:'Loading campaign clock…'}</div>
  {!!state.saved.length&&<div role="status" aria-label="Saved time advance" style={{padding:12,border:'1px solid var(--c-gold-bdr)',borderRadius:8}}>
   <strong>Saved time needs confirmation</strong>
   <p style={{fontSize:12}}>{state.saved[0].request.amount} {state.saved[0].request.unit} at {state.saved[0].request.scale} seconds per round. Confirming will not advance it twice.</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn-primary" disabled={state.busy} onClick={()=>void state.confirm(state.saved[0])}>Confirm saved time</button><button className="btn-secondary" disabled={state.busy} onClick={()=>void state.cancel(state.saved[0])}>Cancel unconfirmed time</button></div>
   <p style={{fontSize:11,marginBottom:0}}>Cancellation keeps time that already advanced.{state.saved.length>1?` ${state.saved.length} saved advances remain.`:''}</p>
  </div>}
  <div role="group" aria-label="Time intervals" style={{display:'flex',flexWrap:'wrap',gap:8}}>{intervals.map(i=>{
   const rounds=i.unit==='rounds'?i.amount:state.clock?hoursToRounds(i.amount/3600,state.clock.scale):0;
   return <button key={i.label} className="btn-secondary" disabled={locked||rounds<1} title={rounds?`Advances ${rounds} rounds at the current time scale`:'Shorter than one round at the current time scale'} onClick={()=>void state.advance(i.unit,i.amount)}>{i.label}</button>;
  })}</div>
  {(state.error||state.storageError)&&<p role="alert" style={{margin:0,color:'var(--danger)',overflowWrap:'anywhere'}}>{state.storageError||state.error}</p>}
  {(state.busy||state.message)&&<p role="status" style={{margin:0,fontSize:12}}>{state.busy?'Confirming time…':state.message}</p>}
 </section>;
}
