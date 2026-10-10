import {hasStrongerTelekinesis,psionSpellRange} from '../../rules/psionSpellRange';
import PsionCastingNote from './_shared/PsionCastingNote';
import {canUpcastSpell,availableSpellSlots} from '../../rules/spellSlots';
import {createSpellDeclarationRequest,createTeleporterCantripRequest} from '../../lib/spellDeclarationRequest';
import {declarationParticipant,saveSpellDeclaration} from '../../lib/api/declaredSpells';
import {useSpellEffects} from './useSpellEffects';
import type {ConcentrationCastSource} from '../../rules/concentrationCasting';
import SpellSourceReview from './SpellSourceReview';
import {useSpellCasting,type SpellCastingState} from './SpellCastingContext';
import {SpellCastingChoice} from './SpellCastingChoice';
import {cantripDamage} from '../../rules/cantripDamage';
import {addDiceModifier,rollDiceGroups} from '../../rules/dice';
import { SpellDescription } from '../shared/SpellDescription';
import { useRef, useState, Suspense } from 'react';
// Chunk-retry lazy (v2.330) — same swap App.tsx uses; see lazyWithRetry.ts.
import { lazyWithRetry as lazy } from '../../lib/lazyWithRetry';

import { createPortal } from 'react-dom';
import type { Character, SpellSlots } from '../../types';
import type { SpellData } from '../../types';
import { logAction } from '../shared/ActionLog';
import { parseSpellMechanics, parseUpcastScaling, computeUpcastDice } from '../../lib/spellParser';
import { useDiceRoll } from '../../context/DiceRollContext';
import { CONDITION_MAP } from '../../data/conditions';
import { rollDie, computeStats } from '../../lib/gameUtils';
import { parseRangeToFt } from '../../lib/rangeParse';
import SpellAttackCastButton from '../Combat/SpellAttackCastButton';
// v2.443.0 — Lazy-load all five spell-cast modals. They open
// conditionally based on spell type (buff / declare / AoE save /
// multi-beam / heal), so a typical spell-cast click only ever loads
// one of them. Pre-v2.443 this file dragged ~2253 lines of modal
// code into every character sheet's first paint. Suspense fallback
// is a tiny inline spinner — the user explicitly clicked Cast and
// expects a brief beat before the picker appears.
const SpellTargetPickerModal = lazy(() => import('../Combat/SpellTargetPickerModal'));
const MultiAttackPickerModal = lazy(() => import('../Combat/MultiAttackPickerModal'));
const SpellHealPickerModal = lazy(() => import('../Combat/SpellHealPickerModal'));
import { findMultiAttackSpell, computeDefaultAttackCount } from '../../lib/multiAttackSpells';
import { findHealSpell, resolveHealDice, rollResolvedHeal, type HealSpellDef } from '../../lib/healSpells';

interface SpellCastButtonProps {
 teleporterCombatParent?:string;
 onTeleporterDeclared?:()=>void;
 spell: SpellData;
 character: Character;
 userId: string;
 campaignId?: string | null;
 onUpdateSlots: (slots: SpellSlots) => void;
 onReviewSpellSources?: (patch:Partial<Character>)=>void;
 compact?: boolean;
 spellLockedOut?: boolean; // true when a leveled spell was already cast this turn
 onLeveledSpellCast?: (isBonusAction?: boolean) => void; // called when a leveled spell is successfully cast
 // v2.34: When set, forces the cast to use this specific slot level (upcast row).
 // Skips the slot-picker UI and casts straight at this tier.
 forceSlotLevel?: number;
 // v2.37.0: called when ANY cast (cantrip or leveled) happens for a concentration spell.
 // The parent should set character.concentration_spell = spell.id.
 // v2.605.0 — receives the slot level the spell was cast at (undefined
 // for cantrips) so the parent can persist it for upcast dice scaling.
 onConcentrationCast?: (slotLevel?: number,source?:ConcentrationCastSource) => void;
 castingBlocked?:boolean;
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

export default function SpellCastButton(props:SpellCastButtonProps){
 const allCasting=useSpellCasting(props.character,props.spell,computeStats(props.character));
 const psionChoice=allCasting.options.find(option=>option.source==='class:Psion'||option.source==='grant:class:Psion')??null;
 const casting=props.teleporterCombatParent?{...allCasting,selected:psionChoice,options:psionChoice?[psionChoice]:[],unresolvedSources:[],needsSourceReview:!psionChoice}:allCasting;
 const [review,setReview]=useState(false);
 return <><SpellCastingChoice casting={casting} name={props.spell.name}/>{casting.needsSourceReview&&props.onReviewSpellSources&&<div onClick={event=>event.stopPropagation()}>
  <button type="button" className="btn btn-secondary" onClick={()=>setReview(current=>!current)}>{review?'Close source review':'Review spell source'}</button>
  {review&&<SpellSourceReview character={props.character} spells={[props.spell]} initialSpellId={props.spell.id} onSave={patch=>{props.onReviewSpellSources?.(patch);setReview(false);}}/>}
 </div>}{casting.selected&&<ResolvedSpellCastButton key={casting.selected.key} {...props} casting={casting.selected}/>}</>;
}
function ResolvedSpellCastButton({
 spell, character, userId, campaignId, onUpdateSlots, compact = false,
 spellLockedOut = false, onLeveledSpellCast, forceSlotLevel, onConcentrationCast, upcastTrigger, casting, castingBlocked, teleporterCombatParent,onTeleporterDeclared,
}: SpellCastButtonProps & {casting:NonNullable<SpellCastingState['selected']>}) {
 const isBonusActionCast = /bonus action/i.test(spell.casting_time);
 const [showModal, setShowModal] = useState(false);
 // v2.858: select a real remaining slot, including when base/intermediate
 // tiers are exhausted. Explicit tier rows never fall back to a different cost.
 const availableSlots=availableSpellSlots(spell.level,character.spell_slots);
 const [slotChoice,setSelectedSlot]=useState<number|undefined>(undefined);
 const selectedSlot=forceSlotLevel ?? (availableSlots.some(s=>s.level===slotChoice)?slotChoice!:
  (upcastTrigger?availableSlots.find(s=>s.level>spell.level)?.level:undefined)??availableSlots[0]?.level??spell.level);
 const selectedSlotAvailable=spell.level===0||availableSlots.some(s=>s.level===selectedSlot);
 const [target, setTarget] = useState('');
 const { triggerRoll } = useDiceRoll();
 const declaring=useRef(false);
 const [declarationError,setDeclarationError]=useState('');

 // v2.148.0 — Phase O pt 1: multi-target save spell picker. When set,
 // opens SpellTargetPickerModal which routes the cast through
 // declareMultiTargetAttack, auto-populating save DC / save ability /
 // damage dice / damage type / per-target cover. Deferred from the Cast
 // button click — slot burn happens in onDeclared, not on open, so a
 // player can cancel the picker without losing the slot.
 const [aoePicker, setAoePicker] = useState<{
   slotLevel: number;
   damageDice: string;
 } | null>(null);

 // v2.149.0 — Phase O pt 2: multi-beam attack spell picker (Scorching
 // Ray, Eldritch Blast). Parallel to aoePicker but routes through N
 // separate declareAttack calls with attackKind='attack_roll'.
 const [multiAttackPicker, setMultiAttackPicker] = useState<{
   slotLevel: number;
   damageDice: string;
   attackCount: number;
 } | null>(null);

 // v2.150.0 — Phase O pt 3: heal target picker (Cure Wounds, Healing
 // Word, Mass Cure Wounds, etc.). Doesn't create pending_attacks rows
 // — applies HP directly via applyHealToParticipant. Slot burn +
 // concentration in onDeclared as usual.
 const [healPicker, setHealPicker] = useState<{
   slotLevel: number;
   healDice: string;
   def: HealSpellDef;
 } | null>(null);


 const isCantrip = spell.level === 0;
 const mechanics = parseSpellMechanics(spell.description, {
 save_type: (spell as any).save_type,
 attack_type: (spell as any).attack_type,
 // Some spells (including Mind Spike) carry their base damage only in the slot table.
 damage_dice: spell.damage_dice ?? spell.damage_at_slot_level?.[String(spell.level)],
 damage_type: (spell as any).damage_type,
 heal_dice: (spell as any).heal_dice,
 area_of_effect: (spell as any).area_of_effect,
 });

 // Upcast scaling info — derived from spell.higher_levels (preferred) or description
 const upcast = parseUpcastScaling(
 (spell as any).higher_levels || spell.description,
 spell.level,
 );

 // Higher slots remain valid even without an extra scaling benefit.
 const canCast = (isCantrip || availableSlots.length > 0) && (forceSlotLevel===undefined || selectedSlotAvailable);

 // v2.794 — source choice governs every targeted/manual/healing casting path.
 const stats = computeStats(character);
 const key=casting.ability,spellMod=casting.modifier,profBonus=stats.proficiency_bonus;
 const spellAttack=casting.attack,saveDC=casting.saveDC;
 const {flashCast,recentlyCast,postCastChoices}=useSpellEffects({spell,character,campaignId,casting,saveDC,onConcentrationCast});
 const damageProfile=cantripDamage(character,spell,mechanics.damageDice,stats.modifiers.intelligence,casting.className??'other');
 mechanics.damageDice=damageProfile.dice?addDiceModifier(damageProfile.dice,damageProfile.bonus):null;
 const previewHeal=resolveHealDice(spell.heal_at_slot_level?.[String(selectedSlot)]??mechanics.healDice,spellMod);
 const healingPreview=previewHeal&&<p style={{fontSize:12,color:'#6ee7b7',margin:'8px 0'}}>
 Healing: {previewHeal.diceCount?`${previewHeal.diceCount}d${previewHeal.diceSides}${previewHeal.flatBonus>0?'+':''}${previewHeal.flatBonus||''}`:previewHeal.flatBonus}
 </p>;



 // v2.856: explicit slot tables take precedence over prose-derived scaling.
 // The same expression feeds manual rolls, combat targets and slot previews.
 function damageForSlot(level:number):string|null {
  return spell.damage_at_slot_level?.[String(level)] ?? (upcast.extraDice && mechanics.damageDice
   ? computeUpcastDice(mechanics.damageDice,upcast.extraDice,upcast.baseLevel,level) : mechanics.damageDice);
 }

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
 if(!isCantrip&&!availableSlots.some(s=>s.level===effectiveSlot))return;
 const effectiveDice = damageForSlot(effectiveSlot)!;
 const rolled=rollDiceGroups(effectiveDice);
 if(!rolled)return;
 const allRolls=rolled.dice.map(d=>d.value);
 const total=Math.max(0,rolled.total);

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

 // The animation, logged expression and combat payload use the same damage.
 if(rolled.dice.length)triggerRoll({
 result:rolled.dice[0].value,dieType:rolled.dice[0].die,
 allDice:rolled.dice,expression:effectiveDice,flatBonus:rolled.modifier,total,
 label:`${spell.name} — ${mechanics.damageType ?? 'damage'}`,
 });

 await logAction({
 campaignId, characterId: character.id, characterName: character.name,
 actionType: 'damage',
 actionName: `${spell.name} — ${mechanics.damageType ?? 'damage'}`,
 diceExpression: effectiveDice,
 individualResults: allRolls, total,
 notes: isCantrip ? 'cantrip' : `Level ${slotLevel ?? availableSlots[0]?.level ?? spell.level} slot`,
 });
 }

 /** Roll heal dice → 3D roller + action log */
 async function rollHeal(slotLevel?:number) {
 if (!mechanics.healDice) return;
 const effectiveSlot=slotLevel??forceSlotLevel??(isCantrip?0:availableSlots[0]?.level);
 if(effectiveSlot===undefined||(!isCantrip&&!availableSlots.some(s=>s.level===effectiveSlot)))return;
 const expression=spell.heal_at_slot_level?.[String(effectiveSlot)]??mechanics.healDice;
 const resolved=resolveHealDice(expression,spellMod);
 if(!resolved)return;
 const rolled=rollResolvedHeal(resolved),total=Math.max(0,rolled.total);
 // v2.790 — resolve MOD/upcasting before paying; every successful cast pays once.
 burnSlot(effectiveSlot);
 flashCast(effectiveSlot);
 if(rolled.rolls.length)triggerRoll({result:rolled.rolls[0],dieType:resolved.diceSides,
 allDice:rolled.rolls.map(value=>({die:resolved.diceSides,value})),
 expression,flatBonus:resolved.flatBonus,total,label:`${spell.name} — healing`});
 await logAction({campaignId,characterId:character.id,characterName:character.name,
 actionType:'heal',actionName:spell.name,targetName:target||undefined,diceExpression:expression,individualResults:rolled.rolls,total,
 notes:`Level ${effectiveSlot} slot; healing bonus ${resolved.flatBonus>=0?'+':''}${resolved.flatBonus}. Apply healing at the table.`});
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
 // No target AC is known for this standalone roll. Do not invent an AC-10 hit.
 const hitResult = d20 === 20 ? 'crit' : d20 === 1 ? 'fumble' : '';
 const disadvLabel = hasDisadvantage ? ` (Disadv. — ${disadvSources.join(', ')})` : '';
 triggerRoll({
 result: d20, dieType: 20, modifier: spellAttack, total,
 label: `${spell.name} — Spell Attack${disadvLabel}`,
 });
 await logAction({ campaignId, characterId: character.id, characterName: character.name,
 actionType: 'attack', actionName: `${spell.name} — Spell Attack${disadvLabel}`,
 diceExpression: hasDisadvantage ? '2d20kl1' : '1d20',
 individualResults: hasDisadvantage ? [roll1, roll2] : [d20],
 total,
 hitResult: hitResult as any,
 notes: `+${spellAttack} spell attack (${key.slice(0,3).toUpperCase()} ${spellMod >= 0 ? '+' : ''}${spellMod} + Prof +${profBonus})${hasDisadvantage ? ` · disadvantage from ${disadvSources.join(', ')}` : ''}` });
 // v2.46.0: fire for cantrips too so parent action-economy tracks the consumed action.
 onLeveledSpellCast?.(isBonusActionCast);
 }

 /** v2.125.0 — Phase J: burn the spell slot (and fire action-economy hook)
  *  without applying the spell effect. For cantrips: just consumes the
  *  action (no slot to burn). Separated from applyEffect so Counterspell's
  *  immediate casts can share this helper. Declared casts pay through their
  *  server transaction and return the original slot if Counterspell interrupts. */
 function burnSlot(slotLevel: number) {
 if (!isCantrip && slotLevel > 0) {
 spendSlot(slotLevel);
 onLeveledSpellCast?.(isBonusActionCast);
 } else if (isCantrip) {
 // v2.46.0: cantrip cast still consumes the action.
 onLeveledSpellCast?.(isBonusActionCast);
 }
 }

 /** v2.125.0 — Phase J: apply the spell's visible effects (flash + log
  *  entry) without burning a slot. Used by the Counterspell flow to
  *  resolve the effect after the reaction window closes un-countered. */
 async function applyEffect(slotLevel: number, targetName?: string) {
 flashCast(slotLevel);
 await logAction({ campaignId, characterId: character.id, characterName: character.name,
 actionType: 'spell', actionName: spell.name, targetName,
 notes: `${isCantrip ? 'Cantrip' : `Level ${slotLevel} slot`} · ${psionSpellRange(character,spell)} · ${spell.duration}` });
 }

 /** Cast utility spell (no dice). Composed of burnSlot + applyEffect so
  *  existing callsites that want the full cast-and-resolve behavior work
  *  unchanged. */
 async function castUtility(slotLevel: number, targetName?: string) {
 if(!isCantrip&&!availableSlots.some(s=>s.level===slotLevel))return;
 burnSlot(slotLevel);
 await applyEffect(slotLevel, targetName);
 }

 /** v2.804: capture the selected cast before lookup/saves. The sheet-level
  * recovery host owns payment and the window, even after the last slot disappears. */
 async function openDeclareCast(slotLevel:number,targetName:string){
  if(declaring.current||castingBlocked)return;
  declaring.current=true;setDeclarationError('');
  const captured=structuredClone(character),source={source:casting.source,ability:casting.ability,saveDC:casting.saveDC},castId=crypto.randomUUID();
  try{
   if(teleporterCombatParent&&!campaignId)throw new Error('Teleporter follow-up casting outside combat is not connected yet.');
   if(!campaignId){await castUtility(slotLevel,targetName);return;}
   const participant=await declarationParticipant(captured.id,campaignId);
   if(teleporterCombatParent&&!participant)throw new Error('This follow-up requires the original active combat.');
   if(!participant){await castUtility(slotLevel,targetName);return;}
   saveSpellDeclaration(teleporterCombatParent?createTeleporterCantripRequest(captured,spell,participant,userId,source,targetName,teleporterCombatParent,castId):createSpellDeclarationRequest(captured,spell,participant,userId,slotLevel,source,targetName,castId));
   if(teleporterCombatParent)onTeleporterDeclared?.();
  }catch(error){setDeclarationError(error instanceof Error?error.message:'The casting could not be started.');}
  finally{declaring.current=false;}
 }

 /** Log save DC to party */
 async function logSaveDC() {
 const saveColor = SAVE_COLORS[mechanics.saveType ?? ''];
 await logAction({ campaignId, characterId: character.id, characterName: character.name,
 actionType: 'save', actionName: `${spell.name} — ${mechanics.saveType} Save`,
 total: saveDC,
 notes: `Targets must beat DC ${saveDC} ${mechanics.saveType} save${mechanics.damageDice ? ` or take ${mechanics.damageDice} ${mechanics.damageType} damage` : ''}` });
 }

 // ──────────────────────────────────────────────────────────────────
 // v2.794: post-cast choices survive save locks, last-slot use, and both tabs.

 function renderCastControls(){
 if(castingBlocked)return <button type="button" disabled>Finish pending casting first</button>;
 // Teleporter declarations must never fall into legacy slot/attack writers.
 // Complex cantrips stay explicit until their durable multi-target/weapon path
 // is connected; a generic success button would silently lose their effects.
 if(teleporterCombatParent){
  if(spell.id==='true-strike'||spell.area_of_effect||findMultiAttackSpell(spell.name)||spell.heal_dice||(mechanics.saveType&&!mechanics.damageDice))return <p role="status">This cantrip still needs manual resolution. Its weapon, area, or non-damaging saving-throw choices are not automated here yet. No casting has been spent.</p>;
  if(mechanics.damageDice&&(mechanics.isAttack||mechanics.saveType))return <SpellAttackCastButton
   character={character} spell={spell} userId={userId} casting={casting} slotLevel={0}
   teleporterCombatParent={teleporterCombatParent} onSaved={onTeleporterDeclared}
   attackKind={mechanics.isAttack?'attack_roll':'save'} attackMode={mechanics.attackType}
   maxRangeFt={parseRangeToFt(psionSpellRange(character,spell))} attackBonus={spellAttack}
   saveAbility={mechanics.saveType as 'STR'|'DEX'|'CON'|'INT'|'WIS'|'CHA'|undefined}
   saveSuccessEffect="none" damageDice={damageForSlot(0)!} damageType={mechanics.damageType??''} label="Choose follow-up target"/>;
  return <div style={{display:'grid',gap:8}}><label>Target or point (optional)<input aria-label="Follow-up target" value={target} onChange={e=>setTarget(e.target.value)} maxLength={300}/></label>
   <button type="button" className="btn btn-primary" onClick={()=>void openDeclareCast(0,target)}>Cast follow-up</button></div>;
 }

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
 title="Choose a higher-level spell slot for this casting"
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
 {healingPreview}
 <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 6 }}>
 Base level {spell.level} · Casting at level {selectedSlot}
 </div>
 </div>

 {/* Scrollable middle section — slot picker + higher-levels text + target */}
 <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' as const, marginRight: -8, paddingRight: 8 }}>
 {/* v2.63.0: full spell description (one big block) so player has full
     context on what the spell does without closing the modal. */}
 <PsionCastingNote psionic={false} stronger={hasStrongerTelekinesis(character,spell)}/><SpellDescription spell={spell} />
 {!spell.higher_levels?.trim()&&<p style={{fontSize:12,color:'var(--t-2)'}}>A higher slot is allowed. Apply extra effects only when the spell description specifies them.</p>}
 {/* v2.64.0: Unified slot picker. When the spell has per-tier damage/healing
     data, show a rich grid where each tile = one slot tier with the rolled
     dice for that tier. Tiles are clickable picker buttons. Tiles without an
     available slot are dimmed but still visible (so the player sees what they
     COULD do at higher tiers if they had slots). When the spell has no scaling
     data (utility/control spells), fall back to the simple slot picker.
     The redundant "Choose Spell Slot Level" section is removed. */}
 {(() => {
 const dasl = (spell as any).damage_at_slot_level as Record<string, string> | undefined;
 const hasl = (spell as any).heal_at_slot_level as Record<string, string> | undefined;
 const tiers = dasl ?? hasl;
 const availableMap = new Map(availableSlots.map(s => [s.level, s.remaining]));
 const label = dasl ? 'Damage by slot · tap to pick' : hasl ? 'Healing by slot · tap to pick' : 'Choose Spell Slot Level';

 if (tiers) {
 // Rich tier grid: show every tier the spell scales to, picker behavior
 const tierKeys = [...new Set([...Object.keys(tiers).map(Number),...availableSlots.map(s=>s.level)])].filter(k => Number.isInteger(k) && k >= spell.level && k<=9).sort((a,b)=>a-b);
 if (tierKeys.length === 0) return null;
 return (
 <div style={{
 padding: '10px 12px', borderRadius: 'var(--r-md)',
 background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
 marginBottom: 14,
 }}>
 <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#fbbf24', marginBottom: 6 }}>
 {label}
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
 {tierKeys.map(lvl => {
 const remaining = availableMap.get(lvl) ?? 0;
 const isAvailable = remaining > 0;
 const isSelected = selectedSlot === lvl;
 return (
 <button
 key={lvl}
 onClick={() => isAvailable && setSelectedSlot(lvl)}
 disabled={!isAvailable}
 style={{
 padding: '6px 8px', borderRadius: 6, cursor: isAvailable ? 'pointer' : 'not-allowed',
 background: isSelected ? 'rgba(251,191,36,0.22)' : isAvailable ? 'rgba(255,255,255,0.025)' : 'transparent',
 border: `1px solid ${isSelected ? 'rgba(251,191,36,0.6)' : 'var(--c-border)'}`,
 textAlign: 'center' as const,
 opacity: isAvailable ? 1 : 0.35,
 fontFamily: 'var(--ff-body)',
 minHeight: 0,
 }}
 title={isAvailable ? `Cast at level ${lvl} (${remaining} slot${remaining === 1 ? '' : 's'} left)` : `No level ${lvl} slots available`}
 >
 <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.04em' }}>LVL {lvl}</div>
 <div style={{ fontFamily: 'var(--ff-stat)', fontSize: 13, fontWeight: 800, color: isSelected ? '#fbbf24' : 'var(--t-2)', marginTop: 1 }}>{tiers[String(lvl)]??(dasl?damageForSlot(lvl):spell.heal_dice)??'See description'}</div>
 <div style={{ fontSize: 8, fontWeight: 600, color: isAvailable ? 'var(--t-3)' : 'var(--c-red-l)', marginTop: 2 }}>
 {isAvailable ? `${remaining} left` : 'no slot'}
 </div>
 </button>
 );
 })}
 </div>
 </div>
 );
 }

 // Fallback for spells with no scaling data — simple slot picker only
 return (
 <>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 8 }}>
 {label}
 </div>
 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
 {availableSlots.map(({ level, remaining }) => (
 <button key={level} onClick={() => setSelectedSlot(level)}
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
 </>
 );
 })()}
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
 {/* v2.81.0: Single primary button. For damaging spells, clicking it both
     consumes the slot (castUtility) AND rolls the upcast damage. The separate
     "Roll Damage @ Level N" button was redundant — a user upcasting a damage
     spell almost always wants both in one click. Re-rolling damage without
     burning a slot (e.g. concentration spell tick) is handled elsewhere. */}
 <button
 onClick={() => {
 if(!selectedSlotAvailable)return;
 if(mechanics.healDice)rollHeal(selectedSlot);
 else if(mechanics.damageDice)rollDamage(selectedSlot);
 else castUtility(selectedSlot, target);
 setShowModal(false);
 setTarget('');
 }}
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
 {mechanics.damageDice
 ? `↑ Upcast at Level ${selectedSlot} + Roll Damage`
 : `↑ Upcast at Level ${selectedSlot}${mechanics.healDice?' + Roll Healing':''}`}
 </button>
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
  // v2.746 — the in-campaign target pickers (AoE save, multi-beam attack,
  // heal) were rendered ONLY by the full-mode (Spells tab) return below,
  // but the compact Actions-tab buttons are the ones that call
  // setAoePicker / setMultiAttackPicker / setHealPicker — so "Cast" on
  // Fireball from the Actions tab was a silent no-op (verified live on the
  // local stack: no encounter query, nothing mounted). One element, rendered
  // by every compact return that can open a picker and by full mode.
  const campaignPickerModals = (
    <Suspense fallback={null}>
      {aoePicker && campaignId && (
       <SpellTargetPickerModal
       open={true}
       onClose={() => setAoePicker(null)}
       spell={spell}
       slotLevel={aoePicker.slotLevel}
       effectiveDamageDice={aoePicker.damageDice}
       saveDC={saveDC}
       character={character}
       campaignId={campaignId}
       onDeclared={() => {
       if (!isCantrip) spendSlot(aoePicker.slotLevel);
       flashCast(aoePicker.slotLevel);
       onLeveledSpellCast?.(isBonusActionCast);
       }}
       />
       )}
      {multiAttackPicker && campaignId && (
       <MultiAttackPickerModal
       open={true}
       onClose={() => setMultiAttackPicker(null)}
       spell={spell}
       slotLevel={multiAttackPicker.slotLevel}
       defaultAttackCount={multiAttackPicker.attackCount}
       perBeamDice={multiAttackPicker.damageDice}
       attackBonus={spellAttack}
       character={character}
       campaignId={campaignId}
       onDeclared={() => {
       if (!isCantrip) spendSlot(multiAttackPicker.slotLevel);
       flashCast(multiAttackPicker.slotLevel);
       onLeveledSpellCast?.(isBonusActionCast);
       }}
       />
       )}
      {healPicker && campaignId && (
       <SpellHealPickerModal
       open={true}
       onClose={() => setHealPicker(null)}
       spell={spell}
       slotLevel={healPicker.slotLevel}
       healDef={healPicker.def}
       effectiveHealDice={healPicker.healDice}
       spellMod={spellMod}
       character={character}
       campaignId={campaignId}
       onDeclared={() => {
       if (!isCantrip) spendSlot(healPicker.slotLevel);
       flashCast(healPicker.slotLevel);
       onLeveledSpellCast?.(isBonusActionCast);
       }}
       />
       )}
    </Suspense>
  );

 // v2.790 — cantrips and healing share cast/roll/target controls in both tabs.
 if (compact || isCantrip || mechanics.healDice) {
 // If a leveled spell was already cast this turn, lock this spell out
 if (spellLockedOut) {
 return (
 <span title="You already cast a spell this turn. Only one leveled spell per turn (cantrips are free)."
 style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', opacity: 0.5,
 border: '1px solid var(--c-border)', borderRadius: 4, padding: '2px 7px',
 cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
 1 spell/turn
 </span>
 );
 }

 const dmgColor = DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8';
 const saveColor = SAVE_COLORS[mechanics.saveType ?? ''] ?? '#94a3b8';
 // v2.172.0 — Phase Q.0 pt 13: spell buttons redesigned to visually
 // match the Actions tab (WeaponsTracker). Previously these were
 // fully rounded pills (borderRadius: 999) with 2×7 padding — a
 // different shape and a smaller footprint than the rectangular
 // 5×10 rounded-rect buttons used by weapons. Synced to match:
 // same border-radius, same padding, same overall weight. Colors
 // stay purple (spells semantic) vs gold (weapons) so players can
 // still glance-differentiate the two at a row level.
 const btnBase: React.CSSProperties = {
 fontSize: 11, fontWeight: 700, padding: '5px 10px',
 borderRadius: 'var(--r-md)',
 cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
 fontFamily: 'var(--ff-body)',
 minHeight: 0,
 };

 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end', width: '100%' }}>
 {/* v2.504.0 — justifyContent flipped flex-start → flex-end so spell
     Cast buttons sit at the far right of their column, matching the
     class-ability Cast buttons (ClassAbilitiesSection right-justifies
     its button column). Pre-v2.504 spells were left-aligned within
     the 170px column while abilities were right-aligned, so the two
     surfaces' buttons didn't line up. */}

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
 background: recentlyCast ? '#34d399' : 'rgba(167,139,250,0.15)',
 border: `1px solid ${recentlyCast ? '#34d399' : 'rgba(167,139,250,0.4)'}`,
 color: recentlyCast ? '#000' : '#a78bfa',
 fontWeight: recentlyCast ? 800 : 700,
 transition: 'background 0.2s, border-color 0.2s, color 0.2s',
 }}
 >
 {recentlyCast ?? 'Cast'}
 </button>
 )}

 {/* v2.88.0: Conditional damage roll for utility spells with damage_dice
     (e.g. Dimension Door → 4d6 force damage if you arrive in an occupied
     space). Separate button so the damage is only rolled when the DM
     determines the edge case triggers — not on every cast. Renders in
     addition to the Cast button above. */}
 {mechanics.isUtility && mechanics.damageDice && (
 <button
 onClick={() => rollDamage(forceSlotLevel)}
 title={`Roll ${mechanics.damageDice}${mechanics.damageType ? ` ${mechanics.damageType.toLowerCase()}` : ''} damage (conditional — usually requires DM adjudication)`}
 style={{ ...btnBase,
 background: 'rgba(248,113,113,0.12)',
 border: '1px solid rgba(248,113,113,0.4)',
 color: 'var(--c-red-l)',
 fontWeight: 700,
 transition: 'background 0.2s, border-color 0.2s, color 0.2s',
 }}
 >
 {/* v2.504.0 — damage type stripped from the compact button label
     (was "{dice} thun."); the full typed damage stays in the
     expanded detail panel and the actual roll still applies the
     correct type. Compact row shows dice only for a cleaner scan. */}
 {mechanics.damageDice}
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
 {/* v2.504.0 — dice only; type lives in expanded details + the roll. */}
 {mechanics.damageDice}
 </button>
 )}
 {/* v2.101.0 — Phase F: in-combat single-target spell attack.
     v2.149.0 — Phase O pt 2: for multi-beam attack spells (Scorching
     Ray, Eldritch Blast), branch to MultiAttackPickerModal which
     creates one pending_attacks row per beam via declareAttack. Single-
     target attack spells (Fire Bolt, Guiding Bolt, Ray of Frost, etc.)
     keep the existing PlayerAttackButton path unchanged. */}
 {character.id && campaignId && mechanics.damageDice && (() => {
 const effSlot = forceSlotLevel ?? (isCantrip ? 0 : (availableSlots[0]?.level ?? spell.level));
 const dice = damageForSlot(effSlot)!;
 // Registry lookup — multi-beam spells open the beam-assignment picker.
 const multi = findMultiAttackSpell(spell.name);
 if (multi) {
   const beamCount = computeDefaultAttackCount(multi, effSlot, character.level ?? 1);
   return (
<>
     <button
       onClick={() => setMultiAttackPicker({
         slotLevel: effSlot,
         damageDice: multi.perBeamDice ? addDiceModifier(multi.perBeamDice,damageProfile.bonus) : mechanics.damageDice!,
         attackCount: beamCount,
       })}
       title={`${beamCount} beam${beamCount === 1 ? '' : 's'} · attack +${spellAttack} · ${multi.perBeamDice ?? mechanics.damageDice} ${mechanics.damageType ?? ''} each. Click to assign targets.`}
       style={{
         ...btnBase,
         background: 'rgba(251,191,36,0.15)',
         border: '1px solid rgba(251,191,36,0.5)',
         color: '#fbbf24', fontWeight: 700,
       }}
     >
       ⚔ {beamCount} beam{beamCount === 1 ? '' : 's'} +{spellAttack}
     </button>
</>
   );
 }
 // v2.856: single-target combat spells use the durable sheet casting host.
 return (
   <SpellAttackCastButton
     character={character} spell={spell} userId={userId} casting={casting} slotLevel={effSlot}
     attackKind="attack_roll" attackMode={mechanics.attackType}
     maxRangeFt={parseRangeToFt(psionSpellRange(character,spell))}
     attackBonus={spellAttack}
     damageDice={dice}
     damageType={mechanics.damageType ?? ''}
   />
 );
 })()}
 </>
 )}

 {/* ── CATEGORY 3: SAVE SPELL — Cast + Damage two-button row (v2.372.0) ── */}
 {mechanics.saveType && !mechanics.isAttack && mechanics.damageDice && (
 <>
 {/* Cast button (v2.372.0) — always renders, regardless of campaign
     context. Pre-v2.372 the Cast affordance was buried inside the
     in-campaign branch with a non-obvious label and didn't render
     at all out of combat, leaving only the damage button visible.
     Now: in-campaign with AoE → opens SpellTargetPickerModal (the
     existing multi-target save resolver auto-rolls damage on save
     outcomes per target, Option B). In-campaign single-target →
     PlayerAttackButton with attackKind="save". Out-of-campaign →
     castUtility, which spends the slot and logs the DC for the DM. */}
 {(() => {
 const inCampaign = !!(character.id && campaignId);
 const isAoE = !!spell.area_of_effect;
 const effSlot = forceSlotLevel ?? (isCantrip ? 0 : (availableSlots[0]?.level ?? spell.level));
 const dice = damageForSlot(effSlot)!;

 // In-campaign + AoE: route to SpellTargetPickerModal. Open via
 // setAoePicker just like the pre-v2.372 ⚔ AoE button did.
 if (inCampaign && isAoE) {
 return (
<>
 <button
 onClick={() => setAoePicker({ slotLevel: effSlot, damageDice: dice })}
 title={`${spell.area_of_effect!.size}ft ${spell.area_of_effect!.type} · ${mechanics.saveType} DC ${saveDC} save · ${dice} ${mechanics.damageType ?? 'damage'} (${isCantrip?'none':'half'} on save). Pick targets to cast.`}
 style={{
 ...btnBase,
 background: recentlyCast ? '#34d399' : 'rgba(167,139,250,0.15)',
 border: `1px solid ${recentlyCast ? '#34d399' : 'rgba(167,139,250,0.5)'}`,
 color: recentlyCast ? '#000' : '#a78bfa',
 fontWeight: recentlyCast ? 800 : 700,
 transition: 'background 0.2s, border-color 0.2s, color 0.2s',
 }}
 >
 {/* v2.504.0 — button label is just "Cast"; the save DC already
     shows in the row's HIT/DC column, so repeating it on the
     button was redundant. Full save info stays in the tooltip. */}
 {recentlyCast ?? 'Cast'}
 </button>
</>
 );
 }

 // In-campaign + single target: save the paid casting and selected target.
 // Already declares the attack through the combat pipeline,
 // resolves saves, and handles the damage flow per target.
 if (inCampaign && !isAoE) {
 return (
 <SpellAttackCastButton
 character={character} spell={spell} userId={userId} casting={casting} slotLevel={effSlot}
 attackKind="save"
 maxRangeFt={parseRangeToFt(psionSpellRange(character,spell))}
 saveAbility={mechanics.saveType as any}
 saveSuccessEffect={isCantrip?'none':'half'}
 damageDice={dice}
 damageType={mechanics.damageType ?? ''}
 label={recentlyCast ?? 'Cast'}
 />
 );
 }

 // Out-of-campaign fallback: spend slot + log DC, no target picking.
 // Mirrors the save-only spell path at line ~891 (Calm Emotions etc.).
 return (
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
 title={`Targets make ${mechanics.saveType} DC ${saveDC} save. Click to cast (out-of-campaign — DM resolves saves manually).`}
 style={{ ...btnBase,
 background: recentlyCast ? '#34d399' : 'rgba(167,139,250,0.15)',
 border: `1px solid ${recentlyCast ? '#34d399' : 'rgba(167,139,250,0.4)'}`,
 color: recentlyCast ? '#000' : '#a78bfa',
 fontWeight: recentlyCast ? 800 : 700,
 transition: 'background 0.2s, border-color 0.2s, color 0.2s',
 }}
 >
 {recentlyCast ?? 'Cast'}
 </button>
 );
 })()}

 {/* Damage button — explicit manual roll. Unchanged from pre-v2.372;
     used when the DM needs to roll damage outside the auto-flow
     (homebrew adjudication, etc.). */}
 <button
 onClick={() => rollDamage()}
 style={{ ...btnBase, background: dmgColor + '18',
 border: `1px solid ${dmgColor}50`, color: dmgColor }}
 title={`Roll ${mechanics.damageDice} ${mechanics.damageType} damage independently (manual resolution).`}
 >
 {/* v2.504.0 — dice only; type in tooltip + expanded details. */}
 {mechanics.damageDice}
 </button>
 </>
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
 background: recentlyCast ? '#34d399' : 'rgba(167,139,250,0.15)',
 border: `1px solid ${recentlyCast ? '#34d399' : 'rgba(167,139,250,0.4)'}`,
 color: recentlyCast ? '#000' : '#a78bfa',
 fontWeight: recentlyCast ? 800 : 700,
 transition: 'background 0.2s, border-color 0.2s, color 0.2s',
 }}
 title={`Targets make ${mechanics.saveType} DC ${saveDC} save. Click to cast.`}
 >
 {recentlyCast ?? 'Cast'}
 </button>
 )}

 {/* Heal dice. v2.150.0 — Phase O pt 3: in combat, open
     SpellHealPickerModal to pick target(s) and apply HP directly.
     Out of combat (no campaignId, no encounter), fall through to the
     existing rollHeal path (local dice + action log, no HP mutation —
     DM applies manually). */}
 {mechanics.healDice && (() => {
   const healDef = findHealSpell(spell.name);
   const canRoute = !!(healDef && campaignId);
   return (
     <button
       onClick={() => {
         if (canRoute) {
           const effSlot = forceSlotLevel ?? (isCantrip ? 0 : (availableSlots[0]?.level ?? spell.level));
           const hasl = (spell as any).heal_at_slot_level as Record<string, string> | undefined;
           const effDice = hasl?.[String(effSlot)] ?? mechanics.healDice!;
           setHealPicker({ slotLevel: effSlot, healDice: effDice, def: healDef! });
           return;
         }
         const effSlot=forceSlotLevel??(isCantrip?0:availableSlots[0]?.level);
         if(!isCantrip&&forceSlotLevel===undefined&&availableSlots.length>1){
           setSelectedSlot(effSlot!);setShowModal(true);return;
         }
         rollHeal(effSlot);
       }}
       title={canRoute
         ? `Pick up to ${healDef!.maxTargets} target${healDef!.maxTargets === 1 ? '' : 's'} to heal. Applies HP directly.`
         : `Roll ${mechanics.healDice} healing (out of combat — DM applies HP manually).`}
       style={{ ...btnBase, background: 'rgba(52,211,153,0.12)',
       border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }}>
       {canRoute ? `+ ${mechanics.healDice} HP` : mechanics.healDice}
     </button>
   );
 })()}

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
 {healingPreview}
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
 {psionSpellRange(character,spell)}
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
     v2.81.0: Single button for damaging spells — casts + rolls damage in one click. */}
 {(() => {
 const isUpcasting = !isCantrip && selectedSlot > spell.level;
 const verb = isUpcasting ? '↑ Upcast' : 'Cast';
 const confirmLabel = mechanics.damageDice
 ? `${verb} at Level ${selectedSlot} + Roll Damage`
 : `${verb} at Level ${selectedSlot}${mechanics.healDice?' + Roll Healing':''}`;
 return (
 <div style={{
 display: 'flex', flexDirection: 'column' as const, gap: 8,
 paddingTop: 14, borderTop: '1px solid var(--c-border)', marginTop: 12,
 }}>
 <button
 onClick={() => {
 if(!selectedSlotAvailable)return;
 if(mechanics.healDice)rollHeal(selectedSlot);
 else if(mechanics.damageDice)rollDamage(selectedSlot);
 else castUtility(selectedSlot, target);
 setShowModal(false);
 setTarget('');
 }}
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
 {/* v2.801 — mount once: branch-local copies doubled area/beam dialogs. */}
 {campaignPickerModals}
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
 {psionSpellRange(character,spell)}
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
 const upcastDice = damageForSlot(level);
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
 maxHeight: 240, overflowY: 'auto' }}><PsionCastingNote psionic={false} stronger={hasStrongerTelekinesis(character,spell)}/><SpellDescription spell={spell} /></div>
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
 const dice = damageForSlot(selectedSlot);
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
 {/* v2.124.0 — Phase J: Declare Cast opens the Counterspell pre-cast
     window. Only shown for leveled spells (cantrip and attack/healing coverage remains follow-up work;
     Counterspell can also interrupt cantrips). */}
 {mechanics.isUtility && !isCantrip && selectedSlot > 0 && campaignId && (
 <button onClick={() => { openDeclareCast(selectedSlot, target); setShowModal(false); setTarget(''); }}
 title="Declare the cast through the Counterspell reaction window (30s) before resolving the effect. Use when an enemy spellcaster might counterspell you."
 style={{ flex: 1, fontFamily: 'var(--ff-body)', fontWeight: 700, padding: '7px 10px',
 borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid #60a5fa60', background: 'rgba(96,165,250,0.15)',
 color: '#60a5fa', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 Declare
 </button>
 )}
 </div>
 </div>
 </div>,
 document.body
 )}
 {/* v2.443.0 — One Suspense boundary for all five lazy-loaded
     spell modals. Only one is ever rendered at a time (states
     are mutually exclusive), but a single boundary keeps the
     fallback simple and centralizes the loading fade. */}
 <Suspense fallback={null}>
 {/* v2.115.0 — Phase H pt 6: buff target picker for registry spells */}
 {/* v2.124.0 — Phase J: Counterspell pre-cast window */}
 {/* v2.148.0 — Phase O pt 1: multi-target save spell picker. Opens when
     the AoE save button is clicked. onDeclared burns the slot + sets
     concentration; picker cancel leaves slot unspent. */}
 {campaignPickerModals}
 {/* v2.149.0 — Phase O pt 2: multi-beam attack spell picker. Fires N
     independent declareAttack calls; each beam rolls its own d20 +
     damage per RAW 2024 "Make a ranged spell attack for each ray." */}
 
 {/* v2.150.0 — Phase O pt 3: heal picker. Direct HP application via
     applyHealToParticipant — no pending_attacks rows since there's no
     hit/miss/save to resolve. Mass heals share one roll across targets
     per RAW 2024. */}
 
 </Suspense>
 </>
 );
}
 return <>{declarationError&&<p role="alert">{declarationError}</p>}{renderCastControls()}{postCastChoices}</>;
}
