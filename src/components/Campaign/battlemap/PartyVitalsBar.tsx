import {useCallback,useRef,useState} from 'react';
import type {BattleMapV2Props} from '../BattleMapV2';
import {useMapControlClearance} from './useMapControlClearance';
import './PartyVitalsBar.css';
export const PARTY_PANEL_COLLAPSED_KEY='dndkeep:battlemap_v2:party_panel_collapsed';
/** v2.755 — The old 240px reserve left only half a card on phones. Keep
 * the heading outside the scrolling cards, and let navigation measure this
 * panel rather than assuming a fixed height. Cards are native focus controls. */
export function PartyVitalsBar({characters,onCharacterClick}:{
 characters:BattleMapV2Props['playerCharacters'];onCharacterClick?:(id:string)=>void;
}) {
 const ref=useRef<HTMLDivElement>(null);
 // Party occupies the left lane; dice buttons stay in the reserved right lane.
 useMapControlClearance(ref,false,!!characters?.length);
 const [collapsed,setCollapsed]=useState(()=>{
  try{return typeof window!=='undefined'&&localStorage.getItem(PARTY_PANEL_COLLAPSED_KEY)==='1';}catch{return false;}
 });
 const toggleCollapsed=useCallback(()=>setCollapsed(prev=>{
  try{if(!prev)localStorage.setItem(PARTY_PANEL_COLLAPSED_KEY,'1');else localStorage.removeItem(PARTY_PANEL_COLLAPSED_KEY);}catch{/* Storage is optional. */}
  return !prev;
 }),[]);
 if(!characters?.length)return null;
 return <div ref={ref} className="party-vitals" data-collapsed={collapsed} role="region" aria-label="Party vitals">
  {collapsed?<button className="party-vitals-toggle" onClick={toggleCollapsed} title="Show party vitals" aria-expanded={false}>Party <span>{characters.length}</span><span aria-hidden="true">▴</span></button>:<>
   <div className="party-vitals-heading"><span>Party <span className="party-vitals-count">{characters.length}</span></span>
    <button className="party-vitals-hide" title="Collapse party panel" aria-label="Collapse party panel" aria-expanded={true} onClick={toggleCollapsed}>Hide <span aria-hidden="true">▾</span></button>
   </div>
   <div className="party-vitals-cards" role="group" aria-label="Party characters">
    {characters.map(c=>{
     const pct=c.max_hp>0?Math.max(0,Math.min(1,c.current_hp/c.max_hp)):0;
     const color=pct>0.5?'#34d399':pct>0.25?'#fbbf24':pct>0?'#f87171':'#9ca3af';
     const content=<><span className="party-vitals-card-heading"><span className="party-vitals-name">{c.name}</span><span className="party-vitals-ac">AC {c.armor_class}</span></span>
      <span className="party-vitals-health"><span>HP</span><span style={{color}}>{c.current_hp}<span className="party-vitals-max"> / {c.max_hp}</span></span></span>
      <span className="party-vitals-track" aria-hidden="true"><span style={{width:`${pct*100}%`,background:color}}/></span></>;
     return onCharacterClick?<button key={c.id} type="button" className="party-vitals-card" title={`Pan map to ${c.name}`} aria-label={`Focus ${c.name} on map`} onClick={()=>onCharacterClick(c.id)}>{content}</button>:
      <div key={c.id} className="party-vitals-card" title={c.name}>{content}</div>;
    })}
   </div>
  </>}
 </div>;
}
