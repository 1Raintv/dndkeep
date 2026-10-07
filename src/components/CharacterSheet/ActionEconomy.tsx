import {getEnkindledTurn,advancePsionicSoloTurn,PsionicRequestError} from '../../lib/api/psionicTurns';
import { useState, useEffect, useRef } from 'react';
import { useToast } from '../shared/Toast';
import { useCombatSelector, useCombatCurrentActor } from '../../context/CombatContext';
import { advanceTurn } from '../../lib/combatEncounter';

// Action, Bonus Action, Reaction and Movement refresh for a new turn.
interface ActionState {
 action: boolean;
 bonusAction: boolean;
 reaction: boolean;
 movedFeet: number;
}

interface ActionEconomyProps {
 trackPsionicTurns?:boolean;
 speedFeet: number;
 onActionUsed?: (action: string, used: boolean) => void;
 onNewTurn?: () => void;
 // v2.46.0: external sync — parent can push action/BA used state in (e.g. when
 // a spell with 1A casting time is cast, the parent flips actionUsedExternal=true
 // and ActionEconomy reflects it visually).
 // v2.76.0: Reactions now also sync externally so the Actions-tab filter
 // chiclet for Reaction shares state with this panel.
 actionUsedExternal?: boolean;
 bonusActionUsedExternal?: boolean;
 reactionUsedExternal?: boolean;
 /** v2.594.0 — when set and this character is the CURRENT ACTOR in an
  * active encounter, End Turn also advances the combat turn (the
  * user-reported bug: the sheet's End Turn only reset the local
  * action trackers and never moved combat to the next combatant). */
 characterId?: string;
}

const TOKEN = {
 action: { label: 'Action', key: 'action', icon: '', color: '#f59e0b' },
 bonusAction: { label: 'Bonus', key: 'bonusAction', icon: '', color: '#8b5cf6' },
 reaction: { label: 'Reaction', key: 'reaction', icon: '', color: '#3b82f6' },
};

export default function ActionEconomy({ trackPsionicTurns=false, speedFeet, onActionUsed, onNewTurn, actionUsedExternal, bonusActionUsedExternal, reactionUsedExternal, characterId }: ActionEconomyProps) {
 const [state, setState] = useState<ActionState>({
 action: false, bonusAction: false, reaction: false, movedFeet: 0,
 });
 // v2.594.0 — combat awareness. Safe outside a CombatProvider: the
 // context default has encounter=null, so this is a no-op there.
 const encounter = useCombatSelector(s => s.encounter); // v2.645 slice 2
 const currentActor = useCombatCurrentActor();
 const [endingTurn, setEndingTurn] = useState(false);
 const {showToast}=useToast();
 const advancing=useRef(false),mounted=useRef(true);
 const soloAdvance=useRef<{characterId:string;requestId:string;expected:number}|null>(null);
 const sheet=useRef({characterId,encounterId:encounter?.id});
 sheet.current={characterId,encounterId:encounter?.id};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const isMyCombatTurn = !!characterId && !!encounter && encounter.status === 'active'
 && !!currentActor
 && currentActor.participant_type === 'character'
 && currentActor.entity_id === characterId;
 // v2.781 — only a confirmed advance may clear the local turn budget.
 // A failed request must not silently refund actions or reset another sheet.
 async function handleEndTurn() {
 if(advancing.current)return;
 if((!isMyCombatTurn||!encounter)&&(!trackPsionicTurns||!characterId)){reset();return;}
 advancing.current=true;setEndingTurn(true);
 const started=sheet.current;
 const stillHere=()=>mounted.current&&sheet.current.characterId===started.characterId&&sheet.current.encounterId===started.encounterId;
 try {
 if(!isMyCombatTurn||!encounter){
  const turn=await getEnkindledTurn(characterId!);if(!stillHere())return;
  if('soloTurn' in turn.turn){
   if(soloAdvance.current?.characterId!==characterId)soloAdvance.current={characterId:characterId!,requestId:crypto.randomUUID(),expected:turn.turn.soloTurn};
   const request=soloAdvance.current!;
   await advancePsionicSoloTurn(characterId!,request.requestId,request.expected);soloAdvance.current=null;
  }
  if(stillHere())reset();return;
 }
 const result=await advanceTurn(encounter.id);
 if(!stillHere())return;
 if(result.ok)reset();
 else showToast(`Turn could not be completed: ${result.reason}. Your sheet trackers were kept. Check combat before trying again.`, 'error', {duration:0});
 } catch(error) {
 if(error instanceof PsionicRequestError&&error.definitelyNotPaid)soloAdvance.current=null;
 if(stillHere())showToast('Turn advancement could not be confirmed. Your sheet trackers were kept. Check combat before trying again.', 'error', {duration:0});
 } finally {
 advancing.current=false;
 if(mounted.current)setEndingTurn(false);
 }
 }

 // v2.46.0: Sync external action/BA flags into local state so spell casts
 // visually mark the correct action token as consumed.
 useEffect(() => {
 if (actionUsedExternal !== undefined && actionUsedExternal !== state.action) {
 setState(s => ({ ...s, action: !!actionUsedExternal }));
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [actionUsedExternal]);
 useEffect(() => {
 if (bonusActionUsedExternal !== undefined && bonusActionUsedExternal !== state.bonusAction) {
 setState(s => ({ ...s, bonusAction: !!bonusActionUsedExternal }));
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [bonusActionUsedExternal]);
 // v2.76.0: Reaction sync — keeps Turn Economy panel in lockstep with
 // the Actions-tab filter chiclet for Reaction.
 useEffect(() => {
 if (reactionUsedExternal !== undefined && reactionUsedExternal !== state.reaction) {
 setState(s => ({ ...s, reaction: !!reactionUsedExternal }));
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [reactionUsedExternal]);

 function toggle(key: keyof Omit<ActionState,'movedFeet'>) {
 setState(s => {
 const newVal = !s[key];
 onActionUsed?.(key, newVal);
 return { ...s, [key]: newVal };
 });
 }

 function addMove(feet: number) {
 setState(s => ({ ...s, movedFeet: Math.max(0, Math.min(speedFeet, s.movedFeet + feet)) }));
 }

 function reset() {
 setState({ action: false, bonusAction: false, reaction: false, movedFeet: 0 });
 onNewTurn?.();
 }

 const movePct = speedFeet > 0 ? (state.movedFeet / speedFeet) * 100 : 0;
 const movingColor = movePct >= 100 ? '#ef4444' : movePct > 50 ? '#f59e0b' : '#22c55e';

 return (
 <div style={{
 background: 'var(--c-surface)',
 border: '1px solid var(--c-border)',
 borderRadius: 'var(--r-lg)',
 padding: 'var(--sp-3)',
 }}>
 {/* v2.77.0: Vertical layout per user spec —
     Header → Action → Bonus Action → Reaction → Movement → End Turn.
     Each action type is now its own full-width row button instead of a
     horizontal token strip, making the panel readable at narrow widths
     (it lives in the left vitals column above Saving Throws on mobile). */}
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--c-gold-l)', marginBottom: 'var(--sp-2)' }}>
 Turn Economy
 </div>

 {/* Stacked Action / Bonus Action / Reaction — each full-width */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--sp-2)' }}>
 {Object.values(TOKEN).map(t => {
 const used = state[t.key as keyof Omit<ActionState,'movedFeet'>];
 const fullLabel = t.key === 'bonusAction' ? 'Bonus Action' : t.label;
 return (
 <button
 key={t.key}
 disabled={endingTurn}
 onClick={() => toggle(t.key as keyof Omit<ActionState,'movedFeet'>)}
 title={used ? `${fullLabel} used — click to undo` : `Mark ${fullLabel} used`}
 style={{
 width: '100%',
 display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
 padding: '8px 12px',
 borderRadius: 8,
 border: `2px solid ${used ? t.color+'60' : t.color+'30'}`,
 background: used ? t.color+'22' : 'transparent',
 cursor: 'pointer', transition: 'all .15s',
 opacity: used ? 0.5 : 1,
 textAlign: 'left',
 }}
 >
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, color: used ? 'var(--t-3)' : t.color, letterSpacing: '.08em', textTransform: 'uppercase' }}>
 {fullLabel}
 </span>
 <span style={{
 fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
 color: used ? '#ef4444' : t.color,
 letterSpacing: '.08em', textTransform: 'uppercase',
 display: 'inline-flex', alignItems: 'center', gap: 4,
 }}>
 {used && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />}
 {used ? 'Used' : 'Available'}
 </span>
 </button>
 );
 })}
 </div>

 {/* Movement tracker — sits between the three action rows and End Turn */}
 {speedFeet > 0 && (
 <div style={{ marginBottom: 'var(--sp-2)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
 Movement
 </span>
 <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
 <button disabled={endingTurn} onClick={() => addMove(-5)} style={{ background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: 'var(--t-2)', fontSize: 11, width: 18, height: 18, cursor: 'pointer', lineHeight: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, color: movingColor, minWidth: 56, textAlign: 'center' }}>
 {state.movedFeet}/{speedFeet}ft
 </span>
 <button disabled={endingTurn} onClick={() => addMove(5)} style={{ background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: 'var(--t-2)', fontSize: 11, width: 18, height: 18, cursor: 'pointer', lineHeight: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
 </div>
 </div>
 <div style={{ height: 4, background: 'var(--c-border)', borderRadius: 2, overflow: 'hidden' }}>
 <div style={{ height: '100%', width: `${movePct}%`, background: movingColor, borderRadius: 2, transition: 'width .2s, background .2s' }} />
 </div>
 </div>
 )}

 {/* End Turn button at the bottom — full width, prominent */}
 <button
 onClick={handleEndTurn}
 disabled={endingTurn}
 style={{
 width: '100%',
 opacity: endingTurn ? 0.6 : 1,
 fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
 padding: '8px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', minHeight: 0,
 border: '1px solid var(--c-gold-bdr)',
 background: 'var(--c-gold-bg)',
 color: 'var(--c-gold-l)',
 letterSpacing: '.08em', textTransform: 'uppercase',
 transition: 'all .15s',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
 }}
 title={isMyCombatTurn ? "End your combat turn — advances to the next combatant" : "Reset Action / Bonus / Reaction / Movement for a new turn"}
 onMouseEnter={e => {
 (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,160,23,0.22)';
 (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-gold)';
 }}
 onMouseLeave={e => {
 (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-gold-bg)';
 (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-gold-bdr)';
 }}
 >
 ↺ {endingTurn ? 'Ending…' : isMyCombatTurn ? 'End Turn →' : 'End Turn'}
 </button>
 </div>
 );
}
