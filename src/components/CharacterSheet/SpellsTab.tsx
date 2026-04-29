import { useState, useMemo, type ReactNode } from 'react';
import type { Character, ComputedStats, SpellData } from '../../types';
import SpellCastButton from './SpellCastButton';
import SpellPickerDropdown from '../shared/SpellPickerDropdown';
import { SPELLS } from '../../data/spells';
import { getMaxSpellsKnown, isKnownCaster } from '../../data/spellSlots';
import { parseSpellMechanics, canUpcastSpell } from '../../lib/spellParser';
import { getGrantedSpellIds, type GrantedSpellEntry } from '../../lib/grantedSpells';
import { getSpellCounts, getMaxPrepared, getMaxCantrips, getSpellAbilityMod } from '../../lib/spellLimits';
import LevelTab from './_shared/LevelTab';

interface SpellsTabProps {
 character: Character;
 computed: ComputedStats;
 knownSpellData: SpellData[];
 availableSpells: SpellData[];
 maxSpellLevel: number;
 concentrationSpellId: string | null;
 hasSpellSlots: boolean;
 onUpdateSlots: (slots: Character['spell_slots']) => void;
 onAddSpell: (id: string) => void;
 onRemoveSpell: (id: string) => void;
 onTogglePrepared: (id: string) => void;
 onConcentrate: (id: string) => void;
 userId: string;
 campaignId: string | null;
}

const SAVE_COLORS: Record<string, string> = {
 STR: '#f97316', DEX: '#84cc16', CON: '#ef4444',
 INT: '#3b82f6', WIS: '#22c55e', CHA: '#a855f7',
};

const SCHOOL_COLORS: Record<string, string> = {
 Abjuration: '#60a5fa', Conjuration: '#34d399', Divination: '#fbbf24',
 Enchantment: '#f472b6', Evocation: '#f87171', Illusion: '#a78bfa',
 Necromancy: '#94a3b8', Transmutation: '#fb923c',
};

const LEVEL_LABELS: Record<number, string> = {
 0: 'Cantrips', 1: '1st', 2: '2nd', 3: '3rd',
 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th',
};

// Preparers: choose spells to prepare each day from their full class list
const PREPARER_CLASSES = ['Cleric', 'Druid', 'Paladin', 'Wizard', 'Artificer', 'Psion'];
// Known casters: permanently learn a fixed number of spells (Bard, Sorcerer, Warlock, Ranger)

/** Derive a DDB-style effect category from spell mechanics + description */
function getEffectCategory(spell: SpellData): { label: string; color: string } {
 const m = parseSpellMechanics(spell.description, {
 save_type: (spell as any).save_type,
 attack_type: (spell as any).attack_type,
 damage_dice: (spell as any).damage_dice,
 damage_type: (spell as any).damage_type,
 heal_dice: (spell as any).heal_dice,
 });
 const d = spell.description.toLowerCase();
 if (m.healDice) return { label: 'Healing', color: '#34d399' };
 if (d.includes('teleport') || d.includes('misty step')) return { label: 'Teleportation', color: '#60a5fa' };
 if (d.includes('invisible') || d.includes('invisibility')) return { label: 'Invisible', color: '#a78bfa' };
 if (d.includes('charm') || d.includes('frightened') || d.includes('incapacitated') || d.includes('paralyzed') || d.includes('stunned')) return { label: 'Debuff', color: '#f472b6' };
 if (d.includes('difficult terrain') || d.includes('restrained') || d.includes('no reaction') || d.includes('grappled') || d.includes('prone')) return { label: 'Control', color: '#fbbf24' };
 if (d.includes('advantage') || d.includes('bonus to attack') || d.includes('temp hp')) return { label: 'Buff', color: '#4ade80' };
 if (d.includes('movement') || d.includes('fly speed') || d.includes('swim speed')) return { label: 'Movement', color: '#22d3ee' };
 if (m.damageDice) return { label: 'Damage', color: '#f87171' };
 if (m.saveType) return { label: 'Save', color: '#fb923c' };
 return { label: 'Utility', color: '#94a3b8' };
}

export default function SpellsTab({
 character, computed, knownSpellData, availableSpells, maxSpellLevel,
 concentrationSpellId, hasSpellSlots, onUpdateSlots, onAddSpell,
 onRemoveSpell, onTogglePrepared, onConcentrate, userId, campaignId,
}: SpellsTabProps) {
 const [activeLevel, setActiveLevel] = useState<number | 'all'>('all');
 const [expandedSpell, setExpandedSpell] = useState<string | null>(null);
 const [filterPrepared, setFilterPrepared] = useState(false);
 const [filterSchool, setFilterSchool] = useState<string | null>(null);
 // v2.63.0: removed showUpcasts state — variant rows replaced by per-spell
 // upcast trigger button that opens the slot picker modal.
 const showUpcasts = false;

 const isPreparer = PREPARER_CLASSES.includes(character.class_name);
 const isKnown = isKnownCaster(character.class_name);
 const knownMax = getMaxSpellsKnown(character.class_name, character.level);

 // Spell ability modifier + caps — all from canonical source (src/lib/spellLimits.ts)
 const spellAbilityMod = getSpellAbilityMod(character);
 const prepareMax = getMaxPrepared(character);
 const cantripMax = getMaxCantrips(character.class_name, character.level);

 // Current cantrip count (exclude auto-granted Mage Hand for Psion)
 const classCantrips = useMemo(() =>
 SPELLS.filter(s => s.classes.includes(character.class_name) && s.level === 0),
 [character.class_name]
 );
 // Granted spells that don't count toward limits
 // v2.322.0 (T1 fix): added character.level to deps. getSubclassSpellIds
 // gates spells by character level (L3 spells unlock at lvl 5, L4 at 7,
 // L5 at 9, etc.), so the granted list MUST recompute on level-up.
 // Pre-fix this could leave a freshly-leveled character with stale
 // grants (e.g. Psi Warper hitting lvl 5 wouldn't auto-prep Blink/Haste).
 const { grantedCantrips, grantedPrepared, entries: grantedEntries } = useMemo(
 () => getGrantedSpellIds(character),
 [character.class_name, character.subclass, character.level] // eslint-disable-line react-hooks/exhaustive-deps
 );
 // Map id -> reason for badge display
 const grantedReasonMap = useMemo(() => {
 const map: Record<string, string> = {};
 grantedEntries.forEach((e: GrantedSpellEntry) => { map[e.id] = e.reason; });
 return map;
 }, [grantedEntries]);

 const currentCantripCount = useMemo(() => {
 let count = character.known_spells.filter(id =>
 classCantrips.find(s => s.id === id) && !grantedCantrips.includes(id)
 ).length;
 return Math.max(0, count);
 }, [character.known_spells, classCantrips, grantedCantrips]);

 // Slots per level for limit display in picker
 const slotsPerLevel = useMemo(() => {
 const map: Record<number, number> = {};
 Object.entries(character.spell_slots).forEach(([k, v]) => {
 const lvl = parseInt(k);
 if (!isNaN(lvl) && (v as any)?.total) map[lvl] = (v as any).total;
 });
 return map;
 }, [character.spell_slots]);

 const slotInfo = useMemo(() => {
 const info: Record<number, { max: number; remaining: number }> = {};
 if (character.spell_slots) {
 Object.entries(character.spell_slots).forEach(([k, v]) => {
 const lvl = parseInt(k.replace('level_', ''));
 const slot = v as { total: number; used: number };
 if (!isNaN(lvl) && slot?.total) {
 info[lvl] = { max: slot.total, remaining: slot.total - (slot.used ?? 0) };
 }
 });
 }
 return info;
 }, [character.spell_slots]);

 // Levels the character actually has spells for
 const knownLevels = useMemo(() => {
 const levels = new Set(knownSpellData.map(s => s.level));
 return Array.from(levels).sort((a, b) => a - b);
 }, [knownSpellData]);

 // Filtered known spells for active level
 const visibleSpells = useMemo(() => {
 return knownSpellData.filter(s => {
 if (activeLevel !== 'all' && s.level !== activeLevel) return false;
 if (filterPrepared && isPreparer && !isKnown && s.level > 0 && !character.prepared_spells.includes(s.id)) return false;
 if (filterSchool && s.school !== filterSchool) return false;
 return true;
 });
 }, [knownSpellData, activeLevel, filterPrepared, filterSchool, character.prepared_spells, isPreparer]);

 // Group visible spells by level. When showUpcasts is on, each leveled spell
 // is rendered once per slot-level tier from its base level up to the max
 // available slot — so Shatter (level 2) appears at 2, 3, 4, 5, etc.
 // Each cloned entry carries an `effectiveLevel` property that differs from
 // the spell's intrinsic level when upcasted.
 const maxAvailableSlotLevel = useMemo(() => {
 let max = 0;
 Object.entries(slotsPerLevel).forEach(([k, total]) => {
 const lvl = parseInt(k);
 if (!isNaN(lvl) && total > 0 && lvl > max) max = lvl;
 });
 return max;
 }, [slotsPerLevel]);

 type SpellRow = SpellData & { effectiveLevel: number; isUpcast: boolean };

 const byLevel = useMemo(() => {
 const map: Record<number, SpellRow[]> = {};
 visibleSpells.forEach(s => {
 // Cantrips never upcast
 if (s.level === 0) {
 if (!map[0]) map[0] = [];
 map[0].push({ ...s, effectiveLevel: 0, isUpcast: false });
 return;
 }
 // Base-level entry
 if (!map[s.level]) map[s.level] = [];
 map[s.level].push({ ...s, effectiveLevel: s.level, isUpcast: false });
 // v2.44.0: Only generate upcast rows for spells that ACTUALLY support
 // upcasting (i.e. have a non-empty higher_levels field). Spells like
 // Jump/Find Familiar/etc. have no higher_levels and won't show upcast variants.
 if (showUpcasts && maxAvailableSlotLevel > s.level && canUpcastSpell(s)) {
 for (let up = s.level + 1; up <= Math.min(9, maxAvailableSlotLevel); up++) {
 if (!map[up]) map[up] = [];
 map[up].push({ ...s, effectiveLevel: up, isUpcast: true });
 }
 }
 });
 return map;
 }, [visibleSpells, showUpcasts, maxAvailableSlotLevel]);

 if (!hasSpellSlots) {
 return (
 <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--t-2)' }}>
 <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>
 {character.class_name}s don't cast spells
 </div>
 <p style={{ fontSize: 'var(--fs-sm)', maxWidth: 340, margin: '0 auto' }}>
 Your power comes from martial skill. Head to the Combat tab to manage weapons and attacks.
 </p>
 </div>
 );
 }

 const { prepared: preparedCount } = getSpellCounts(character);

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

 {/* ── Top bar: prepared count + Add Spells button ── */}
 <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
 {/* Known-casters: show spells known counter */}
 {isKnown && knownMax !== null && (() => {
 const knownCount = knownSpellData.filter(s => s.level > 0 && !grantedPrepared.includes(s.id)).length;
 const atCap = knownCount >= knownMax;
 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--c-card)', border: `1px solid ${atCap ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`, borderRadius: 999 }}>
 <span style={{ fontSize: 11, color: 'var(--t-2)' }}>Spells Known:</span>
 <span style={{ fontSize: 12, fontWeight: 700, color: atCap ? 'var(--c-gold-l)' : 'var(--t-1)', fontFamily: 'var(--ff-stat)' }}>
 {knownCount} / {knownMax}
 </span>
 {atCap && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.08em' }}>FULL</span>}
 </div>
 );
 })()}
 {isPreparer && !isKnown && (() => {
 const remaining = prepareMax - preparedCount;
 const atCap = preparedCount >= prepareMax;
 const pct = Math.min(100, prepareMax > 0 ? (preparedCount / prepareMax) * 100 : 0);
 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
 background: 'var(--c-card)', border: `1px solid ${atCap ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
 borderRadius: 999, cursor: 'default' }}
 title={atCap ? 'All spell slots are prepared' : `${remaining} more spell${remaining !== 1 ? 's' : ''} can be prepared`}
 >
 {/* Progress bar */}
 <div style={{ width: 48, height: 5, borderRadius: 3, background: 'var(--c-raised)', overflow: 'hidden', flexShrink: 0 }}>
 <div style={{ width: `${pct}%`, height: '100%', background: atCap ? 'var(--c-gold)' : 'var(--c-gold-l)', borderRadius: 3, transition: 'width 0.3s', opacity: 0.8 }}/>
 </div>
 <span style={{ fontSize: 11, color: 'var(--t-3)' }}>Prepared</span>
 <span style={{ fontSize: 12, fontWeight: 700, color: atCap ? 'var(--c-gold-l)' : 'var(--t-1)', fontFamily: 'var(--ff-stat)', minWidth: 28 }}>
 {preparedCount}<span style={{ fontWeight: 400, color: 'var(--t-3)' }}>/{prepareMax}</span>
 </span>
 {atCap && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--c-gold-l)', letterSpacing: '0.08em' }}>FULL</span>}
 <button
 onClick={() => setFilterPrepared(v => !v)}
 style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
 border: filterPrepared ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)',
 background: filterPrepared ? 'var(--c-gold-bg)' : 'transparent',
 color: filterPrepared ? 'var(--c-gold-l)' : 'var(--t-3)' }}
 >
 {filterPrepared ? 'All' : 'Unprepared'}
 </button>
 </div>
 );
 })()}

 {/* Spell Book button — opens picker with all levels including cantrips (Level 0 tab) */}
 <div style={{ marginLeft: 'auto' }}>
 <SpellPickerDropdown
 label={` Spell Book`}
 isCantrip={false}
 className={character.class_name}
 maxLevel={maxSpellLevel}
 selected={character.known_spells}
 onToggle={id => character.known_spells.includes(id) ? onRemoveSpell(id) : onAddSpell(id)}
 cantripMax={cantripMax}
 prepareMax={isPreparer ? prepareMax : isKnown ? (knownMax ?? undefined) : undefined}
 // v2.366.0 — For non-Wizard preparers (Cleric/Druid/Paladin/
 // Ranger/Artificer/Psion), known_spells IS the prepared list,
 // so the picker should gate against current known count, not
 // currently-prepared count. Wizard keeps prepared-count since
 // its known_spells is a true unbounded spellbook. Pre-v2.366
 // all preparers compared against preparedCount, so a Psion
 // could add unlimited known spells as long as they didn't
 // mark them prepared (the user-reported bug).
 prepareCount={isPreparer
 ? (character.class_name === 'Wizard' ? preparedCount : getSpellCounts(character).known)
 : isKnown ? getSpellCounts(character).known : undefined}
 isKnownCaster={isKnown}
 slotsPerLevel={slotsPerLevel}
 grantedSpellIds={[...grantedCantrips, ...grantedPrepared]}
 />
 </div>
 </div>

 {/* ── Spell stats header (DDB-style) — modifier / attack / save DC ── */}
 {computed.proficiency_bonus > 0 && (() => {
 const spellAbility = ({ Bard:'charisma', Cleric:'wisdom', Druid:'wisdom', Paladin:'charisma', Ranger:'wisdom', Sorcerer:'charisma', Warlock:'charisma', Wizard:'intelligence', Artificer:'intelligence' } as Record<string,string>)[character.class_name];
 if (!spellAbility) return null;
 const score = (character as any)[spellAbility] ?? 10;
 const mod = Math.floor((score - 10) / 2);
 const atk = mod + computed.proficiency_bonus;
 const dc = 8 + atk;
 return (
 <div style={{ display: 'flex', gap: 24, padding: '10px 16px', background: 'var(--c-surface)', border: '1px solid rgba(192,132,252,0.2)', borderRadius: 'var(--r-lg)', alignItems: 'center', flexWrap: 'wrap' as const }}>
 {[
 { label: 'MODIFIER', value: mod >= 0 ? `+${mod}` : String(mod) },
 { label: 'SPELL ATTACK', value: atk >= 0 ? `+${atk}` : String(atk) },
 { label: 'SAVE DC', value: String(dc) },
 ].map(s => (
 <div key={s.label} style={{ textAlign: 'center' }}>
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: '1.5rem', color: '#c084fc', lineHeight: 1 }}>{s.value}</div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(192,132,252,0.6)', marginTop: 2 }}>{s.label}</div>
 </div>
 ))}
 </div>
 );
 })()}

 {/* v2.63.0: removed "Show upcast variants" toggle. Upcasting is now driven
     entirely from the per-spell upcast trigger button in the expanded panel,
     which opens the slot-picker modal. The variant-row UX was redundant and
     cluttered the spell list. */}

 {/* ── Level tabs ── */}
 {/* v2.74.0: single-row pills with inline chiclets. Layout uses flex-wrap
     so pills pack naturally and wrap based on available width. On desktop
     this lines up as 5-6 per row; on narrow mobile it wraps sooner. Each
     pill is compact (label + count + up to 4 inline chiclets). Chiclet
     clicks expend/restore slots (stopPropagation); pill body clicks set
     the filter. Auto-decrement on cast still flows through SpellCastButton
     → onUpdateSlots. */}
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
 <LevelTab
 label="All"
 count={knownSpellData.filter(s => !grantedCantrips.includes(s.id) && !grantedPrepared.includes(s.id)).length}
 active={activeLevel === 'all'}
 onClick={() => setActiveLevel('all')}
 />
 {knownLevels.map(lvl => {
 const slots = lvl > 0 ? slotInfo[lvl] : null;
 const count = knownSpellData.filter(s =>
 s.level === lvl &&
 !grantedCantrips.includes(s.id) &&
 !grantedPrepared.includes(s.id)
 ).length;
 return (
 <LevelTab
 key={lvl}
 label={LEVEL_LABELS[lvl]}
 count={count}
 slots={slots}
 active={activeLevel === lvl}
 onClick={() => setActiveLevel(lvl)}
 onToggleSlot={slots ? (_idx, expending) => {
 // v2.71.0: Simple +1/-1 mutation. The visual fills the
 // leftmost N boxes based on remaining, so the specific
 // box index doesn't matter for state — only the direction.
 const slotKey = String(lvl);
 const current = character.spell_slots?.[slotKey];
 if (!current) return;
 const currentUsed = current.used ?? 0;
 const newUsed = expending
 ? Math.min(current.total, currentUsed + 1)
 : Math.max(0, currentUsed - 1);
 if (newUsed === currentUsed) return;
 onUpdateSlots({
 ...character.spell_slots,
 [slotKey]: { ...current, used: newUsed },
 });
 } : undefined}
 />
 );
 })}
 </div>

 {/* ── School filter chips ── */}
 {(() => {
 const presentSchools = [...new Set(knownSpellData.map(s => s.school))].sort();
 if (presentSchools.length <= 1) return null;
 return (
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
 {presentSchools.map(school => {
 const sc = SCHOOL_COLORS[school] ?? '#94a3b8';
 const active = filterSchool === school;
 return (
 <button key={school} onClick={() => setFilterSchool(active ? null : school)}
 style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
 border: `1px solid ${active ? sc : sc + '40'}`,
 background: active ? sc + '25' : 'transparent',
 color: active ? sc : sc + 'aa', transition: 'all 0.15s' }}>
 {school}
 </button>
 );
 })}
 </div>
 );
 })()}

 {/* ── Spellbook ── */}
 {knownSpellData.length === 0 ? (
 <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--c-border-m)', borderRadius: 16, color: 'var(--t-2)' }}>
 <div style={{ fontSize: 32, opacity: 0.15, marginBottom: 12 }}></div>
 <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-1)', marginBottom: 8 }}>No spells yet</div>
 <p style={{ fontSize: 12, color: 'var(--t-3)', margin: 0 }}>Use the "Spell Book" button above to add {character.class_name} spells to your sheet.</p>
 </div>
 ) : visibleSpells.length === 0 ? (
 <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--t-3)', fontSize: 13, border: '1px dashed var(--c-border)', borderRadius: 12 }}>
 <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}></div>
 <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-2)', marginBottom: 4 }}>
 No spells match your filters
 </div>
 <div style={{ fontSize: 12, color: 'var(--t-3)' }}>
 Clear your filters to see all spells
 </div>
 </div>
 ) : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
 {(Object.entries(byLevel) as [string, SpellData[]][])
 .sort(([a], [b]) => +a - +b)
 .map(([lvlStr, spells]) => {
 const lvl = parseInt(lvlStr);
 const slots = lvl > 0 ? slotInfo[lvl] : null;
 return (
 <div key={lvl}>
 {/* Level header */}
 <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--c-border)' }}>
 <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--t-2)' }}>
 {LEVEL_LABELS[lvl] === 'Cantrips' ? 'Cantrips' : `${LEVEL_LABELS[lvl]} Level`}
 </span>
 <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)', padding: '1px 6px', borderRadius: 999 }}>
 {spells.length}
 </span>
 {slots && (
 // v2.264.0 — was rendering `slots.max` pip dots PLUS "X/Y slots"
 // text. At high level (Wizard L17+ has 9 slot levels) this added
 // a wall of pips that doubled the header height. Replaced with
 // text-only display: "Slots: 4 / 4". Per-slot expend/restore
 // remains available through the Actions tab's chiclet rail and
 // the LevelTab pill in this tab.
 <span style={{
   fontSize: 10, color: slots.remaining > 0 ? 'var(--c-gold-l)' : 'var(--t-3)',
   marginLeft: 4, fontFamily: 'var(--ff-body)', fontWeight: 700,
   letterSpacing: '0.04em',
 }}>
   Slots: {slots.remaining} / {slots.max}
 </span>
 )}
 </div>

 {/* Column headers — show once for cantrips, once for leveled */}
 {lvl === 0 && (
 <div style={{ display: 'grid', gridTemplateColumns: '90px 3px 1fr 46px 70px 74px 80px auto 16px', gap: '0 8px', padding: '0 10px 4px', marginBottom: 2 }}>
 {['', '', 'NAME', 'TIME', 'RANGE', 'HIT / DC', 'EFFECT', '', ''].map((h, i) => (
 <span key={i} style={{ fontFamily: 'var(--ff-body)', fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>{h}</span>
 ))}
 </div>
 )}
 {/* Spell cards */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
 {spells.map(spell => (
 <SpellCard
 key={`${spell.id}-${spell.effectiveLevel}`}
 spell={spell}
 effectiveLevel={spell.effectiveLevel}
 isUpcast={spell.isUpcast}
 isExpanded={expandedSpell === `${spell.id}-${spell.effectiveLevel}`}
 isPrepared={character.prepared_spells.includes(spell.id)}
 isConcentrating={concentrationSpellId === spell.id}
 isPreparer={isPreparer && !isKnown}
 grantedReason={grantedReasonMap[spell.id]}
 spellAttack={computed.spell_attack_bonus ?? undefined}
 saveDC={computed.spell_save_dc ?? undefined}
 showInvisibleBadge={character.class_name === 'Psion' && spell.id === 'mage-hand'}
 castButton={
 <SpellCastButton
 spell={spell}
 character={character}
 userId={userId}
 campaignId={campaignId}
 onUpdateSlots={onUpdateSlots}
 forceSlotLevel={spell.isUpcast ? spell.effectiveLevel : undefined}
 onConcentrationCast={() => onConcentrate(spell.id)}
 />
 }
 upcastButton={
 <SpellCastButton
 spell={spell}
 character={character}
 userId={userId}
 campaignId={campaignId}
 onUpdateSlots={onUpdateSlots}
 upcastTrigger={true}
 onConcentrationCast={() => onConcentrate(spell.id)}
 />
 }
 onExpand={() => {
 const key = `${spell.id}-${spell.effectiveLevel}`;
 setExpandedSpell(expandedSpell === key ? null : key);
 }}
 onTogglePrepared={() => onTogglePrepared(spell.id)}
 onConcentrate={() => onConcentrate(spell.id)}
 onRemove={!spell.isUpcast && character.advanced_spell_edits_unlocked ? () => onRemoveSpell(spell.id) : undefined}
 />
 ))}
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
}

// ── Level tab button ─────────────────────────────────────────────────
// ── Spell card ───────────────────────────────────────────────────────
function SpellCard({ spell, effectiveLevel, isUpcast, isExpanded, isPrepared, isConcentrating, isPreparer, castButton, upcastButton, onExpand, onTogglePrepared, onConcentrate, onRemove, grantedReason, spellAttack, saveDC, showInvisibleBadge }: {
 spell: SpellData; effectiveLevel?: number; isUpcast?: boolean;
 isExpanded: boolean; isPrepared: boolean; isConcentrating: boolean;
 isPreparer: boolean; castButton: ReactNode; upcastButton?: ReactNode; grantedReason?: string;
 spellAttack?: number; saveDC?: number;
 onExpand: () => void; onTogglePrepared: () => void;
 onConcentrate: () => void; onRemove?: () => void;
 // v2.197.0 — Phase Q.0 pt 38: Subtle Telekinesis modifier badge.
 // When true (passed only for Psion's auto-granted Mage Hand), an
 // INVISIBLE chip renders next to the spell name reminding the
 // player that their version of the hand is not visible to onlookers.
 // The cast pipeline doesn't change — this is a RAW reminder, not a
 // mechanical modifier (no spell-data fork).
 showInvisibleBadge?: boolean;
}) {
 const schoolColor = SCHOOL_COLORS[spell.school] ?? '#94a3b8';
 const dimmed = isPreparer && spell.level > 0 && !isPrepared && !grantedReason; // isPreparer already false for known casters
 const displayLevel = effectiveLevel ?? spell.level; // for badges / labels that show the cast tier
 const effect = getEffectCategory(spell);
 const mechanics = parseSpellMechanics(spell.description, {
 save_type: (spell as any).save_type,
 attack_type: (spell as any).attack_type,
 damage_dice: (spell as any).damage_dice,
 damage_type: (spell as any).damage_type,
 heal_dice: (spell as any).heal_dice,
 });
 // Abbreviate casting time for table display
 const timeAbbr = spell.casting_time
 .replace('1 action', '1A').replace('1 Action', '1A')
 .replace('1 bonus action', '1BA').replace('Bonus Action', '1BA').replace('bonus action', '1BA')
 .replace('1 reaction', '1R').replace('Reaction', '1R')
 .replace('1 minute', '1 min').replace('10 minutes', '10 min')
 .replace('1 hour', '1 hr').replace('8 hours', '8 hr');
 // HIT/DC column value
 const hitDC = mechanics.isAttack && spellAttack !== undefined
 ? `+${spellAttack}`
 : mechanics.saveType && saveDC !== undefined
 ? `${mechanics.saveType} ${saveDC}`
 : '—';

 return (
 <div style={{
 borderRadius: 8,
 border: `1px solid ${isConcentrating ? 'rgba(167,139,250,0.4)' : isExpanded ? `${schoolColor}35` : 'var(--c-border)'}`,
 background: isConcentrating ? 'rgba(167,139,250,0.06)' : isExpanded ? `${schoolColor}04` : 'var(--c-card)',
 overflow: 'hidden', opacity: dimmed ? 0.5 : 1,
 transition: 'all 0.15s',
 }}>
 {/* Hint for unprepared spells */}
 {dimmed && (
 <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(212,160,23,0.15), transparent)' }}/>
 )}
 {/* ── DDB-style compact table row ── */}
 <div
 style={{
 display: 'grid',
 gridTemplateColumns: '90px 3px 1fr 46px 70px 74px 80px auto 16px',
 alignItems: 'center', gap: '0 8px',
 padding: '7px 10px', cursor: 'pointer', minHeight: 44,
 }}
 onClick={onExpand}
 >
 {/* Col 0: AT WILL / prepare dot / level badge */}
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
 {spell.level === 0 ? (
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800, color: '#a78bfa', letterSpacing: '0.04em', textTransform: 'uppercase' as const, textAlign: 'center', lineHeight: 1.2 }}>AT<br/>WILL</div>
 ) : isPreparer && !grantedReason ? (
 isUpcast ? (
 <span style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 13,
 color: schoolColor, letterSpacing: '0.02em',
 padding: '4px 10px', borderRadius: 6,
 border: `1px solid ${schoolColor}45`,
 background: `${schoolColor}0f`,
 whiteSpace: 'nowrap' as const,
 }} title={`Upcast as level ${displayLevel}`}>
 Lvl {displayLevel}↑
 </span>
 ) : (
 <button
 onClick={e => { e.stopPropagation(); onTogglePrepared(); }}
 title={isPrepared ? 'Prepared — click to unprepare' : 'Not prepared — click to prepare'}
 style={{
 cursor: 'pointer', borderRadius: 6, padding: '5px 10px', minHeight: 0,
 border: `1px solid ${isPrepared ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`,
 background: isPrepared ? 'var(--c-gold-bg)' : 'transparent',
 transition: 'all 0.15s',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
 minWidth: 76,
 }}
 >
 <span aria-hidden style={{
 display: 'inline-block', width: 12, height: 12, borderRadius: 3,
 border: `1.5px solid ${isPrepared ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
 background: isPrepared ? 'var(--c-gold)' : 'transparent',
 position: 'relative',
 }}>
 {isPrepared && (
 <span style={{
 position: 'absolute', top: -1, left: 2,
 color: '#000', fontSize: 10, fontWeight: 900, lineHeight: 1,
 }}>✓</span>
 )}
 </span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, color: isPrepared ? 'var(--c-gold-l)' : 'var(--t-2)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
 {isPrepared ? 'Prepared' : 'Prepare'}
 </span>
 </button>
 )
 ) : grantedReason ? (
 <span title={grantedReason} style={{
 fontSize: 9, fontWeight: 800, color: '#34d399',
 letterSpacing: '0.04em', textTransform: 'uppercase' as const,
 padding: '4px 10px', borderRadius: 6,
 border: '1px solid rgba(52,211,153,0.3)',
 background: 'rgba(52,211,153,0.08)',
 cursor: 'help', whiteSpace: 'nowrap' as const,
 }}>Granted</span>
 ) : (
 <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 14, fontWeight: 800, color: schoolColor }}>
 Lvl {displayLevel}{isUpcast ? '↑' : ''}
 </span>
 )}
 </div>

 {/* Col 1: School color bar */}
 <div style={{ width: 3, height: 30, borderRadius: 2, background: schoolColor, opacity: 0.75 }} />

 {/* Col 2: NAME + source */}
 <div style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
 <span style={{ fontWeight: 700, fontSize: 13, color: isConcentrating ? '#c4b5fd' : 'var(--t-1)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {spell.name}
 </span>
 {/* v2.197.0 — Phase Q.0 pt 38: Subtle Telekinesis (Psion class
     feature) makes Mage Hand invisible. Surface as a small chip
     next to the name so the player remembers the modifier when
     deciding to cast (and when narrating to the DM). Only renders
     for Psions on Mage Hand specifically. */}
 {showInvisibleBadge && (
 <span
 title="Subtle Telekinesis (Psion): your Mage Hand is invisible to onlookers"
 style={{
 fontSize: 8, fontWeight: 800, letterSpacing: '0.06em',
 color: '#a78bfa',
 background: 'rgba(167,139,250,0.12)',
 border: '1px solid rgba(167,139,250,0.4)',
 borderRadius: 4, padding: '1px 5px',
 textTransform: 'uppercase' as const, flexShrink: 0,
 }}
 >
 Invisible
 </span>
 )}
 {isConcentrating && <span style={{ fontSize: 8, fontWeight: 800, color: '#a78bfa', flexShrink: 0 }}>● CONC</span>}
 </div>
 <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1, whiteSpace: 'nowrap' as const }}>
 {spell.school}{spell.ritual ? ' · Ritual' : ''}
 </div>
 </div>

 {/* Col 3: TIME */}
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const }}>{timeAbbr}</div>

 {/* Col 4: RANGE */}
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{spell.range}</div>

 {/* Col 5: HIT / DC */}
 <div style={{ textAlign: 'center' }}>
 {hitDC !== '—' ? (
 <span style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 12,
 color: mechanics.isAttack ? '#fbbf24' : (SAVE_COLORS as any)[mechanics.saveType ?? ''] ?? '#94a3b8',
 background: mechanics.isAttack ? 'rgba(251,191,36,0.1)' : 'rgba(148,163,184,0.1)',
 border: `1px solid ${mechanics.isAttack ? 'rgba(251,191,36,0.3)' : 'rgba(148,163,184,0.25)'}`,
 borderRadius: 999, padding: '1px 6px', display: 'inline-block',
 }}>{hitDC}</span>
 ) : (
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>—</span>
 )}
 </div>

 {/* Col 6: EFFECT */}
 <div style={{ textAlign: 'center' }}>
 <span style={{
 fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, letterSpacing: '0.04em',
 color: effect.color, background: effect.color + '12',
 border: `1px solid ${effect.color}30`, borderRadius: 4, padding: '1px 5px',
 }}>{effect.label}</span>
 </div>

 {/* Col 7: Cast button(s) */}
 <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
 {castButton}
 </div>

 {/* Col 8: Quick remove + expand chevron */}
 <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
 {!grantedReason && onRemove && (
 <button
 onClick={onRemove}
 title="Remove spell"
 style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid transparent', background: 'transparent',
 color: 'var(--t-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
 fontSize: 11, padding: 0, lineHeight: 1, transition: 'all 0.15s',
 ':hover': { background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' },
 }}
 onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
 onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-3)'; }}
 ></button>
 )}
 <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
 </div>
 </div>

 {/* Expanded detail panel */}
 {isExpanded && (
 <div style={{ borderTop: `1px solid ${schoolColor}20`, padding: '12px 14px', background: 'rgba(255,255,255,0.015)' }}>
 {/* Stats row */}
 <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
 {[['Casting Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]].map(([k, v]) => v ? (
 <div key={k}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>{k}</div>
 <div style={{ fontSize: 12, color: 'var(--t-2)', fontWeight: 500 }}>{v}</div>
 </div>
 ) : null)}
 </div>

 {/* Description */}
 <p style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65, margin: '0 0 12px' }}>{spell.description}</p>

 {/* v2.58.0: Upcast trigger button — pinned right after description so users
     can deliberately pick a higher slot. The button only renders when the spell
     supports upcasting + has higher slots available (handled by SpellCastButton). */}
 {upcastButton && (
 <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
 {upcastButton}
 </div>
 )}

 {/* Actions */}
 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--c-border)', alignItems: 'center' }}>
 {spell.concentration && (
 <button
 onClick={onConcentrate}
 style={{
 fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
 border: isConcentrating ? '1px solid rgba(167,139,250,0.5)' : '1px solid var(--c-border-m)',
 background: isConcentrating ? 'rgba(167,139,250,0.15)' : 'var(--c-raised)',
 color: isConcentrating ? '#a78bfa' : 'var(--t-2)',
 }}
 >
 {isConcentrating ? 'Drop Concentration' : 'Concentrate'}
 </button>
 )}
 {isPreparer && spell.level > 0 && (
 grantedReason ? (
 <span style={{
 fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 7,
 background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)',
 color: '#34d399',
 }}>
 {grantedReason}
 </span>
 ) : (
 <button
 onClick={onTogglePrepared}
 style={{
 fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
 border: isPrepared ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
 background: isPrepared ? 'var(--c-gold-bg)' : 'var(--c-raised)',
 color: isPrepared ? 'var(--c-gold-l)' : 'var(--t-2)',
 }}
 >
 {isPrepared ? ' Prepared' : 'Prepare'}
 </button>
 )
 )}
 {onRemove && (
 <button
 onClick={onRemove}
 style={{ fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0, marginLeft: 'auto', border: '1px solid rgba(248,113,113,0.2)', background: 'transparent', color: 'var(--stat-str)' }}
 >
 Remove
 </button>
 )}
 </div>
 </div>
 )}
 </div>
 );
}
