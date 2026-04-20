import { useState, useEffect } from 'react';

// Per 2024 rules: Action, Bonus Action, Reaction reset each round; Movement tracked separately
interface ActionState {
 action: boolean;
 bonusAction: boolean;
 reaction: boolean;
 movedFeet: number;
}

interface ActionEconomyProps {
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
}

const TOKEN = {
 action: { label: 'Action', key: 'action', icon: '', color: '#f59e0b' },
 bonusAction: { label: 'Bonus', key: 'bonusAction', icon: '', color: '#8b5cf6' },
 reaction: { label: 'Reaction', key: 'reaction', icon: '', color: '#3b82f6' },
};

export default function ActionEconomy({ speedFeet, onActionUsed, onNewTurn, actionUsedExternal, bonusActionUsedExternal, reactionUsedExternal }: ActionEconomyProps) {
 const [state, setState] = useState<ActionState>({
 action: false, bonusAction: false, reaction: false, movedFeet: 0,
 });

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
 <button onClick={() => addMove(-5)} style={{ background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: 'var(--t-2)', fontSize: 11, width: 18, height: 18, cursor: 'pointer', lineHeight: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, color: movingColor, minWidth: 56, textAlign: 'center' }}>
 {state.movedFeet}/{speedFeet}ft
 </span>
 <button onClick={() => addMove(5)} style={{ background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: 'var(--t-2)', fontSize: 11, width: 18, height: 18, cursor: 'pointer', lineHeight: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
 </div>
 </div>
 <div style={{ height: 4, background: 'var(--c-border)', borderRadius: 2, overflow: 'hidden' }}>
 <div style={{ height: '100%', width: `${movePct}%`, background: movingColor, borderRadius: 2, transition: 'width .2s, background .2s' }} />
 </div>
 </div>
 )}

 {/* End Turn button at the bottom — full width, prominent */}
 <button
 onClick={reset}
 style={{
 width: '100%',
 fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
 padding: '8px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', minHeight: 0,
 border: '1px solid var(--c-gold-bdr)',
 background: 'var(--c-gold-bg)',
 color: 'var(--c-gold-l)',
 letterSpacing: '.08em', textTransform: 'uppercase',
 transition: 'all .15s',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
 }}
 title="Reset Action / Bonus / Reaction / Movement for a new turn"
 onMouseEnter={e => {
 (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,160,23,0.22)';
 (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-gold)';
 }}
 onMouseLeave={e => {
 (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-gold-bg)';
 (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-gold-bdr)';
 }}
 >
 ↺ End Turn
 </button>
 </div>
 );
}
