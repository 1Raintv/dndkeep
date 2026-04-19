import { useState } from 'react';
import { createPortal } from 'react-dom';
import { rollDie } from '../../lib/gameUtils';
import { supabase } from '../../lib/supabase';
import { useDiceRoll } from '../../context/DiceRollContext';
import { useEffect, useRef } from 'react';
import { DICE_SKINS } from '../../data/diceSkins';

interface DiceInQueue { die: number; count: number; }
interface RollResultDie { die: number; value: number; index: number; dropped?: boolean; }

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
const DIE_COLORS: Record<number, string> = {
 4: '#e879f9', 6: '#60a5fa', 8: '#34d399', 10: '#fb923c',
 12: '#a78bfa', 20: 'var(--c-gold-l)', 100: '#f87171',
};
function dieColor(d: number) { return DIE_COLORS[d] ?? 'var(--c-gold-l)'; }
function isNat(die: number, v: number) {
 if (die === 20) return v === 20 ? 'crit' : v === 1 ? 'fumble' : null;
 return v === die ? 'max' : null;
}

export async function logRoll(p: {
 campaignId?: string | null; characterId?: string | null;
 userId?: string | null;
 characterName?: string; label: string; expression: string;
 results: number[]; total: number; modifier?: number;
}) {
 if (!p.characterId) return;
 // Write to roll_logs (character's personal history) 
 await supabase.from('roll_logs').insert({
 user_id: p.userId ?? p.characterId,
 character_id: p.characterId,
 campaign_id: p.campaignId ?? null,
 character_name: p.characterName ?? '',
 label: p.label || p.expression,
 dice_expression: p.expression,
 individual_results: p.results,
 total: p.total,
 modifier: p.modifier ?? 0,
 });
 // Also write to action_logs if in a campaign (shared roll log)
 if (p.campaignId) {
 await supabase.from('action_logs').insert({
 campaign_id: p.campaignId,
 character_id: p.characterId,
 character_name: p.characterName ?? '',
 action_type: 'roll',
 action_name: p.label || p.expression,
 dice_expression: p.expression,
 individual_results: p.results,
 total: p.total,
 });
 }
}

interface QuickRollProps {
 characterId?: string;
 characterName?: string;
 campaignId?: string | null;
 userId?: string;
}

export default function QuickRoll({ characterId, characterName, campaignId, userId }: QuickRollProps) {
 const [open, setOpen] = useState(false);
 const [queue, setQueue] = useState<DiceInQueue[]>([]);
 const [label, setLabel] = useState('');

 const [rolling, setRolling] = useState(false);
 const lastShakeRef = useRef(0);
 const shakeCountRef = useRef(0);

 // Shake-to-roll on mobile
 useEffect(() => {
 const handler = (e: DeviceMotionEvent) => {
 const acc = e.accelerationIncludingGravity;
 if (!acc) return;
 const total = Math.sqrt((acc.x??0)**2 + (acc.y??0)**2 + (acc.z??0)**2);
 const now = Date.now();
 if (total > 22) { // threshold
 if (now - lastShakeRef.current > 300) {
 shakeCountRef.current++;
 lastShakeRef.current = now;
 if (shakeCountRef.current >= 2) {
 shakeCountRef.current = 0;
 if (queue.length > 0 && !rolling) rollAll();
 }
 }
 }
 };
 if (typeof DeviceMotionEvent !== 'undefined') {
 window.addEventListener('devicemotion', handler);
 return () => window.removeEventListener('devicemotion', handler);
 }
 }, [queue, rolling]);
 const [activeSkin, setActiveSkin] = useState(() =>
 typeof window!=='undefined'?localStorage.getItem('dndkeep_dice_skin')||'classic':'classic'
 );
 const [previewSkin, setPreviewSkin] = useState<string|null>(null);
 const [unlockedSkins, setUnlockedSkins] = useState<string[]>(['classic']);
 const [buyLoading, setBuyLoading] = useState(false);

 // Check unlocked skins on mount
 useEffect(()=>{
 async function loadUnlocked(){
 const { data } = await supabase.from('dice_skin_unlocks').select('skin_id');
 if(data) setUnlockedSkins(['classic',...data.map((r:any)=>r.skin_id)]);
 }
 loadUnlocked();
 // Handle return from Stripe
 const params=new URLSearchParams(window.location.search);
 const unlocked=params.get('skin_unlocked');
 if(unlocked){
 setUnlockedSkins(prev=>[...new Set([...prev,unlocked])]);
 setActiveSkin(unlocked);
 localStorage.setItem('dndkeep_dice_skin',unlocked);
 window.history.replaceState({},'',window.location.pathname);
 }
 },[]);

 async function buySkin(skinId:string){
 setBuyLoading(true);
 try{
 const { data:{ session } }=await supabase.auth.getSession();
 const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/buy-dice-skin`,{
 method:'POST',
 headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token}`},
 body:JSON.stringify({skinId,origin:window.location.origin}),
 });
 const json=await res.json();
 if(json.url) window.location.href=json.url;
 else alert(json.error||'Something went wrong');
 }catch(e){alert(String(e));}
 finally{setBuyLoading(false);}
 }

 function chooseSkin(id:string){
 const skin=DICE_SKINS.find(s=>s.id===id);
 if(!skin) return;
 if(!skin.free && !unlockedSkins.includes(id)){
 setPreviewSkin(id); // show buy prompt
 return;
 }
 setActiveSkin(id);
 localStorage.setItem('dndkeep_dice_skin',id);
 setPreviewSkin(null);
 }
 const { triggerRoll } = useDiceRoll();
 const [adv, setAdv] = useState<'normal'|'advantage'|'disadvantage'>('normal');

 function addDie(die: number) {
 setQueue(q => {
 const ex = q.find(d => d.die === die);
 return ex ? q.map(d => d.die === die ? { ...d, count: d.count + 1 } : d) : [...q, { die, count: 1 }];
 });
 }
 function removeDie(die: number) {
 setQueue(q => {
 const ex = q.find(d => d.die === die);
 if (!ex) return q;
 return ex.count <= 1 ? q.filter(d => d.die !== die) : q.map(d => d.die === die ? { ...d, count: d.count - 1 } : d);
 });
 }
 function clearQueue() { setQueue([]); setLabel(''); setAdv('normal'); }
 function buildExpr(q: DiceInQueue[]) { return q.map(d => `${d.count}d${d.die}`).join(' + '); }

 async function rollAll() {
 if (!queue.length) return;
 setRolling(true);

 // Compute results synchronously — no delay, dice appear instantly
 const effectiveQueue = queue.map(d =>
 d.die === 20 && adv !== 'normal' ? { ...d, count: Math.max(2, d.count) } : d
 );

 const dice: RollResultDie[] = [];
 let idx = 0;
 for (const { die, count } of effectiveQueue) {
 for (let i = 0; i < count; i++) dice.push({ die, value: rollDie(die), index: idx++ });
 }

 // Handle advantage/disadvantage on d20s
 const has20 = queue.some(d => d.die === 20);
 let finalDice = dice;
 let total = 0;

 if (adv !== 'normal' && has20) {
 const origCount = queue.find(d => d.die === 20)?.count ?? 1;
 const d20s = dice.filter(d => d.die === 20);
 const others = dice.filter(d => d.die !== 20);
 const sorted = [...d20s].sort((a, b) => adv === 'advantage' ? b.value - a.value : a.value - b.value);
 const kept = sorted.slice(0, origCount);
 const dropped = sorted.slice(origCount).map(d => ({ ...d, dropped: true }));
 finalDice = [...kept, ...dropped, ...others];
 total = [...kept, ...others].reduce((s, d) => s + d.value, 0);
 } else {
 total = dice.reduce((s, d) => s + d.value, 0);
 }

 const expression = buildExpr(queue);
 setRolling(false);

 // Fire 3D dice immediately — physics IS the animation
 const primaryDie = queue[0];
 const keptDice = finalDice.filter(d => !d.dropped);
 const totalDiceCount = queue.reduce((s, d) => s + d.count, 0);
 triggerRoll({
 result: 0,
 dieType: primaryDie?.die ?? 20,
 label: label || expression,
 advantage: adv === 'advantage',
 disadvantage: adv === 'disadvantage',
 allDice: totalDiceCount > 1 ? keptDice.map(d => ({ die: d.die, value: d.value })) : undefined,
 expression: totalDiceCount > 1 ? expression : undefined,
 onResult: characterId ? async (physDice, physTotal) => {
 await logRoll({
 campaignId, characterId, characterName, userId,
 label: label || expression,
 expression,
 results: physDice.map(d => d.value),
 total: physTotal,
 });
 } : undefined,
 });
 }

 const totalDice = queue.reduce((s, d) => s + d.count, 0);
 const has20 = queue.some(d => d.die === 20);

 return createPortal(
 <>
 <style>{`
 @keyframes diceShake {
 0% { transform: translate(-1px, -1px) rotate(-3deg) scale(1.05); }
 25% { transform: translate(1px, -2px) rotate(2deg) scale(1.08); }
 50% { transform: translate(-1px, 1px) rotate(-1deg) scale(1.04); }
 75% { transform: translate(2px, 1px) rotate(3deg) scale(1.07); }
 100% { transform: translate(0px, 2px) rotate(-2deg) scale(1.05); }
 }
 @keyframes diceLand {
 0% { transform: scale(1.4) rotate(-8deg); }
 60% { transform: scale(0.92) rotate(2deg); }
 80% { transform: scale(1.06) rotate(-1deg); }
 100% { transform: scale(1) rotate(0deg); }
 }
 .dice-land { animation: diceLand 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
 `}</style>
 <button
 onClick={() => setOpen(o => !o)}
 title="Dice Roller"
 style={{
 position: 'fixed', bottom: 'var(--sp-10)', right: 'var(--sp-4)',
 zIndex: 90, width: 52, height: 52, borderRadius: '50%',
 background: open
 ? 'linear-gradient(160deg, #7f1d1d 0%, #450a0a 100%)'
 : 'linear-gradient(160deg, #8a5e18 0%, var(--c-gold) 50%, #7a5216 100%)',
 border: `2px solid ${open ? '#f87171' : 'var(--c-gold)'}`,
 boxShadow: open ? '0 4px 20px rgba(239,68,68,0.4), 0 2px 8px rgba(0,0,0,0.6)' : 'var(--shadow-gold), 0 4px 16px rgba(0,0,0,0.5)',
 cursor: 'pointer', transition: 'all var(--tr-fast)',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 fontSize: open ? 18 : 26, color: 'var(--t-1)',
 }}
 >
 {open ? '' : ''}
 {totalDice > 0 && !open && (
 <div style={{
 position: 'absolute', top: -4, right: -4, width: 18, height: 18,
 borderRadius: '50%', background: 'var(--c-red-l)', color: 'white',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 border: '2px solid var(--c-bg)',
 }}>
 {totalDice}
 </div>
 )}
 </button>

 {open && (
 <div className="animate-fade-in" style={{
 position: 'fixed', bottom: 76, right: 'var(--sp-4)',
 zIndex: 89, width: 296,
 background: 'linear-gradient(160deg, #1a1f2e 0%, #0d1117 100%)',
 border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)',
 boxShadow: 'var(--shadow-lg), var(--shadow-gold)', overflow: 'hidden',
 }}>
 {/* Header */}
 <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--c-border)' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-gold-l)' }}>
 Dice Roller
 </span>
 </div>

 {/* Die grid — padding-top accommodates the badge overflow so it never affects layout */}
 <div style={{ padding: 'var(--sp-3)', paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-2)' }}>
 {DICE.map(d => {
 const count = queue.find(q => q.die === d)?.count ?? 0;
 return (
 <button key={d}
 onClick={() => addDie(d)}
 onContextMenu={e => { e.preventDefault(); e.stopPropagation(); removeDie(d); }}
 title={`Click to add d${d} · right-click to remove`}
 style={{
 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
 gap: 2, padding: 'var(--sp-2) var(--sp-1)',
 borderRadius: 'var(--r-md)', position: 'relative',
 border: count > 0 ? `2px solid ${dieColor(d)}` : '2px solid var(--c-border)',
 background: count > 0 ? `${dieColor(d)}18` : '#080d14',
 cursor: 'pointer', transition: 'all var(--tr-fast)',
 }}>
 {count > 0 && (
 <div style={{
 position: 'absolute', top: -6, right: -6, width: 16, height: 16,
 borderRadius: '50%', background: dieColor(d), color: 'var(--c-bg)',
 fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 9,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 border: '1.5px solid var(--c-bg)',
 }}>{count}</div>
 )}
 <svg width="24" height="24" viewBox="0 0 24 24" style={{ color: count > 0 ? dieColor(d) : 'var(--t-2)', display:'block' }}
 dangerouslySetInnerHTML={{__html:({4:'<polygon points="12,2 22,20 2,20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>',6:'<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/>',8:'<polygon points="12,2 22,12 12,22 2,12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>',10:'<polygon points="12,2 20,8 18,20 6,20 4,8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>',12:'<polygon points="12,2 20,6 22,15 16,22 8,22 2,15 4,6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>',20:'<polygon points="12,2 22,8 22,16 12,22 2,16 2,8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>',100:'<polygon points="12,2 20,8 18,20 6,20 4,8" fill="none" stroke="currentColor" strokeWidth="1.8"/>'})[d]??''}} />
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, color: count > 0 ? dieColor(d) : 'var(--t-2)' }}>d{d}</span>
 </button>
 );
 })}
 </div>

 {/* Controls — queue chips (fixed height) + roll button */}
 <div style={{ padding: '0 var(--sp-3) var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
 <div style={{ height: 26, display: 'flex', flexWrap: 'nowrap', gap: 4, alignItems: 'center', overflow: 'hidden' }}>
 {queue.length === 0 ? (
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>
 Click dice to add them
 </span>
 ) : queue.map(({ die, count }) => (
 <span key={die} style={{
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, flexShrink: 0,
 color: dieColor(die), background: `${dieColor(die)}15`,
 border: `1px solid ${dieColor(die)}50`,
 borderRadius: 4, padding: '2px 8px',
 }}>{count}d{die}</span>
 ))}
 </div>
 {/* Skin picker */}
 <div style={{ marginBottom:4 }}>
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
 <span style={{ fontFamily:'var(--ff-body)', fontSize:9, color:'var(--t-3)', letterSpacing:'.1em', textTransform:'uppercase' }}>Dice Skin</span>
 <span style={{ fontFamily:'var(--ff-body)', fontSize:9, color:'var(--c-gold-l)' }}>
 {DICE_SKINS.find(s=>s.id===activeSkin)?.name}
 </span>
 </div>
 <div style={{ display:'flex', gap:5 }}>
 {DICE_SKINS.map(s=>{
 const locked=!s.free&&!unlockedSkins.includes(s.id);
 const active=activeSkin===s.id;
 const bg:Record<string,string>={classic:'#8b5cf6',obsidian:'#1a1a2e',gold:'#d97706',ice:'#0ea5e9',blood:'#991b1b'};
 return (
 <button key={s.id} onClick={()=>chooseSkin(s.id)}
 title={s.name+(locked?' — Premium (tap to preview)':'')}
 style={{
 flex:1, height:28, borderRadius:5, padding:0, cursor:'pointer',
 border:active?'2px solid var(--c-gold)':'2px solid var(--c-border)',
 background:bg[s.id]??'#333',
 position:'relative',
 boxShadow:active?'0 0 8px rgba(245,158,11,0.4)':'none',
 transition:'all .15s',
 }}>
 {locked&&<span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,background:'rgba(0,0,0,0.55)',borderRadius:3}}>🔒</span>}
 </button>
 );
 })}
 </div>
 </div>
 {/* Skin preview/buy modal */}
 {previewSkin && (()=>{
 const s=DICE_SKINS.find(sk=>sk.id===previewSkin);
 if(!s)return null;
 const bg:Record<string,string>={classic:'#8b5cf6',obsidian:'#1a1a2e',gold:'#d97706',ice:'#0ea5e9',blood:'#991b1b'};
 return (
 <div style={{ position:'fixed',inset:0,zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)' }}
 onClick={()=>setPreviewSkin(null)}>
 <div onClick={e=>e.stopPropagation()} style={{ background:'var(--c-surface)',border:'1px solid var(--c-border)',borderRadius:16,padding:24,maxWidth:300,width:'90%',textAlign:'center' }}>
 <div style={{ width:64,height:64,borderRadius:12,background:bg[s.id],margin:'0 auto 12px',boxShadow:'0 4px 20px rgba(0,0,0,0.5)' }} />
 <div style={{ fontFamily:'var(--ff-body)',fontWeight:900,fontSize:18,color:'var(--t-1)',marginBottom:4 }}>{s.name}</div>
 <div style={{ fontFamily:'var(--ff-body)',fontSize:12,color:'var(--t-3)',marginBottom:16 }}>Premium dice skin</div>
 <button className="btn-gold" style={{ width:'100%',justifyContent:'center',marginBottom:8 }}
 onClick={()=>buySkin(s.id)} disabled={buyLoading}>
 Unlock for $2.99
 </button>
 <button className="btn-ghost btn-sm" style={{ width:'100%',justifyContent:'center' }} onClick={()=>setPreviewSkin(null)}>
 Cancel
 </button>
 </div>
 </div>
 );
 })()}
 <button className="btn-gold" onClick={rollAll} disabled={rolling || queue.length === 0}
 style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--fs-sm)', fontWeight: 700,
 opacity: (rolling || queue.length === 0) ? 0.45 : 1 }}>
 {rolling ? ' Rolling…' : ' Roll'}
 </button>
 </div>



 </div>
 )}
 </>
 , document.body);
}
