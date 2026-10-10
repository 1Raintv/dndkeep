interface Props {spellName:string;damage:number;dc:number;bonus:number;advantage:boolean;onRoll:()=>void;onDismiss?:()=>void}
/** v2.809 — give the explanation its own row so narrow sheets keep readable
 * text and usable save controls instead of squeezing them beside one another. */
export function ConcentrationCheckPrompt({spellName,damage,dc,bonus,advantage,onRoll,onDismiss}:Props){
 const half=Math.floor(damage/2),reason=half>=30?`capped at 30 (half of ${damage} = ${half})`:
  half>10?`half of ${damage} damage = ${half}`:`floor of 10 (half of ${damage} = ${half}, below floor)`;
 return <section aria-label="Concentration check required" style={{padding:'12px 16px',borderRadius:10,
  display:'flex',flexDirection:'column',gap:10,background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.4)'}}>
  <div>
   <div style={{fontWeight:800,fontSize:11,color:'#a78bfa',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:5}}>Concentration Check Required</div>
   <div style={{fontSize:13,color:'var(--t-1)',fontWeight:600}}>{spellName} — took {damage} damage → CON save DC {dc}</div>
   <div style={{fontSize:12,color:'var(--t-2)',marginTop:5,lineHeight:1.5}}>DC = {reason} · need a {dc-bonus} or higher on the d20</div>
   {advantage&&<div style={{fontSize:12,color:'#c4b5fd',marginTop:5}}>Advantage: roll two d20s, keep the higher</div>}
  </div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <button onClick={onRoll} style={{fontWeight:800,fontSize:12,padding:'8px 14px',minHeight:44,borderRadius:'var(--r-md)',cursor:'pointer',
    background:'rgba(167,139,250,0.2)',border:'1px solid rgba(167,139,250,0.5)',color:'#c4b5fd'}}>Roll CON Save ({bonus>=0?'+':''}{bonus})</button>
   {onDismiss&&<button onClick={onDismiss} style={{fontSize:12,padding:'8px 12px',minHeight:44,borderRadius:'var(--r-sm)',cursor:'pointer',
    background:'transparent',border:'1px solid var(--c-border)',color:'var(--t-2)'}}>Dismiss</button>}
  </div>
 </section>;
}
