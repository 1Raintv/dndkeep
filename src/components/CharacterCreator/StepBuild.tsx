import { useState, useMemo } from 'react';
import { CLASS_MAP } from '../../data/classes';
import { CLASS_LEVEL_PROGRESSION, hpPerLevel } from '../../data/levelProgression';
import { SPELLS } from '../../data/spells';
import { FEATS } from '../../data/feats';
import FeatPicker from '../shared/FeatPicker';
import SpellPickerDropdown from '../shared/SpellPickerDropdown';
import {
  METAMAGIC_OPTIONS, FIGHTING_STYLE_OPTIONS, WARLOCK_INVOCATIONS,
  EXPERTISE_SKILLS, DIVINE_ORDERS, PRIMAL_ORDERS,
} from '../../data/choiceOptions';

export interface BuildChoices {
  subclass: string;
  spells: string[];       // spell IDs
  cantrips: string[];     // cantrip IDs
  metamagic: string[];    // flat list of ALL known metamagic (derived from metamagicByLevel)
  metamagicByLevel: Record<number, string[]>;  // level -> metamagic chosen at that level
  invocations: string[];  // flat list of ALL known invocations
  invocationsByLevel: Record<number, string[]>;  // level -> invocations chosen at that level
  fightingStyle: string;
  expertise: string[];    // skill names
  feats: Record<number, string>;  // level -> feat name
  asiChoices: Record<number, { ability: string; amount: number; ability2?: string; amount2?: number }>;
  divineOrder: string;
  primalOrder: string;
}

export const emptyBuildChoices = (): BuildChoices => ({
  subclass: '', spells: [], cantrips: [], metamagic: [], metamagicByLevel: {}, invocations: [], invocationsByLevel: {},
  fightingStyle: '', expertise: [], feats: {}, asiChoices: {},
  divineOrder: '', primalOrder: '',
});

interface StepBuildProps {
  className: string;
  level: number;
  choices: BuildChoices;
  onChoicesChange: (c: BuildChoices) => void;
  constitutionMod?: number;
  onBack?: () => void;
  onNext?: () => void;
  currentLevel?: number;
  onCurrentLevelChange?: (l: number) => void;
}

const SPELL_ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
const ABILITY_ABBREV: Record<string, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

export default function StepBuild({ className, level, choices, onChoicesChange, constitutionMod = 0, onBack, onNext, currentLevel: controlledLevel, onCurrentLevelChange }: StepBuildProps) {
  const cls = CLASS_MAP[className];
  const progression = CLASS_LEVEL_PROGRESSION[className] ?? [];
  // Level is fully controlled by parent via currentLevel prop.
  // setCurrentLevel only used by dot indicators - it notifies parent which re-renders with new prop.
  const currentLevel = controlledLevel ?? 1;
  const setCurrentLevel = (updater: number | ((v: number) => number)) => {
    const next = typeof updater === 'function' ? updater(currentLevel) : updater;
    onCurrentLevelChange?.(next);
  };

  const levelsToShow = useMemo(() =>
    Array.from({ length: level }, (_, i) => i + 1)
      .map(lvl => ({
        lvl,
        prog: progression.find(p => p.level === lvl) ?? { level: lvl, features: [], choices: [] },
      })),
  [level, progression]);

  const { prog } = levelsToShow.find(l => l.lvl === currentLevel) ?? levelsToShow[0] ?? { lvl: 1, prog: { level: 1, features: [], choices: [] } };
  const choiceItems = prog.choices ?? [];

  function update(patch: Partial<BuildChoices>) {
    onChoicesChange({ ...choices, ...patch });
  }

  // Subclass data for feature lookup
  const selectedSubclass = choices.subclass ? cls?.subclasses?.find((sc: any) => sc.name === choices.subclass) : null;

  // Build summary entries for right panel
  const summary = levelsToShow.map(({ lvl, prog: p }) => {
    const entries: string[] = [];
    if (choices.subclass && (p.choices ?? []).some(c => c.type === 'subclass')) entries.push(`Subclass ${choices.subclass}`);
    if (choices.feats[lvl]) entries.push(`Feat: ${choices.feats[lvl]}`);
    if (choices.asiChoices[lvl]) {
      const a = choices.asiChoices[lvl];
      entries.push(`+${a.amount} ${a.ability.slice(0,3).toUpperCase()}${a.ability2 ? ` / +${a.amount2} ${a.ability2.slice(0,3).toUpperCase()}` : ''}`);
    }
    if (choices.fightingStyle && (p.choices ?? []).some(c => c.type === 'fighting_style')) entries.push(`Style ${choices.fightingStyle}`);
    if (choices.divineOrder && (p.choices ?? []).some(c => c.type === 'divine_order')) entries.push(`Order ${choices.divineOrder}`);
    if (choices.primalOrder && (p.choices ?? []).some(c => c.type === 'primal_order')) entries.push(`Order ${choices.primalOrder}`);
    const invAtLevel = choices.invocationsByLevel?.[lvl] ?? [];
    if (invAtLevel.length) entries.push(`Invocations ${invAtLevel.join(', ')}`);
    const mmAtLevel = choices.metamagicByLevel?.[lvl] ?? [];
    if (mmAtLevel.length) entries.push(`Metamagic ${mmAtLevel.join(', ')}`);
    // Note: class features and subclass features are intentionally excluded from this summary.
    // Summary only shows choices the player actively made.
    const isComplete = (p.choices ?? []).length === 0 || !(p.choices ?? []).some(c => isChoiceIncomplete(c.type, lvl, choices));
    const hasRequired = (p.choices ?? []).some(c => ['subclass','asi','fighting_style','divine_order','primal_order'].includes(c.type));
    const isMissing = hasRequired && (p.choices ?? []).some(c => ['subclass','asi','fighting_style','divine_order','primal_order'].includes(c.type) && isChoiceIncomplete(c.type, lvl, choices));
    return { lvl, entries, isComplete, isMissing, hasChoices: (p.choices ?? []).length > 0 };
  });

  const totalIncomplete = summary.filter(s => s.isMissing).length;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', width: '100%' }}>

      {/* ── LEFT: Level wizard ── */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: 'calc(100% - 156px)', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-1)' }}>Build Your {className}</div>
            <div style={{ fontSize: 12, color: 'var(--t-3)', marginTop: 2 }}>Level {currentLevel} of {level}</div>
          </div>
          {totalIncomplete > 0 ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-red-l)', background: 'var(--c-red-bg)', border: '1px solid rgba(220,38,38,0.3)', padding: '3px 10px', borderRadius: 999 }}>
              {totalIncomplete} level{totalIncomplete !== 1 ? 's' : ''} need choices
            </span>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-green-l)', background: 'var(--c-green-bg)', border: '1px solid rgba(5,150,105,0.3)', padding: '3px 10px', borderRadius: 999 }}>
              ✓ All choices made
            </span>
          )}
        </div>



        {/* Level progress dots */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {levelsToShow.map(({ lvl }) => {
            const s = summary.find(s => s.lvl === lvl)!;
            const isActive = lvl === currentLevel;
            return (
              <button key={lvl} onClick={() => setCurrentLevel(lvl)} style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 11,
                background: isActive ? 'var(--c-gold)' : s.isMissing ? 'rgba(220,38,38,0.2)' : s.hasChoices && s.isComplete ? 'rgba(5,150,105,0.2)' : 'var(--c-raised)',
                color: isActive ? '#000' : s.isMissing ? 'var(--c-red-l)' : s.hasChoices && s.isComplete ? 'var(--c-green-l)' : 'var(--t-3)',
                boxShadow: isActive ? '0 0 0 2px var(--c-gold)' : 'none',
                transition: 'all 0.15s',
              }}>{lvl}</button>
            );
          })}
        </div>

        {/* Level card */}
        <div key={currentLevel} style={{ border: '1px solid var(--c-border-m)', borderRadius: 12, background: 'var(--c-card)', overflow: 'hidden' }}>
          {/* Level title bar */}
          <div style={{ padding: '12px 16px', background: 'rgba(212,160,23,0.06)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--c-gold-bg)', border: '2px solid var(--c-gold-bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: 'var(--c-gold-l)', flexShrink: 0 }}>
              {currentLevel}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-1)' }}>Level {currentLevel}</div>
              {prog.newSpellLevel && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fcd34d', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', padding: '2px 8px', borderRadius: 999 }}>
                  Unlocks {SPELL_ORDINAL[prog.newSpellLevel]}-level spell slots
                </span>
              )}
            </div>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* HP gain info */}
            {(() => {
              const hitDie = cls?.hit_die ?? 8;
              const hpGain = currentLevel === 1
                ? hitDie + constitutionMod
                : hpPerLevel(hitDie) + constitutionMod;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#34d399' }}>HP</span>
                  <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 14, color: '#34d399' }}>+{hpGain}</span>
                  <span style={{ fontSize: 11, color: 'var(--t-3)' }}>
                    {currentLevel === 1
                      ? `d${hitDie} max (${hitDie}) + CON mod (${constitutionMod >= 0 ? '+' : ''}${constitutionMod})`
                      : `d${hitDie} avg (${hpPerLevel(hitDie)}) + CON mod (${constitutionMod >= 0 ? '+' : ''}${constitutionMod})`}
                  </span>
                  {cls?.is_spellcaster && prog.newSpellLevel && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#fcd34d', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', padding: '2px 8px', borderRadius: 999 }}>
                      + {SPELL_ORDINAL[prog.newSpellLevel]}-level slots
                    </span>
                  )}
                  {cls?.is_spellcaster && currentLevel > 0 && !prog.newSpellLevel && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t-3)' }}>
                      Prepared spells: {cls.spellcasting_ability?.slice(0,3).toUpperCase() ?? 'KEY'} mod + level — manage on character sheet
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Features */}
            {((prog.features ?? []).length > 0 || prog.subclassFeature) && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 8 }}>Features Gained</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(prog.features ?? []).map((f, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.5, display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--c-gold)', flexShrink: 0 }}>+</span>
                      <span>{f}</span>
                    </div>
                  ))}
                  {prog.subclassFeature && choices.subclass && (
                    <div style={{ fontSize: 13, color: '#a78bfa', lineHeight: 1.5, display: 'flex', gap: 8 }}>
                      <span style={{ flexShrink: 0 }}>+</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(() => {
                          const subFeats = (selectedSubclass as any)?.features?.filter((f: any) => f.level === currentLevel) ?? [];
                          if (subFeats.length > 0) {
                            return subFeats.map((f: any) => (
                              <div key={f.name}>
                                <span style={{ fontWeight: 700 }}>{f.name}</span>
                                {f.description && <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2 }}>{f.description}</div>}
                              </div>
                            ));
                          }
                          // Fallback: show subclass name as the feature (for official subclasses without detailed data)
                          return <span style={{ fontWeight: 600 }}>{choices.subclass} feature</span>;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* No features, no choices */}
            {(prog.features ?? []).length === 0 && !prog.subclassFeature && choiceItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--t-3)', fontSize: 13 }}>
                No new choices at this level. Features continue from previous levels.
              </div>
            )}

            {/* Choices */}
            {choiceItems.map((ch, i) => (
              <ChoicePanel
                key={i}
                type={ch.type}
                label={ch.label}
                level={currentLevel}
                className={className}
                choices={choices}
                onUpdate={update}
                maxSpellLevel={prog.newSpellLevel ?? getMaxSpellLevel(currentLevel, cls.spellcaster_type ?? 'full')}
              />
            ))}
          </div>
        </div>


      </div>

      {/* ── RIGHT: Choices summary — level list only ── */}
      <div style={{ width: 140, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--t-3)', marginBottom: 4 }}>
          All Choices
        </div>
        {summary.map(({ lvl, isComplete, isMissing, hasChoices }) => (
          <button key={lvl} onClick={() => setCurrentLevel(lvl)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: lvl === currentLevel ? 'rgba(212,160,23,0.08)' : 'transparent',
            border: `1px solid ${lvl === currentLevel ? 'var(--c-gold-bdr)' : isMissing ? 'rgba(220,38,38,0.3)' : isComplete && hasChoices ? 'rgba(5,150,105,0.25)' : 'var(--c-border)'}`,
            borderRadius: 7, padding: '6px 10px', cursor: 'pointer', width: '100%', minHeight: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: 12,
              color: lvl === currentLevel ? 'var(--c-gold-l)' : isMissing ? 'var(--c-red-l)' : isComplete && hasChoices ? 'var(--c-green-l)' : 'var(--t-3)' }}>
              Level {lvl}
            </span>
            {isMissing && <span style={{ fontSize: 9, color: 'var(--c-red-l)' }}>●</span>}
            {isComplete && hasChoices && !isMissing && <span style={{ fontSize: 9, color: 'var(--c-green-l)' }}>✓</span>}
          </button>
        ))}
      </div>

    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function isChoiceIncomplete(type: string, level: number, choices: BuildChoices): boolean {
  if (type === 'cantrips' || type === 'spells') return false; // Added from sheet later
  if (type === 'subclass') return !choices.subclass;
  if (type === 'asi') return !choices.asiChoices[level] && !choices.feats[level];
  if (type === 'fighting_style') return !choices.fightingStyle;
  if (type === 'divine_order') return !choices.divineOrder;
  if (type === 'primal_order') return !choices.primalOrder;
  return false; // spells/cantrips/metamagic are optional (can add later)
}

function countNeeded(label: string, type: string, current: string[]): number {
  const match = label.match(/Choose (\d+)|Learn (\d+)/);
  const needed = match ? parseInt(match[1] || match[2]) : 1;
  return Math.max(0, needed - current.length);
}

function getMaxSpellLevel(level: number, casterType: string): number {
  if (casterType === 'none') return 0;
  const effectiveLevel = casterType === 'half' ? Math.ceil(level / 2) : level;
  if (effectiveLevel >= 17) return 9;
  if (effectiveLevel >= 15) return 8;
  if (effectiveLevel >= 13) return 7;
  if (effectiveLevel >= 11) return 6;
  if (effectiveLevel >= 9) return 5;
  if (effectiveLevel >= 7) return 4;
  if (effectiveLevel >= 5) return 3;
  if (effectiveLevel >= 3) return 2;
  return 1;
}

// ── Choice panel renders ────────────────────────────────────────────

function ChoicePanel({ type, label, level, className, choices, onUpdate, maxSpellLevel }: {
  type: string; label: string; level: number; className: string;
  choices: BuildChoices; onUpdate: (patch: Partial<BuildChoices>) => void;
  maxSpellLevel: number;
}) {
  const cls = CLASS_MAP[className];

  if (type === 'subclass') {
    return <SubclassPicker label={label} cls={cls} choices={choices} onUpdate={onUpdate} />;
  }

  if (type === 'cantrips' || type === 'spells') {
    const isCantrip = type === 'cantrips';
    const selected = isCantrip ? choices.cantrips : choices.spells;
    return (
      <SpellPickerDropdown
        label={label}
        isCantrip={isCantrip}
        className={className}
        maxLevel={maxSpellLevel}
        selected={selected}
        onToggle={id => {
          const next = selected.includes(id) ? selected.filter((x: string) => x !== id) : [...selected, id];
          onUpdate(isCantrip ? { cantrips: next } : { spells: next });
        }}
      />
    );
  }

  if (type === 'metamagic') {
    // Parse max for this level (e.g. "Learn 2 Metamagic" → 2)
    const metaMax = parseInt(label.match(/Learn (\d+)|Choose (\d+)/)?.[1] ?? label.match(/Learn (\d+)|Choose (\d+)/)?.[2] ?? '1');
    // All metamagic chosen at PREVIOUS levels
    const priorMeta = Object.entries(choices.metamagicByLevel ?? {})
      .filter(([lvl]) => parseInt(lvl) < level)
      .flatMap(([, ids]) => ids);
    const thisLevelMeta = (choices.metamagicByLevel ?? {})[level] ?? [];
    return <MultiPicker
      label={label}
      max={metaMax}
      options={METAMAGIC_OPTIONS.map(m => ({ id: m.id, name: m.name, desc: m.description }))}
      excluded={priorMeta}
      selected={thisLevelMeta}
      onToggle={id => {
        const current = (choices.metamagicByLevel ?? {})[level] ?? [];
        const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
        const newByLevel = { ...(choices.metamagicByLevel ?? {}), [level]: next };
        // Flatten all levels into the flat array
        const allMeta = Object.values(newByLevel).flat();
        onUpdate({ metamagicByLevel: newByLevel, metamagic: allMeta });
      }}
    />;
  }

  if (type === 'invocations') {
    const invMax = parseInt(label.match(/Learn (\d+)|Choose (\d+)/)?.[1] ?? label.match(/Learn (\d+)|Choose (\d+)/)?.[2] ?? '1');
    const priorInv = Object.entries(choices.invocationsByLevel ?? {})
      .filter(([lvl]) => parseInt(lvl) < level)
      .flatMap(([, ids]) => ids);
    const thisLevelInv = (choices.invocationsByLevel ?? {})[level] ?? [];
    return <MultiPicker
      label={label}
      max={invMax}
      options={WARLOCK_INVOCATIONS.map(i => ({ id: i.id, name: i.name, desc: i.description, badge: i.prereq ?? undefined }))}
      excluded={priorInv}
      selected={thisLevelInv}
      onToggle={id => {
        const current = (choices.invocationsByLevel ?? {})[level] ?? [];
        const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
        const newByLevel = { ...(choices.invocationsByLevel ?? {}), [level]: next };
        const allInv = Object.values(newByLevel).flat();
        onUpdate({ invocationsByLevel: newByLevel, invocations: allInv });
      }}
    />;
  }

  if (type === 'fighting_style') {
    return <MultiPicker label={label} single options={FIGHTING_STYLE_OPTIONS.map(f => ({ id: f.id, name: f.name, desc: f.description }))}
      selected={choices.fightingStyle ? [choices.fightingStyle] : []} onToggle={id => onUpdate({ fightingStyle: id })} />;
  }

  if (type === 'expertise') {
    return (
      <div>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>{label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {EXPERTISE_SKILLS.map(skill => {
            const sel = choices.expertise.includes(skill);
            return (
              <button key={skill} onClick={() => {
                const next = sel ? choices.expertise.filter(s => s !== skill) : [...choices.expertise, skill];
                onUpdate({ expertise: next });
              }} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                border: sel ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                background: sel ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                color: sel ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
                {sel ? '✓ ' : ''}{skill}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (type === 'asi') {
    return <ASIFeatPicker key={`asi-${level}`} label={label} level={level} choices={choices} onUpdate={onUpdate} />;
  }

  if (type === 'divine_order') {
    return <MultiPicker label={label} single options={DIVINE_ORDERS.map(o => ({ id: o.id, name: o.name, desc: o.description }))}
      selected={choices.divineOrder ? [choices.divineOrder] : []} onToggle={id => onUpdate({ divineOrder: id })} />;
  }

  if (type === 'primal_order') {
    return <MultiPicker label={label} single options={PRIMAL_ORDERS.map(o => ({ id: o.id, name: o.name, desc: o.description }))}
      selected={choices.primalOrder ? [choices.primalOrder] : []} onToggle={id => onUpdate({ primalOrder: id })} />;
  }

  // Default: just show label
  return (
    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', padding: 'var(--sp-2) var(--sp-3)', background: 'var(--c-raised)', borderRadius: 'var(--r-md)' }}>
      {label} — record this choice on your character sheet after creation.
    </div>
  );
}

// ── Spell Picker — level-tabbed ────────────────────────────────────
function SpellPicker({ label, type, className, choices, onUpdate, maxLevel }: {
  label: string; type: string; className: string;
  choices: BuildChoices; onUpdate: (p: Partial<BuildChoices>) => void; maxLevel: number;
}) {
  const isCantrip = type === 'cantrips';
  const selected = isCantrip ? choices.cantrips : choices.spells;
  const [activeLevel, setActiveLevel] = useState<number>(isCantrip ? 0 : 1);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const levelOptions: number[] = isCantrip ? [0] : Array.from({ length: maxLevel }, (_, i) => i + 1);

  // All spells for this class grouped by level
  const allByLevel = useMemo(() => {
    const map: Record<number, typeof SPELLS> = {};
    SPELLS.forEach(s => {
      if (!s.classes.includes(className)) return;
      if (isCantrip ? s.level !== 0 : (s.level === 0 || s.level > maxLevel)) return;
      if (!map[s.level]) map[s.level] = [];
      map[s.level].push(s);
    });
    return map;
  }, [className, isCantrip, maxLevel]);

  const spellsAtLevel = useMemo(() => {
    const base = allByLevel[activeLevel] ?? [];
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(s => s.name.toLowerCase().includes(q) || s.school.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q));
  }, [allByLevel, activeLevel, search]);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    onUpdate(isCantrip ? { cantrips: next } : { spells: next });
  }

  const SCHOOL_COLORS: Record<string, string> = {
    Abjuration: '#60a5fa', Conjuration: '#a78bfa', Divination: '#34d399',
    Enchantment: '#f472b6', Evocation: '#fb923c', Illusion: '#c084fc',
    Necromancy: '#94a3b8', Transmutation: '#4ade80',
  };

  const LEVEL_LABELS = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>
          {label}
        </div>
        <span style={{ fontSize: 10, color: selected.length > 0 ? 'var(--c-gold-l)' : 'var(--t-3)', fontWeight: 600 }}>
          {selected.length} selected
        </span>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={`Search ${isCantrip ? 'cantrips' : 'spells'}…`}
        style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
      />

      {/* Level tabs */}
      {!isCantrip && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {levelOptions.map(lvl => {
            const countAtLevel = (allByLevel[lvl] ?? []).length;
            const selectedAtLevel = (allByLevel[lvl] ?? []).filter(s => selected.includes(s.id)).length;
            const isActive = activeLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => { setActiveLevel(lvl); setExpanded(null); setSearch(''); }}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
                  cursor: 'pointer', minHeight: 0, position: 'relative',
                  border: isActive ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                  background: isActive ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                  color: isActive ? 'var(--c-gold-l)' : 'var(--t-2)',
                }}
              >
                {LEVEL_LABELS[lvl]}
                {selectedAtLevel > 0 && (
                  <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 800, color: 'var(--c-gold-l)', background: 'rgba(212,160,23,0.2)', padding: '0 4px', borderRadius: 999 }}>
                    {selectedAtLevel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Spell list for active level */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
        {spellsAtLevel.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--t-3)', fontSize: 12 }}>
            {search ? `No ${isCantrip ? 'cantrips' : 'spells'} match "${search}"` : `No ${isCantrip ? 'cantrips' : `${LEVEL_LABELS[activeLevel]}-level spells`} available`}
          </div>
        ) : spellsAtLevel.map(spell => {
          const sel = selected.includes(spell.id);
          const isExp = expanded === spell.id;
          const schoolColor = SCHOOL_COLORS[spell.school] ?? 'var(--t-3)';
          return (
            <div key={spell.id} style={{
              borderRadius: 8,
              border: sel ? '1px solid var(--c-gold-bdr)' : isExp ? '1px solid var(--c-border-m)' : '1px solid var(--c-border)',
              background: sel ? 'rgba(212,160,23,0.06)' : 'var(--c-card)',
              overflow: 'hidden',
            }}>
              {/* Spell row */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', minHeight: 40 }}
                onClick={() => setExpanded(isExp ? null : spell.id)}
              >
                {/* School color pip */}
                <div style={{ width: 3, height: 28, borderRadius: 2, background: schoolColor, flexShrink: 0, opacity: 0.7 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: sel ? 700 : 500, fontSize: 13, color: sel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                      {spell.name}
                    </span>
                    <span style={{ fontSize: 9, color: schoolColor, background: `${schoolColor}15`, border: `1px solid ${schoolColor}30`, padding: '1px 4px', borderRadius: 3 }}>
                      {spell.school}
                    </span>
                    {spell.concentration && (
                      <span style={{ fontSize: 9, color: 'var(--c-amber-l)', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', padding: '1px 4px', borderRadius: 3 }}>C</span>
                    )}
                    {spell.ritual && (
                      <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', padding: '1px 4px', borderRadius: 3 }}>R</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t-3)', marginTop: 1 }}>
                    {spell.casting_time} · {spell.range} · {spell.duration}
                  </div>
                </div>

                {/* Add/Remove button */}
                <button
                  onClick={e => { e.stopPropagation(); toggle(spell.id); }}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                    cursor: 'pointer', minHeight: 0, flexShrink: 0,
                    border: sel ? '1px solid rgba(248,113,113,0.3)' : '1px solid var(--c-gold-bdr)',
                    background: sel ? 'rgba(248,113,113,0.08)' : 'var(--c-gold-bg)',
                    color: sel ? 'var(--stat-str)' : 'var(--c-gold-l)',
                  }}
                >
                  {sel ? '− Remove' : '+ Add'}
                </button>

                <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
              </div>

              {/* Expanded description */}
              {isExp && (
                <div style={{ padding: '0 12px 10px 23px', borderTop: '1px solid var(--c-border)' }}>
                  <p style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6, margin: '8px 0 0' }}>
                    {spell.description}
                  </p>
                  {spell.components && (
                    <div style={{ fontSize: 10, color: 'var(--t-3)', marginTop: 5 }}>
                      Components: {spell.components}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected summary pills */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 4, borderTop: '1px solid var(--c-border)' }}>
          {selected.map(id => {
            const spell = SPELLS.find(s => s.id === id);
            if (!spell) return null;
            return (
              <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 6px 2px 8px', borderRadius: 999, background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', color: 'var(--c-gold-l)' }}>
                {spell.name}
                <button
                  onClick={() => toggle(id)}
                  style={{ fontSize: 10, color: 'var(--c-gold-l)', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Multi-select picker ─────────────────────────────────────────────
function MultiPicker({ label, options, selected, onToggle, single, max, excluded = [] }: {
  label: string; options: { id: string; name: string; desc: string; badge?: string }[];
  selected: string[]; onToggle: (id: string) => void; single?: boolean;
  max?: number;         // max selections allowed at this level
  excluded?: string[];  // already chosen at prior levels — greyed out, not selectable
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const atMax = max !== undefined && selected.length >= max;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)' }}>
          {label}
        </div>
        {max !== undefined && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            background: atMax ? 'rgba(5,150,105,0.12)' : 'var(--c-raised)',
            border: `1px solid ${atMax ? 'var(--c-green-l)' : 'var(--c-border-m)'}`,
            color: atMax ? 'var(--c-green-l)' : 'var(--t-3)',
          }}>
            {selected.length} / {max} chosen
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {options.map(opt => {
          const sel = selected.includes(opt.id);
          const isExcluded = excluded.includes(opt.id);
          const isDisabled = !sel && atMax && !single; // greyed if at max and not selected
          const isExp = expanded === opt.id;

          return (
            <div key={opt.id} style={{
              borderRadius: 'var(--r-md)',
              border: isExcluded ? '1px solid var(--c-border)' : sel ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
              background: isExcluded ? 'transparent' : sel ? 'var(--c-gold-bg)' : 'var(--c-raised)',
              overflow: 'hidden',
              opacity: isExcluded ? 0.35 : isDisabled ? 0.45 : 1,
              transition: 'opacity 0.15s',
            }}>
              <button
                onClick={() => !isExcluded && !isDisabled && setExpanded(isExp ? null : opt.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                  padding: '7px var(--sp-3)', background: 'transparent', border: 'none',
                  cursor: isExcluded ? 'not-allowed' : isDisabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left', minHeight: 0,
                }}
              >
                {/* Status indicator */}
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                  background: isExcluded ? 'var(--t-3)' : sel ? 'var(--c-gold-l)' : 'transparent',
                  border: `2px solid ${isExcluded ? 'var(--t-3)' : sel ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
                }} />
                <span style={{
                  flex: 1, fontSize: 'var(--fs-sm)',
                  fontWeight: sel ? 600 : 400,
                  color: isExcluded ? 'var(--t-3)' : sel ? 'var(--c-gold-l)' : 'var(--t-1)',
                }}>
                  {sel ? '✓ ' : ''}{opt.name}
                  {isExcluded && <span style={{ fontSize: 9, color: 'var(--t-3)', marginLeft: 6 }}>already known</span>}
                  {isDisabled && <span style={{ fontSize: 9, color: 'var(--t-3)', marginLeft: 6 }}>limit reached</span>}
                </span>
                {opt.badge && <span style={{ fontSize: 9, color: 'var(--t-3)' }}>{opt.badge}</span>}
                {!isExcluded && !isDisabled && (
                  <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>▶</span>
                )}
              </button>
              {isExp && !isExcluded && (
                <div style={{ padding: '0 var(--sp-3) var(--sp-2) calc(var(--sp-3) + 18px)', borderTop: '1px solid var(--c-border)' }}>
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.6, margin: '6px 0' }}>{opt.desc}</p>
                  <button
                    className={sel ? 'btn-secondary btn-sm' : 'btn-gold btn-sm'}
                    disabled={!sel && isDisabled}
                    onClick={() => { onToggle(opt.id); setExpanded(null); }}
                  >
                    {sel ? 'Remove' : 'Select'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Subclass Picker ─────────────────────────────────────────────────
function SubclassPicker({ label, cls, choices, onUpdate }: {
  label: string; cls: any;
  choices: BuildChoices; onUpdate: (p: Partial<BuildChoices>) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(choices.subclass || null);
  const subclasses: any[] = cls?.subclasses ?? [];
  const selected = choices.subclass;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-1)', marginBottom: 2 }}>Choose Your Subclass</div>
      <div style={{ fontSize: 11, color: 'var(--t-3)', marginBottom: 6 }}>Click a subclass to see its description, then confirm your choice.</div>

      {subclasses.map((sc: any) => {
        const isSelected = selected === sc.name;
        const isExpanded = expanded === sc.name;

        return (
          <div key={sc.name} style={{
            border: isSelected ? '2px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
            borderRadius: 10, overflow: 'hidden',
            background: isSelected ? 'rgba(212,160,23,0.05)' : 'var(--c-card)',
            transition: 'border-color 0.15s',
          }}>
            {/* Row */}
            <button onClick={() => setExpanded(isExpanded && !isSelected ? null : sc.name)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 0,
            }}>
              {/* Selection indicator */}
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: isSelected ? '2px solid var(--c-gold)' : '2px solid var(--c-border-m)',
                background: isSelected ? 'var(--c-gold)' : 'transparent',
              }}>
                {isSelected && <span style={{ fontSize: 10, color: '#000', fontWeight: 900 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: isSelected ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{sc.name}</span>
                  {sc.source === 'ua' && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', padding: '1px 6px', borderRadius: 999 }}>UA 2026</span>
                  )}
                </div>
                {/* One-liner teaser */}
                {!isExpanded && (
                  <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                    {sc.description.split('.')[0]}.
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
            </button>

            {/* Expanded description */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--c-border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.7, margin: 0 }}>{sc.description}</p>

                {/* Features list if available (UA/homebrew subclasses) */}
                {sc.features && sc.features.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>Features</div>
                    {sc.features.map((f: any) => (
                      <div key={f.name} style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, borderLeft: '2px solid var(--c-border-m)' }}>
                        <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--t-2)' }}>Lv {f.level} — {f.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2, lineHeight: 1.5 }}>{f.description}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bonus spells */}
                {sc.spell_list && sc.spell_list.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--t-3)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--t-2)' }}>Oath/Domain spells: </span>
                    {sc.spell_list.join(', ')}
                  </div>
                )}

                {/* Choose button */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button onClick={() => { onUpdate({ subclass: sc.name }); setExpanded(sc.name); }}
                    style={{ fontSize: 12, fontWeight: 700, padding: '7px 20px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                      border: isSelected ? '1px solid rgba(248,113,113,0.3)' : '1px solid var(--c-gold-bdr)',
                      background: isSelected ? 'rgba(248,113,113,0.08)' : 'var(--c-gold-bg)',
                      color: isSelected ? '#f87171' : 'var(--c-gold-l)' }}>
                    {isSelected ? '✕ Deselect' : 'Choose this Subclass'}
                  </button>
                  {!isSelected && (
                    <button onClick={() => setExpanded(null)} style={{ fontSize: 11, color: 'var(--t-3)', background: 'none', border: '1px solid var(--c-border)', padding: '7px 12px', borderRadius: 7, cursor: 'pointer' }}>
                      Close
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── ASI / Feat picker ─────────────────────────────────────────────────────────
function ASIFeatPicker({ label, level, choices, onUpdate }: {
  label: string; level: number;
  choices: BuildChoices; onUpdate: (p: Partial<BuildChoices>) => void;
}) {
  const asi = choices.asiChoices[level];
  const hasFeat = !!choices.feats[level];
  const currentMode: 'plus2' | 'split' | 'feat' | null =
    hasFeat ? 'feat' : asi?.amount === 2 ? 'plus2' : asi ? 'split' : null;
  const [mode, setMode] = useState<'plus2' | 'split' | 'feat' | null>(currentMode);

  const OPTION_CARDS = [
    { id: 'plus2' as const, label: '+2 to One Ability', desc: 'Raise a single ability score by 2 points. Cannot exceed 20.' },
    { id: 'split' as const, label: '+1 to Two Abilities', desc: 'Raise two different ability scores by 1 point each. Neither can exceed 20.' },
    { id: 'feat' as const, label: 'Choose a Feat', desc: 'Forgo the ASI entirely and gain a feat from the feat list.' },
  ];

  function clearChoice() {
    const { [level]: _a, ...restASI } = choices.asiChoices;
    const { [level]: _f, ...restFeats } = choices.feats;
    onUpdate({ asiChoices: restASI, feats: restFeats });
  }

  const ABILITIES_LIST = ['strength','dexterity','constitution','intelligence','wisdom','charisma'];
  const ABILITY_LABELS: Record<string,string> = { strength:'STR', dexterity:'DEX', constitution:'CON', intelligence:'INT', wisdom:'WIS', charisma:'CHA' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-1)' }}>Ability Score Improvement or Feat</div>

      {/* Three option rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {OPTION_CARDS.map(opt => {
          const isActive = mode === opt.id;
          return (
            <button key={opt.id} onClick={() => { clearChoice(); setMode(opt.id); }}
              style={{ textAlign: 'left', padding: '9px 14px', borderRadius: 9, cursor: 'pointer',
                border: isActive ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                background: isActive ? 'var(--c-gold-bg)' : 'var(--c-card)',
                display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: isActive ? '2px solid var(--c-gold)' : '2px solid var(--c-border-m)',
                background: isActive ? 'var(--c-gold)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isActive && <span style={{ fontSize: 9, color: '#000', fontWeight: 900 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{opt.label}</div>
                <div style={{ display: 'none' }}>{opt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* +2 single ability */}
      {mode === 'plus2' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 8 }}>Which ability? (+2)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '100%' }}>
            {ABILITIES_LIST.map(ab => {
              const isChosen = asi?.ability === ab && asi?.amount === 2;
              return (
                <button key={ab} onClick={() => onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: ab, amount: 2 } } })}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                    border: isChosen ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                    background: isChosen ? 'var(--c-gold-bg)' : 'var(--c-raised)', color: isChosen ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
                  {ABILITY_LABELS[ab]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* +1/+1 split */}
      {mode === 'split' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1].map(idx => {
            const chosen = idx === 0 ? asi?.ability : asi?.ability2;
            const otherChosen = idx === 0 ? asi?.ability2 : asi?.ability;
            return (
              <div key={idx}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 6 }}>
                  {idx === 0 ? 'First ability (+1)' : 'Second ability (+1)'}
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {ABILITIES_LIST.map(ab => {
                    const isChosen = chosen === ab;
                    const isOther = otherChosen === ab;
                    return (
                      <button key={ab} disabled={isOther} onClick={() => {
                        if (idx === 0) {
                          onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: ab, amount: 1, ability2: asi?.ability2, amount2: asi?.ability2 ? 1 : undefined } } });
                        } else {
                          onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ...asi, ability: asi?.ability ?? ab, amount: 1, ability2: ab, amount2: 1 } as any } });
                        }
                      }} style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: isOther ? 'not-allowed' : 'pointer', minHeight: 0,
                        border: isChosen ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                        background: isChosen ? 'var(--c-gold-bg)' : 'var(--c-raised)', color: isChosen ? 'var(--c-gold-l)' : isOther ? 'var(--t-3)' : 'var(--t-2)',
                        opacity: isOther ? 0.4 : 1 }}>
                        {ABILITY_LABELS[ab]}
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
      {mode === 'feat' && (
        <FeatPicker
          selected={choices.feats[level] ?? ''}
          onSelect={name => onUpdate({ feats: { ...choices.feats, [level]: name } as Record<number, string> })}
        />
      )}
    </div>
  );
}
