import {unarmedSaveRequest,type UnarmedSaveMode} from '../../rules/unarmedStrike';
import {explicitAttackMode} from '../../rules/attackMode';
import { useId, useState } from 'react';
import {parseWeaponAbilityModifier} from '../../rules/weaponAbility';
import { v4 as uuidv4 } from 'uuid';
import type { WeaponItem } from '../../types';
import { rollDie, computeActiveBonuses } from '../../lib/gameUtils';
import { weaponMaxRangeFt, weaponNormalRangeFt } from '../../lib/rangeParse';
import { CONDITION_MAP } from '../../data/conditions';
import { useDiceRoll } from '../../context/DiceRollContext';
import { logAction } from '../shared/ActionLog';
import PlayerAttackButton from '../Combat/PlayerAttackButton';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../shared/ModalPortal';

interface WeaponsTrackerProps {
 weapons: WeaponItem[];
 attacksPerAction: number;
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
 return Math.max(0, dmg);
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
 activeConditions = [], activeBufss = [], attacksPerAction,
}: WeaponsTrackerProps) {
 const formId=useId();
 const [abilityInput,setAbilityInput]=useState('');
 const parsedAbility=parseWeaponAbilityModifier(abilityInput);
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
 const [unarmedAttackRolled,setUnarmedAttackRolled]=useState(false);
 const [unarmedError,setUnarmedError]=useState('');
 const [unarmedBusy,setUnarmedBusy]=useState(false);
 const [unarmedNotice,setUnarmedNotice]=useState('');
 // v2.326.0 — T4: weapon row expansion. Magic weapons (Lucky Blade,
 // staves, etc.) often have a description in `notes` that doesn't fit on
 // the row. Click anywhere outside the Hit/Damage/edit buttons to expand
 // the row and show the full notes panel below.
 const [expandedWeaponId, setExpandedWeaponId] = useState<string | null>(null);
 const [form, setForm] = useState<Partial<WeaponItem>>({
 name: '', attackBonus: 0, damageDice: '1d8', damageBonus: 0,
 damageType: 'slashing', range: 'Melee', properties: '', notes: '',
 });

 // v2.869: tabletop declaration only. The target rolls its own chosen save;
 // this control must never fabricate an attacker Athletics roll or success.
 async function requestUnarmedSave(weapon:WeaponItem,mode:UnarmedSaveMode){
  if(unarmedBusy)return;setUnarmedBusy(true);setUnarmedError('');
  try{
   const request=unarmedSaveRequest(mode,weapon.unarmedSaveDC??NaN);
   if(historyCharacterId){
    const result=await logAction({campaignId:campaignId??null,characterId:historyCharacterId,
     characterName:characterName??'',actionType:'standard-action',actionName:`${request.name} (Unarmed Strike) — save requested`,notes:request.notes});
    if(result?.error)throw new Error('The save request could not be logged. Check the action log before trying again.');
   }
   setUnarmedNotice(request.notes);setUnarmedModal(null);
  }catch(error){setUnarmedError(error instanceof Error?error.message:'The save request could not be recorded.');}
  finally{setUnarmedBusy(false);}
 }

 function openAdd() {
 setForm({name:'',attackBonus:0,damageDice:'1d8',damageBonus:0,damageType:'slashing',range:'Melee',properties:'',notes:''});
 setAbilityInput('');setEditId(null);setShowAdd(true);
 }

 function openEdit(w: WeaponItem) {
 setForm({ ...w });
 setAbilityInput(w.attackAbilityModifier==null?'':String(w.attackAbilityModifier));
 setEditId(w.id);
 setShowAdd(true);
 }

 function saveWeapon() {
 if (!form.name?.trim()||!parsedAbility.valid) return;
 const weapon: WeaponItem = {
 id: editId ?? uuidv4(),
 name: form.name!.trim(),
 attackBonus: form.attackBonus ?? 0,
 ...(parsedAbility.value===undefined?{}:{attackAbilityModifier:parsedAbility.value}),
 damageDice: form.damageDice ?? '1d8',
 damageBonus: form.damageBonus ?? 0,
 damageType: form.damageType ?? 'slashing',
 range: form.range ?? 'Melee',
 properties: form.properties ?? '',
 notes: form.notes ?? '',
 };
 if (editId) {
 onUpdate(customWeapons.map(w => w.id === editId ? weapon : w));
 } else {
 onUpdate([...customWeapons, weapon]);
 }
 setShowAdd(false);
 setEditId(null);
 }

 function removeWeapon(id: string) {
 onUpdate(customWeapons.filter(w => w.id !== id));
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
 damage: !weapon.unarmedModes && prev?.weaponName === weapon.name ? prev.damage : 0,
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
 // v2.869 — critical hits add dice, never an invented point to flat damage.
 const critExtra = isCrit && weapon.damageDice !== 'flat' ? parseDamage(weapon.damageDice, 0) : 0;
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

 // v2.869: generated inventory, species and unarmed rows are rebuilt from
 // their source. Never copy them into the manually saved weapon list.
 const customWeapons = weapons.filter(w => !String(w.id).startsWith('inv_')&&!String(w.id).startsWith('nat_')&&w.id!=='unarmed');

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
 <span title="Attacks when taking the Attack action on your turn. Bonus attacks, reactions and temporary effects are separate." style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>
 Attacks per Action: {attacksPerAction}
 </span>
 </div>
 {/* Table column headers — v2.371.0 unified 9-col template
     matches SpellsTab + ClassAbilitiesSection. Weapons don't have
     level/school/casting-time analogs, so LEAD/BAR/TIME render
     empty here. */}
 {weapons.length > 0 && (
 <div className="srow-grid srow-head" style={{ padding: '0 10px 4px', marginBottom: 2 }}>
 {/* v2.546.0: Headers mirror SpellsTab so weapons + spells line up visually across both tabs. */}
 {['', '', 'NAME', 'TIME', 'RANGE', '', 'HIT', 'DAMAGE', '', '', ''].map((h, i) => (
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
 borderRadius: 8,
 // v2.374.0 — match SpellsTab + ClassAbilities wrapper aesthetic.
 // Non-inventory weapons now use var(--c-card) (raised) instead of
 // #080d14 (darker). Inventory weapons keep their gold tint as a
 // semantic cue ("this weapon comes from your bag, not your
 // attack list"). Border normalizes to neutral var(--c-border)
 // when collapsed; gold tint shows on expand or when the row is
 // an inventory item.
 border: `1px solid ${isExpanded ? 'rgba(200,146,42,0.45)' : isInv ? 'rgba(200,146,42,0.2)' : 'var(--c-border)'}`,
 background: isInv ? 'rgba(200,146,42,0.03)' : 'var(--c-card)',
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
 // v2.371.0 — Unified template, matches SpellsTab +
 // ClassAbilitiesSection. Empty cells in LEAD/BAR/TIME for
 // weapons (no level/school/casting-time analog) so columns
 // visually line up across all three tabs. v2.675.0 — that
 // template is `.srow-grid` in globals.css now (one copy for all
 // four surfaces, wrapping to a flex stack under 640px). The
 // save-spell branch was never on the template — it is its own
 // flex row and stays one.
 className={isSaveSpell ? undefined : 'srow-grid'}
 style={{
 display: isSaveSpell ? 'flex' : undefined,
 alignItems: isSaveSpell ? 'center' : undefined,
 gap: isSaveSpell ? 10 : undefined,
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
 <div className="srow-lead" />

 {/* Col 1: BAR — gold stripe matches inventory color. */}
 <div className="srow-bar" style={{ background: 'rgba(200,146,42,0.6)' }} />

 {/* Col 2: NAME — weapon name + source/properties subline. */}
 <div className="srow-name" style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{w.name}</span>
 {isInv && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '1px 5px', borderRadius: 999 }}>Inventory</span>}
 </div>
 {/* v2.592.0 — clamp subline: on narrow widths the name/type text
     spilled out of the 1fr NAME track into the TIME column
     ("Unarmed Strike / Bludgeoning" overlapping "1A"). */}
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
 {w.damageType ? w.damageType.charAt(0).toUpperCase() + w.damageType.slice(1) : ''}
 {w.properties ? ` · ${w.properties}` : ''}
 </div>
 </div>

 {/* Col 3: TIME — v2.546.0: was empty; weapons are always 1 Action,
     so render "1A" matching spell row's casting-time abbreviation. */}
 <div className="srow-time" style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const }}>1A</div>

 {/* Col 4: RANGE */}
 <div className="srow-range" style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', alignSelf: 'center', textAlign: 'center', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {w.range || 'Melee'}
 </div>

 {/* Col 5: TAGS — empty for weapons (no C/AoE concept). Reserved
     so row aligns with spell rows that DO have tag chips. */}
 <div className="srow-tags" />

 {/* v2.87.0: Unarmed Strike — single STRIKE button that opens the mode
     picker (Damage / Grapple / Shove). v2.371.0: spans HIT-DC + EFFECT
     cols (74 + 80 + gap = 162px). v2.546.0: collapsed to a single-word
     "STRIKE" label per user request; mode options live in the picker
     modal that opens on click, not crammed into the button label. */}
 {w.unarmedModes ? (
 <button
 className="srow-hit"
 onClick={() => {setUnarmedError('');setUnarmedNotice('');setUnarmedAttackRolled(false);setUnarmedModal(w);}}
 title="Unarmed Strike — pick Damage, Grapple, or Shove"
 style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 13,
 color: 'var(--c-gold-l)', letterSpacing: '0.04em',
 padding: '4px 10px',
 borderRadius: 999,
 border: '1px solid rgba(200,146,42,0.4)',
 background: 'rgba(200,146,42,0.12)',
 cursor: 'pointer', transition: 'all var(--tr-fast)',
 minHeight: 0, alignSelf: 'center', justifySelf: 'center',
 gridColumn: 'span 2', // spans cols 6 (HIT) + 7 (DAMAGE)
 }}
 >
 STRIKE
 </button>
 ) : (
 <>
 {/* Col 6: HIT — to-hit modifier. v2.546.0: stripped "TO HIT"
     subtitle so the chip shows just "+5" matching SpellsTab's
     HIT / DC pill. Stays a button so a tap rolls the attack;
     the column header above labels it. */}
 <button
 className="srow-hit"
 onClick={() => handleHit(w)}
 title={`Roll to hit (d20${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus})`}
 style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 12,
 color: '#fbbf24',
 background: 'rgba(251,191,36,0.1)',
 border: '1px solid rgba(251,191,36,0.3)',
 borderRadius: 999, padding: '2px 8px',
 cursor: 'pointer', transition: 'all var(--tr-fast)',
 minHeight: 0, alignSelf: 'center', justifySelf: 'center',
 }}
 >
 {modStr(w.attackBonus)}
 </button>

 {/* Col 7: DAMAGE — damage dice. v2.546.0: stripped "DAMAGE"
     subtitle so the chip shows just "1d6+1" matching SpellsTab's
     EFFECT chip. Column header above labels it. */}
 <button
 className="srow-effect"
 onClick={() => handleDamage(w)}
 title={`Roll damage (${w.damageDice === 'flat' ? modStr(w.damageBonus) : w.damageDice}${w.damageDice !== 'flat' && w.damageBonus !== 0 ? modStr(w.damageBonus) : ''})`}
 style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 12,
 color: 'var(--c-red-l)',
 background: 'rgba(248,113,113,0.1)',
 border: '1px solid rgba(248,113,113,0.3)',
 borderRadius: 999, padding: '2px 8px',
 cursor: 'pointer', transition: 'all var(--tr-fast)',
 minHeight: 0, alignSelf: 'center', justifySelf: 'center',
 }}
 >
 {w.damageDice === 'flat' ? modStr(w.damageBonus) : `${w.damageDice}${w.damageBonus !== 0 ? modStr(w.damageBonus) : ''}`}
 </button>
 </>
 )}

 {/* Col 7: BUTTONS — in-combat PlayerAttackButton + edit/delete.
     v2.100.0 PlayerAttackButton renders only when in an active
     encounter; out-of-combat rolls use the Hit/Damage buttons above. */}
 <div className="srow-act" style={{ display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
 {historyCharacterId && (
 <PlayerAttackButton
 characterId={historyCharacterId}
 maxRangeFt={weaponMaxRangeFt(w.range, w.properties)}
 normalRangeFt={weaponNormalRangeFt(w.range, w.properties)}
 attackBonus={w.attackBonus ?? 0}
 attackAbilityModifier={w.attackAbilityModifier}
 damageDice={w.damageDice === 'flat' ? String(w.damageBonus ?? 0) : `${w.damageDice}${w.damageBonus ? (w.damageBonus > 0 ? `+${w.damageBonus}` : String(w.damageBonus)) : ''}`}
 damageType={w.damageType || 'slashing'}
 attackName={w.name}
 source={w.id==='unarmed'?'ability':'weapon'} attackMode={explicitAttackMode(w.range)}
 compact
 />
 )}
 {!isInv && !String(w.id).startsWith('nat_') && w.id !== 'unarmed' && (
 <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
 <button className="btn-ghost btn-sm" aria-label={`Edit ${w.name}`} onClick={() => openEdit(w)} style={{ padding: '2px 6px', fontSize: 10 }}>Edit</button>
 <button className="btn-ghost btn-sm" aria-label={`Remove ${w.name}`} onClick={() => removeWeapon(w.id)} style={{ padding: '2px 6px', fontSize: 10 }}>×</button>
 </div>
 )}
 </div>

 {/* Col 9: CHARGES — empty for weapons. Reserved for column
     alignment with class-ability rows that have tracker chiclets. */}
 <div className="srow-charges" />

 {/* Col 10: CHEVRON */}
 <div className="srow-chev" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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



 <button className="btn-secondary" onClick={openAdd} style={{alignSelf:'flex-start'}}>Add Custom Attack</button>

 {/* Add/Edit form modal */}
 {showAdd && (
 <ModalPortal>
 <div className="modal-overlay" onClick={() => setShowAdd(false)}>
 <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} style={{ maxWidth: 460, padding:16 }} onClick={e => e.stopPropagation()}>
 <h3 id={`${formId}-title`} style={{ margin: '0 0 12px' }}>{editId ? 'Edit Attack' : 'Add Custom Attack'}</h3>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
 <div>
 <label htmlFor={`${formId}-name`}>Name *</label>
 <input id={`${formId}-name`} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Longsword, Firebolt, Shove…" autoFocus />
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
 <div>
 <label htmlFor={`${formId}-attackBonus`}>Attack Bonus (d20 +)</label>
 <input id={`${formId}-attackBonus`} type="number" value={form.attackBonus ?? 0} onChange={e => setForm(f => ({ ...f, attackBonus: parseInt(e.target.value) || 0 }))} />
 </div>
 <div>
 <label htmlFor={`${formId}-damageDice`}>Damage Dice</label>
 <select id={`${formId}-damageDice`} value={form.damageDice ?? '1d8'} onChange={e => setForm(f => ({ ...f, damageDice: e.target.value }))}>
 {DICE_OPTIONS.map(d => <option key={d} value={d}>{d === 'flat' ? 'Flat (no dice)' : d}</option>)}
 </select>
 </div>
 <div>
 <label htmlFor={`${formId}-damageBonus`}>Damage Bonus</label>
 <input id={`${formId}-damageBonus`} type="number" value={form.damageBonus ?? 0} onChange={e => setForm(f => ({ ...f, damageBonus: parseInt(e.target.value) || 0 }))} />
 </div>
 <div>
 <label htmlFor={`${formId}-damageType`}>Damage Type</label>
 <select id={`${formId}-damageType`} value={form.damageType ?? 'slashing'} onChange={e => setForm(f => ({ ...f, damageType: e.target.value }))}>
 {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
 </select>
 </div>
 </div>
 <div>
 <label htmlFor={`${formId}-ability`}>Attack ability modifier (optional)</label>
 <input id={`${formId}-ability`} type="number" step="1" value={abilityInput} onChange={e=>setAbilityInput(e.target.value)} placeholder="e.g. 4" aria-describedby={`${formId}-ability-help`} aria-invalid={!parsedAbility.valid}/>
 <div id={`${formId}-ability-help`} style={{fontSize:11,color:'var(--t-2)',marginTop:4}}>For Graze and mastery effects. Enter only the chosen ability modifier, excluding proficiency and magic bonuses. Leave blank if unsure.</div>
 {!parsedAbility.valid&&<div role="alert">Enter a whole-number modifier or leave it blank.</div>}
 </div>
 <div>
 <label htmlFor={`${formId}-range`}>Range</label>
 <input id={`${formId}-range`} value={form.range ?? 'Melee'} onChange={e => setForm(f => ({ ...f, range: e.target.value }))} placeholder="Melee or Ranged (80/320 ft.)" />
 </div>
 <div>
 <label htmlFor={`${formId}-properties`}>Properties (optional)</label>
 <input id={`${formId}-properties`} value={form.properties ?? ''} onChange={e => setForm(f => ({ ...f, properties: e.target.value }))} placeholder="Versatile, Finesse, Light…" />
 </div>
 <div>
 <label htmlFor={`${formId}-notes`}>Notes (optional) — start with "save:DC14 CON" to mark as spell save</label>
 <input id={`${formId}-notes`} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="+1 magic, or save:DC14 CON" />
 </div>
 </div>
 <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
 <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
 <button className="btn-gold" onClick={saveWeapon} disabled={!form.name?.trim()||!parsedAbility.valid}>
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
 {unarmedNotice&&<p role="status" style={{fontSize:12,whiteSpace:'normal'}}>{unarmedNotice}</p>}
 {unarmedModal && (
 <ModalPortal>
 <div className="modal-overlay" onClick={() => setUnarmedModal(null)}>
 <div
 className="modal" role="dialog" aria-modal="true" aria-label="Unarmed Strike"
 onClick={e => e.stopPropagation()}
 style={{
 // v2.174.0 — bumped 480→560 for comfortable line length now
 // that descriptions wrap (previously they overflowed in a
 // single nowrap line, so width didn't matter as much).
 maxWidth: 560, width: 'calc(100vw - 16px)',
 maxHeight: 'calc(100dvh - 32px)', overflowY:'auto',
 display: 'block',
 padding: 20,
 }}
 >
 <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 4 }}>
 Unarmed Strike
 </div>
 {unarmedError&&<p role="alert">{unarmedError}</p>}
 <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--t-1)', lineHeight: 1.2 }}>
 Choose a mode
 </h3>
 <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--t-2)', lineHeight: 1.5 }}>
 Each Unarmed Strike can deal damage, grapple, or shove. Targets must be within 5 ft and at most one size larger for grapple/shove.
 </p>
 <p style={{margin:'6px 0 0',fontSize:11,color:'var(--t-2)',lineHeight:1.5}}>
 Grapple/shove buttons request a save only. Resolve the target’s save, attack spending and effects with your DM. The base DC uses Strength; apply feature changes, such as eligible Monk Dexterity, at the table.
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
 if(!unarmedAttackRolled){
   setUnarmedAttackRolled(true);
   void handleHit(unarmedModal).catch(()=>setUnarmedError('The attack roll could not be logged. Keep the displayed roll; check history before continuing.'));
 }else{
   if(lastRoll?.nat!==1)void handleDamage(unarmedModal);
   setUnarmedModal(null);
 }
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
 {unarmedAttackRolled?(lastRoll?.nat===1?'Miss — close':'Confirm hit — show damage'):'Damage'}
 </div>
 <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-2)', whiteSpace: 'normal' as const, lineHeight: 1.5 }}>
 {unarmedAttackRolled?`Attack total: ${lastRoll?.hit}. ${lastRoll?.nat===1?'Natural 1: no damage.':lastRoll?.nat===20?'Natural 20: critical hit. Confirm to show damage.':'Confirm the hit with your DM before showing damage.'} No HP is changed here.`:`Roll to hit (${modStr(unarmedModal.attackBonus)}), then confirm the hit before showing bludgeoning damage.`}
 </div>
 </button>

 {/* Grapple — target chooses Strength or Dexterity save */}
 <button
 disabled={unarmedBusy||unarmedAttackRolled||unarmedModal.unarmedSaveDC==null} onClick={() => void requestUnarmedSave(unarmedModal,'grapple')}
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
 <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-2)', whiteSpace: 'normal' as const, lineHeight: 1.5 }}>
 Target chooses STR or DEX save, base DC {unarmedModal.unarmedSaveDC??'—'}. Failure: Grappled. Requires a free hand.
 </div>
 </button>

 {/* Shove — Push 5 ft */}
 <button
 disabled={unarmedBusy||unarmedAttackRolled||unarmedModal.unarmedSaveDC==null} onClick={() => void requestUnarmedSave(unarmedModal,'push')}
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
 <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-2)', whiteSpace: 'normal' as const, lineHeight: 1.5 }}>
 Target chooses STR or DEX save, base DC {unarmedModal.unarmedSaveDC??'—'}. Failure: push it 5 feet away from you.
 </div>
 </button>

 {/* Shove — Knock Prone */}
 <button
 disabled={unarmedBusy||unarmedAttackRolled||unarmedModal.unarmedSaveDC==null} onClick={() => void requestUnarmedSave(unarmedModal,'prone')}
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
 <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-2)', whiteSpace: 'normal' as const, lineHeight: 1.5 }}>
 Target chooses STR or DEX save, base DC {unarmedModal.unarmedSaveDC??'—'}. Failure: Prone.
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
