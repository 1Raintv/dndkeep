import { useState } from 'react';
import type { Character } from '../../types';
import { CLASS_COMBAT_ABILITIES, type ClassAbility } from '../../data/classAbilities';
import { PSION_DISCIPLINES } from '../../data/psionDisciplines';
import { logAction } from '../shared/ActionLog';
import { rollDice } from '../../lib/spellParser';
import { useToast } from '../shared/Toast';

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
 const { showToast } = useToast();
 const [justUsed, setJustUsed] = useState<string | null>(null);
 const [psionicRollHistory, setPsionicRollHistory] = useState<{ value: number; die: string }[]>([]);
 // v2.80.0: which ability card is expanded (click chevron to open detail panel)
 const [expandedAbility, setExpandedAbility] = useState<string | null>(null);

 // v2.190.0 — Phase Q.0 pt 31: refresh a depleted once-per-rest feature
 // by spending Psionic Energy Dice. The "Restore (N PED)" button only
 // renders when the feature is depleted AND the pool has enough dice
 // (see button render around the Use button). This handler does both
 // the deduction and the feature_uses decrement in one update, then
 // logs to the action log so the DM + party see it.
 async function restoreUseFromPed(ability: ClassAbility) {
 const restoreCost = (ability as any).pedRestoreCost as number | undefined;
 if (typeof restoreCost !== 'number' || restoreCost <= 0) return;
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 const currentDice = (resources['psionic-energy-dice'] as number | undefined) ?? 0;
 if (currentDice < restoreCost) {
 showToast(`Not enough Psionic Energy Dice. Need ${restoreCost}, have ${currentDice}.`, 'warn');
 return;
 }
 const fu = ((character.feature_uses as Record<string, number>) ?? {});
 const used = fu[ability.name] ?? 0;
 if (used <= 0) return; // nothing to restore
 onUpdate({
 class_resources: { ...resources, 'psionic-energy-dice': currentDice - restoreCost },
 feature_uses: { ...fu, [ability.name]: Math.max(0, used - 1) },
 });
 await logAction({
 campaignId: campaignId ?? null,
 characterId: character.id,
 characterName: character.name,
 actionType: 'roll',
 actionName: `Restored ${ability.name} (spent ${restoreCost} PED)`,
 notes: `Refreshed feature use mid-rest. ${currentDice - restoreCost} PED remaining.`,
 });
 setJustUsed(`restore:${ability.name}`);
 setTimeout(() => setJustUsed(curr => curr === `restore:${ability.name}` ? null : curr), 1800);
 }

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
 showToast(`Not enough Psionic Energy Dice. Need ${pedCost}, have ${currentDice}.`, 'warn');
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
 const descShort = resolveDesc(ability.description, character);
 const descLong = (ability as any).descriptionLong
 ? resolveDesc((ability as any).descriptionLong, character)
 : null;
 const isExpanded = expandedAbility === ability.name;

 return (
 <div
 key={ability.name}
 style={{
 // v2.238.0 — wrapper now mirrors the regular spell-row wrapper:
 // single thin border that recolors on expand, no left-only accent
 // stripe (the stripe moved INSIDE the row as grid col 1, matching
 // the spell rows below). Background tint flips on expand using
 // the action-type color, the same way spell rows tint by school.
 background: isExpanded ? `${acColor}08` : 'var(--c-surface)',
 border: `1px solid ${isExpanded ? `${acColor}45` : `${acColor}25`}`,
 borderRadius: 'var(--r-md)',
 overflow: 'hidden',
 transition: 'all 0.15s',
 }}
 >
 {/* v2.238.0 — Row converted from flex to the same 8-column grid
     used by the regular spell rows below
     (`70px 3px 1fr 46px 70px 74px 16px 170px`). Mapping:
       Col 0: action-type badge (replaces "Lvl 2" badge)
       Col 1: 3px color stripe (action color, same as school stripe)
       Col 2: name + concentration-style chip + subtitle line
              (recovery + tracker chiclets if any)
       Col 3: empty
       Col 4: empty
       Col 5: PED cost OR last-rolled PED value chip
       Col 6: chevron (when there's an expanded panel)
       Col 7: Use / Spend / Trigger button + optional Restore button
     The whole row is click-to-expand (matching spell rows) when an
     expanded panel exists; otherwise click is a no-op.
     The always-visible short description sits as a slim band BELOW
     the grid row — preserves the v2.86.0 UX where a player can read
     what an ability does without expanding. */}
 {(() => {
 const canExpand = !!(descLong || ((ability as any).psionicDie && psionicRollHistory.length > 0));
 const ped = (ability as any).pedCost as number | undefined;
 const restingLabel =
 typeof ped === 'number' && ped > 0 ? `Use (${ped} PED)` :
 ability.actionType === 'reaction' ? 'Trigger' :
 (ability as any).psionicDie ? `Spend Die (1${getPsionicDieSize(character.level)})` :
 (ability as any).isPool ? 'Spend Die' : 'Use';
 const isFlashing = justUsed === ability.name;
 const ACTION_BADGE_LABEL: Record<string, string> = {
 action: 'ACTION', bonus: 'BONUS', reaction: 'REACT', special: 'SPCL', free: 'FREE',
 };
 const actionBadge = ACTION_BADGE_LABEL[ability.actionType] ?? 'ABLY';
 // Recovery label — secondary line that mirrors a spell row's
 // "school" subtitle. Falls back to action label when no rest.
 const recoveryLabel = ability.rest === 'short' ? 'Short Rest'
 : ability.rest === 'long' ? 'Long Rest'
 : (ability as any).isPool ? 'Resource Pool'
 : (ability as any).psionicDie ? 'Psionic Die'
 : 'At Will';

 return (
 <div
 onClick={() => { if (canExpand) setExpandedAbility(isExpanded ? null : ability.name); }}
 style={{
 display: 'grid',
 gridTemplateColumns: '70px 3px 1fr 46px 70px 74px 16px 170px',
 alignItems: 'center', gap: '0 8px',
 padding: '7px 10px',
 cursor: canExpand ? 'pointer' : 'default',
 minHeight: 44,
 }}
 >
 {/* Col 0: action-type badge (visual analog to "Lvl N" on spell rows) */}
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
 <span style={{
 fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 800,
 color: acColor,
 padding: '3px 8px', borderRadius: 6,
 border: `1px solid ${acColor}45`,
 background: `${acColor}10`,
 whiteSpace: 'nowrap' as const,
 letterSpacing: '0.06em',
 }} title={`Action type: ${ability.actionType}`}>
 {actionBadge}
 </span>
 </div>

 {/* Col 1: 3px color stripe — same visual function as spell row's school bar */}
 <div style={{ width: 3, height: 30, borderRadius: 2, background: acColor, opacity: 0.75 }} />

 {/* Col 2: name + chips + subtitle (recovery + tracker chiclets) */}
 <div style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
 <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {ability.name}
 </span>
 {ability.isPool && (
 <span style={{
 fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
 color: '#60a5fa', background: 'rgba(96,165,250,0.1)',
 border: '1px solid rgba(96,165,250,0.35)', borderRadius: 999,
 padding: '1px 7px', flexShrink: 0,
 }} title="Resource pool — track current vs max in the chiclets below">
 Resource
 </span>
 )}
 </div>
 <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1, whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
 <span style={{ flexShrink: 0 }}>{recoveryLabel}</span>
 {/* Inline tracker chiclets — moved here from the row tail so the
     button column stays predictable. Don't propagate row clicks
     when the user is interacting with the tracker. */}
 {maxUses !== undefined && ability.rest && (
 <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}>
 <UseTracker
 abilityName={ability.name}
 max={maxUses}
 rest={ability.rest}
 character={character}
 onUpdate={onUpdate}
 />
 </span>
 )}
 </div>
 </div>

 {/* Col 3: reserved for future per-ability metadata */}
 <div />

 {/* Col 4: reserved for future per-ability metadata */}
 <div />

 {/* Col 5: PED cost chip OR last-rolled PED value badge.
     pedCost and psionicDie are mutually exclusive on a given
     ability, so this column has a single semantic at a time. */}
 <div style={{ textAlign: 'center' }}>
 {(ability as any).psionicDie ? (() => {
 const hasRoll = psionicRollHistory.length > 0;
 return (
 <span
 title={hasRoll ? `Last roll: ${psionicRollHistory[0].value} on 1${psionicRollHistory[0].die}` : 'No rolls yet — click Spend Die to roll'}
 style={{
 display: 'inline-flex', alignItems: 'center', gap: 3,
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 12,
 padding: '1px 7px', borderRadius: 999,
 background: hasRoll ? 'rgba(232,121,249,0.18)' : 'transparent',
 border: `1px solid ${hasRoll ? 'rgba(232,121,249,0.5)' : 'rgba(232,121,249,0.2)'}`,
 color: hasRoll ? '#e879f9' : 'rgba(232,121,249,0.4)',
 transition: 'background 0.25s, border-color 0.25s, color 0.25s',
 }}>
 <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.7 }}>ROLL</span>
 {hasRoll ? psionicRollHistory[0].value : '—'}
 </span>
 );
 })() : typeof ped === 'number' && ped > 0 ? (
 <span style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 11,
 color: '#e879f9', background: 'rgba(232,121,249,0.1)',
 border: '1px solid rgba(232,121,249,0.35)',
 borderRadius: 999, padding: '1px 6px',
 }} title={`Costs ${ped} Psionic Energy Die${ped === 1 ? '' : 's'}`}>
 {ped} PED
 </span>
 ) : null}
 </div>

 {/* Col 6: chevron — only when there's something to expand. */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 {canExpand && (
 <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
 )}
 </div>

 {/* Col 7: Use button + optional Restore button.
     Click handlers stop propagation so they don't trigger
     the row-level expand toggle. */}
 <div onClick={e => {
 const target = e.target as HTMLElement;
 if (target.closest('button')) e.stopPropagation();
 }} style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' as const, alignItems: 'center' }}>
 {ability.actionType !== 'free' && (
 <button
 onClick={() => handleUseAbility(ability, maxUses !== undefined ? 1 : undefined)}
 style={{
 padding: '4px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 background: isFlashing ? '#34d399' : acColor + '20',
 border: `1px solid ${isFlashing ? '#34d399' : acColor + '60'}`,
 color: isFlashing ? '#000' : acColor,
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
 letterSpacing: '0.04em',
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 flexShrink: 0, minHeight: 0,
 textAlign: 'center' as const,
 }}
 >
 {isFlashing ? 'Used!' : restingLabel}
 </button>
 )}
 {/* PED-restore button — only when feature is depleted AND
     player has enough PEDs. Same conditions as v2.190.0. */}
 {(ability as any).pedRestoreCost !== undefined && maxUses !== undefined && (() => {
 const restoreCost = (ability as any).pedRestoreCost as number;
 const used = ((character.feature_uses as Record<string, number>) ?? {})[ability.name] ?? 0;
 if (used < maxUses) return null;
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 const currentDice = (resources['psionic-energy-dice'] as number | undefined) ?? 0;
 const insufficient = currentDice < restoreCost;
 const flashKey = `restore:${ability.name}`;
 const restoreFlashing = justUsed === flashKey;
 return (
 <button
 onClick={() => restoreUseFromPed(ability)}
 disabled={insufficient}
 title={insufficient
 ? `Need ${restoreCost} Psionic Energy Die${restoreCost === 1 ? '' : 's'} (have ${currentDice})`
 : `Spend ${restoreCost} PED to refresh this feature mid-rest`}
 style={{
 padding: '4px 10px', borderRadius: 'var(--r-md)',
 cursor: insufficient ? 'not-allowed' : 'pointer',
 background: restoreFlashing
 ? '#34d399'
 : insufficient
 ? 'var(--c-raised)'
 : 'rgba(232,121,249,0.12)',
 border: `1px solid ${
 restoreFlashing ? '#34d399' :
 insufficient ? 'var(--c-border)' :
 'rgba(232,121,249,0.45)'
 }`,
 color: restoreFlashing
 ? '#000'
 : insufficient
 ? 'var(--t-3)'
 : '#e879f9',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
 letterSpacing: '0.04em',
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 flexShrink: 0, minHeight: 0,
 opacity: insufficient ? 0.55 : 1,
 }}
 >
 {restoreFlashing ? 'Restored!' : `+${restoreCost} PED`}
 </button>
 );
 })()}
 </div>
 </div>
 );
 })()}

 {/* v2.86.0: Always-visible short description below the grid row.
     Preserved from the previous design — class abilities have
     narrative behavior that doesn't reduce to a single chip, so
     reading it shouldn't require expanding the card. */}
 <div style={{
 padding: '0 12px 9px 12px',
 fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)',
 lineHeight: 1.5,
 }}>
 {descShort}
 </div>

 {/* Expanded detail panel — long-form mechanics + roll history.
     Layout mirrors the regular spell row's expanded panel: stats
     grid on top, prose body below. */}
 {isExpanded && (
 <div style={{
 padding: '10px 14px 12px 14px',
 borderTop: `1px solid ${acColor}20`,
 background: 'rgba(255,255,255,0.015)',
 }}>
 {/* Stats grid — adapted to ability fields rather than spell fields. */}
 <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 10, alignItems: 'center' }}>
 {(() => {
 const ped = (ability as any).pedCost as number | undefined;
 const stats: Array<[string, string | null]> = [
 ['Action', ACTION_LABELS[ability.actionType]?.replace(/^[^A-Za-z]+/, '') ?? ability.actionType],
 ['Recovery', ability.rest === 'short' ? 'Short Rest' : ability.rest === 'long' ? 'Long Rest' : 'At Will'],
 ['Uses', maxUses !== undefined ? String(maxUses) : null],
 ['Cost', typeof ped === 'number' && ped > 0 ? `${ped} PED` : null],
 ];
 return stats.filter(([, v]) => v != null).map(([k, v]) => (
 <div key={k}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>{k}</div>
 <div style={{ fontSize: 12, color: 'var(--t-1)' }}>{v}</div>
 </div>
 ));
 })()}
 </div>
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
