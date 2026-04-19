import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';

interface CharacterHeaderProps {
 character: Character;
 computed: ComputedStats;
 onOpenSettings: () => void;
 onOpenMap?: () => void;
 onUpdateXP?: (xp: number) => void;
 onOpenAvatarPicker?: () => void;
 onToggleInspiration?: () => void;
 onOpenRest?: () => void;
 onUpdateHP?: (delta: number, tempHP?: number) => void;
 onUpdateAC?: (ac: number) => void;
 onUpdateSpeed?: (speed: number) => void;
 onShare?: () => void;
}

function hpColor(current: number, max: number): string {
 const pct = max > 0 ? current / max : 0;
 if (pct > 0.5) return 'var(--hp-full)'; // full green above half HP
 if (pct > 0.25) return 'var(--hp-mid)'; // yellow between 25% and 50%
 return 'var(--hp-low)'; // red/orange below 25%
}

/**
 * v2.27: The big HP card has moved out of HPStatsPanel and into the header row,
 * sitting between the class/species text and the Settings button. A thin
 * gradient HP bar spans the full bottom edge.
 */
export default function CharacterHeader({
 character, onOpenSettings, onOpenAvatarPicker,
 onToggleInspiration, onOpenRest, onShare, onOpenMap,
 onUpdateHP,
}: CharacterHeaderProps) {

 const [hpInput, setHpInput] = useState('');

 // v2.32 Phase 3: multi-class display with both subclasses
 const isMulticlass = !!character.secondary_class && (character.secondary_level ?? 0) > 0;
 const classDisplay = isMulticlass
 ? `${character.class_name} ${character.level} / ${character.secondary_class} ${character.secondary_level}`
 : `${character.class_name} ${character.level}`;

 // Combined subclass label:
 //   - Both subclasses set: "Champion / Evocation"
 //   - Only primary: "Champion"
 //   - Only secondary (rare — primary not yet at subclass unlock): "— / Evocation"
 //   - Neither: ""
 const subclassDisplay = (() => {
 const primarySub = character.subclass;
 const secondarySub = character.secondary_subclass;
 if (isMulticlass) {
 if (primarySub && secondarySub) return `${primarySub} / ${secondarySub}`;
 if (primarySub && !secondarySub) return primarySub;
 if (!primarySub && secondarySub) return `— / ${secondarySub}`;
 return '';
 }
 return primarySub ?? '';
 })();

 const hpCol = hpColor(character.current_hp, character.max_hp);
 const hpPct = character.max_hp > 0 ? Math.min(1, character.current_hp / character.max_hp) : 0;

 function applyDamage() { const n = parseInt(hpInput); if (!isNaN(n) && n > 0) { onUpdateHP?.(-n); setHpInput(''); } }
 function applyHeal() { const n = parseInt(hpInput); if (!isNaN(n) && n > 0) { onUpdateHP?.(n); setHpInput(''); } }
 function applyTemp() { const n = parseInt(hpInput); if (!isNaN(n) && n >= 0) { onUpdateHP?.(0, n); setHpInput(''); } }

 function handleKey(e: React.KeyboardEvent) {
 if (e.key === 'Enter') applyDamage();
 }

 return (
 <div style={{
 position: 'relative',
 background: 'var(--c-surface)',
 borderBottom: '1px solid var(--c-border)',
 padding: '14px 24px 16px 24px',
 display: 'flex',
 alignItems: 'center',
 gap: 16,
 flexWrap: 'wrap',
 }}>
 {/* Avatar */}
 <button
 onClick={onOpenAvatarPicker}
 style={{
 width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
 background: 'var(--c-raised)', border: '2px solid var(--c-border-m)',
 overflow: 'hidden', cursor: 'pointer', padding: 0,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 }}
 title="Change portrait"
 >
 {character.avatar_url ? (
 <img src={character.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
 ) : (
 <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-gold-l)' }}>
 {character.name?.charAt(0).toUpperCase() ?? '?'}
 </span>
 )}
 </button>

 {/* Identity */}
 <div style={{ flex: '1 1 200px', minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
 <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--t-1)', letterSpacing: '0.01em' }}>
 {character.name}
 </span>
 <button
 onClick={onToggleInspiration}
 title={character.inspiration ? 'Click to use Inspiration' : 'Click to gain Inspiration'}
 style={{
 fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, padding: '2px 8px',
 borderRadius: 999, cursor: 'pointer', letterSpacing: '0.08em',
 border: `1px solid ${character.inspiration ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
 background: character.inspiration ? 'var(--c-gold-bg)' : 'transparent',
 color: character.inspiration ? 'var(--c-gold-l)' : 'var(--t-3)',
 transition: 'all 0.2s',
 }}
 >
 {character.inspiration ? 'INSPIRED' : 'Inspiration'}
 </button>
 </div>
 <div style={{ fontSize: 12, color: 'var(--t-2)', marginTop: 1 }}>
 {classDisplay}{subclassDisplay ? ` — ${subclassDisplay}` : ''} · {character.species}{character.background ? ` · ${character.background}` : ''}
 </div>
 </div>

 {/* v2.27: HP block — sits between class/species and Settings */}
 {onUpdateHP && (
 <div style={{
 display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
 padding: '6px 10px', borderRadius: 'var(--r-md)',
 background: 'var(--c-card)',
 border: `1px solid ${hpCol}40`,
 flexWrap: 'wrap',
 }}>
 <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
 <span
 className={hpPct < 0.25 && character.current_hp > 0 ? 'hp-critical' : ''}
 style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: '1.3rem', color: hpCol, lineHeight: 1 }}
 >
 {character.current_hp}
 </span>
 <span style={{ fontSize: 11, color: 'var(--t-3)', fontWeight: 500 }}>/ {character.max_hp}</span>
 {character.temp_hp > 0 && (
 <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', padding: '1px 5px', borderRadius: 999, marginLeft: 4 }}>
 +{character.temp_hp}
 </span>
 )}
 <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-3)', marginLeft: 2 }}>HP</span>
 </div>
 <input
 type="text"
 inputMode="numeric"
 value={hpInput}
 onChange={e => setHpInput(e.target.value.replace(/[^0-9]/g, ''))}
 onKeyDown={handleKey}
 style={{
 width: 48, fontSize: 12, fontFamily: 'var(--ff-stat)', fontWeight: 600,
 textAlign: 'center', padding: '4px 6px', borderRadius: 6,
 border: '1px solid var(--c-border-m)', background: 'var(--c-raised)',
 color: 'var(--t-1)',
 MozAppearance: 'textfield',
 }}
 />
 <button
 onClick={applyDamage}
 style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-str-bdr)', background: 'var(--stat-str-bg)', color: 'var(--stat-str)', whiteSpace: 'nowrap' }}
 >
 Damage
 </button>
 <button
 onClick={applyHeal}
 style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)', whiteSpace: 'nowrap' }}
 >
 Heal
 </button>
 <button
 onClick={applyTemp}
 style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', whiteSpace: 'nowrap' }}
 >
 Temp
 </button>
 </div>
 )}

 {/* Actions */}
 <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
 {onShare && (
 <button className="btn-ghost btn-sm" onClick={onShare} style={{ color: 'var(--t-2)', fontSize: 12 }}>
 Share
 </button>
 )}
 <button className="btn-secondary btn-sm" onClick={onOpenRest} style={{ fontSize: 12 }}>
 Rest
 </button>
 {onOpenMap && (
 <button className="btn-ghost btn-sm" onClick={onOpenMap} title="Battle Map"
 style={{ fontSize: 12, color: 'var(--t-2)' }}>
 Map
 </button>
 )}
 <button
 className="btn-ghost btn-sm"
 onClick={onOpenSettings}
 style={{ color: character.level < 20 ? 'var(--c-gold-l)' : 'var(--t-2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
 title={character.level < 20 ? 'Level up available — open Settings' : 'Settings'}
 >
 Settings
 {character.level < 20 && (
 <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '1px 5px', borderRadius: 999 }}>
 LVL UP
 </span>
 )}
 </button>
 </div>

 {/* v2.27: thin gradient HP bar along the bottom edge of the header */}
 {character.max_hp > 0 && (
 <div style={{
 position: 'absolute', left: 0, right: 0, bottom: 0,
 height: 3, background: 'rgba(255,255,255,0.04)',
 overflow: 'hidden', pointerEvents: 'none',
 }}>
 <div style={{
 height: '100%',
 width: `${Math.max(1, hpPct * 100)}%`,
 background: hpCol,
 boxShadow: `0 0 6px ${hpCol}`,
 transition: 'width 0.4s ease, background 0.3s ease',
 }} />
 </div>
 )}

 {/* Death saves strip — only shown when HP = 0; sits above the gradient bar */}
 {character.current_hp <= 0 && (
 <div style={{ position: 'absolute', bottom: 3, left: 0, right: 0, padding: '6px 24px', borderTop: '1px solid rgba(229,57,53,0.3)', background: 'rgba(229,57,53,0.06)', display: 'flex', gap: 16, alignItems: 'center' }}>
 <span style={{ fontSize: 10, fontWeight: 700, color: '#ff8a80', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Death Saves</span>
 <div style={{ display: 'flex', gap: 3 }}>
 {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #34d399', background: i < (character.death_saves_successes ?? 0) ? '#34d399' : 'transparent' }} />)}
 </div>
 <span style={{ fontSize: 10, color: 'var(--t-2)' }}>Successes</span>
 <div style={{ display: 'flex', gap: 3 }}>
 {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #e53935', background: i < (character.death_saves_failures ?? 0) ? '#e53935' : 'transparent' }} />)}
 </div>
 <span style={{ fontSize: 10, color: 'var(--t-2)' }}>Failures</span>
 </div>
 )}
 </div>
 );
}