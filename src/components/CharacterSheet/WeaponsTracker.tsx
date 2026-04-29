import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { WeaponItem } from '../../types';
import { rollDie, computeActiveBonuses } from '../../lib/gameUtils';
import { CONDITION_MAP } from '../../data/conditions';
import { useDiceRoll } from '../../context/DiceRollContext';
import { logAction } from '../shared/ActionLog';
import PlayerAttackButton from '../Combat/PlayerAttackButton';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../shared/ModalPortal';

interface WeaponsTrackerProps {
 weapons: WeaponItem[];
 onUpdate: (weapons: WeaponItem[]) => void;
 /** LEGACY NAMING: in some call sites this is the auth user's id (not the
  * character row id). We preserve it as-is to avoid breaking existing
  * roll_logs / action_log writes that key on this value. */
 characterId?: string;
 characterName?: string;
 // v2.82.0: two new props power character_history logging for rolls. Separate
 // from the legacy `characterId` wiring (which is ambiguous per-caller).
 historyCharacterId?: string;  // the character row id (character.id)
 userId?: string;              // the authenticated user's id
 campaignId?: string | null;
 activeConditions?: string[];
 activeBufss?: any[];
}

const DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'poison', 'acid', 'necrotic', 'radiant', 'psychic', 'thunder', 'force'];
const DICE_OPTIONS = ['1d4', '1d6', '1d8', '1d10', '1d12', '2d6', '2d8', '1d4+1d6', 'flat'];

function parseDamage(damageDice: string, damageBonus: number): number {
 let dmg = damageBonus;
 const diceMatch = damageDice.match(/(\d+)d(\d+)/g);
 if (diceMatch) {
 for (const expr of diceMatch) {
 const [count, sides] = expr.split('d').map(Number);
 for (let i = 0; i < count; i++) dmg += rollDie(sides);
 }
 } else if (damageDice === 'flat') {
 dmg = damageBonus;
 }
 return Math.max(1, dmg);
}

function modStr(n: number) { return (n >= 0 ? '+' : '') + n; }

interface RollResult {
 weaponName: string;
 hit: number;
 nat: number;
 damage: number;
 damageType: string;
 crit: boolean;
 miss: boolean;
 hitVsAC: 'hit' | 'miss' | 'crit' | 'unknown';
}

export default function WeaponsTracker({
 weapons, onUpdate, characterId, characterName, historyCharacterId, userId, campaignId,
 activeConditions = [], activeBufss = [],
}: WeaponsTrackerProps) {
 const [showAdd, setShowAdd] = useState(false);
 const [editId, setEditId] = useState<string | null>(null);
 const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
 const { triggerRoll } = useDiceRoll();
 // v2.82.0: logHistory hook — uses the explicit history props (not the legacy
 // `characterId` which in some call sites is actually the auth user's id).
 // Falls back to undefined when either is missing so triggerRoll silently skips.
 const logHistory = historyCharacterId && userId ? { characterId: historyCharacterId, userId } : undefined;
 // v2.87.0: Unarmed Strike mode picker modal. Set when the user clicks the
 // STRIKE button on the synthesized Unarmed Strike row; holds the weapon
 // reference so the 4 mode buttons (Damage / Grapple / Shove Push / Shove
 // Prone) have everything they need.
 const [unarmedModal, setUnarmedModal] = useState<WeaponItem | null>(null);
 // v2.326.0 — T4: weapon row expansion. Magic weapons (Lucky Blade,
 // staves, etc.) often have a description in `notes` that doesn't fit on
 // the row. Click anywhere outside the Hit/Damage/edit buttons to expand
 // the row and show the full notes panel below.
 const [expandedWeaponId, setExpandedWeaponId] = useState<string | null>(null);
 const [form, setForm] = useState<Partial<WeaponItem>>({
 name: '', attackBonus: 0, damageDice: '1d8', damageBonus: 0,
 damageType: 'slashing', range: 'Melee', properties: '', notes: '',
 });

 // v2.87.0: Grapple and Shove are 2024 PHB Unarmed Strike modes. Both are
 // contested Athletics checks — the target picks Athletics or Acrobatics.
 // We broadcast the attacker's roll + context; DM adjudicates the target
 // side (they have the monster/NPC stat block and condition state). Each
 // handler: triggerRoll (3D dice + history), logAction (action_log
 // broadcast), then close modal. Closing the modal before the 3D roller
 // settles is fine — triggerRoll's physics are independent of this UI.
 async function handleGrapple(weapon: WeaponItem) {
 const bonus = weapon.athleticsBonus ?? 0;
 const nat = rollDie(20);
 const total = nat + bonus;
 triggerRoll({
 result: nat, dieType: 20, modifier: bonus, total,
 label: `Grapple — Athletics check${bonus >= 0 ? '+' : ''}${bonus}`,
 logHistory,
 });
 if (historyCharacterId) {
 await logAction({
 campaignId: campaignId ?? null,
 characterId: historyCharacterId,
 characterName: characterName ?? '',
 actionType: 'attack',
 actionName: `Grapple (Unarmed Strike) — Athletics`,
 diceExpression: `1d20${bonus >= 0 ? '+' : ''}${bonus}`,
 individualResults: [nat],
 total,
 notes: 'Contested: target rolls STR (Athletics) or DEX (Acrobatics). On success target gains Grappled condition.',
 });
 }
 setUnarmedModal(null);
 }

 async function handleShove(weapon: WeaponItem, variant: 'push' | 'prone') {
 const bonus = weapon.athleticsBonus ?? 0;
 const nat = rollDie(20);
 const total = nat + bonus;
 const variantLabel = variant === 'push' ? 'Push 5 ft' : 'Knock Prone';
 triggerRoll({
 result: nat, dieType: 20, modifier: bonus, total,
 label: `Shove (${variantLabel}) — Athletics check${bonus >= 0 ? '+' : ''}${bonus}`,
 logHistory,
 });
 if (historyCharacterId) {
 await logAction({
 campaignId: campaignId ?? null,
 characterId: historyCharacterId,
 characterName: characterName ?? '',
 actionType: 'attack',
 actionName: `Shove — ${variantLabel} (Unarmed Strike)`,
 diceExpression: `1d20${bonus >= 0 ? '+' : ''}${bonus}`,
 individualResults: [nat],
 total,
 notes: `Contested: target rolls STR (Athletics) or DEX (Acrobatics). On success: ${variant === 'push' ? 'target is pushed 5 ft.' : 'target has the Prone condition.'}`,
 });
 }
 setUnarmedModal(null);
 }

 function openEdit(w: WeaponItem) {
 setForm({ ...w });
 setEditId(w.id);
 setShowAdd(true);
 }

 function saveWeapon() {
 if (!form.name?.trim()) return;
 const weapon: WeaponItem = {
 id: editId ?? uuidv4(),
 name: form.name!.trim(),
 attackBonus: form.attackBonus ?? 0,
 damageDice: form.damageDice ?? '1d8',
 damageBonus: form.damageBonus ?? 0,
 damageType: form.damageType ?? 'slashing',
 range: form.range ?? 'Melee',
 properties: form.properties ?? '',
 notes: form.notes ?? '',
 };
 if (editId) {
 onUpdate(weapons.filter(w => !String(w.id).startsWith('inv_')).map(w => w.id === editId ? weapon : w));
 } else {
 onUpdate([...weapons.filter(w => !String(w.id).startsWith('inv_')), weapon]);
 }
 setShowAdd(false);
 setEditId(null);
 }

 function removeWeapon(id: string) {
 onUpdate(weapons.filter(w => w.id !== id));
 }

 async function handleHit(weapon: WeaponItem) {
 const buffBonuses = computeActiveBonuses(activeBufss);
 const blessRoll = buffBonuses.blessActive ? rollDie(4) : 0;
 const hasDisadvantage = activeConditions.some(c => CONDITION_MAP[c]?.attackDisadvantage);
 const roll1 = rollDie(20);
 const nat = hasDisadvantage ? Math.min(roll1, rollDie(20)) : roll1;
 const hit = nat + weapon.attackBonus + blessRoll + buffBonuses.attackBonus;
 // Hit-vs-AC adjudication moved to the DM's BattleMap; only nat 20 / nat 1 are decided here
 const hitVsAC: RollResult['hitVsAC'] = nat === 20 ? 'crit'
 : nat === 1 ? 'miss'
 : 'unknown';

 setLastRoll(prev => ({
 weaponName: weapon.name,
 hit, nat,
 damage: prev?.weaponName === weapon.name ? prev.damage : 0,
 damageType: weapon.damageType,
 crit: nat === 20,
 miss: nat === 1,
 hitVsAC,
 }));

 triggerRoll({ result: nat, dieType: 20, modifier: weapon.attackBonus, total: hit, label: `${weapon.name} — d20${weapon.attackBonus >= 0 ? '+' : ''}${weapon.attackBonus}`, logHistory });

 // Write to roll_logs so it appears in Roll History
 if (characterId) {
 supabase.from('roll_logs').insert({
 character_id: characterId,
 campaign_id: campaignId ?? null,
 label: `${weapon.name} — To Hit`,
 dice_expression: `1d20+${weapon.attackBonus}`,
 individual_results: [nat],
 total: hit,
 modifier: weapon.attackBonus,
 });
 }

 if (characterId) {
 await logAction({
 campaignId, characterId, characterName: characterName ?? '',
 actionType: 'attack', actionName: `${weapon.name} (Hit Roll)`,
 diceExpression: `1d20+${weapon.attackBonus}`,
 individualResults: [nat], total: hit,
 hitResult: nat === 20 ? 'crit' : nat === 1 ? 'fumble' : '',
 notes: `To hit: ${hit}`,
 });
 }
 }

 async function handleDamage(weapon: WeaponItem) {
 const buffBonuses = computeActiveBonuses(activeBufss);
 const rageDmg = buffBonuses.rageActive && weapon.range === 'Melee' ? 2 : 0;
 const huntersDmg = buffBonuses.huntersMarkActive ? rollDie(6) : 0;
 const hexDmg = buffBonuses.hexActive ? rollDie(6) : 0;
 const divineDmg = buffBonuses.divineFavorActive ? rollDie(4) : 0;
 const bonusDmg = rageDmg + huntersDmg + hexDmg + divineDmg + buffBonuses.damageBonus;

 const baseDmg = parseDamage(weapon.damageDice, weapon.damageBonus);
 const isCrit = lastRoll?.weaponName === weapon.name && lastRoll.crit;
 const critExtra = isCrit ? parseDamage(weapon.damageDice, 0) : 0;
 const damage = baseDmg + bonusDmg + critExtra;

 setLastRoll(prev => prev ? { ...prev, damage, weaponName: weapon.name } : {
 weaponName: weapon.name, hit: 0, nat: 0, damage, damageType: weapon.damageType,
 crit: false, miss: false, hitVsAC: 'unknown',
 });

 // Extract the die type so the 3D roller shows the correct physical die
 const dmgDieMatch = weapon.damageDice.match(/\d+d(\d+)/);
 const dmgDieType = dmgDieMatch ? parseInt(dmgDieMatch[1]) : 4;
 triggerRoll({ result: 0, dieType: dmgDieType, modifier: weapon.damageBonus, total: damage, label: `${weapon.name} — ${weapon.damageDice} damage`, logHistory });

 // Write to roll_logs so it appears in Roll History
 if (characterId) {
 supabase.from('roll_logs').insert({
 character_id: characterId,
 campaign_id: campaignId ?? null,
 label: `${weapon.name} — Damage`,
 dice_expression: `${weapon.damageDice}${weapon.damageBonus !== 0 ? modStr(weapon.damageBonus) : ''}`,
 individual_results: [baseDmg],
 total: damage,
 modifier: weapon.damageBonus,
 });
 }

 if (characterId) {
 await logAction({
 campaignId, characterId, characterName: characterName ?? '',
 actionType: 'attack', actionName: `${weapon.name} (Damage)`,
 diceExpression: `${weapon.damageDice}${weapon.damageBonus !== 0 ? modStr(weapon.damageBonus) : ''}`,
 individualResults: [baseDmg], total: damage,
 hitResult: 'hit',
 notes: `${damage} ${weapon.damageType}`,
 });
 }
 }

 // v2.266.0 — was splitting weapons into customWeapons and an
 // unused inventoryWeapons branch; the unused branch was kept "for
 // symmetry" but TS rejects it. Drop entirely; we filter only
 // customWeapons here. If a future ranged-from-inventory section
 // wants its own branch, recreate it then.
 const customWeapons = weapons.filter(w => !String(w.id).startsWith('inv_'));

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

 {/* v2.35.0: removed the "last roll" banner — 3D dice roller and the action log
 already surface attack results; the banner was a duplicate that sat above the
 attack rows and shifted layout on every roll. */}

 {/* v2.183.0 — Phase Q.0 pt 24: renamed section from "ATTACKS" to
     "WEAPON ATTACKS" to distinguish from spell attacks (which have
     their own section under the Spells tab) and from the overall
     Actions tab (which includes Standard Actions and Class
     Abilities). "Weapon Attacks" is unambiguous — if it's here,
     it's something you swing, shoot, or throw. */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-border)', paddingBottom: 6 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>
 WEAPON ATTACKS
 </span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)' }}>
 Attacks per Action: 1
 </span>
 </div>
 {/* Table column headers — v2.371.0 unified 9-col template
     matches SpellsTab + ClassAbilitiesSection. Weapons don't have
     level/school/casting-time analogs, so LEAD/BAR/TIME render
     empty here. */}
 {weapons.length > 0 && (
 <div style={{ display: 'grid', gridTemplateColumns: '70px 3px 1fr 46px 70px 36px 74px 80px 180px 110px 16px', gap: '0 8px', padding: '0 10px 4px', marginBottom: 2 }}>
 {['', '', 'ATTACK', '', 'RANGE', '', 'HIT', 'DAMAGE', '', '', ''].map((h, i) => (
 <span key={i} style={{ fontFamily: 'var(--ff-body)', fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>{h}</span>
 ))}
 </div>
 )}
 {weapons.length === 0 ? (
 <div style={{ textAlign: 'center', padding: 'var(--sp-6) 0' }}>
 <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.25 }}></div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: 'var(--t-1)', marginBottom: 6 }}>No weapons</div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', maxWidth: 240, margin: '0 auto', lineHeight: 1.6 }}>
 Add weapons to your inventory or use the Add Attack button below
 </div>
 </div>
 ) : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
 {weapons.map(w => {
 const isInv = String(w.id).startsWith('inv_');
 const isSaveSpell = w.notes?.startsWith('save:');
 const saveInfo = isSaveSpell ? w.notes!.replace('save:', '') : null;
 // v2.326.0 — T4: only non-save-spell weapons with descriptive notes
 // get the click-to-expand affordance. Save spells already use `notes`
 // as a structured save spec ("save:DC X · YYY"), not as a description.
 const hasNotesPanel = !isSaveSpell && !!w.notes;
 const isExpanded = expandedWeaponId === w.id;

 return (
 <div key={w.id} style={{
 borderRadius: 'var(--r-md)',
 border: `1px solid ${isExpanded ? 'rgba(200,146,42,0.45)' : isInv ? 'rgba(200,146,42,0.2)' : 'var(--c-border)'}`,
 background: isInv ? 'rgba(200,146,42,0.03)' : '#080d14',
 overflow: 'hidden',
 transition: 'border-color 0.15s',
 }}>
 <div
 onClick={(e) => {
 // Only toggle when the click didn't originate on a button or
 // input — Hit / Damage / edit / delete clicks roll dice or
 // open modals and shouldn't double as expansion triggers.
 const t = e.target as HTMLElement;
 if (t.closest('button') || t.closest('input')) return;
 if (hasNotesPanel) setExpandedWeaponId(isExpanded ? null : w.id);
 }}
 style={{
 display: isSaveSpell ? 'flex' : 'grid',
 // v2.371.0 — Unified template, matches SpellsTab +
 // ClassAbilitiesSection. Empty cells in LEAD/BAR/TIME for
 // weapons (no level/school/casting-time analog) so columns
 // visually line up across all three tabs.
 gridTemplateColumns: isSaveSpell ? undefined : '70px 3px 1fr 46px 70px 36px 74px 80px 180px 110px 16px',
 alignItems: 'center',
 gap: isSaveSpell ? 10 : '0 8px',
 padding: '8px 12px',
 cursor: hasNotesPanel ? 'pointer' : 'default',
 }}>

 {isSaveSpell ? (
 /* Spell with saving throw — show DC badge, no roll */
 <>
 <div style={{ flexShrink: 0, width: 52, height: 36, borderRadius: 8, background: 'rgba(192,132,252,0.12)', border: '1px solid rgba(192,132,252,0.3)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
 <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 13, color: '#c084fc', lineHeight: 1 }}>{saveInfo}</span>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 7, color: 'rgba(192,132,252,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>SAVE</span>
 </div>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: '#c084fc', marginBottom: 2 }}>{w.name}</div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)' }}>DM calls the save</div>
 </div>
 <div style={{ textAlign: 'center', flexShrink: 0 }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--c-red-l)' }}>
 {w.damageDice === 'flat' ? modStr(w.damageBonus) : `${w.damageDice}${w.damageBonus !== 0 ? modStr(w.damageBonus) : ''}`}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--t-3)', letterSpacing: '0.06em' }}>ON FAIL</div>
 </div>
 </>
 ) : (
 /* Normal weapon — unified 9-col grid row (v2.371.0). */
 <>
 {/* Col 0: LEAD — empty for weapons (no level/prepare badge analog). */}
 <div />

 {/* Col 1: BAR — gold stripe matches inventory color. */}
 <div style={{ width: 3, height: 30, borderRadius: 2, background: 'rgba(200,146,42,0.6)' }} />

 {/* Col 2: NAME — weapon name + source/properties subline. */}
 <div style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{w.name}</span>
 {isInv && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '1px 5px', borderRadius: 999 }}>Inventory</span>}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', marginTop: 1 }}>
 {w.damageType ? w.damageType.charAt(0).toUpperCase() + w.damageType.slice(1) : ''}
 {w.properties ? ` · ${w.properties}` : ''}
 </div>
 </div>

 {/* Col 3: TIME — empty for weapons (action econ implicit). */}
 <div />

 {/* Col 4: RANGE */}
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', alignSelf: 'center', textAlign: 'center', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {w.range || 'Melee'}
 </div>

 {/* Col 5: TAGS — empty for weapons (no C/AoE concept). Reserved
     so row aligns with spell rows that DO have tag chips. */}
 <div />

 {/* v2.87.0: Unarmed Strike — single STRIKE button that opens the mode
     picker (Damage / Grapple / Shove). v2.371.0: spans HIT-DC + EFFECT
     cols (74 + 80 + gap = 162px). */}
 {w.unarmedModes ? (
 <button
 onClick={() => setUnarmedModal(w)}
 title="Unarmed Strike: pick Damage, Grapple, or Shove"
 style={{
 textAlign: 'center', padding: '5px 10px',
 borderRadius: 'var(--r-md)',
 border: '1px solid rgba(200,146,42,0.4)',
 background: 'linear-gradient(180deg, rgba(200,146,42,0.2), rgba(200,146,42,0.08))',
 cursor: 'pointer', transition: 'all var(--tr-fast)',
 minHeight: 0, alignSelf: 'center',
 gridColumn: 'span 2', // spans cols 5 (HIT-DC) + 6 (EFFECT)
 }}
 >
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 13, color: 'var(--c-gold-l)', lineHeight: 1 }}>
 STRIKE
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 7, color: 'rgba(200,146,42,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginTop: 2 }}>
 Damage · Grapple · Shove
 </div>
 </button>
 ) : (
 <>
 {/* Col 5: HIT-DC — to-hit modifier */}
 <button
 onClick={() => handleHit(w)}
 title={`Roll to hit: d20${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus}`}
 style={{
 textAlign: 'center', padding: '5px 4px',
 borderRadius: 'var(--r-md)',
 border: '1px solid rgba(200,146,42,0.3)',
 background: 'rgba(200,146,42,0.08)',
 cursor: 'pointer', transition: 'all var(--tr-fast)',
 minHeight: 0, alignSelf: 'center',
 }}
 >
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 16, color: 'var(--c-gold-l)', lineHeight: 1 }}>
 {modStr(w.attackBonus)}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 7, color: 'rgba(200,146,42,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
 TO HIT
 </div>
 </button>

 {/* Col 6: EFFECT — damage dice */}
 <button
 onClick={() => handleDamage(w)}
 title={`Roll damage: ${w.damageDice === 'flat' ? modStr(w.damageBonus) : w.damageDice}${w.damageDice !== 'flat' && w.damageBonus !== 0 ? modStr(w.damageBonus) : ''}`}
 style={{
 textAlign: 'center', padding: '5px 4px',
 borderRadius: 'var(--r-md)',
 border: '1px solid rgba(248,113,113,0.3)',
 background: 'rgba(248,113,113,0.08)',
 cursor: 'pointer', transition: 'all var(--tr-fast)',
 minHeight: 0, alignSelf: 'center',
 }}
 >
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 14, color: 'var(--c-red-l)', lineHeight: 1 }}>
 {w.damageDice === 'flat' ? modStr(w.damageBonus) : `${w.damageDice}${w.damageBonus !== 0 ? modStr(w.damageBonus) : ''}`}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 7, color: 'rgba(248,113,113,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
 DAMAGE
 </div>
 </button>
 </>
 )}

 {/* Col 7: BUTTONS — in-combat PlayerAttackButton + edit/delete.
     v2.100.0 PlayerAttackButton renders only when in an active
     encounter; out-of-combat rolls use the Hit/Damage buttons above. */}
 <div style={{ display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
 {historyCharacterId && (
 <PlayerAttackButton
 characterId={historyCharacterId}
 attackBonus={w.attackBonus ?? 0}
 damageDice={w.damageDice === 'flat' ? `1d0+${w.damageBonus ?? 0}` : `${w.damageDice}${w.damageBonus ? (w.damageBonus > 0 ? `+${w.damageBonus}` : String(w.damageBonus)) : ''}`}
 damageType={w.damageType || 'slashing'}
 attackName={w.name}
 source="weapon"
 compact
 />
 )}
 {!isInv && w.id !== 'unarmed' && (
 <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
 <button className="btn-ghost btn-sm" onClick={() => openEdit(w)} style={{ padding: '2px 6px', fontSize: 10 }}></button>
 <button className="btn-ghost btn-sm" onClick={() => removeWeapon(w.id)} style={{ padding: '2px 6px', fontSize: 10 }}></button>
 </div>
 )}
 </div>

 {/* Col 9: CHARGES — empty for weapons. Reserved for column
     alignment with class-ability rows that have tracker chiclets. */}
 <div />

 {/* Col 10: CHEVRON */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 {hasNotesPanel && (
 <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
 )}
 </div>
 </>
 )}
 </div>
 {/* v2.326.0 — T4: expanded notes panel. Magic-weapon descriptions
     ("Lucky Blade: +1 to hit, advantage on…", staff usage charges,
     etc.) live in `notes` and used to be truncated inline; now they
     get full lines with proper wrapping when the row is expanded. */}
 {isExpanded && hasNotesPanel && (
 <div style={{
 padding: '0 12px 10px 12px',
 fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
 lineHeight: 1.5,
 borderTop: '1px solid rgba(200,146,42,0.18)',
 paddingTop: 8,
 whiteSpace: 'pre-wrap' as const,
 }}>
 {w.notes}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}



 {/* Add/Edit form modal */}
 {showAdd && (
 <ModalPortal>
 <div className="modal-overlay" onClick={() => setShowAdd(false)}>
 <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
 <h3 style={{ marginBottom: 'var(--sp-4)' }}>{editId ? 'Edit Attack' : 'Add Custom Attack'}</h3>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
 <div>
 <label>Name *</label>
 <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Longsword, Firebolt, Shove…" autoFocus />
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
 <div>
 <label>Attack Bonus (d20 +)</label>
 <input type="number" value={form.attackBonus ?? 0} onChange={e => setForm(f => ({ ...f, attackBonus: parseInt(e.target.value) || 0 }))} />
 </div>
 <div>
 <label>Damage Dice</label>
 <select value={form.damageDice ?? '1d8'} onChange={e => setForm(f => ({ ...f, damageDice: e.target.value }))}>
 {DICE_OPTIONS.map(d => <option key={d} value={d}>{d === 'flat' ? 'Flat (no dice)' : d}</option>)}
 </select>
 </div>
 <div>
 <label>Damage Bonus</label>
 <input type="number" value={form.damageBonus ?? 0} onChange={e => setForm(f => ({ ...f, damageBonus: parseInt(e.target.value) || 0 }))} />
 </div>
 <div>
 <label>Damage Type</label>
 <select value={form.damageType ?? 'slashing'} onChange={e => setForm(f => ({ ...f, damageType: e.target.value }))}>
 {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
 </select>
 </div>
 </div>
 <div>
 <label>Range</label>
 <input value={form.range ?? 'Melee'} onChange={e => setForm(f => ({ ...f, range: e.target.value }))} placeholder="Melee or Ranged (80/320 ft.)" />
 </div>
 <div>
 <label>Properties (optional)</label>
 <input value={form.properties ?? ''} onChange={e => setForm(f => ({ ...f, properties: e.target.value }))} placeholder="Versatile, Finesse, Light…" />
 </div>
 <div>
 <label>Notes (optional) — start with "save:DC14 CON" to mark as spell save</label>
 <input value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="+1 magic, or save:DC14 CON" />
 </div>
 </div>
 <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-5)', justifyContent: 'flex-end' }}>
 <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
 <button className="btn-gold" onClick={saveWeapon} disabled={!form.name?.trim()}>
 {editId ? 'Save Changes' : 'Add Attack'}
 </button>
 </div>
 </div>
 </div>
 </ModalPortal>
 )}

 {/* v2.87.0: Unarmed Strike mode picker — Damage / Grapple / Shove (Push or Prone).
     Opens when the user clicks the STRIKE button on the synthesized Unarmed
     Strike row. Each option triggers a 3D dice roll + broadcasts to action_log
     so the DM sees what the player is attempting in real time. Damage uses
     the existing handleHit + handleDamage chain so it stays consistent with
     other melee attacks. Grapple and Shove use dedicated handlers that roll
     Athletics and broadcast contested-check context for DM adjudication. */}
 {unarmedModal && (
 <ModalPortal>
 <div className="modal-overlay" onClick={() => setUnarmedModal(null)}>
 <div
 className="modal"
 onClick={e => e.stopPropagation()}
 style={{
 // v2.174.0 — bumped 480→560 for comfortable line length now
 // that descriptions wrap (previously they overflowed in a
 // single nowrap line, so width didn't matter as much).
 maxWidth: 560, width: 'calc(100vw - 16px)',
 maxHeight: 'calc(100dvh - 32px)',
 display: 'flex', flexDirection: 'column' as const,
 padding: 20,
 }}
 >
 <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 4 }}>
 Unarmed Strike
 </div>
 <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--t-1)', lineHeight: 1.2 }}>
 Choose a mode
 </h3>
 <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
 2024 PHB: you can use one Unarmed Strike per attack action for Damage, Grapple, or Shove.
 </p>
 </div>

 <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 14 }}>
 {/* v2.174.0 — Phase Q.0 pt 15: each mode button was inheriting the
     global `button { display: flex; flex-direction: row }` style,
     which forced the label <div> and description <div> to render
     side-by-side instead of stacked. Combined with `white-space:
     nowrap` on children, this clipped the Grapple/Shove labels on
     the left and truncated descriptions on the right — the "small
     window with broken buttons" playtest report. Fix: explicitly
     override to column + allow description text to wrap. */}

 {/* Damage — the existing attack flow */}
 <button
 onClick={() => {
 handleHit(unarmedModal);
 // Slight delay so the two rolls don't visually collide on screen
 window.setTimeout(() => handleDamage(unarmedModal), 150);
 setUnarmedModal(null);
 }}
 style={{
 width: '100%', padding: '12px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
 textAlign: 'left' as const,
 border: '1px solid rgba(248,113,113,0.5)',
 background: 'rgba(248,113,113,0.1)',
 color: 'var(--c-red-l)',
 minHeight: 0,
 display: 'flex', flexDirection: 'column' as const, alignItems: 'stretch',
 }}
 >
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 15, marginBottom: 4, whiteSpace: 'normal' as const }}>
 Damage
 </div>
 <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-3)', whiteSpace: 'normal' as const, lineHeight: 1.5 }}>
 Roll to hit ({modStr(unarmedModal.attackBonus)}), then {modStr(unarmedModal.damageBonus)} bludgeoning on hit.
 </div>
 </button>

 {/* Grapple — contested Athletics */}
 <button
 onClick={() => handleGrapple(unarmedModal)}
 style={{
 width: '100%', padding: '12px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
 textAlign: 'left' as const,
 border: '1px solid rgba(96,165,250,0.5)',
 background: 'rgba(96,165,250,0.1)',
 color: '#60a5fa',
 minHeight: 0,
 display: 'flex', flexDirection: 'column' as const, alignItems: 'stretch',
 }}
 >
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 15, marginBottom: 4, whiteSpace: 'normal' as const }}>
 Grapple
 </div>
 <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-3)', whiteSpace: 'normal' as const, lineHeight: 1.5 }}>
 Athletics check ({modStr(unarmedModal.athleticsBonus ?? 0)}) vs target's Athletics or Acrobatics. On success: target is Grappled.
 </div>
 </button>

 {/* Shove — Push 5 ft */}
 <button
 onClick={() => handleShove(unarmedModal, 'push')}
 style={{
 width: '100%', padding: '12px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
 textAlign: 'left' as const,
 border: '1px solid rgba(167,139,250,0.5)',
 background: 'rgba(167,139,250,0.1)',
 color: '#a78bfa',
 minHeight: 0,
 display: 'flex', flexDirection: 'column' as const, alignItems: 'stretch',
 }}
 >
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 15, marginBottom: 4, whiteSpace: 'normal' as const }}>
 Shove — Push 5 ft
 </div>
 <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-3)', whiteSpace: 'normal' as const, lineHeight: 1.5 }}>
 Athletics check ({modStr(unarmedModal.athleticsBonus ?? 0)}) vs target's Athletics or Acrobatics. On success: push target 5 feet.
 </div>
 </button>

 {/* Shove — Knock Prone */}
 <button
 onClick={() => handleShove(unarmedModal, 'prone')}
 style={{
 width: '100%', padding: '12px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
 textAlign: 'left' as const,
 border: '1px solid rgba(167,139,250,0.5)',
 background: 'rgba(167,139,250,0.1)',
 color: '#a78bfa',
 minHeight: 0,
 display: 'flex', flexDirection: 'column' as const, alignItems: 'stretch',
 }}
 >
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 15, marginBottom: 4, whiteSpace: 'normal' as const }}>
 Shove — Knock Prone
 </div>
 <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-3)', whiteSpace: 'normal' as const, lineHeight: 1.5 }}>
 Athletics check ({modStr(unarmedModal.athleticsBonus ?? 0)}) vs target's Athletics or Acrobatics. On success: target has the Prone condition.
 </div>
 </button>
 </div>

 <button
 className="btn-secondary"
 onClick={() => setUnarmedModal(null)}
 style={{ width: '100%', justifyContent: 'center', fontWeight: 600, minHeight: 0 }}
 >
 Cancel
 </button>
 </div>
 </div>
 </ModalPortal>
 )}
 </div>
 );
}
