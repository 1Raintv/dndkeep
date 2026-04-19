import { useState } from 'react';
import type { Character } from '../../types';
import { CLASSES, getSubclassSpellIds } from '../../data/classes';
import { FEATS } from '../../data/feats';
import { PSION_DISCIPLINES, getDisciplineCount } from '../../data/psionDisciplines';
import FeatPicker from '../shared/FeatPicker';
import { xpForNextLevel, abilityModifier } from '../../lib/gameUtils';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';

interface LevelUpWizardProps {
 character: Character;
 onLevelUp: (updates: Partial<Character>) => void;
 onClose: () => void;
}

const ABILITY_NAMES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
type AbilityKey = typeof ABILITY_NAMES[number];

const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

export default function LevelUpWizard({ character, onLevelUp, onClose }: LevelUpWizardProps) {
 const newLevel = character.level + 1;
 const classData = CLASSES.find(c => c.name === character.class_name);
 const subclassUnlockLevel = classData?.subclasses?.[0]?.unlock_level ?? 3;
 const needsSubclass = newLevel === subclassUnlockLevel && !character.subclass;
 const needsASI = ASI_LEVELS.has(newLevel);

 // Psion discipline needs
 const DISCIPLINE_LEVELS = new Set([2, 5, 10, 13, 17]);
 const needsDiscipline = character.class_name === 'Psion' && DISCIPLINE_LEVELS.has(newLevel);
 const currentDisciplines: string[] = Array.isArray(character.class_resources?.['psion-disciplines'])
 ? character.class_resources['psion-disciplines'] as string[]
 : [];

 const [step, setStep] = useState<'overview' | 'subclass' | 'discipline' | 'asi' | 'confirm'>('overview');
 const [selectedSubclass, setSelectedSubclass] = useState(character.subclass ?? '');
 const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([...currentDisciplines]);
 const [disciplineSearch, setDisciplineSearch] = useState('');
 const [asiChoice, setAsiChoice] = useState<'asi' | 'feat'>('asi');
 const [abiBoosts, setAbiBoosts] = useState<Partial<Record<AbilityKey, number>>>({});
 const [selectedFeat, setSelectedFeat] = useState('');

 const totalBoosts = (Object.values(abiBoosts) as number[]).reduce((a, b) => a + (b ?? 0), 0);

 // Compute what new HP they get
 const classHD = classData?.hit_die ?? 8;
 const avgHPGain = Math.floor(classHD / 2) + 1 + abilityModifier(character.constitution);
 const newMaxHP = character.max_hp + avgHPGain;

 function computeNewProfBonus(level: number) {
 return Math.ceil(level / 4) + 1;
 }
 const newProfBonus = computeNewProfBonus(newLevel);
 const oldProfBonus = computeNewProfBonus(character.level);
 const profBonusIncreased = newProfBonus > oldProfBonus;

 function buildUpdates(): Partial<Character> {
 const updates: Partial<Character> = {
 level: newLevel,
 max_hp: newMaxHP,
 current_hp: Math.min(character.current_hp + avgHPGain, newMaxHP),
 };

 // Auto-add subclass always-prepared spells when subclass is chosen
 const subclassToApply = needsSubclass ? selectedSubclass : (character.subclass ?? '');
 if (needsSubclass && selectedSubclass) {
 updates.subclass = selectedSubclass;
 // Auto-add subclass always-prepared spells — filter by level being assigned
 // so a new Psi Warper at level 3 doesn't get level-5/7/9 spells yet.
 const subSpellIds = getSubclassSpellIds(selectedSubclass, character.class_name, newLevel);
 if (subSpellIds.length > 0) {
 const existing = [...new Set([...character.known_spells, ...subSpellIds])];
 updates.known_spells = existing;
 }
 }

 // Save selected disciplines
 if (needsDiscipline && selectedDisciplines.length > currentDisciplines.length) {
 updates.class_resources = {
 ...(character.class_resources as Record<string, unknown> ?? {}),
 'psion-disciplines': selectedDisciplines,
 };
 }

 if (needsASI) {
 if (asiChoice === 'asi') {
 for (const [key, val] of Object.entries(abiBoosts)) {
 const numVal = val as number;
 if (numVal) {
 const current = character[key as AbilityKey] as number;
 updates[key as AbilityKey] = Math.min(20, current + numVal);
 }
 }
 } else if (asiChoice === 'feat' && selectedFeat) {
 const featData = FEATS.find(f => f.name === selectedFeat);
 if (featData?.asi) {
 for (const asiGrant of featData.asi) {
 const ability = asiGrant.ability.toLowerCase();
 const exactMatch = ABILITY_NAMES.find(a => ability === a);
 if (exactMatch) {
 updates[exactMatch] = Math.min(20, (character[exactMatch] as number) + asiGrant.amount);
 }
 }
 }
 const currentFeats = character.gained_feats ?? [];
 if (!currentFeats.includes(selectedFeat)) {
 updates.gained_feats = [...currentFeats, selectedFeat];
 }
 const existing = character.features_and_traits ?? '';
 const featNote = `\n[Feat — Level ${newLevel}]\n${selectedFeat}${featData ? ': ' + featData.description : ''}`;
 updates.features_and_traits = existing + featNote;
 }
 }
 return updates;
 }

 function handleConfirm() {
 onLevelUp(buildUpdates());
 onClose();
 }

 // Steps flow
 const steps: ('overview' | 'subclass' | 'discipline' | 'asi' | 'confirm')[] = ['overview'];
 if (needsSubclass) steps.push('subclass');
 if (needsDiscipline) steps.push('discipline');
 if (needsASI) steps.push('asi');
 steps.push('confirm');

 const currentIdx = steps.indexOf(step);
 const expectedDisciplinesAtLevel = getDisciplineCount(newLevel);
 const newDisciplinesNeeded = expectedDisciplinesAtLevel - currentDisciplines.length;
 const canNext = step === 'overview' ||
 (step === 'subclass' && selectedSubclass) ||
 (step === 'discipline' && selectedDisciplines.length >= expectedDisciplinesAtLevel) ||
 (step === 'asi' && (asiChoice === 'feat' ? selectedFeat : totalBoosts === 2)) ||
 step === 'confirm';

 return (
 <div style={{
 position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
 display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-4)',
 }}>
 <div style={{
 background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
 borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-gold)',
 width: '100%', maxWidth: 760, maxHeight: '90vh',
 display: 'flex', flexDirection: 'column', overflow: 'hidden',
 }}>
 {/* Header */}
 <div style={{
 padding: 'var(--sp-5) var(--sp-6)',
 borderBottom: '1px solid var(--c-border)',
 background: 'linear-gradient(135deg, var(--c-surface), var(--c-card))',
 }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 'var(--fs-xl)', color: 'var(--c-gold-l)' }}>
 Level Up!
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginTop: 2 }}>
 {character.name} is now {character.class_name} level {newLevel}
 </div>
 {/* Step dots */}
 <div style={{ display: 'flex', gap: 6, marginTop: 'var(--sp-3)' }}>
 {steps.map((s, i) => (
 <div key={s} style={{
 width: 8, height: 8, borderRadius: '50%',
 background: i <= currentIdx ? 'var(--c-gold)' : 'var(--c-border-m)',
 }} />
 ))}
 </div>
 </div>

 {/* Content */}
 <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-5) var(--sp-6)' }}>
 {step === 'overview' && (
 <OverviewStep
 newLevel={newLevel}
 character={character}
 classData={classData}
 avgHPGain={avgHPGain}
 newMaxHP={newMaxHP}
 profBonusIncreased={profBonusIncreased}
 newProfBonus={newProfBonus}
 needsSubclass={needsSubclass}
 needsASI={needsASI}
 />
 )}

 {step === 'subclass' && classData && (
 <SubclassStep
 classData={classData}
 selected={selectedSubclass}
 onSelect={setSelectedSubclass}
 />
 )}

 {step === 'discipline' && (
 <DisciplineStep
 currentDisciplines={selectedDisciplines}
 needed={newDisciplinesNeeded}
 expectedTotal={expectedDisciplinesAtLevel}
 search={disciplineSearch}
 onSearch={setDisciplineSearch}
 onToggle={(name: string) => {
 if (selectedDisciplines.includes(name)) {
 setSelectedDisciplines(prev => prev.filter(d => d !== name));
 } else if (selectedDisciplines.length < expectedDisciplinesAtLevel) {
 setSelectedDisciplines(prev => [...prev, name]);
 }
 }}
 />
 )}

 {step === 'asi' && (
 <ASIStep
 character={character}
 asiChoice={asiChoice}
 onSetChoice={setAsiChoice}
 abiBoosts={abiBoosts}
 onSetBoosts={setAbiBoosts}
 totalBoosts={totalBoosts}
 selectedFeat={selectedFeat}
 onSetFeat={setSelectedFeat}
 />
 )}

 {step === 'confirm' && (
 <ConfirmStep
 character={character}
 newLevel={newLevel}
 avgHPGain={avgHPGain}
 newMaxHP={newMaxHP}
 selectedSubclass={needsSubclass ? selectedSubclass : undefined}
 abiBoosts={needsASI && asiChoice === 'asi' ? abiBoosts : undefined}
 selectedFeat={needsASI && asiChoice === 'feat' ? selectedFeat : undefined}
 />
 )}
 </div>

 {/* Footer */}
 <div style={{
 padding: 'var(--sp-4) var(--sp-6)',
 borderTop: '1px solid var(--c-border)',
 display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)',
 }}>
 <button className="btn-ghost btn-sm" onClick={() => {
 if (currentIdx === 0) { onClose(); }
 else { setStep(steps[currentIdx - 1]); }
 }}>
 {currentIdx === 0 ? ' Cancel' : '← Back'}
 </button>

 {step === 'confirm' ? (
 <button className="btn-gold" onClick={handleConfirm} style={{ fontWeight: 700 }}>
 Confirm Level Up
 </button>
 ) : (
 <button
 className="btn-primary btn-sm"
 onClick={() => setStep(steps[currentIdx + 1])}
 disabled={!canNext}
 >
 Next →
 </button>
 )}
 </div>
 </div>
 </div>
 );
}

// ── Step components ─────────────────────────────────────────────────

function OverviewStep({ newLevel, character, classData, avgHPGain, newMaxHP, profBonusIncreased, newProfBonus, needsSubclass, needsASI }: any) {
 // Pull real features from the level progression table
 const progression = CLASS_LEVEL_PROGRESSION[character.class_name] ?? [];
 const milestone = progression.find((m: any) => m.level === newLevel);
 const classFeatures: string[] = milestone?.features ?? [];
 const newSpellLevel = milestone?.newSpellLevel;

 // Pull subclass features for this level (with full descriptions)
 const subclassFeatures: any[] = [];
 if (character.subclass && classData) {
 const subcls = classData.subclasses?.find((s: any) => s.name === character.subclass);
 if (subcls?.features) {
 subclassFeatures.push(...subcls.features.filter((f: any) => f.level === newLevel));
 }
 }
 const hasSubclassFeature = (milestone?.subclassFeature && character.subclass) || subclassFeatures.length > 0;

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
 {/* Stat gains row */}
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
 <Gain icon="" label="Max HP" before={character.max_hp} after={newMaxHP} color="var(--hp-full)" />
 <Gain icon="" label="Level" before={character.level} after={newLevel} color="var(--c-gold-l)" />
 {profBonusIncreased && <Gain icon="" label="Prof Bonus" before={newProfBonus - 1} after={newProfBonus} color="#a78bfa" />}
 {newSpellLevel && <Gain icon="" label="New Spell Level" before={newSpellLevel - 1} after={newSpellLevel} color="#c084fc" />}
 </div>

 {/* HP note */}
 <Feature text={`+${avgHPGain} HP (d${classData?.hit_die ?? 8} average + Con mod)`} icon="" />

 {/* Subclass choice prompt */}
 {needsSubclass && <Feature text="Choose your subclass — see next step" icon="⭐" highlight />}

 {/* ASI prompt */}
 {needsASI && <Feature text="Ability Score Improvement or Feat — see next step" icon="" highlight />}

 {/* Subclass features with full descriptions */}
 {subclassFeatures.length > 0 && (
 <div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
 {character.subclass} — Level {newLevel} Features
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
 {subclassFeatures.map((f: any, i: number) => (
 <FeatureCard key={i} name={f.name} description={f.description} isChoice={f.isChoice} level={newLevel} />
 ))}
 </div>
 </div>
 )}

 {/* Subclass feature gained but no data available */}
 {milestone?.subclassFeature && subclassFeatures.length === 0 && character.subclass && (
 <Feature text={`${character.subclass} subclass feature gained — check your class description`} icon="" highlight />
 )}

 {/* Class features for this level */}
 {classFeatures.length > 0 && (
 <div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: 'var(--t-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
 {character.class_name} Class Features
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
 {classFeatures.map((f: string, i: number) => (
 <Feature key={i} text={f} icon="" />
 ))}
 </div>
 </div>
 )}

 {classFeatures.length === 0 && !needsSubclass && !needsASI && !hasSubclassFeature && (
 <Feature text="No new class features this level — your subclass may have features" icon="" />
 )}

 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontStyle: 'italic' }}>
 HP uses average formula. Adjust in Character Settings if needed.
 </div>
 </div>
 );
}

function DisciplineStep({ currentDisciplines, needed, expectedTotal, search, onSearch, onToggle }: any) {
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const filtered = PSION_DISCIPLINES.filter(d =>
 search === '' ||
 d.name.toLowerCase().includes(search.toLowerCase()) ||
 d.description.toLowerCase().includes(search.toLowerCase())
 );
 const canAdd = currentDisciplines.length < expectedTotal;

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
 <div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)', marginBottom: 4 }}>
 Choose {needed} Psionic Discipline{needed > 1 ? 's' : ''}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)' }}>
 {currentDisciplines.length}/{expectedTotal} chosen
 {' '}— each discipline is permanent and grants passive or active psionic benefits.
 </div>
 </div>

 {/* Current selections */}
 {currentDisciplines.length > 0 && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
 {currentDisciplines.map((name: string) => (
 <span key={name} style={{
 padding: '3px 10px', borderRadius: 999,
 background: 'rgba(212,160,23,0.15)', border: '1px solid var(--c-gold-bdr)',
 fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700, color: 'var(--c-gold-l)',
 }}>
 {name}
 </span>
 ))}
 </div>
 )}

 <input
 type="text" placeholder="Search disciplines..."
 value={search} onChange={e => onSearch(e.target.value)}
 style={{
 padding: '6px 10px', borderRadius: 'var(--r-md)', background: 'var(--c-raised)',
 border: '1px solid var(--c-border)', color: 'var(--t-1)',
 fontFamily: 'var(--ff-body)', fontSize: 12, outline: 'none',
 }}
 />

 <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
 {filtered.map(disc => {
 const isSelected = currentDisciplines.includes(disc.name);
 const isExpanded = expandedId === disc.id;
 const typeColor = disc.type === 'passive' ? '#34d399' : disc.type === 'active' ? '#fbbf24' : '#60a5fa';
 return (
 <div key={disc.id} style={{
 border: isSelected ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
 borderRadius: 'var(--r-lg)',
 background: isSelected ? 'rgba(212,160,23,0.06)' : 'var(--c-raised)',
 overflow: 'hidden',
 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
 <button
 onClick={() => {
 if (isSelected || canAdd) onToggle(disc.name);
 }}
 disabled={!isSelected && !canAdd}
 style={{
 flex: 1, textAlign: 'left', background: 'transparent', border: 'none',
 cursor: isSelected || canAdd ? 'pointer' : 'not-allowed', padding: 0,
 display: 'flex', flexDirection: 'column', gap: 3,
 }}
 >
 <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: isSelected ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
 {isSelected && ' '}{disc.name}
 </span>
 <span style={{ fontSize: 9, fontWeight: 700, color: typeColor, background: typeColor + '15', border: `1px solid ${typeColor}40`, borderRadius: 999, padding: '1px 6px' }}>
 {disc.type === 'passive' ? ' PASSIVE' : disc.type === 'active' ? ' ACTIVE' : '◈ BOTH'}
 </span>
 {disc.dieCost && (
 <span style={{ fontSize: 9, color: '#e879f9', background: 'rgba(232,121,249,0.1)', border: '1px solid rgba(232,121,249,0.3)', borderRadius: 999, padding: '1px 5px' }}>
 {disc.dieCost}
 </span>
 )}
 </div>
 {!isExpanded && (
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4 }}>
 {disc.description.slice(0, 90)}{disc.description.length > 90 ? '…' : ''}
 </span>
 )}
 </button>
 <button
 onClick={() => setExpandedId(isExpanded ? null : disc.id)}
 style={{ background: 'transparent', border: 'none', color: 'var(--t-3)', cursor: 'pointer', fontSize: 11, padding: '0 4px', flexShrink: 0 }}
 >
 {isExpanded ? '▲' : '▼'}
 </button>
 </div>
 {isExpanded && (
 <div style={{ padding: '0 14px 12px', fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.65, borderTop: '1px solid var(--c-border)' }}>
 {disc.description}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
}

function SubclassStep({ classData, selected, onSelect }: any) {
 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)' }}>
 Choose your {classData.name} subclass
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
 {classData.subclasses.map((sub: any) => {
 const featuresByLevel: Record<number, string[]> = {};
 for (const f of sub.features ?? []) {
 if (!featuresByLevel[f.level]) featuresByLevel[f.level] = [];
 featuresByLevel[f.level].push(f.name);
 }
 const featureLevels = Object.keys(featuresByLevel).map(Number).sort((a, b) => a - b);
 const isSel = selected === sub.name;
 return (
 <div
 key={sub.name}
 role="button"
 tabIndex={0}
 onClick={() => onSelect(sub.name)}
 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(sub.name); } }}
 style={{
 padding: 'var(--sp-3) var(--sp-4)',
 border: isSel ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
 borderRadius: 'var(--r-lg)',
 background: isSel ? 'rgba(212,160,23,0.08)' : '#080d14',
 transition: 'all var(--tr-fast)',
 display: 'flex', flexDirection: 'column', gap: 8,
 cursor: 'pointer',
 outline: 'none',
 }}
 onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--c-border-m)'; }}
 onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--c-border)'; }}
 >
 {/* Title row */}
 <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: isSel ? 'var(--c-gold-l)' : 'var(--t-1)', flex: 1 }}>
 {isSel ? ' ' : ''}{sub.name}
 </span>
 {sub.source === 'ua' && (
 <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#c084fc', background: 'rgba(192,132,252,0.12)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: 999, padding: '1px 6px' }}>UA</span>
 )}
 </div>

 {/* Description */}
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5 }}>
 {sub.description}
 </div>

 {/* Features list — secondary, below the description */}
 {featureLevels.length > 0 && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
 {featureLevels.map((lvl: number) => (
 <span key={lvl} title={featuresByLevel[lvl].join(', ')} style={{
 fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
 color: isSel ? 'var(--c-gold-l)' : 'var(--t-3)',
 background: isSel ? 'rgba(212,160,23,0.12)' : 'var(--c-surface)',
 border: `1px solid ${isSel ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`,
 borderRadius: 4, padding: '2px 5px',
 }}>
 Lv{lvl}: {featuresByLevel[lvl].join(', ')}
 </span>
 ))}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
}

function ASIStep({ character, asiChoice, onSetChoice, abiBoosts, onSetBoosts, totalBoosts, selectedFeat, onSetFeat }: any) {
 // v2.31.1: match the CharacterCreator StepBuild ASIFeatPicker UI —
 // three option cards (+2 one ability, +1 two abilities, Feat) with radio selection
 // and ability buttons underneath. Keep abiBoosts state shape so buildUpdates() still works.

 const ABILITY_LABELS: Record<string, string> = {
 strength: 'STR', dexterity: 'DEX', constitution: 'CON',
 intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
 };

 // Derive 3-way mode from current state (plus2 = one ability got +2; split = two got +1)
 const currentMode: 'plus2' | 'split' | 'feat' =
 asiChoice === 'feat' ? 'feat' :
 (Object.values(abiBoosts).some(v => (v as number) === 2) ? 'plus2' : 'split');

 // For +2 mode: the single ability that has a boost
 const plus2Ability = Object.entries(abiBoosts).find(([, v]) => v === 2)?.[0] ?? null;
 // For split mode: the two abilities with +1
 const splitAbilities = Object.entries(abiBoosts).filter(([, v]) => v === 1).map(([k]) => k);
 const first = splitAbilities[0] ?? null;
 const second = splitAbilities[1] ?? null;

 function setMode(m: 'plus2' | 'split' | 'feat') {
 if (m === 'feat') {
 onSetChoice('feat');
 onSetBoosts({});
 } else {
 onSetChoice('asi');
 onSetBoosts({});
 onSetFeat('');
 }
 }

 function pickPlus2(ab: string) {
 onSetBoosts({ [ab]: 2 });
 }
 function pickSplit(slot: 0 | 1, ab: string) {
 const other = slot === 0 ? second : first;
 const next: Record<string, number> = {};
 if (slot === 0) {
 next[ab] = 1;
 if (other) next[other] = 1;
 } else {
 if (first) next[first] = 1;
 next[ab] = 1;
 }
 onSetBoosts(next);
 }

 const OPTIONS = [
 { id: 'plus2' as const, label: '+2 to One Ability', desc: 'Raise a single ability score by 2 points. Cannot exceed 20.' },
 { id: 'split' as const, label: '+1 to Two Abilities', desc: 'Raise two different ability scores by 1 point each. Neither can exceed 20.' },
 { id: 'feat' as const, label: 'Choose a Feat', desc: 'Forgo the ASI entirely and gain a feat from the feat list.' },
 ];

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
 <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)' }}>
 Ability Score Improvement or Feat
 </div>

 {/* Three-option radio stack (matches CharacterCreator) */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
 {OPTIONS.map(opt => {
 const active = currentMode === opt.id;
 return (
 <button
 key={opt.id}
 onClick={() => setMode(opt.id)}
 style={{
 textAlign: 'left', padding: '10px 14px', borderRadius: 9, cursor: 'pointer', minHeight: 0,
 border: active ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
 background: active ? 'var(--c-gold-bg)' : 'var(--c-card)',
 display: 'flex', alignItems: 'center', gap: 12,
 }}
 >
 <div style={{
 width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
 border: active ? '2px solid var(--c-gold)' : '2px solid var(--c-border-m)',
 background: active ? 'var(--c-gold)' : 'transparent',
 }} />
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
 {opt.label}
 </div>
 <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2 }}>
 {opt.desc}
 </div>
 </div>
 </button>
 );
 })}
 </div>

 {/* +2 single ability picker */}
 {currentMode === 'plus2' && (
 <div>
 <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 8 }}>
 Which ability? (+2)
 </div>
 <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
 {ABILITY_NAMES.map(ab => {
 const chosen = plus2Ability === ab;
 const current = character[ab] as number;
 const atCap = current + 2 > 20;
 return (
 <button
 key={ab}
 disabled={atCap && !chosen}
 onClick={() => pickPlus2(ab)}
 title={atCap ? `${ABILITY_LABELS[ab]} cannot exceed 20` : `${ABILITY_LABELS[ab]} ${current} → ${current + 2}`}
 style={{
 fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 7,
 cursor: atCap && !chosen ? 'not-allowed' : 'pointer', minHeight: 0,
 border: chosen ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
 background: chosen ? 'var(--c-gold-bg)' : 'var(--c-raised)',
 color: chosen ? 'var(--c-gold-l)' : atCap ? 'var(--t-3)' : 'var(--t-2)',
 opacity: atCap && !chosen ? 0.4 : 1,
 }}
 >
 {ABILITY_LABELS[ab]}
 <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11, color: chosen ? 'var(--c-gold-l)' : 'var(--t-3)' }}>
 {current}{chosen ? ` → ${current + 2}` : ''}
 </span>
 </button>
 );
 })}
 </div>
 </div>
 )}

 {/* +1 + +1 split picker — two labeled rows */}
 {currentMode === 'split' && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
 {[0, 1].map(slot => {
 const chosen = slot === 0 ? first : second;
 const other = slot === 0 ? second : first;
 return (
 <div key={slot}>
 <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 6 }}>
 {slot === 0 ? 'First ability (+1)' : 'Second ability (+1)'}
 </div>
 <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
 {ABILITY_NAMES.map(ab => {
 const isChosen = chosen === ab;
 const isOther = other === ab;
 const current = character[ab] as number;
 const atCap = current + 1 > 20;
 const disabled = isOther || (atCap && !isChosen);
 return (
 <button
 key={ab}
 disabled={disabled}
 onClick={() => pickSplit(slot as 0 | 1, ab)}
 title={isOther ? 'Already selected as the other ability' : atCap ? `${ABILITY_LABELS[ab]} cannot exceed 20` : undefined}
 style={{
 fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 7,
 cursor: disabled ? 'not-allowed' : 'pointer', minHeight: 0,
 border: isChosen ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
 background: isChosen ? 'var(--c-gold-bg)' : 'var(--c-raised)',
 color: isChosen ? 'var(--c-gold-l)' : disabled ? 'var(--t-3)' : 'var(--t-2)',
 opacity: disabled ? 0.4 : 1,
 }}
 >
 {ABILITY_LABELS[ab]}
 <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11, color: isChosen ? 'var(--c-gold-l)' : 'var(--t-3)' }}>
 {current}{isChosen ? ` → ${current + 1}` : ''}
 </span>
 </button>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 )}

 {/* Feat picker */}
 {currentMode === 'feat' && (
 <FeatPicker
 selected={selectedFeat ?? null}
 onSelect={name => onSetFeat(name ?? '')}
 />
 )}
 </div>
 );
}

function ConfirmStep({ character, newLevel, avgHPGain, newMaxHP, selectedSubclass, abiBoosts, selectedFeat }: any) {
 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--c-gold-l)', textAlign: 'center' }}>
 Ready to Level Up?
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
 <ConfirmLine icon="" label="New Level" value={`${character.class_name} ${newLevel}`} />
 <ConfirmLine icon="" label="Max HP" value={`${character.max_hp} → ${newMaxHP} (+${avgHPGain})`} />
 {selectedSubclass && <ConfirmLine icon="⭐" label="Subclass" value={selectedSubclass} highlight />}
 {abiBoosts && Object.entries(abiBoosts).filter(([,v]) => v).map(([k, v]) => (
 <ConfirmLine key={k} icon="" label={k.slice(0,3).toUpperCase()} value={`${character[k]} → ${(character[k] as number) + (v as number)} (+${v})`} highlight />
 ))}
 {selectedFeat && <ConfirmLine icon="⭐" label="Feat Gained" value={selectedFeat} highlight />}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontStyle: 'italic', textAlign: 'center' }}>
 This will update your character immediately. You can always adjust stats in Character Settings.
 </div>
 </div>
 );
}

function Gain({ icon, label, before, after, color }: any) {
 return (
 <div style={{ padding: 'var(--sp-3)', background: '#080d14', borderRadius: 'var(--r-lg)', border: `1px solid ${color}20` }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-2)' }}>{icon} {label}</div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 'var(--fs-lg)', color, marginTop: 2 }}>
 {before} → {after}
 </div>
 </div>
 );
}

function FeatureCard({ name, description, isChoice, level }: { name: string; description: string; isChoice?: boolean; level?: number }) {
 return (
 <div style={{
 padding: '10px 14px',
 background: isChoice ? 'rgba(212,160,23,0.06)' : 'rgba(124,58,237,0.05)',
 border: `1px solid ${isChoice ? 'rgba(212,160,23,0.25)' : 'rgba(124,58,237,0.2)'}`,
 borderRadius: 'var(--r-md)',
 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: isChoice ? 'var(--c-gold-l)' : '#c084fc' }}>
 {isChoice ? '⬡ ' : ' '}{name}
 </span>
 {isChoice && (
 <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--c-gold-l)', background: 'rgba(212,160,23,0.12)', border: '1px solid var(--c-gold-bdr)', borderRadius: 999, padding: '1px 6px' }}>CHOICE</span>
 )}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.6 }}>
 {description}
 </div>
 </div>
 );
}

function Feature({ text, icon, highlight }: { text: string; icon: string; highlight?: boolean }) {
 return (
 <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: highlight ? 'rgba(212,160,23,0.08)' : '#080d14', borderRadius: 'var(--r-md)', border: highlight ? '1px solid rgba(212,160,23,0.2)' : '1px solid var(--c-border)' }}>
 <span>{icon}</span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: highlight ? 'var(--c-gold-l)' : 'var(--t-2)', fontWeight: highlight ? 600 : 400 }}>{text}</span>
 </div>
 );
}

function ConfirmLine({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)', background: highlight ? 'rgba(212,160,23,0.06)' : '#080d14', borderRadius: 'var(--r-md)', border: highlight ? '1px solid rgba(212,160,23,0.2)' : '1px solid var(--c-border)' }}>
 <span>{icon}</span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-2)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 80 }}>{label}</span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: highlight ? 'var(--c-gold-l)' : 'var(--t-2)', fontWeight: highlight ? 600 : 400 }}>{value}</span>
 </div>
 );
}
