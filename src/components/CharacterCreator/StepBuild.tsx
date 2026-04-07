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
}

const SPELL_ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
const ABILITY_ABBREV: Record<string, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

export default function StepBuild({ className, level, choices, onChoicesChange, constitutionMod = 0 }: StepBuildProps) {
  const cls = CLASS_MAP[className];
  const progression = CLASS_LEVEL_PROGRESSION[className] ?? [];
  const [currentLevel, setCurrentLevel] = useState<number>(1);

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

  // Build summary entries for right panel
  const summary = levelsToShow.map(({ lvl, prog: p }) => {
    const entries: string[] = [];
    if (choices.subclass && (p.choices ?? []).some(c => c.type === 'subclass')) entries.push(`Subclass: ${choices.subclass}`);
    if (choices.feats[lvl]) entries.push(`Feat: ${choices.feats[lvl]}`);
    if (choices.asiChoices[lvl]) {
      const a = choices.asiChoices[lvl];
      entries.push(`ASI: +${a.amount} ${a.ability.slice(0,3).toUpperCase()}${a.ability2 ? ` / +${a.amount2} ${a.ability2.slice(0,3).toUpperCase()}` : ''}`);
    }
    if (choices.fightingStyle && (p.choices ?? []).some(c => c.type === 'fighting_style')) entries.push(`Style: ${choices.fightingStyle}`);
    if (choices.divineOrder && (p.choices ?? []).some(c => c.type === 'divine_order')) entries.push(`Order: ${choices.divineOrder}`);
    if (choices.primalOrder && (p.choices ?? []).some(c => c.type === 'primal_order')) entries.push(`Order: ${choices.primalOrder}`);
    const invAtLevel = choices.invocationsByLevel?.[lvl] ?? [];
    if (invAtLevel.length) entries.push(`Invocations: ${invAtLevel.join(', ')}`);
    const mmAtLevel = choices.metamagicByLevel?.[lvl] ?? [];
    if (mmAtLevel.length) entries.push(`Metamagic: ${mmAtLevel.join(', ')}`);
    const isComplete = (p.choices ?? []).length === 0 || !(p.choices ?? []).some(c => isChoiceIncomplete(c.type, lvl, choices));
    const hasRequired = (p.choices ?? []).some(c => ['subclass','asi','fighting_style','divine_order','primal_order'].includes(c.type));
    const isMissing = hasRequired && (p.choices ?? []).some(c => ['subclass','asi','fighting_style','divine_order','primal_order'].includes(c.type) && isChoiceIncomplete(c.type, lvl, choices));
    return { lvl, entries, isComplete, isMissing, hasChoices: (p.choices ?? []).length > 0 };
  });

  const totalIncomplete = summary.filter(s => s.isMissing).length;

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

      {/* ── LEFT: Level wizard ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

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
        <div style={{ border: '1px solid var(--c-border-m)', borderRadius: 12, background: 'var(--c-card)', overflow: 'hidden' }}>
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
                  {prog.subclassFeature && currentLevel > (cls.subclasses[0]?.unlock_level ?? 3) && choices.subclass && (
                    <div style={{ fontSize: 13, color: '#a78bfa', lineHeight: 1.5, display: 'flex', gap: 8 }}>
                      <span style={{ flexShrink: 0 }}>+</span>
                      <span>{choices.subclass} class feature</span>
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

        {/* Prev / Next navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setCurrentLevel(v => Math.max(1, v - 1))}
            disabled={currentLevel <= 1}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 20px', borderRadius: 8, cursor: currentLevel <= 1 ? 'not-allowed' : 'pointer', minHeight: 0,
              border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: currentLevel <= 1 ? 'var(--t-3)' : 'var(--t-1)',
              opacity: currentLevel <= 1 ? 0.4 : 1 }}
          >
            ← Level {currentLevel - 1}
          </button>

          <span style={{ fontSize: 12, color: 'var(--t-3)' }}>{currentLevel} / {level}</span>

          {currentLevel < level ? (
            <button
              onClick={() => setCurrentLevel(v => Math.min(level, v + 1))}
              style={{ fontSize: 13, fontWeight: 700, padding: '8px 20px', borderRadius: 8, cursor: 'pointer', minHeight: 0,
                border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)' }}
            >
              Level {currentLevel + 1} →
            </button>
          ) : (
            <div style={{ width: 120 }} />
          )}
        </div>
      </div>

      {/* ── RIGHT: Choices summary ── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, position: 'sticky', top: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--t-3)', marginBottom: 4 }}>
          All Choices
        </div>
        {summary.map(({ lvl, entries, isComplete, isMissing, hasChoices }) => (
          <button key={lvl} onClick={() => setCurrentLevel(lvl)} style={{
            textAlign: 'left', background: lvl === currentLevel ? 'rgba(212,160,23,0.08)' : 'var(--c-card)',
            border: `1px solid ${lvl === currentLevel ? 'var(--c-gold-bdr)' : isMissing ? 'rgba(220,38,38,0.3)' : isComplete && hasChoices ? 'rgba(5,150,105,0.25)' : 'var(--c-border)'}`,
            borderRadius: 8, padding: '7px 10px', cursor: 'pointer', width: '100%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: entries.length > 0 ? 4 : 0 }}>
              <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 11,
                color: lvl === currentLevel ? 'var(--c-gold-l)' : isMissing ? 'var(--c-red-l)' : isComplete && hasChoices ? 'var(--c-green-l)' : 'var(--t-3)' }}>
                Lv {lvl}
              </span>
              {isMissing && <span style={{ fontSize: 9, color: 'var(--c-red-l)' }}>●</span>}
              {isComplete && hasChoices && !isMissing && <span style={{ fontSize: 9, color: 'var(--c-green-l)' }}>✓</span>}
            </div>
            {entries.map((e, i) => (
              <div key={i} style={{ fontSize: 10, color: 'var(--t-2)', lineHeight: 1.4 }}>{e}</div>
            ))}
            {entries.length === 0 && hasChoices && (
              <div style={{ fontSize: 10, color: 'var(--t-3)', fontStyle: 'italic' }}>Pending…</div>
            )}
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
    return (
      <div>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {cls?.subclasses.map(sc => (
            <button key={sc.name} onClick={() => onUpdate({ subclass: sc.name })}
              style={{ textAlign: 'left', padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-lg)', cursor: 'pointer',
                border: choices.subclass === sc.name ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                background: choices.subclass === sc.name ? 'var(--c-gold-bg)' : 'var(--c-raised)' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: choices.subclass === sc.name ? 'var(--c-gold-l)' : 'var(--t-1)', marginBottom: 4 }}>
                {choices.subclass === sc.name ? '✓ ' : ''}{sc.name}
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {sc.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
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

// ── ASI / Feat picker ───────────────────────────────────────────────
function ASIFeatPicker({ label, level, choices, onUpdate }: {
  label: string; level: number;
  choices: BuildChoices; onUpdate: (p: Partial<BuildChoices>) => void;
}) {
  const [mode, setMode] = useState<'asi' | 'feat'>(!choices.feats[level] ? 'asi' : 'feat');
  const asi = choices.asiChoices[level];
  const feat = choices.feats[level];
  const totalBoost = asi ? asi.amount + (asi.amount2 ?? 0) : 0;

  function handleASIClick(ab: string, amt: number) {
    const current = choices.asiChoices[level];

    if (amt === 2) {
      // +2 to one ability — clear any split and set this one
      onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: ab, amount: 2 } } });
      return;
    }

    // amt === 1 cases
    if (!current) {
      // Nothing selected yet — set first +1
      onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: ab, amount: 1 } } });
      return;
    }

    if (current.ability === ab) {
      if (current.amount === 2) {
        // Was +2, downgrade to +1
        onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: ab, amount: 1 } } });
      } else {
        // Was +1 main, deselect main
        if (current.ability2) {
          // Promote ability2 to main
          onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: current.ability2, amount: 1 } } });
        } else {
          const { [level]: _, ...rest } = choices.asiChoices;
          onUpdate({ asiChoices: rest });
        }
      }
      return;
    }

    if (current.ability2 === ab) {
      // Deselect the second ability — keep first
      onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: current.ability, amount: current.amount } } });
      return;
    }

    // New ability — if we have room (totalBoost < 2), add as +1 split
    if (totalBoost < 2) {
      if (current.amount === 1 && !current.ability2) {
        // Add second +1
        onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: current.ability, amount: 1, ability2: ab, amount2: 1 } } });
      } else {
        // Replace with new single +1
        onUpdate({ asiChoices: { ...choices.asiChoices, [level]: { ability: ab, amount: 1 } } });
      }
    }
  }

  return (
    <div>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-3)' }}>
        {(['asi', 'feat'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{ fontSize: 'var(--fs-sm)', padding: '5px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', minHeight: 0,
            border: mode === m ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
            background: mode === m ? 'var(--c-gold-bg)' : 'var(--c-raised)',
            color: mode === m ? 'var(--c-gold-l)' : 'var(--t-2)', fontWeight: mode === m ? 600 : 400 }}>
            {m === 'asi' ? '+2 Ability Score' : 'Take a Feat'}
          </button>
        ))}
      </div>

      {mode === 'asi' && (
        <div>
          <div style={{ fontSize: 11, color: totalBoost === 2 ? 'var(--hp-full)' : 'var(--t-3)', marginBottom: 8, fontWeight: 600 }}>
            {totalBoost === 2 ? '✓ Points allocated' : `${2 - totalBoost} point${2 - totalBoost !== 1 ? 's' : ''} remaining — +2 one ability or +1 to two`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {ABILITIES.map(ab => {
              const isMain = asi?.ability === ab;
              const isSub = asi?.ability2 === ab;
              const isSel = isMain || isSub;
              const boost = isMain ? (asi?.amount ?? 0) : isSub ? (asi?.amount2 ?? 0) : 0;
              return (
                <div key={ab} style={{ padding: '8px 10px', borderRadius: 'var(--r-md)', border: `1px solid ${isSel ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`, background: isSel ? 'var(--c-gold-bg)' : 'var(--c-raised)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isSel ? 'var(--c-gold-l)' : 'var(--t-2)', letterSpacing: '0.06em' }}>{ABILITY_ABBREV[ab]}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {isSel && <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 800, color: 'var(--c-gold-l)', marginRight: 2 }}>+{boost}</span>}
                    {[1, 2].map(amt => {
                      const active = isMain && asi!.amount >= amt;
                      const active2 = isSub && amt === 1;
                      return (
                        <button key={amt} onClick={() => handleASIClick(ab, amt)}
                          style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 800, minHeight: 0,
                            background: active || active2 ? 'var(--c-gold)' : 'var(--c-card)',
                            color: active || active2 ? '#0d0900' : 'var(--t-3)',
                            outline: active || active2 ? 'none' : '1px solid var(--c-border-m)',
                          }}>
                          +{amt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'feat' && (
        <FeatPicker
          selected={feat ?? null}
          onSelect={featName => {
            const newFeats = { ...choices.feats };
            if (featName) newFeats[level] = featName;
            else delete newFeats[level];
            onUpdate({ feats: newFeats });
          }}
        />
      )}
    </div>
  );
}
