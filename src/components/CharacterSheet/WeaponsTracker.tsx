import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { WeaponItem } from '../../types';
import { rollDie, computeActiveBonuses } from '../../lib/gameUtils';
import { CONDITION_MAP } from '../../data/conditions';
import { useDiceRoll } from '../../context/DiceRollContext';
import { logAction } from '../shared/ActionLog';
import { supabase } from '../../lib/supabase';

interface WeaponsTrackerProps {
 weapons: WeaponItem[];
 onUpdate: (weapons: WeaponItem[]) => void;
 characterId?: string;
 characterName?: string;
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
 weapons, onUpdate, characterId, characterName, campaignId,
 activeConditions = [], activeBufss = [],
}: WeaponsTrackerProps) {
 const [showAdd, setShowAdd] = useState(false);
 const [editId, setEditId] = useState<string | null>(null);
 const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
 const { triggerRoll } = useDiceRoll();
 const [form, setForm] = useState<Partial<WeaponItem>>({
 name: '', attackBonus: 0, damageDice: '1d8', damageBonus: 0,
 damageType: 'slashing', range: 'Melee', properties: '', notes: '',
 });

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

 triggerRoll({ result: nat, dieType: 20, modifier: weapon.attackBonus, total: hit, label: `${weapon.name} — d20${weapon.attackBonus >= 0 ? '+' : ''}${weapon.attackBonus}` });

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
 triggerRoll({ result: 0, dieType: dmgDieType, modifier: weapon.damageBonus, total: damage, label: `${weapon.name} — ${weapon.damageDice} damage` });

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

 // Separate non-inventory weapons (can be edited/deleted)
 const customWeapons = weapons.filter(w => !String(w.id).startsWith('inv_'));
 const inventoryWeapons = weapons.filter(w => String(w.id).startsWith('inv_'));

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

 {/* v2.35.0: removed the "last roll" banner — 3D dice roller and the action log
 already surface attack results; the banner was a duplicate that sat above the
 attack rows and shifted layout on every roll. */}

 {/* Weapon rows */}
 {/* ACTIONS section header — DDB style */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-border)', paddingBottom: 6 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>
 ATTACKS
 </span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)' }}>
 Attacks per Action: 1
 </span>
 </div>
 {/* Table column headers */}
 {weapons.length > 0 && (
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 64px 100px auto', gap: '0 10px', padding: '0 4px', marginBottom: -2 }}>
 {['ATTACK', 'RANGE', 'HIT / DC', 'DAMAGE', ''].map(h => (
 <span key={h} style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>{h}</span>
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

 return (
 <div key={w.id} style={{
 display: isSaveSpell ? 'flex' : 'grid',
 gridTemplateColumns: isSaveSpell ? undefined : '1fr 70px 64px 100px auto',
 alignItems: 'center',
 gap: isSaveSpell ? 10 : '0 10px',
 padding: '8px 12px',
 borderRadius: 'var(--r-md)',
 border: `1px solid ${isInv ? 'rgba(200,146,42,0.2)' : 'var(--c-border)'}`,
 background: isInv ? 'rgba(200,146,42,0.03)' : '#080d14',
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
 /* Normal weapon — DDB-style grid row */
 <>
 {/* ATTACK name + source */}
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

 {/* RANGE */}
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', alignSelf: 'center' }}>
 {w.range || 'Melee'}
 </div>

 {/* HIT BUTTON */}
 <button
 onClick={() => handleHit(w)}
 title={`Roll to hit: d20${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus}`}
 style={{
 textAlign: 'center', padding: '5px 8px',
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

 {/* DMG BUTTON */}
 <button
 onClick={() => handleDamage(w)}
 title={`Roll damage: ${w.damageDice === 'flat' ? modStr(w.damageBonus) : w.damageDice}${w.damageDice !== 'flat' && w.damageBonus !== 0 ? modStr(w.damageBonus) : ''}`}
 style={{
 textAlign: 'center', padding: '5px 8px',
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

 {/* NOTES + edit/delete */}
 <div style={{ display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'center', minWidth: 0 }}>
 {w.notes && !w.notes.startsWith('save:') && (
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{w.notes}</span>
 )}
 {!isInv && w.id !== 'unarmed' && (
 <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 'auto' }}>
 <button className="btn-ghost btn-sm" onClick={() => openEdit(w)} style={{ padding: '2px 6px', fontSize: 10 }}></button>
 <button className="btn-ghost btn-sm" onClick={() => removeWeapon(w.id)} style={{ padding: '2px 6px', fontSize: 10 }}></button>
 </div>
 )}
 </div>
 </>
 )}
 </div>
 );
 })}
 </div>
 )}



 {/* Add/Edit form modal */}
 {showAdd && (
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
 )}
 </div>
 );
}
