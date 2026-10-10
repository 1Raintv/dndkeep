import {useEffect,useState} from 'react';
import type {PendingAttack} from '../../types';
import {masteryWeaponEntry} from '../../data/weaponMastery';
import {readGrazeDamageContext,recordGrazeDamage,type GrazeDamageContext} from '../../lib/api/grazeDamage';
export default function GrazeChoiceControls({attack,disabled,runAction,onSkip}:{attack:PendingAttack;disabled:boolean;runAction:(action:()=>Promise<unknown>)=>Promise<void>;onSkip:()=>unknown}){
 const [context,setContext]=useState<GrazeDamageContext|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;setContext(null);setError('');readGrazeDamageContext(attack.id).then(c=>{if(active)setContext(c);}).catch(()=>{if(active)setError('Weapon mastery could not be checked. Refresh before continuing.');});return()=>{active=false;};},[attack.id,reload]);
 if(error)return <div role="alert">{error} <button disabled={disabled} onClick={()=>setReload(n=>n+1)}>Refresh mastery</button></div>;
 if(!context)return <div role="status">Checking weapon mastery…</div>;
 const entry=masteryWeaponEntry(attack.attack_name),chosen=context.attacker?.definition?.weapon_masteries??[];
 const hasGraze=entry?.mastery==='Graze'&&chosen.includes(entry.name)&&attack.cover_level!=='total';
 const review=hasGraze&&(attack.graze_resolution_version!==1||attack.attack_ability_modifier==null);
 if(!hasGraze||review)return <div style={{display:'grid',gap:8}}>
  {review&&<div role="status">{attack.graze_resolution_version!==1?'Older attack: Graze may already have applied. Review HP before continuing.':'The attack ability modifier was not saved. Review Graze damage manually.'}</div>}
  <button disabled={disabled} onClick={onSkip}>Continue without Graze</button>
 </div>;
 return <section aria-label="Graze choice" style={{display:'grid',gap:10,padding:12,border:'1px solid var(--c-border)',borderRadius:8}}>
  <strong>Graze — optional</strong>
  <div>The final attack missed. Deal {Math.max(0,attack.attack_ability_modifier!)} {attack.damage_type?.toLowerCase()} damage before defenses, using only the saved ability modifier.</div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <button className="btn-gold" disabled={disabled} onClick={()=>void runAction(()=>recordGrazeDamage(context.attack,true))}>Use Graze</button>
   <button disabled={disabled} onClick={()=>void runAction(()=>recordGrazeDamage(context.attack,false))}>Decline Graze</button>
  </div>
 </section>;
}
