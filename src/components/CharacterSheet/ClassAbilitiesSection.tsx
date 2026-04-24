import { useState } from 'react';
import type { Character } from '../../types';
import { CLASS_COMBAT_ABILITIES, type ClassAbility } from '../../data/classAbilities';
import { PSION_DISCIPLINES } from '../../data/psionDisciplines';
import { logAction } from '../shared/ActionLog';
import { rollDice } from '../../lib/spellParser';

interface Props {
 character: Character;
 combatFilter: 'all' | 'action' | 'bonus' | 'reaction' | 'limited';
 onUpdate: (u: Partial<Character>) => void;
 userId?: string;
 campaignId?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
 action: ' Action',
 bonus: ' Bonus',
 reaction: ' Reaction',
 special: '⬡ Special',
 free: 'Free',
};

const ACTION_COLORS: Record<string, string> = {
 action: '#60a5fa',
 bonus: '#fbbf24',
 reaction: '#34d399',
 special: '#c084fc',
 free: 'var(--t-3)',
};

function UseTracker({ abilityName, max, rest, character, onUpdate }: {
 abilityName: string; max: number; rest: 'short' | 'long';
 character: Character; onUpdate: (u: Partial<Character>) => void;
}) {
 const uses = ((character.feature_uses as Record<string, number>) ?? {})[abilityName] ?? 0;
 const remaining = max - uses;

 function toggle(targetUsed: number) {
 const clamped = Math.min(max, Math.max(0, targetUsed));
 onUpdate({
 feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [abilityName]: clamped }
 });
 }

 // Pool display (> 8 uses or isPool)
 if (max > 8) {
 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
 <button onClick={() => toggle(uses + 1)} style={trackBtnStyle}>−1</button>
 <span style={{
 fontFamily: 'var(--ff-stat)', fontSize: 13, fontWeight: 700,
 color: remaining > 0 ? 'var(--c-gold-l)' : 'var(--t-3)',
 minWidth: 52, textAlign: 'center' as const,
 }}>
 {remaining}/{max}
 </span>
 <button onClick={() => toggle(uses - 1)} style={trackBtnStyle}>+1</button>
 <button onClick={() => toggle(0)} style={{ ...trackBtnStyle, color: 'var(--t-3)', fontSize: 9 }}>↺</button>
 <span style={{ fontSize: 9, color: rest === 'short' ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--ff-body)' }}>
 {rest === 'short' ? 'Short/LR' : 'Long Rest'}
 </span>
 </div>
 );
 }

 // v2.81.0: Chiclets fill LEFT → RIGHT, empty from the RIGHT as uses are
 // consumed. Matches the LevelTab pattern on Spells/Actions tabs, where
 // available slots sit on the LEFT and spent slots appear on the RIGHT.
 // Previously this was inverted (used on LEFT), which was inconsistent
 // with the rest of the app's chiclet direction.
 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
 {Array.from({ length: max }).map((_, i) => {
 // Box i is available if its index is within the remaining count.
 // E.g. max=8, uses=2 → remaining=6 → indices 0-5 filled (LEFT side),
 // indices 6-7 empty (RIGHT side). Clicking a filled box consumes it
 // (becomes empty); clicking an empty box restores it (becomes filled).
 const isAvailable = i < remaining;
 return (
 <button
 key={i}
 onClick={() => toggle(isAvailable ? uses + 1 : uses - 1)}
 title={isAvailable
 ? `Use a die (${rest === 'short' ? 'Short' : 'Long'} Rest recovers)`
 : `Restore a die (${rest === 'short' ? 'Short' : 'Long'} Rest recovers)`}
 style={{
 width: 12, height: 12, borderRadius: 2, cursor: 'pointer', padding: 0,
 minHeight: 0, minWidth: 0,            // override global button 36px touch target
 background: isAvailable ? 'var(--c-gold-l)' : 'transparent',
 border: `1.5px solid ${isAvailable ? 'var(--c-gold-l)' : 'var(--c-border-m)'}`,
 transition: 'all 0.15s', flexShrink: 0, boxSizing: 'border-box',
 }}
 />
 );
 })}
 </div>
 );
}

const trackBtnStyle: React.CSSProperties = {
 width: 24, height: 24, borderRadius: 'var(--r-sm)',
 background: 'var(--c-raised)', border: '1px solid var(--c-border)',
 color: 'var(--t-2)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-body)',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function getMaxUses(ability: ClassAbility, character: Character): number | undefined {
 if (ability.maxUsesFn) {
 const val = ability.maxUsesFn(character);
 if (val === 999) return undefined; // unlimited
 return val;
 }
 return undefined;
}

// Resolve dynamic values in descriptions
function getPsionicDieSize(level: number): string {
 if (level >= 17) return 'd12';
 if (level >= 11) return 'd10';
 if (level >= 5) return 'd8';
 return 'd6';
}

function getPsionicDieCount(level: number): number {
 if (level >= 17) return 12;
 if (level >= 13) return 10;
 if (level >= 9) return 8;
 if (level >= 5) return 6;
 return 4;
}

function resolveDesc(desc: string | ((c: Character) => string), character: Character): string {
 const raw = typeof desc === 'function' ? desc(character) : desc;
 return raw.replace('{{sneak_dice}}', String(Math.ceil(character.level / 2)));
}

export default function ClassAbilitiesSection({ character, combatFilter, onUpdate, userId, campaignId }: Props) {
 const [justUsed, setJustUsed] = useState<string | null>(null);
 const [psionicRollHistory, setPsionicRollHistory] = useState<{ value: number; die: string }[]>([]);
 // v2.80.0: which ability card is expanded (click chevron to open detail panel)
 const [expandedAbility, setExpandedAbility] = useState<string | null>(null);

 async function handleUseAbility(ability: ClassAbility, cost?: number) {
 // v2.189.0 — Phase Q.0 pt 30: explicit Psionic Energy Die cost gate.
 // Abilities with `pedCost: N` (Warp Space=1, Mass Teleport=4, etc.)
 // require N dice in the pool; insufficient pool aborts with an alert
 // rather than silently deducting and going negative. Pool deduction
 // happens here in one shot rather than in the legacy isPool branch
 // below (which always deducted exactly 1, regardless of cost).
 const pedCost = (ability as any).pedCost as number | undefined;
 if (typeof pedCost === 'number' && pedCost > 0) {
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 const currentDice = (resources['psionic-energy-dice'] as number | undefined) ?? 0;
 if (currentDice < pedCost) {
 // Insufficient pool — bail before logging or flashing.
 alert(`Not enough Psionic Energy Dice. Need ${pedCost}, have ${currentDice}.`);
 return;
 }
 const nextResources = { ...resources, 'psionic-energy-dice': currentDice - pedCost };
 onUpdate({ class_resources: nextResources });
 }

 // Mark as used if it has limited uses
 if (cost !== undefined) {
 const current = ((character.feature_uses as Record<string, number>) ?? {})[ability.name] ?? 0;
 onUpdate({
 feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [ability.name]: current + 1 }
 });
 }
 // v2.189.0 — Legacy isPool deduction: still fires for the
 // Psionic Energy Dice row itself (which has isPool but no
 // pedCost — clicking Spend Die on that row deducts exactly 1
 // and rolls). For abilities with pedCost set, we skip this
 // branch since deduction already happened above.
 if (typeof pedCost !== 'number' && (ability.id === 'psionic-energy-dice' || (ability as any).isPool)) {
 const resources = { ...(character.class_resources as Record<string, number> ?? {}) };
 if (resources['psionic-energy-dice'] !== undefined) {
 resources['psionic-energy-dice'] = Math.max(0, (resources['psionic-energy-dice'] as number) - 1);
 onUpdate({ class_resources: resources });
 }
 }
 // For psionic energy dice — roll the die and show in action log
 let diceExpr: string | undefined;
 let rollResult: { total: number; rolls: number[] } | undefined;
 if ((ability as any).psionicDie) {
 const dieSize = getPsionicDieSize(character.level);
 diceExpr = `1${dieSize}`;
 rollResult = rollDice(diceExpr);
 }
 // Resolve description (may be a function)
 const desc = resolveDesc((ability as any).description ?? '', character);
 // Log to action log
 await logAction({
 campaignId: campaignId ?? null,
 characterId: character.id,
 characterName: character.name,
 actionType: (ability as any).psionicDie ? 'roll' : ability.actionType === 'action' ? 'spell' :
 ability.actionType === 'bonus' ? 'spell' :
 ability.actionType === 'reaction' ? 'save' : 'roll',
 actionName: (ability as any).psionicDie
 ? `Spent Psionic Energy Die (1${getPsionicDieSize(character.level)})`
 : `Used ${ability.name}`,
 diceExpression: diceExpr,
 individualResults: rollResult?.rolls,
 total: rollResult?.total ?? 0,
 notes: (ability as any).psionicDie
 ? `Rolled 1${getPsionicDieSize(character.level)} = ${rollResult?.total} · ${getPsionicDieCount(character.level) - 1} dice remaining`
 : desc.slice(0, 100) + (desc.length > 100 ? '…' : ''),
 });
 // Store psionic roll for inline display
 if ((ability as any).psionicDie && rollResult) {
 const dieSize = getPsionicDieSize(character.level);
 setPsionicRollHistory(prev => [{ value: rollResult!.total, die: dieSize }, ...prev].slice(0, 5));
 }
 // Brief flash feedback
 setJustUsed(ability.name);
 setTimeout(() => setJustUsed(null), 2000);
 }
 const abilities = CLASS_COMBAT_ABILITIES[character.class_name] ?? [];

 // Inject active/both psychic disciplines as usable abilities
 const disciplineAbilities: ClassAbility[] = [];
 if (character.class_name === 'Psion') {
 const chosen: string[] = Array.isArray((character.class_resources as any)?.['psion-disciplines'])
 ? (character.class_resources as any)['psion-disciplines'] as string[]
 : [];
 for (const id of chosen) {
 const disc = PSION_DISCIPLINES.find(d => d.id === id);
 if (!disc || disc.type === 'passive') continue;
 disciplineAbilities.push({
 name: disc.name,
 actionType: disc.actionType ?? 'action',
 description: disc.description,
 minLevel: 2,
 isPool: true,
 rest: 'long',
 // Mark as psionic die cost
 ...(disc.dieCost ? { psionicDie: true } : {}),
 } as any);
 }
 }
 const allAbilities = [...abilities, ...disciplineAbilities];

 // Filter by level and action type
 const filtered = allAbilities.filter(a => {
 if (a.minLevel > character.level) return false;
 if (combatFilter === 'limited') return a.maxUsesFn !== undefined || (a as any).isPool === true || (a as any).psionicDie === true;
 if (combatFilter === 'all') return true;
 if (combatFilter === 'action') return a.actionType === 'action';
 if (combatFilter === 'bonus') return a.actionType === 'bonus';
 if (combatFilter === 'reaction') return a.actionType === 'reaction';
 return true;
 });

 if (filtered.length === 0) return null;

 return (
 <div style={{ marginTop: 'var(--sp-3)' }}>
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
 letterSpacing: '0.12em', textTransform: 'uppercase' as const,
 color: '#a78bfa', marginBottom: 8,
 }}>
 {character.class_name} Abilities
 </div>

 {/* Split disciplines into their own sub-section */}
 {disciplineAbilities.length > 0 && filtered.some(a => disciplineAbilities.includes(a)) && (
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
 textTransform: 'uppercase' as const, color: '#c084fc', marginBottom: 6, marginTop: 4 }}>
 Psychic Disciplines
 </div>
 )}
 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
 {filtered.map(ability => {
 const maxUses = getMaxUses(ability, character);
 const acColor = ACTION_COLORS[ability.actionType] ?? 'var(--t-3)';
 const actionLabel = ACTION_LABELS[ability.actionType] ?? '';
 const descShort = resolveDesc(ability.description, character);
 const descLong = (ability as any).descriptionLong
 ? resolveDesc((ability as any).descriptionLong, character)
 : null;
 const isExpanded = expandedAbility === ability.name;

 return (
 <div
 key={ability.name}
 style={{
 background: 'var(--c-surface)',
 border: `1px solid ${acColor}25`,
 borderLeft: `3px solid ${acColor}`,
 borderRadius: 'var(--r-md)',
 overflow: 'hidden',
 }}
 >
 {/* v2.81.0: Row sized to match spell & attack rows — padding 10px 14px,
     name font 14, tags 2px 7px. Same visual weight as the spell rows below
     so Psion cards and spells feel like siblings. Chevron reveals more detail. */}
 <div style={{
 display: 'flex', alignItems: 'center', gap: 8,
 padding: '10px 14px', flexWrap: 'wrap' as const,
 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: 'var(--t-1)', flex: '1 1 auto', minWidth: 120 }}>
 {ability.name}
 </span>
 {ability.actionType !== 'free' && (
 <span style={{
 fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
 color: acColor, background: acColor + '15',
 border: `1px solid ${acColor}40`,
 borderRadius: 999, padding: '2px 7px', flexShrink: 0,
 }}>
 {actionLabel}
 </span>
 )}
 {ability.isPool && (
 <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 999, padding: '2px 7px', flexShrink: 0 }}>
 RESOURCE
 </span>
 )}

 {/* Use tracker chiclets — inline, no label */}
 {maxUses !== undefined && ability.rest && (
 <UseTracker
 abilityName={ability.name}
 max={maxUses}
 rest={ability.rest}
 character={character}
 onUpdate={onUpdate}
 />
 )}

 {/* v2.81.0: Last rolled psionic die — inline badge visible BEFORE expanding.
     Shows the most recent roll right in the row so players can see results
     at a glance without having to open the detail panel.
     v2.88.0: Slot now ALWAYS renders for psionicDie abilities (not only after
     first roll) so clicking Spend Die doesn't shift the row layout. Empty
     state shows a muted "—" placeholder; once rolled, it flips to the pink
     accent value. */}
 {(ability as any).psionicDie && (() => {
 const hasRoll = psionicRollHistory.length > 0;
 return (
 <span
 title={hasRoll ? `Last roll: ${psionicRollHistory[0].value} on 1${psionicRollHistory[0].die}` : 'No rolls yet — click Spend Die to roll'}
 style={{
 display: 'inline-flex', alignItems: 'center', gap: 4,
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 13,
 padding: '2px 9px', borderRadius: 999,
 background: hasRoll ? 'rgba(232,121,249,0.18)' : 'transparent',
 border: `1px solid ${hasRoll ? 'rgba(232,121,249,0.5)' : 'rgba(232,121,249,0.2)'}`,
 color: hasRoll ? '#e879f9' : 'rgba(232,121,249,0.35)',
 flexShrink: 0,
 transition: 'background 0.25s, border-color 0.25s, color 0.25s',
 minWidth: 64, justifyContent: 'center' as const,
 }}
 >
 <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.7 }}>ROLLED</span>
 {hasRoll ? psionicRollHistory[0].value : '—'}
 </span>
 );
 })()}

 {/* Use / Spend Die / Trigger button
     v2.84.0: Fixed minWidth so the "Used!" flash doesn't resize the button.
     The widest rest label ("Spend Die (1dN)") defines the button width, and
     when it briefly swaps to "Used!" the width stays constant — visual
     feedback without layout reflow of the parent row. */}
 {ability.actionType !== 'free' && (() => {
 // v2.189.0 — Phase Q.0 pt 30: button label includes PED cost when set.
 //   - pedCost: N → "Use (N PED)" (tells player the cost up front)
 //   - reaction → "Trigger" (legacy)
 //   - psionicDie ROW (the PED resource itself) → "Spend Die (1dN)"
 //   - isPool only → "Spend Die" (legacy fallback for old discipline shape)
 //   - everything else → "Use"
 const ped = (ability as any).pedCost as number | undefined;
 const restingLabel =
 typeof ped === 'number' && ped > 0 ? `Use (${ped} PED)` :
 ability.actionType === 'reaction' ? 'Trigger' :
 (ability as any).psionicDie ? `Spend Die (1${getPsionicDieSize(character.level)})` :
 (ability as any).isPool ? 'Spend Die' : 'Use';
 const isFlashing = justUsed === ability.name;
 return (
 <button
 onClick={() => handleUseAbility(ability, maxUses !== undefined ? 1 : undefined)}
 style={{
 padding: '4px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 background: isFlashing ? '#34d399' : acColor + '20',
 border: `1px solid ${isFlashing ? '#34d399' : acColor + '60'}`,
 color: isFlashing ? '#000' : acColor,
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
 letterSpacing: '0.04em',
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 flexShrink: 0, minHeight: 0,
 // Estimate px per character (~7.2px for fontSize 11 + letterSpacing 0.04em)
 // and reserve space for the longest resting label, plus button padding (28px).
 minWidth: restingLabel.length * 7.2 + 28,
 textAlign: 'center' as const,
 }}
 >
 {isFlashing ? 'Used!' : restingLabel}
 </button>
 );
 })()}

 {/* Expand/collapse chevron — v2.86.0: only shown when there's
     additional detail beyond the always-visible short description:
     either a descriptionLong (the Psionic Dice scaling table) or psionic
     roll history worth expanding into. Regular abilities with just a
     short description don't need a chevron — the description is already
     visible below the row header. */}
 {(descLong || ((ability as any).psionicDie && psionicRollHistory.length > 0)) && (
 <button
 onClick={() => setExpandedAbility(isExpanded ? null : ability.name)}
 title={isExpanded ? 'Collapse details' : 'Expand details'}
 aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
 style={{
 background: 'transparent', border: 'none', padding: 0,
 cursor: 'pointer', color: 'var(--t-3)', fontSize: 12,
 width: 20, height: 20, minHeight: 0, minWidth: 0,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 flexShrink: 0,
 transition: 'transform 0.2s',
 transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
 }}
 >
 ▼
 </button>
 )}
 </div>

 {/* v2.86.0: Short description inline — always visible below the
     header row. Users no longer need to expand to see what an ability
     does; the chevron reveals only additional long-form detail. */}
 <div style={{
 padding: '0 14px 10px 14px',
 fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)',
 lineHeight: 1.5,
 }}>
 {descShort}
 </div>

 {/* Expanded detail panel — v2.86.0: only shows long-form detail now.
     Short description is always visible above the row, so we don't
     repeat it here. Panel appears only when descLong exists or psionic
     roll history is present. */}
 {isExpanded && (
 <div style={{
 padding: '8px 12px 10px 12px',
 borderTop: '1px solid var(--c-border)',
 background: 'var(--c-raised)',
 }}>
 {descLong && (
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
 lineHeight: 1.6, whiteSpace: 'pre-wrap' as const,
 }}>
 {descLong}
 </div>
 )}

 {(ability as any).psionicDie && psionicRollHistory.length > 0 && (
 <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' as const }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginRight: 4 }}>
 Recent Rolls:
 </span>
 {psionicRollHistory.map((r, i) => (
 <span key={i} style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: i === 0 ? 13 : 11,
 padding: '1px 7px', borderRadius: 999,
 background: i === 0 ? 'rgba(232,121,249,0.2)' : 'rgba(232,121,249,0.07)',
 border: `1px solid rgba(232,121,249,${i === 0 ? '0.5' : '0.2'})`,
 color: '#e879f9',
 flexShrink: 0,
 }}>
 {r.value}
 </span>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
}
