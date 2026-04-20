import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Character, SpellSlots } from '../../types';
import type { SpellData } from '../../types';
import { logAction } from '../shared/ActionLog';
import { parseSpellMechanics, parseUpcastScaling, computeUpcastDice, canUpcastSpell } from '../../lib/spellParser';
import { useDiceRoll } from '../../context/DiceRollContext';
import { CONDITION_MAP } from '../../data/conditions';
import { rollDie } from '../../lib/gameUtils';

interface SpellCastButtonProps {
 spell: SpellData;
 character: Character;
 userId: string;
 campaignId?: string | null;
 onUpdateSlots: (slots: SpellSlots) => void;
 compact?: boolean;
 spellLockedOut?: boolean; // true when a leveled spell was already cast this turn
 onLeveledSpellCast?: (isBonusAction?: boolean) => void; // called when a leveled spell is successfully cast
 // v2.34: When set, forces the cast to use this specific slot level (upcast row).
 // Skips the slot-picker UI and casts straight at this tier.
 forceSlotLevel?: number;
 // v2.37.0: called when ANY cast (cantrip or leveled) happens for a concentration spell.
 // The parent should set character.concentration_spell = spell.id.
 onConcentrationCast?: () => void;
 // v2.49.0: Renders a single "↑ Upcast" button that opens the slot picker modal directly.
 // Used in spell description panels so the user can deliberately choose a higher slot
 // instead of just casting at base level.
 upcastTrigger?: boolean;
}

const SAVE_COLORS: Record<string, string> = {
 STR: '#f97316', DEX: '#84cc16', CON: '#ef4444',
 INT: '#3b82f6', WIS: '#22c55e', CHA: '#a855f7',
};

const DAMAGE_COLORS: Record<string, string> = {
 Fire: '#f97316', Thunder: '#a78bfa', Lightning: '#fbbf24',
 Cold: '#60a5fa', Acid: '#4ade80', Poison: '#86efac',
 Necrotic: '#94a3b8', Radiant: '#fde68a', Psychic: '#e879f9',
 Force: '#c084fc',
};

/** Parse "2d6" -> { count:2, sides:6 } */
function parseDice(expr: string): { count: number; sides: number } | null {
 const m = expr.match(/^(\d+)d(\d+)$/);
 if (!m) return null;
 return { count: parseInt(m[1]), sides: parseInt(m[2]) };
}

/** Roll N dice of S sides, return individual values */
function rollNdS(count: number, sides: number): number[] {
 return Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
}

export default function SpellCastButton({
 spell, character, userId, campaignId, onUpdateSlots, compact = false,
 spellLockedOut = false, onLeveledSpellCast, forceSlotLevel, onConcentrationCast, upcastTrigger,
}: SpellCastButtonProps) {
 const isBonusActionCast = /bonus action/i.test(spell.casting_time);
 const [showModal, setShowModal] = useState(false);
 // v2.34: if a specific upcast slot is forced by the parent row, start with it
 const [selectedSlot, setSelectedSlot] = useState<number>(forceSlotLevel ?? spell.level);
 const [target, setTarget] = useState('');
 // v2.34.2: flash "Cast!" on the button for ~900ms after firing so users see confirmation
 const [recentlyCast, setRecentlyCast] = useState<string | null>(null);
 const { triggerRoll } = useDiceRoll();

 function flashCast(slotLevel: number) {
 const label = isCantrip ? 'Cast!' : `Cast (Lvl ${slotLevel}) ✓`;
 setRecentlyCast(label);
 window.setTimeout(() => setRecentlyCast(curr => curr === label ? null : curr), 900);
 // v2.37.0: if this spell requires concentration, notify the parent so it can
 // set character.concentration_spell. Fires for cantrips + leveled alike.
 if (spell.concentration) {
 onConcentrationCast?.();
 }
 }

 const isCantrip = spell.level === 0;
 const mechanics = parseSpellMechanics(spell.description, {
 save_type: (spell as any).save_type,
 attack_type: (spell as any).attack_type,
 damage_dice: (spell as any).damage_dice,
 damage_type: (spell as any).damage_type,
 heal_dice: (spell as any).heal_dice,
 area_of_effect: (spell as any).area_of_effect,
 });

 // Upcast scaling info — derived from spell.higher_levels (preferred) or description
 const upcast = parseUpcastScaling(
 (spell as any).higher_levels || spell.description,
 spell.level,
 );

 // Available slots at spell.level or higher.
 // v2.44.0: If the spell cannot be upcast (no higher_levels text), the picker
 // is restricted to ONLY the spell's base level — even if higher slots exist.
 // This matches RAW: spells like Jump, Find Familiar, Mage Armor can't benefit
 // from a higher-level slot, so showing those options would be misleading.
 const availableSlots: { level: number; remaining: number }[] = [];
 if (!isCantrip) {
 const allowsUpcast = canUpcastSpell(spell);
 const maxSlotLevel = allowsUpcast ? 9 : spell.level;
 for (let lvl = spell.level; lvl <= maxSlotLevel; lvl++) {
 const slot = character.spell_slots[String(lvl)];
 if (slot && slot.total > 0) {
 const remaining = slot.total - (slot.used ?? 0);
 if (remaining > 0) availableSlots.push({ level: lvl, remaining });
 }
 }
 }
 const canCast = isCantrip || availableSlots.length > 0;

 // Spell modifier
 const spellAbilityMap: Record<string, keyof Character> = {
 Wizard: 'intelligence', Artificer: 'intelligence', Psion: 'intelligence',
 Cleric: 'wisdom', Druid: 'wisdom', Ranger: 'wisdom',
 Paladin: 'charisma', Bard: 'charisma', Sorcerer: 'charisma', Warlock: 'charisma',
 };
 const key = spellAbilityMap[character.class_name] ?? 'intelligence';
 const score = (character[key] as number) ?? 10;
 const spellMod = Math.floor((score - 10) / 2);
 const profBonus = Math.ceil(character.level / 4) + 1;
 const spellAttack = spellMod + profBonus;
 const saveDC = 8 + spellAttack;

 /** Deduct one slot of the given level */
 function spendSlot(slotLevel: number) {
 const slotKey = String(slotLevel);
 const s = character.spell_slots[slotKey];
 if (s) onUpdateSlots({ ...character.spell_slots, [slotKey]: { ...s, used: (s.used ?? 0) + 1 } });
 }

 /** Roll damage dice → 3D roller + action log */
 async function rollDamage(slotLevel?: number) {
 if (!mechanics.damageDice) return;
 // Compute actual dice to roll considering upcast scaling
 const effectiveSlot = slotLevel ?? (isCantrip ? 0 : (availableSlots[0]?.level ?? spell.level));
 const effectiveDice = upcast.extraDice
 ? computeUpcastDice(mechanics.damageDice, upcast.extraDice, upcast.baseLevel, effectiveSlot)
 : mechanics.damageDice;
 const parsed = parseDice(effectiveDice.includes('+')
 ? effectiveDice.split('+')[0] // parse first component only for now
 : effectiveDice);
 if (!parsed) return;
 const { count, sides } = parsed;
 const rolls = rollNdS(count, sides);
 // Handle compound dice e.g. "3d6+2d8" — add second component
 let extraRolls: number[] = [];
 if (effectiveDice.includes('+')) {
 const secondPart = effectiveDice.split('+')[1];
 const p2 = parseDice(secondPart);
 if (p2) extraRolls = rollNdS(p2.count, p2.sides);
 }
 const allRolls = [...rolls, ...extraRolls];
 const total = allRolls.reduce((a, b) => a + b, 0);

 // Spend slot if leveled spell + mark spell as cast this turn.
 // v2.46.0: cantrips also fire onLeveledSpellCast so parent action-economy
 // tracking can consume the action/BA based on the spell's casting time.
 if (!isCantrip && slotLevel !== undefined) {
 spendSlot(slotLevel);
 onLeveledSpellCast?.(isBonusActionCast);
 flashCast(slotLevel);
 } else if (!isCantrip && availableSlots.length === 1) {
 spendSlot(availableSlots[0].level);
 onLeveledSpellCast?.(isBonusActionCast);
 flashCast(availableSlots[0].level);
 } else if (isCantrip) {
 onLeveledSpellCast?.(isBonusActionCast);
 flashCast(0);
 }

 // Fire 3D roller
 if (count === 1) {
 triggerRoll({
 result: rolls[0], dieType: sides, modifier: 0, total,
 label: `${spell.name} — ${mechanics.damageType ?? 'damage'}`,
 });
 } else {
 triggerRoll({
 allDice: rolls.map(v => ({ die: sides, value: v })),
 expression: mechanics.damageDice,
 flatBonus: 0, total,
 label: `${spell.name} — ${mechanics.damageType ?? 'damage'}`,
 });
 }

 await logAction({
 campaignId, characterId: userId, characterName: character.name,
 actionType: 'damage',
 actionName: `${spell.name} — ${mechanics.damageType ?? 'damage'}`,
 diceExpression: mechanics.damageDice,
 individualResults: allRolls.length ? allRolls : rolls, total,
 notes: isCantrip ? 'cantrip' : `Level ${slotLevel ?? availableSlots[0]?.level ?? spell.level} slot`,
 });
 }

 /** Roll heal dice → 3D roller + action log */
 async function rollHeal() {
 if (!mechanics.healDice) return;
 const parsed = parseDice(mechanics.healDice);
 if (!parsed) return;
 const { count, sides } = parsed;
 const rolls = rollNdS(count, sides);
 const total = rolls.reduce((a, b) => a + b, 0);
 if (!isCantrip && availableSlots.length === 1) spendSlot(availableSlots[0].level);
 triggerRoll({
 allDice: count > 1 ? rolls.map(v => ({ die: sides, value: v })) : undefined,
 result: count === 1 ? rolls[0] : undefined,
 dieType: count === 1 ? sides : undefined,
 expression: mechanics.healDice, flatBonus: 0, total,
 label: `${spell.name} — healing`,
 } as any);
 await logAction({ campaignId, characterId: userId, characterName: character.name,
 actionType: 'heal', actionName: spell.name,
 diceExpression: mechanics.healDice, individualResults: rolls, total });
 }

 /** Roll spell attack (d20 + spellAttack) — marks leveled spell as cast */
 async function rollAttack() {
 // v2.53.0: Apply disadvantage automatically when an attack-disadvantaging
 // condition is active (Blinded, Frightened, Poisoned, Prone, Restrained).
 // Pulls from CONDITION_MAP — same logic that weapon attacks use in WeaponsTracker.
 const activeConditions = character.active_conditions ?? [];
 const disadvSources = activeConditions.filter(c => CONDITION_MAP[c]?.attackDisadvantage);
 const hasDisadvantage = disadvSources.length > 0;
 const roll1 = rollDie(20);
 const roll2 = hasDisadvantage ? rollDie(20) : roll1;
 const d20 = hasDisadvantage ? Math.min(roll1, roll2) : roll1;
 const total = d20 + spellAttack;
 const hitResult = d20 === 20 ? 'crit' : d20 === 1 ? 'fumble' : total >= 10 ? 'hit' : 'miss';
 const disadvLabel = hasDisadvantage ? ` (Disadv. — ${disadvSources.join(', ')})` : '';
 triggerRoll({
 result: d20, dieType: 20, modifier: spellAttack, total,
 label: `${spell.name} — Spell Attack${disadvLabel}`,
 });
 await logAction({ campaignId, characterId: userId, characterName: character.name,
 actionType: 'attack', actionName: `${spell.name} — Spell Attack${disadvLabel}`,
 diceExpression: hasDisadvantage ? '2d20kl1' : '1d20',
 individualResults: hasDisadvantage ? [roll1, roll2] : [d20],
 total,
 hitResult: hitResult as any,
 notes: `+${spellAttack} spell attack (${key.slice(0,3).toUpperCase()} ${spellMod >= 0 ? '+' : ''}${spellMod} + Prof +${profBonus})${hasDisadvantage ? ` · disadvantage from ${disadvSources.join(', ')}` : ''}` });
 // v2.46.0: fire for cantrips too so parent action-economy tracks the consumed action.
 onLeveledSpellCast?.(isBonusActionCast);
 }

 /** Cast utility spell (no dice) */
 async function castUtility(slotLevel: number, targetName?: string) {
 if (!isCantrip && slotLevel > 0) {
 spendSlot(slotLevel);
 onLeveledSpellCast?.(isBonusActionCast);
 } else if (isCantrip) {
 // v2.46.0: cantrip cast still consumes the action (or BA for bonus-action cantrips
 // like Vicious Mockery? Actually Vicious Mockery is 1A. Most cantrips = 1A).
 onLeveledSpellCast?.(isBonusActionCast);
 }
 // v2.34.2: visible confirmation — always flashes, whether or not a slot was spent
 flashCast(slotLevel);
 await logAction({ campaignId, characterId: userId, characterName: character.name,
 actionType: 'spell', actionName: spell.name, targetName,
 notes: `${isCantrip ? 'Cantrip' : `Level ${slotLevel} slot`} · ${spell.range} · ${spell.duration}` });
 }

 /** Log save DC to party */
 async function logSaveDC() {
 const saveColor = SAVE_COLORS[mechanics.saveType ?? ''];
 await logAction({ campaignId, characterId: userId, characterName: character.name,
 actionType: 'save', actionName: `${spell.name} — ${mechanics.saveType} Save`,
 total: saveDC,
 notes: `Targets must beat DC ${saveDC} ${mechanics.saveType} save${mechanics.damageDice ? ` or take ${mechanics.damageDice} ${mechanics.damageType} damage` : ''}` });
 }

 // ──────────────────────────────────────────────────────────────────
 // No slots available for leveled spell
 if (!canCast && !isCantrip) {
 return (
 <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', opacity: 0.5,
 border: '1px solid var(--c-border)', borderRadius: 4, padding: '2px 6px' }}>
 No Slots
 </span>
 );
 }

 // ──────────────────────────────────────────────────────────────────
 // v2.59.0: Upcast trigger mode — MUST run BEFORE the compact-mode branch
 // because callers from SpellsTab pass `upcastTrigger=true` without
 // `compact=true`. The previous nesting silently fell through to FULL MODE
 // and rendered a regular Cast button instead of the upcast button.
 // Renders ONLY a single button that opens the slot-picker modal, so users
 // can deliberately pick a higher slot instead of just casting at base level.
 if (upcastTrigger) {
 // Only render if the spell actually supports upcasting + has slots higher than base
 if (isCantrip || !canUpcastSpell(spell)) return null;
 const hasHigherSlots = availableSlots.some(s => s.level > spell.level);
 if (!hasHigherSlots) return null;
 return (
 <>
 <button
 onClick={() => setShowModal(true)}
 style={{
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
 padding: '6px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', minHeight: 0,
 border: '1px solid rgba(167,139,250,0.5)',
 background: 'rgba(167,139,250,0.12)',
 color: '#c4b5fd', letterSpacing: '0.04em',
 display: 'inline-flex', alignItems: 'center', gap: 5,
 }}
 onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.22)'; }}
 onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.12)'; }}
 title="Cast this spell using a higher-level spell slot for greater effect"
 >
 ↑ Upcast at higher slot
 </button>
 {showModal && createPortal(
 <div className="modal-overlay" onClick={() => setShowModal(false)}>
 <div
 className="modal"
 style={{
 maxWidth: 560, width: 'calc(100vw - 16px)',
 // v2.57.0: use dvh for iOS Safari compatibility — vh includes the
 // address bar so 100vh exceeds the visible area on mobile and pushes
 // content (including the confirm button) below the fold.
 maxHeight: 'calc(100dvh - 32px)',
 display: 'flex', flexDirection: 'column' as const,
 padding: 20,
 }}
 onClick={e => e.stopPropagation()}
 >
 {/* Title section — spell name is the LARGEST element so users can read it
     even if they only glance at the modal. Eyebrow + subtitle are secondary. */}
 <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--c-border)' }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#c4b5fd', marginBottom: 6 }}>
 ↑ Upcast Spell
 </div>
 <h3 style={{
 margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--t-1)',
 wordBreak: 'break-word' as const, overflowWrap: 'anywhere' as const,
 lineHeight: 1.15,
 }}>
 {spell.name}
 </h3>
 <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 6 }}>
 Base level {spell.level} · Cast with a higher slot for greater effect
 </div>
 </div>

 {/* Scrollable middle section — slot picker + higher-levels text + target */}
 <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' as const, marginRight: -8, paddingRight: 8 }}>
 {/* v2.63.0: full spell description (one big block) so player has full
     context on what the spell does without closing the modal. */}
 {spell.description && (
 <div style={{
 padding: '10px 12px', borderRadius: 'var(--r-md)',
 background: 'rgba(255,255,255,0.025)', border: '1px solid var(--c-border)',
 marginBottom: 12,
 }}>
 <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 4 }}>
 Description
 </div>
 <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.55 }}>
 {spell.description}
 </div>
 </div>
 )}
 {(spell as any).higher_levels && (
 <div style={{
 padding: '10px 12px', borderRadius: 'var(--r-md)',
 background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)',
 marginBottom: 12,
 }}>
 <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#c4b5fd', marginBottom: 4 }}>
 At Higher Levels
 </div>
 <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5 }}>
 {(spell as any).higher_levels}
 </div>
 </div>
 )}
 {/* v2.63.0: per-tier breakdown using damage_at_slot_level / heal_at_slot_level
     data. Shows exactly what each upcast tier does so the player can pick the
     slot that matches the situation. */}
 {(() => {
 const dasl = (spell as any).damage_at_slot_level as Record<string, string> | undefined;
 const hasl = (spell as any).heal_at_slot_level as Record<string, string> | undefined;
 const tiers = dasl ?? hasl;
 if (!tiers) return null;
 const tierKeys = Object.keys(tiers).map(k => parseInt(k, 10)).filter(k => !isNaN(k) && k >= spell.level).sort((a, b) => a - b);
 if (tierKeys.length === 0) return null;
 const label = dasl ? 'Damage by slot' : 'Healing by slot';
 return (
 <div style={{
 padding: '10px 12px', borderRadius: 'var(--r-md)',
 background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
 marginBottom: 14,
 }}>
 <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#fbbf24', marginBottom: 6 }}>
 {label}
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 }}>
 {tierKeys.map(lvl => (
 <div key={lvl} style={{
 padding: '6px 8px', borderRadius: 6,
 background: selectedSlot === lvl ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.025)',
 border: `1px solid ${selectedSlot === lvl ? 'rgba(251,191,36,0.5)' : 'var(--c-border)'}`,
 textAlign: 'center' as const,
 }}>
 <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.04em' }}>LVL {lvl}</div>
 <div style={{ fontFamily: 'var(--ff-stat)', fontSize: 13, fontWeight: 800, color: selectedSlot === lvl ? '#fbbf24' : 'var(--t-2)', marginTop: 1 }}>{tiers[String(lvl)]}</div>
 </div>
 ))}
 </div>
 </div>
 );
 })()}
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 8 }}>
 Choose Spell Slot Level
 </div>
 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
 {availableSlots.map(({ level, remaining }) => (
 <button key={level} onClick={() => { setSelectedSlot(level); }}
 style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12,
 padding: '8px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', minWidth: 70,
 border: selectedSlot === level ? '2px solid #a78bfa' : '1px solid var(--c-border)',
 background: selectedSlot === level ? 'rgba(167,139,250,0.18)' : 'var(--c-raised)',
 color: selectedSlot === level ? '#c4b5fd' : 'var(--t-2)',
 textAlign: 'center' as const,
 }}>
 <div>Level {level}</div>
 <div style={{ fontSize: 9, fontWeight: 500, color: 'var(--t-3)', marginTop: 2 }}>{remaining} left</div>
 </button>
 ))}
 </div>
 <div style={{ marginBottom: 4 }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 6 }}>
 Target (optional)
 </div>
 <input value={target} onChange={e => setTarget(e.target.value)} placeholder='e.g. "Goblin King"'
 style={{ fontSize: 'var(--fs-sm)', width: '100%' }} />
 </div>
 </div>

 {/* v2.57.0: Action footer rebuilt — buttons STACK VERTICALLY (full-width)
     so the confirm button is always reachable regardless of viewport width.
     Confirm button is on TOP (most prominent), Roll Damage middle, Cancel
     bottom (least destructive choice last). */}
 <div style={{
 display: 'flex', flexDirection: 'column' as const, gap: 8,
 paddingTop: 14, borderTop: '1px solid var(--c-border)', marginTop: 12,
 }}>
 <button
 onClick={() => { castUtility(selectedSlot, target); setShowModal(false); setTarget(''); }}
 style={{
 width: '100%', justifyContent: 'center',
 fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 14,
 padding: '12px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid #a78bfa',
 background: 'linear-gradient(180deg, rgba(167,139,250,0.35), rgba(167,139,250,0.22))',
 color: '#f0e9ff', letterSpacing: '0.04em',
 boxShadow: '0 2px 8px rgba(167,139,250,0.25)',
 }}
 >
 ↑ Upcast at Level {selectedSlot}
 </button>
 {mechanics.damageDice && (
 <button
 onClick={() => { rollDamage(selectedSlot); setShowModal(false); setTarget(''); }}
 style={{
 width: '100%', justifyContent: 'center',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
 padding: '10px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid rgba(251,191,36,0.5)',
 background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
 }}
 >
 Roll Damage @ Level {selectedSlot}
 </button>
 )}
 <button
 className="btn-secondary"
 onClick={() => setShowModal(false)}
 style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
 >
 Cancel
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}
 </>
 );
 }

 // ──────────────────────────────────────────────────────────────────
 // COMPACT MODE (Actions tab)
 if (compact) {
 // If a leveled spell was already cast this turn, lock this spell out
 if (spellLockedOut) {
 return (
 <span title="You already cast a spell this turn. Only one leveled spell per turn (cantrips are free)."
 style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', opacity: 0.5,
 border: '1px solid var(--c-border)', borderRadius: 4, padding: '2px 7px',
 cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
 🔒 1 spell/turn
 </span>
 );
 }

 const dmgColor = DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8';
 const saveColor = SAVE_COLORS[mechanics.saveType ?? ''] ?? '#94a3b8';
 const btnBase: React.CSSProperties = {
 fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
 cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
 fontFamily: 'var(--ff-body)',
 };

 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
 {/* v2.35.1: removed the inline range chip — the row's RANGE column already shows it.
 Keeping it here would duplicate "60 feet" on every spell row. */}

 {/* ── CATEGORY 1: UTILITY — cast button only ── */}
 {mechanics.isUtility && (
 <button
 onClick={() => {
 // v2.34.2: when a slot is forced (upcast row), skip picker and cast at that tier
 if (forceSlotLevel !== undefined) {
 castUtility(forceSlotLevel);
 return;
 }
 if (isCantrip || availableSlots.length <= 1) {
 castUtility(isCantrip ? 0 : (availableSlots[0]?.level ?? spell.level));
 } else {
 setShowModal(true);
 }
 }}
 style={{ ...btnBase,
 background: recentlyCast ? 'rgba(74,222,128,0.22)' : 'rgba(167,139,250,0.15)',
 border: `1px solid ${recentlyCast ? 'rgba(74,222,128,0.55)' : 'rgba(167,139,250,0.4)'}`,
 color: recentlyCast ? '#4ade80' : '#a78bfa',
 transition: 'background 0.2s, border-color 0.2s, color 0.2s',
 }}
 >
 {recentlyCast ?? 'Cast'}
 </button>
 )}

 {/* ── CATEGORY 2: ATTACK SPELL — two independent buttons ── */}
 {mechanics.isAttack && (
 <>
 <button
 onClick={rollAttack}
 style={{ ...btnBase, background: 'rgba(251,191,36,0.12)',
 border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}
 title={`Roll d20 + ${spellAttack} spell attack`}
 >
 Attack +{spellAttack}
 </button>
 {mechanics.damageDice && (
 <button
 onClick={() => rollDamage()}
 style={{ ...btnBase, background: dmgColor + '18',
 border: `1px solid ${dmgColor}50`, color: dmgColor }}
 title="Roll damage (independent of attack roll)"
 >
 {mechanics.damageDice} {mechanics.damageType}
 </button>
 )}
 </>
 )}

 {/* ── CATEGORY 3: SAVE SPELL — damage button only ── */}
 {/* v2.35.1: removed the "CON DC 15" button — HIT/DC column in the row shows this info.
 The damage button below is the functional roll. If the DM needs the save DC relayed,
 casting the spell (via damage button) logs the DC to the action log. */}
 {mechanics.saveType && !mechanics.isAttack && mechanics.damageDice && (
 <button
 onClick={() => rollDamage()}
 style={{ ...btnBase, background: dmgColor + '18',
 border: `1px solid ${dmgColor}50`, color: dmgColor }}
 title={`Targets make ${mechanics.saveType} DC ${saveDC} save. Click to roll damage.`}
 >
 {mechanics.damageDice} {mechanics.damageType}
 </button>
 )}

 {/* ── CATEGORY 3.5 (v2.48.0): SAVE-ONLY SPELL with NO damage ──
     Spells like Calm Emotions, Hold Person, Hypnotic Pattern, Suggestion, Banishment.
     Was previously rendering NO button at all because mechanics.isUtility
     requires no save, and Category 3 requires damage. Now treated like a utility
     cast: spends the slot, logs the spell + save DC, no damage roll. */}
 {mechanics.saveType && !mechanics.isAttack && !mechanics.damageDice && (
 <button
 onClick={() => {
 if (forceSlotLevel !== undefined) {
 castUtility(forceSlotLevel);
 return;
 }
 if (isCantrip || availableSlots.length <= 1) {
 castUtility(isCantrip ? 0 : (availableSlots[0]?.level ?? spell.level));
 } else {
 setShowModal(true);
 }
 }}
 style={{ ...btnBase,
 background: recentlyCast ? 'rgba(74,222,128,0.22)' : 'rgba(167,139,250,0.15)',
 border: `1px solid ${recentlyCast ? 'rgba(74,222,128,0.55)' : 'rgba(167,139,250,0.4)'}`,
 color: recentlyCast ? '#4ade80' : '#a78bfa',
 transition: 'background 0.2s, border-color 0.2s, color 0.2s',
 }}
 title={`Targets make ${mechanics.saveType} DC ${saveDC} save. Click to cast.`}
 >
 {recentlyCast ?? `Cast (${mechanics.saveType} DC ${saveDC})`}
 </button>
 )}

 {/* Heal dice */}
 {mechanics.healDice && (
 <button onClick={rollHeal}
 style={{ ...btnBase, background: 'rgba(52,211,153,0.12)',
 border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }}>
 {mechanics.healDice}
 </button>
 )}

 {/* Slot picker modal — v2.55.0/2.57.0: matches the upcast modal layout.
     Width 560 max with 16px viewport gutter, dvh-based height for iOS Safari,
     title broken into eyebrow + spell name with break-word so long names fit. */}
 {showModal && createPortal(
 <div className="modal-overlay" onClick={() => setShowModal(false)}>
 <div
 className="modal"
 style={{
 maxWidth: 560, width: 'calc(100vw - 16px)',
 maxHeight: 'calc(100dvh - 32px)',
 display: 'flex', flexDirection: 'column' as const,
 padding: 20,
 }}
 onClick={e => e.stopPropagation()}
 >
 {/* Title section — eyebrow shows context (CAST or UPCAST), spell name below.
     overflowWrap: anywhere prevents long names like "Disorienting Whispers" from clipping. */}
 {(() => {
 const isUpcasting = !isCantrip && selectedSlot > spell.level;
 const eyebrowColor = isUpcasting ? '#c4b5fd' : '#fbbf24';
 const eyebrowLabel = isUpcasting ? '↑ UPCAST SPELL' : 'CAST SPELL';
 return (
 <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--c-border)' }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: eyebrowColor, marginBottom: 6 }}>
 {eyebrowLabel}
 </div>
 <h3 style={{
 margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--t-1)',
 wordBreak: 'break-word' as const, overflowWrap: 'anywhere' as const,
 lineHeight: 1.15,
 }}>
 {spell.name}
 </h3>
 <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 6 }}>
 Base level {spell.level}{isUpcasting ? ` · Casting at level ${selectedSlot}` : ''}
 </div>
 </div>
 );
 })()}
 <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' as const, marginRight: -8, paddingRight: 8 }}>
 <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
 <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)',
 border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 7px' }}>
 {spell.range}
 </span>
 {mechanics.saveType && (
 <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
 background: (SAVE_COLORS[mechanics.saveType] ?? '#94a3b8') + '15',
 border: `1px solid ${SAVE_COLORS[mechanics.saveType] ?? '#94a3b8'}40`,
 color: SAVE_COLORS[mechanics.saveType] ?? '#94a3b8' }}>
 {mechanics.saveType} Save DC {saveDC}
 </span>
 )}
 {mechanics.damageDice && (
 <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
 background: (DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8') + '15',
 border: `1px solid ${DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8'}40`,
 color: DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8' }}>
 {mechanics.damageDice} {mechanics.damageType}
 </span>
 )}
 </div>
 {/* If higher_levels rule text is present and a higher slot is selected, surface it */}
 {selectedSlot > spell.level && (spell as any).higher_levels && (
 <div style={{
 padding: '10px 12px', borderRadius: 'var(--r-md)',
 background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)',
 marginBottom: 14,
 }}>
 <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#c4b5fd', marginBottom: 4 }}>
 At Higher Levels
 </div>
 <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5 }}>
 {(spell as any).higher_levels}
 </div>
 </div>
 )}
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
 textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 8 }}>
 Choose Spell Slot Level
 </div>
 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
 {availableSlots.map(({ level, remaining }) => (
 <button key={level} onClick={() => { setSelectedSlot(level); }}
 style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12,
 padding: '8px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', minWidth: 70,
 border: selectedSlot === level ? '2px solid #a78bfa' : '1px solid var(--c-border)',
 background: selectedSlot === level ? 'rgba(167,139,250,0.18)' : 'var(--c-raised)',
 color: selectedSlot === level ? '#c4b5fd' : 'var(--t-2)',
 textAlign: 'center' as const,
 }}>
 <div>Level {level}</div>
 <div style={{ fontSize: 9, fontWeight: 500, color: 'var(--t-3)', marginTop: 2 }}>{remaining} left</div>
 </button>
 ))}
 </div>
 <div>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
 textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 6 }}>
 Target (optional)
 </div>
 <input value={target} onChange={e => setTarget(e.target.value)}
 placeholder='e.g. "Goblin King"' autoFocus
 style={{ fontSize: 'var(--fs-sm)', width: '100%' }} />
 </div>
 </div>
 {/* Action footer — v2.57.0: stacked vertically (full-width buttons) so the
     confirm button is always reachable on mobile and never gets pushed off-screen.
     Confirm on top (most prominent), Roll Damage middle, Cancel bottom. */}
 {(() => {
 const isUpcasting = !isCantrip && selectedSlot > spell.level;
 const confirmLabel = isUpcasting ? `↑ Upcast at Level ${selectedSlot}` : `Cast at Level ${selectedSlot}`;
 return (
 <div style={{
 display: 'flex', flexDirection: 'column' as const, gap: 8,
 paddingTop: 14, borderTop: '1px solid var(--c-border)', marginTop: 12,
 }}>
 <button
 onClick={() => { castUtility(selectedSlot, target); setShowModal(false); setTarget(''); }}
 style={{
 width: '100%', justifyContent: 'center',
 fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 14,
 padding: '12px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid #a78bfa',
 background: 'linear-gradient(180deg, rgba(167,139,250,0.35), rgba(167,139,250,0.22))',
 color: '#f0e9ff', letterSpacing: '0.04em',
 boxShadow: '0 2px 8px rgba(167,139,250,0.25)',
 }}
 >
 {confirmLabel}
 </button>
 {mechanics.damageDice && (
 <button
 onClick={() => { rollDamage(selectedSlot); setShowModal(false); setTarget(''); }}
 style={{
 width: '100%', justifyContent: 'center',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
 padding: '10px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid rgba(251,191,36,0.5)',
 background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
 }}
 >
 Roll Damage @ Level {selectedSlot}
 </button>
 )}
 <button
 className="btn-secondary"
 onClick={() => setShowModal(false)}
 style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
 >
 Cancel
 </button>
 </div>
 );
 })()}
 </div>
 </div>,
 document.body
 )}
 </div>
 );
 }

 // ──────────────────────────────────────────────────────────────────
 // FULL MODE (Spells tab — existing behavior, just with 3D roller)
 return (
 <>
 <button
 onClick={() => isCantrip ? castUtility(0) : setShowModal(true)}
 style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 9,
 letterSpacing: '0.04em', textTransform: 'uppercase' as const,
 padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
 border: '1px solid #a78bfa60', background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}
 onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.25)'; }}
 onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.12)'; }}
 >
 {mechanics.damageDice ? `Cast (${mechanics.damageDice})` : 'Cast'}
 </button>

 {showModal && createPortal(
 <div className="modal-overlay" onClick={() => setShowModal(false)}>
 <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
 <h3 style={{ marginBottom: 4 }}>{spell.name}</h3>
 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
 <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)',
 border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 7px' }}>
 {spell.range}
 </span>
 <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)',
 border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 7px' }}>
 ⏱ {spell.casting_time}
 </span>
 {mechanics.saveType && (
 <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
 background: (SAVE_COLORS[mechanics.saveType] ?? '#94a3b8') + '15',
 border: `1px solid ${SAVE_COLORS[mechanics.saveType] ?? '#94a3b8'}40`,
 color: SAVE_COLORS[mechanics.saveType] ?? '#94a3b8' }}>
 {mechanics.saveType} Save — DC {saveDC}
 </span>
 )}
 {mechanics.damageDice && (
 <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
 background: (DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8') + '15',
 border: `1px solid ${DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8'}40`,
 color: DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8' }}>
 {mechanics.damageDice} {mechanics.damageType}
 </span>
 )}
 {mechanics.isAttack && (
 <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
 background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
 color: '#fbbf24' }}>Spell Attack +{spellAttack}</span>
 )}
 </div>
 {availableSlots.length > 1 && (
 <div style={{ marginBottom: 14 }}>
 <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
 textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 6 }}>Spell Slot</div>
 <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
 {availableSlots.map(({ level, remaining }) => {
 // Show upcast damage for this slot level
 const upcastDice = upcast.extraDice && mechanics.damageDice
 ? computeUpcastDice(mechanics.damageDice, upcast.extraDice, upcast.baseLevel, level)
 : mechanics.damageDice;
 const isUpcast = level > spell.level;
 return (
 <button key={level} onClick={() => setSelectedSlot(level)}
 style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
 padding: '5px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: selectedSlot === level ? '2px solid #a78bfa' : '1px solid var(--c-border)',
 background: selectedSlot === level ? 'rgba(167,139,250,0.15)' : '#080d14',
 color: selectedSlot === level ? '#a78bfa' : 'var(--t-2)' }}>
 Level {level}
 {upcastDice && (
 <span style={{ display: 'block', fontSize: 9, fontWeight: 700,
 color: isUpcast ? '#f87171' : 'var(--t-3)' }}>
 {upcastDice}{isUpcast ? ' ⬆' : ''}
 </span>
 )}
 <span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--t-3)' }}>{remaining} left</span>
 </button>
 );
 })}
 </div>
 </div>
 )}
 <div style={{ marginBottom: 12 }}>
 <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
 textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 4 }}>
 Target (optional)
 </div>
 <input value={target} onChange={e => setTarget(e.target.value)}
 placeholder='e.g. "Goblin King"' autoFocus
 onKeyDown={e => { if (e.key === 'Enter') { castUtility(selectedSlot, target); setShowModal(false); setTarget(''); }}}
 style={{ fontSize: 'var(--fs-sm)', width: '100%' }} />
 </div>
 <div style={{ padding: 8, background: '#080d14', borderRadius: 'var(--r-md)',
 marginBottom: 12, fontSize: 10, color: 'var(--t-2)', lineHeight: 1.4,
 maxHeight: 60, overflowY: 'auto' }}>{spell.description}</div>
 <div style={{ display: 'flex', gap: 8 }}>
 <button className="btn-secondary" onClick={() => setShowModal(false)}
 style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
 {mechanics.isAttack && (
 <button onClick={() => { rollAttack(); }}
 style={{ flex: 1, fontFamily: 'var(--ff-body)', fontWeight: 700, padding: '7px 12px',
 borderRadius: 'var(--r-md)', cursor: 'pointer', border: '1px solid rgba(251,191,36,0.4)',
 background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 11,
 display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 Attack +{spellAttack}
 </button>
 )}
 {mechanics.damageDice && (
 <button onClick={() => { rollDamage(selectedSlot); setShowModal(false); setTarget(''); }}
 style={{ flex: 1, fontFamily: 'var(--ff-body)', fontWeight: 700, padding: '7px 12px',
 borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid #a78bfa60', background: 'rgba(167,139,250,0.2)',
 color: '#a78bfa', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 {(() => {
 const dice = upcast.extraDice && mechanics.damageDice
 ? computeUpcastDice(mechanics.damageDice, upcast.extraDice, upcast.baseLevel, selectedSlot)
 : mechanics.damageDice;
 return <> {dice} Dmg{selectedSlot > spell.level ? ' ⬆' : ''}</>;
 })()}
 </button>
 )}
 {mechanics.isUtility && (
 <button onClick={() => { castUtility(selectedSlot, target); setShowModal(false); setTarget(''); }}
 style={{ flex: 2, fontFamily: 'var(--ff-body)', fontWeight: 700, padding: '7px 14px',
 borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid #a78bfa60', background: 'rgba(167,139,250,0.2)',
 color: '#a78bfa', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 Cast{selectedSlot > spell.level ? ` (Lvl ${selectedSlot})` : ''}
 </button>
 )}
 </div>
 </div>
 </div>,
 document.body
 )}
 </>
 );
}
