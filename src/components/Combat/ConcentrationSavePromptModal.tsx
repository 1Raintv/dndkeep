import {getSpellById} from '../../lib/hooks/useSpells';
// v2.118.0 — Phase I pt 2 of the Combat Backbone
//
// Player-facing prompt for concentration saves when the
// 'concentration_on_damage' automation resolves to 'prompt'. Subscribes to
// pending_concentration_saves and auto-opens for any offered row on the
// current user's character. Shows a 120s countdown and a "Roll Save" button.
// v2.786 — prompt, timeout and recovered rolls share the saved server result.

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {resolveConcentrationSave,savedConcentrationRolls,CONCENTRATION_ROLL_CHANGED,type ConcentrationResolutionSource} from '../../lib/api/concentrationSaves';

interface Props {
  characterId: string;
}

interface PendingRow {
  id: string;
  campaign_id: string;
  character_id: string;
  spell_name: string;
  damage: number;
  dc: number;
  con_bonus: number;
  state: 'offered' | 'resolved' | 'expired';
  expires_at: string;
  offered_at: string;
}

export default function ConcentrationSavePromptModal({ characterId }: Props) {
  const [offers,setOffers]=useState<PendingRow[]>([]);
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState(false),busyRef=useRef(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [saved,setSaved]=useState(()=>savedConcentrationRolls(characterId));
  const currentId=useRef(characterId),loadSequence=useRef(0);currentId.current=characterId;
  const load=useCallback(async()=>{
    const sequence=++loadSequence.current;
    const {data,error:readError}=await supabase.from('pending_concentration_saves').select('*')
      .eq('character_id',characterId).eq('state','offered').order('offered_at',{ascending:true});
    if(sequence!==loadSequence.current||currentId.current!==characterId)return;
    if(readError){setError('Concentration saves could not be loaded. Check your connection.');return;}
    setOffers((data??[]) as PendingRow[]);
  },[characterId]);
  useEffect(()=>{
    setOffers([]);setError('');setNotice('');setBusy(false);busyRef.current=false;
    const refresh=()=>setSaved(savedConcentrationRolls(characterId));refresh();void load();
    window.addEventListener(CONCENTRATION_ROLL_CHANGED,refresh);window.addEventListener('storage',refresh);
    const channel=supabase.channel(`conc-prompts-${characterId}`).on('postgres_changes',{
      event:'*',schema:'public',table:'pending_concentration_saves',filter:`character_id=eq.${characterId}`,
    },()=>{void load();}).subscribe();
    return ()=>{loadSequence.current++;window.removeEventListener(CONCENTRATION_ROLL_CHANGED,refresh);window.removeEventListener('storage',refresh);void supabase.removeChannel(channel);};
  },[characterId,load]);
  const submit=useCallback(async(id:string,source:ConcentrationResolutionSource)=>{
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=await resolveConcentrationSave(characterId,id,source);
      if(currentId.current!==characterId)return;
      setOffers(previous=>previous.filter(offer=>offer.id!==id));
      setNotice(result.outcome==='obsolete'?'Earlier concentration save retired. Your current spell was not changed.':
        result.replayed?`Earlier save confirmed: ${result.outcome} (roll ${result.d20}, total ${result.total}). Your current spell is unchanged.`:
        `Concentration ${result.outcome==='passed'?'maintained':'broken'}: saved roll ${result.d20}, total ${result.total}.`);
      await load();
    }catch(failure){if(currentId.current===characterId)setError(failure instanceof Error?failure.message:'Result not confirmed. Confirm the saved roll.');}
    finally{if(currentId.current===characterId){busyRef.current=false;setBusy(false);setSaved(savedConcentrationRolls(characterId));}}
  },[characterId,load]);
  useEffect(()=>{
    if(!offers.length)return;setNow(Date.now());const id=setInterval(()=>setNow(Date.now()),250);return ()=>clearInterval(id);
  },[offers.length]);
  const urgent=useMemo(()=>[...offers].sort((a,b)=>new Date(a.expires_at).getTime()-new Date(b.expires_at).getTime())[0]??null,[offers]);
  useEffect(()=>{
    // One attempt on expiry. An unknown result stays a visible saved roll;
    // never launch a fresh request on every countdown tick.
    if(urgent&&!busy&&!error&&!saved.some(roll=>roll.pendingId===urgent.id)&&new Date(urgent.expires_at).getTime()<=now)void submit(urgent.id,'timeout');
  },[urgent,now,busy,error,saved,submit]);
  const recovery=(saved.length||error||notice)?<section role="status" aria-label="Concentration recovery" style={{padding:12,border:'1px solid var(--c-border)',borderRadius:8,marginBottom:12}}>
    {saved.map(roll=><div key={roll.pendingId} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      <span>Saved concentration roll: {roll.d20}. Result awaiting confirmation.</span>
      {roll.pendingId!==urgent?.id&&<button className="btn-secondary" disabled={busy} onClick={()=>void submit(roll.pendingId,roll.source)}>Confirm saved save</button>}
    </div>)}
    {error&&<p role="alert">{error}</p>}{notice&&<p>{notice} <button className="btn-secondary" onClick={()=>setNotice('')}>Dismiss</button></p>}
  </section>:null;
  if(!urgent)return recovery;
  const expiresAt=new Date(urgent.expires_at).getTime(),offeredAt=new Date(urgent.offered_at).getTime();
  const secondsLeft=Math.max(0,Math.ceil((expiresAt-now)/1000));
  const progressPct=Math.max(0,Math.min(100,((expiresAt-now)/Math.max(1,expiresAt-offeredAt))*100));
  const timerColor=secondsLeft<=15?'#ef4444':secondsLeft<=45?'#facc15':'#60a5fa';
  const hasSaved=saved.some(roll=>roll.pendingId===urgent.id);
  const onRoll=()=>void submit(urgent.id,'player');

  const spellName=getSpellById(urgent.spell_name)?.name??urgent.spell_name;
  const bonusStr = `${urgent.con_bonus >= 0 ? '+' : ''}${urgent.con_bonus}`;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 30000, padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-label="Concentration save" style={{
        background: 'var(--c-card)', borderRadius: 14,
        border: `2px solid ${timerColor}`,
        maxHeight: '90vh', overflowY: 'auto', maxWidth: 440, width: '100%',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 40px ${timerColor}66, 0 10px 40px rgba(0,0,0,0.8)`,
        animation: 'modalIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: `${timerColor}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: timerColor }}>
              ↺ Concentration Save
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800, color: 'var(--t-1)', marginTop: 2 }}>
              Hold focus on {spellName}?
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--ff-stat)', fontSize: 28, fontWeight: 900,
            color: timerColor,
            minWidth: 48, textAlign: 'center',
          }}>
            {secondsLeft}
          </div>
        </div>

        {/* Countdown bar */}
        <div style={{ height: 4, background: '#0d1117' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: timerColor,
            transition: 'width 0.25s linear',
          }} />
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recovery}
          <div style={{
            padding: 10, borderRadius: 8,
            background: '#0d1117', border: '1px solid var(--c-border)',
            fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
            lineHeight: 1.5,
          }}>
            You took <strong style={{ color: '#f87171' }}>{urgent.damage}</strong> damage while concentrating on <strong style={{ color: 'var(--t-1)' }}>{spellName}</strong>.
            Roll a <strong style={{ color: '#60a5fa' }}>DC {urgent.dc}</strong> CON save
            (1d20 {bonusStr}) to maintain concentration.
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
            If the timer runs out, the save will be rolled automatically.
          </div>

          <button
            onClick={onRoll}
            disabled={busy}
            className="btn-gold"
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 900,
              padding: '10px 14px', borderRadius: 6,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              minHeight: 0,
            }}
          >
            {hasSaved?'Confirm saved save':'⚄ Roll Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
