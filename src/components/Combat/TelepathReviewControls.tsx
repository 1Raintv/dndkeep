import {useEffect,useRef,useState} from 'react';
import type {PendingAttack} from '../../types';
import {loadTelepathCandidates} from '../../lib/api/reactionCharacter';
import {getTelepathAttackContext,type TelepathAttackContext} from '../../lib/api/telepathReactions';
import {pendingTelepath,prepareTelepath,sendTelepath} from '../../lib/telepathRecovery';
import {psionicDieSides} from '../../rules/psionicRestoration';
import {rollDie} from '../../rules/dice';
/** DM review is explicit: range does not prove line of sight, and a saved
 * Reaction is claimed before optional enhancements or conditional Energy cost. */
export default function TelepathReviewControls({attack,disabled,onSaved,runAction}:{attack:PendingAttack;disabled:boolean;onSaved:()=>void;runAction:(task:()=>Promise<unknown>)=>Promise<void>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [choices,setChoices]=useState<{id:string;name:string}[]>([]),[character,setCharacter]=useState(''),[context,setContext]=useState<TelepathAttackContext|null>(null);
 const [distance,setDistance]=useState(''),[visible,setVisible]=useState(false),[confirmed,setConfirmed]=useState(false),[draft,setDraft]=useState(false);
 const lock=useRef(false),alive=useRef(true),selection=useRef('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const feature=['hit','crit'].includes(attack.hit_result??'')?'distraction':'bolstering';
 async function run(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await task();}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Could not review this reaction.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 function launch(){setOpen(true);void run(async()=>{if(!attack.encounter_id)throw new Error('An active encounter is required.');const list=await loadTelepathCandidates(attack.campaign_id,attack.encounter_id);if(alive.current)setChoices(list);});}
 function review(id:string){selection.current=id;setCharacter(id);setContext(null);setDistance('');setVisible(false);setConfirmed(false);setDraft(false);if(!id)return;void run(async()=>{
  const pending=pendingTelepath(id);if(pending){if(alive.current&&selection.current===id)setDraft(true);return;}
  const next=await getTelepathAttackContext(id,attack.id,feature);if(alive.current&&selection.current===id){setContext(next);if(next.subject.self)setDistance('0');}
 });}
 async function declare(){await run(async()=>{
  if(!context||!confirmed||disabled)throw new Error('Confirm the review before rolling.');
  const fresh=await getTelepathAttackContext(character,attack.id,feature);if(!alive.current||selection.current!==character)return;
  if(fresh.attack.updatedAt!==context.attack.updatedAt||fresh.budget.context.turnId!==context.budget.context.turnId||fresh.telepathyRange!==context.telepathyRange)throw new Error('Attack, turn or range changed. Review the Psion again.');
  const saved=await prepareTelepath(character,{requestId:crypto.randomUUID(),attackId:attack.id,feature,expected:fresh,review:{distanceFeet:Number(distance),visible,confirmed:true}},()=>rollDie(psionicDieSides(fresh.psionLevel)));
  if(alive.current)setDraft(true);await sendTelepath(character,saved);if(alive.current){setDraft(false);onSaved();}
 });}
 const legal=!!context&&context.reactionAvailable&&context.energyRemaining>0&&context.rangeVerified&&distance.trim()!==''&&Number.isFinite(Number(distance))&&Number(distance)>=0&&Number(distance)<=context.telepathyRange!&&(!context.subject.self||Number(distance)===0)&&(visible||feature==='bolstering'&&context.subject.self)&&confirmed;
 if(!open)return <button className="btn-ghost" disabled={disabled} onClick={launch}>Review Psion reaction</button>;
 return <section aria-label="DM Telepath review" style={{padding:12,border:'1px solid #a78bfa',borderRadius:10,display:'grid',gap:8,fontSize:12,lineHeight:1.45}}>
 <strong>{feature==='distraction'?'Telepathic Distraction':'Telepathic Bolstering'} · DM review</strong>
 <label>Reacting Psion <select aria-label="Reacting Psion" disabled={busy||disabled} value={character} onChange={e=>review(e.target.value)} style={{width:'100%'}}><option value="">Choose Psion</option>{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 {!busy&&!choices.length&&<p style={{margin:0,fontSize:12}}>No Telepath is assigned to this encounter.</p>}
 {context&&<><p style={{margin:0,fontSize:12}}>Subject: {attack.attacker_name}. Range: {context.telepathyRange??'unverified'} ft. {context.energyRemaining} Energy Dice remaining.</p>
 <label>Distance to subject (ft) <input aria-label="Distance to subject (ft)" type="number" min={0} step="any" value={distance} disabled={busy||disabled} onChange={e=>{setDistance(e.target.value);setConfirmed(false);}} style={{width:'100%'}}/></label>
 <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={visible} disabled={busy||disabled} onChange={e=>{setVisible(e.target.checked);setConfirmed(false);}} style={{width:18,height:18,flexShrink:0}}/>The Psion can see the subject.</label>
 {context.subject.self&&feature==='bolstering'&&<small>Bolstering can affect yourself without a visibility requirement.</small>}
 <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={confirmed} disabled={busy||disabled} onChange={e=>setConfirmed(e.target.checked)} style={{width:18,height:18,flexShrink:0}}/>I confirm range and visibility for this attack.</label>
 <p style={{margin:0,fontSize:12}}>Claims the Psion’s Reaction and saves one d{psionicDieSides(context.psionLevel)} roll. Energy is spent only if the final reaction changes success or failure.</p>
 {!context.reactionAvailable&&<p role="status">The Reaction is unavailable.</p>}
 <button className="btn-primary" disabled={busy||disabled||draft||!legal} onClick={()=>void runAction(declare)}>Roll and save reaction</button></>}
 {draft&&<button className="btn-ghost" disabled={busy} onClick={()=>void run(async()=>{const saved=pendingTelepath(character);if(!saved)throw new Error('No saved request remains. Review the Psion again.');await sendTelepath(character,saved);if(alive.current){setDraft(false);onSaved();}})}>Retry saved Telepath request</button>}
 {error&&<p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
 <button className="btn-ghost" disabled={busy} onClick={()=>review(character)}>Refresh review</button>
 </section>;
}
