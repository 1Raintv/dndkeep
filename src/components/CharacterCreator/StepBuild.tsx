import { useState, useMemo } from 'react';
import { CLASS_MAP } from '../../data/classes';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';
import { SPELLS } from '../../data/spells';
import { FEATS } from '../../data/feats';
import {
  METAMAGIC_OPTIONS, FIGHTING_STYLE_OPTIONS, WARLOCK_INVOCATIONS,
  EXPERTISE_SKILLS, DIVINE_ORDERS, PRIMAL_ORDERS,
} from '../../data/choiceOptions';

export interface BuildChoices {
  subclass: string;
  spells: string[];       // spell IDs
  cantrips: string[];     // cantrip IDs
  metamagic: string[];    // metamagic IDs
  invocations: string[];  // invocation IDs
  fightingStyle: string;
  expertise: string[];    // skill names
  feats: Record<number, string>;  // level -> feat name
  asiChoices: Record<number, { ability: string; amount: number; ability2?: string; amount2?: number }>;
  divineOrder: string;
  primalOrder: string;
}

export const emptyBuildChoices = (): BuildChoices => ({
  subclass: '', spells: [], cantrips: [], metamagic: [], invocations: [],
  fightingStyle: '', expertise: [], feats: {}, asiChoices: {},
  divineOrder: '', primalOrder: '',
});

interface StepBuildProps {
  className: string;
  level: number;
  choices: BuildChoices;
  onChoicesChange: (c: BuildChoices) => void;
}

const SPELL_ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
const ABILITY_ABBREV: Record<string, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

export default function StepBuild({ className, level, choices, onChoicesChange }: StepBuildProps) {
  const cls = CLASS_MAP[className];
  const progression = CLASS_LEVEL_PROGRESSION[className] ?? [];
  const [openLevel, setOpenLevel] = useState<number>(1); // auto-opens level 1

  // Get all levels up to current
  const levelsToShow = useMemo(() =>
    Array.from({ length: level }, (_, i) => i + 1)
      .map(lvl => ({
        lvl,
        prog: progression.find(p => p.level === lvl) ?? { level: lvl, features: [], choices: [] },
      })),
  [level, progression]);

  function update(patch: Partial<BuildChoices>) {
    onChoicesChange({ ...choices, ...patch });
  }

  // Count how many choices still need to be made
  const incomplete = levelsToShow.filter(({ prog }) => {
    const c = prog.choices ?? [];
    return c.some(ch => {
      if (ch.type === 'subclass') return !choices.subclass;
      if (ch.type === 'cantrips') return countNeeded(ch.label, 'cantrip', choices.cantrips) > 0;
      if (ch.type === 'spells') return countNeeded(ch.label, 'spell', choices.spells) > 0;
      if (ch.type === 'metamagic') return countNeeded(ch.label, 'metamagic', choices.metamagic) > 0;
      if (ch.type === 'invocations') return countNeeded(ch.label, 'invocation', choices.invocations) > 0;
      if (ch.type === 'fighting_style') return !choices.fightingStyle;
      if (ch.type === 'asi') return !choices.asiChoices[prog.level] && !choices.feats[prog.level];
      if (ch.type === 'divine_order') return !choices.divineOrder;
      if (ch.type === 'primal_order') return !choices.primalOrder;
      return false;
    });
  }).length;

  if (!cls) return <div style={{ color: 'var(--t-2)', padding: 'var(--sp-4)' }}>Select a class first.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--t-1)' }}>
            Build Your {className}
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginTop: 2 }}>
            Make choices for each level from 1 to {level}. Click a level to expand it.
          </div>
        </div>
        {incomplete > 0 ? (
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-red-l)', background: 'var(--c-red-bg)', border: '1px solid rgba(220,38,38,0.3)', padding: '3px 10px', borderRadius: 999 }}>
            {incomplete} level{incomplete !== 1 ? 's' : ''} need choices
          </span>
        ) : (
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-green-l)', background: 'var(--c-green-bg)', border: '1px solid rgba(5,150,105,0.3)', padding: '3px 10px', borderRadius: 999 }}>
            ✓ All choices made
          </span>
        )}
      </div>

      {levelsToShow.map(({ lvl, prog }) => {
        const choiceItems = prog.choices ?? [];
        const hasChoices = choiceItems.length > 0;
        const hasFeatures = (prog.features ?? []).length > 0 || prog.subclassFeature || prog.newSpellLevel;
        const isOpen = openLevel === lvl;
        // Only mark complete if ALL required choices are made
        const requiredChoiceTypes = ['subclass', 'asi', 'fighting_style', 'divine_order', 'primal_order'];
        const hasRequiredChoices = choiceItems.some(ch => requiredChoiceTypes.includes(ch.type));
        const isComplete = hasChoices && !choiceItems.some(ch => isChoiceIncomplete(ch.type, lvl, choices));
        const isMissing = hasChoices && hasRequiredChoices && choiceItems.some(ch => requiredChoiceTypes.includes(ch.type) && isChoiceIncomplete(ch.type, lvl, choices));

        return (
          <div key={lvl} style={{
            border: `1px solid ${isMissing ? 'rgba(220,38,38,0.35)' : isComplete ? 'rgba(5,150,105,0.3)' : 'var(--c-border-m)'}`,
            borderRadius: 'var(--r-lg)',
            background: isMissing ? 'rgba(220,38,38,0.03)' : 'var(--c-card)',
            overflow: 'hidden',
          }}>
            {/* Level header */}
            <button
              onClick={() => setOpenLevel(isOpen ? -1 : lvl)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                padding: 'var(--sp-2) var(--sp-3)', background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left', minHeight: 0,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 'var(--fs-xs)', fontWeight: 700, flexShrink: 0,
                background: isMissing ? 'var(--c-red-bg)' : isComplete ? 'var(--c-green-bg)' : 'var(--c-raised)',
                color: isMissing ? 'var(--c-red-l)' : isComplete ? 'var(--c-green-l)' : 'var(--t-2)',
                border: `1.5px solid ${isMissing ? 'rgba(220,38,38,0.4)' : isComplete ? 'rgba(5,150,105,0.4)' : 'var(--c-border-m)'}`,
              }}>{lvl}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Show summary of features */}
                  {(prog.features ?? []).slice(0, 2).map((f, i) => (
                    <span key={i} style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{i > 0 && '· '}{f.split('(')[0].trim()}</span>
                  ))}
                  {(prog.features ?? []).length > 2 && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>+{(prog.features ?? []).length - 2} more</span>}
                  {prog.newSpellLevel && <span style={{ fontSize: 9, fontWeight: 700, color: '#fcd34d', background: 'rgba(251,191,36,0.1)', padding: '1px 6px', borderRadius: 999 }}>{SPELL_ORDINAL[prog.newSpellLevel]}-level spells</span>}
                  {prog.subclassFeature && lvl > (cls.subclasses[0]?.unlock_level ?? 3) && choices.subclass && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--c-purple-l)', background: 'var(--c-purple-bg)', padding: '1px 6px', borderRadius: 999 }}>{choices.subclass} feature</span>
                  )}
                </div>
                {/* Show choice labels */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                  {choiceItems.filter(ch => ch.type !== 'cantrips' && ch.type !== 'spells').map((ch, i) => {
                    const done = !isChoiceIncomplete(ch.type, lvl, choices);
                    return (
                      <span key={i} style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                        color: done ? 'var(--c-green-l)' : 'var(--c-amber-l)',
                        background: done ? 'var(--c-green-bg)' : 'var(--c-amber-bg)',
                        border: `1px solid ${done ? 'rgba(5,150,105,0.3)' : 'rgba(217,119,6,0.3)'}` }}>
                        {done ? '✓ ' : ''}{ch.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              <span style={{ color: 'var(--t-3)', fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }}>▶</span>
            </button>

            {/* Expanded choice panel */}
            {isOpen && (
              <div className="animate-fade-in" style={{ borderTop: '1px solid var(--c-border)', padding: 'var(--sp-3) var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
                {/* All features at this level */}
                {(prog.features ?? []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Features Gained</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {prog.features.map((f, i) => (
                        <div key={i} style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.5 }}>• {f}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Render each choice */}
                {choiceItems.map((ch, i) => (
                  <ChoicePanel
                    key={i}
                    type={ch.type}
                    label={ch.label}
                    level={lvl}
                    className={className}
                    choices={choices}
                    onUpdate={update}
                    maxSpellLevel={prog.newSpellLevel ?? getMaxSpellLevel(lvl, cls.spellcaster_type ?? 'full')}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
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
    // Spells are added from the character sheet after creation
    return (
      <div style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--c-raised)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontStyle: 'italic' }}>
        {label} — you'll add spells from your character sheet after creation.
      </div>
    );
  }

  if (type === 'metamagic') {
    return <MultiPicker label={label} options={METAMAGIC_OPTIONS.map(m => ({ id: m.id, name: m.name, desc: m.description }))}
      selected={choices.metamagic} onToggle={id => {
        const next = choices.metamagic.includes(id) ? choices.metamagic.filter(x => x !== id) : [...choices.metamagic, id];
        onUpdate({ metamagic: next });
      }} />;
  }

  if (type === 'invocations') {
    return <MultiPicker label={label} options={WARLOCK_INVOCATIONS.map(i => ({ id: i.id, name: i.name, desc: i.description, badge: i.prereq ?? undefined }))}
      selected={choices.invocations} onToggle={id => {
        const next = choices.invocations.includes(id) ? choices.invocations.filter(x => x !== id) : [...choices.invocations, id];
        onUpdate({ invocations: next });
      }} />;
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
    return <ASIFeatPicker label={label} level={level} choices={choices} onUpdate={onUpdate} />;
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

// ── Spell Picker ────────────────────────────────────────────────────
function SpellPicker({ label, type, className, choices, onUpdate, maxLevel }: {
  label: string; type: string; className: string;
  choices: BuildChoices; onUpdate: (p: Partial<BuildChoices>) => void; maxLevel: number;
}) {
  const [search, setSearch] = useState('');
  const [filterLvl, setFilterLvl] = useState<number | 'all'>('all');
  const isCantrip = type === 'cantrips';
  const selected = isCantrip ? choices.cantrips : choices.spells;

  const available = useMemo(() => SPELLS.filter(s => {
    if (!s.classes.includes(className)) return false;
    if (isCantrip ? s.level !== 0 : s.level === 0) return false;
    if (!isCantrip && s.level > maxLevel) return false;
    if (filterLvl !== 'all' && s.level !== filterLvl) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [className, isCantrip, maxLevel, filterLvl, search]);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    onUpdate(isCantrip ? { cantrips: next } : { spells: next });
  }

  const levelOptions = isCantrip ? [0] : Array.from({ length: maxLevel }, (_, i) => i + 1);

  return (
    <div>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>
        {label} <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontWeight: 400 }}>— {selected.length} selected</span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search spells…" style={{ fontSize: 'var(--fs-xs)', flex: 1, minWidth: 120 }} />
        {!isCantrip && (
          <div style={{ display: 'flex', gap: 3 }}>
            <button onClick={() => setFilterLvl('all')} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, minHeight: 0, cursor: 'pointer',
              border: filterLvl === 'all' ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)',
              background: filterLvl === 'all' ? 'var(--c-gold-bg)' : 'transparent', color: filterLvl === 'all' ? 'var(--c-gold-l)' : 'var(--t-3)' }}>All</button>
            {levelOptions.map(l => (
              <button key={l} onClick={() => setFilterLvl(l)} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, minHeight: 0, cursor: 'pointer',
                border: filterLvl === l ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                background: filterLvl === l ? 'var(--c-gold-bg)' : 'transparent', color: filterLvl === l ? 'var(--c-gold-l)' : 'var(--t-3)' }}>{l}</button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 240, overflowY: 'auto' }}>
        {available.map(spell => {
          const sel = selected.includes(spell.id);
          return (
            <button key={spell.id} onClick={() => toggle(spell.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '5px var(--sp-3)', borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left', minHeight: 0,
                border: sel ? '1px solid var(--c-gold-bdr)' : '1px solid transparent',
                background: sel ? 'var(--c-gold-bg)' : 'transparent' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                background: sel ? 'var(--c-gold-l)' : 'transparent',
                border: `1.5px solid ${sel ? 'var(--c-gold)' : 'var(--c-border-m)'}` }} />
              <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: sel ? 600 : 400, color: sel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{spell.name}</span>
              <span style={{ fontSize: 9, color: 'var(--t-3)' }}>{spell.school}</span>
              {!isCantrip && <span style={{ fontSize: 9, color: 'var(--t-3)', minWidth: 16, textAlign: 'right' }}>Lv{spell.level}</span>}
            </button>
          );
        })}
        {available.length === 0 && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', padding: 'var(--sp-2)', textAlign: 'center' }}>No spells match</div>}
      </div>
    </div>
  );
}

// ── Multi-select picker ─────────────────────────────────────────────
function MultiPicker({ label, options, selected, onToggle, single }: {
  label: string; options: { id: string; name: string; desc: string; badge?: string }[];
  selected: string[]; onToggle: (id: string) => void; single?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>
        {label}
        {!single && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontWeight: 400, marginLeft: 6 }}>{selected.length} selected</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {options.map(opt => {
          const sel = selected.includes(opt.id);
          const isExp = expanded === opt.id;
          return (
            <div key={opt.id} style={{ borderRadius: 'var(--r-md)', border: sel ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)', background: sel ? 'var(--c-gold-bg)' : 'var(--c-raised)', overflow: 'hidden' }}>
              <button onClick={() => setExpanded(isExp ? null : opt.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '5px var(--sp-3)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 0 }}>
                <span style={{ fontSize: 10, color: 'var(--t-3)', transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 120ms', flexShrink: 0 }}>▶</span>
                <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: sel ? 600 : 400, color: sel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{sel ? '✓ ' : ''}{opt.name}</span>
                {opt.badge && <span style={{ fontSize: 9, color: 'var(--t-3)' }}>{opt.badge}</span>}
              </button>
              {isExp && (
                <div style={{ padding: '0 var(--sp-3) var(--sp-2) calc(var(--sp-3) + 18px)', borderTop: '1px solid var(--c-border)' }}>
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.6, margin: '6px 0' }}>{opt.desc}</p>
                  <button className={sel ? 'btn-secondary btn-sm' : 'btn-gold btn-sm'}
                    onClick={() => { onToggle(opt.id); setExpanded(null); }}>
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
  const [featSearch, setFeatSearch] = useState('');
  const [expandedFeat, setExpandedFeat] = useState<string | null>(null);
  const generalFeats = FEATS.filter(f => f.category === 'general' && (!featSearch || f.name.toLowerCase().includes(featSearch.toLowerCase())));
  const asi = choices.asiChoices[level];
  const feat = choices.feats[level];

  const totalBoost = asi ? asi.amount + (asi.amount2 ?? 0) : 0;

  function setASI(ability: string, amount: number, ability2?: string) {
    const next = { ability, amount, ...(ability2 ? { ability2, amount2: 2 - amount } : {}) };
    onUpdate({ asiChoices: { ...choices.asiChoices, [level]: next } });
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
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginBottom: 8 }}>+2 to one ability, or +1 to two different abilities. {totalBoost > 0 && `(${totalBoost}/2 points used)`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {ABILITIES.map(ab => {
              const isMain = asi?.ability === ab;
              const isSub = asi?.ability2 === ab;
              const isSel = isMain || isSub;
              return (
                <div key={ab} style={{ padding: '6px 8px', borderRadius: 'var(--r-md)', border: `1px solid ${isSel ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}`, background: isSel ? 'var(--c-gold-bg)' : 'var(--c-raised)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: isSel ? 'var(--c-gold-l)' : 'var(--t-2)' }}>{ABILITY_ABBREV[ab]}</span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[1, 2].map(amt => (
                      <button key={amt} onClick={() => {
                        if (amt === 2) { setASI(ab, 2); }
                        else if (isMain && asi.amount === 1) {
                          // Already +1 main, click again to deselect
                          const { [level]: _, ...rest } = choices.asiChoices;
                          onUpdate({ asiChoices: rest });
                        } else { setASI(ab, 1, undefined); }
                      }}
                        style={{ width: 20, height: 20, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, minHeight: 0,
                          background: (isMain && asi.amount >= amt) ? 'var(--c-gold)' : (isSub && amt === 1) ? 'var(--c-gold)' : 'var(--c-raised)',
                          color: (isMain && asi.amount >= amt) || (isSub && amt === 1) ? '#0d0900' : 'var(--t-3)' }}>
                        +{amt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'feat' && (
        <div>
          {feat && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-green-l)', marginBottom: 8, fontWeight: 600 }}>✓ Selected: {feat}</div>}
          <input value={featSearch} onChange={e => setFeatSearch(e.target.value)} placeholder="Search feats…" style={{ fontSize: 'var(--fs-xs)', marginBottom: 8 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
            {generalFeats.map(f => {
              const sel = feat === f.name;
              const isExp = expandedFeat === f.name;
              return (
                <div key={f.name} style={{ borderRadius: 'var(--r-sm)', border: sel ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)', background: sel ? 'var(--c-gold-bg)' : 'var(--c-raised)', overflow: 'hidden' }}>
                  <button onClick={() => setExpandedFeat(isExp ? null : f.name)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 0 }}>
                    <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExp ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>▶</span>
                    <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: sel ? 600 : 400, color: sel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{sel ? '✓ ' : ''}{f.name}</span>
                    {f.prerequisite && <span style={{ fontSize: 9, color: 'var(--t-3)' }}>{f.prerequisite}</span>}
                  </button>
                  {isExp && (
                    <div style={{ padding: '0 8px 8px 22px', borderTop: '1px solid var(--c-border)' }}>
                      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5, margin: '5px 0' }}>{f.description}</p>
                      <button className={sel ? 'btn-secondary btn-sm' : 'btn-gold btn-sm'}
                        onClick={() => {
                          const newFeats = { ...choices.feats, [level]: sel ? '' : f.name };
                          if (sel) delete newFeats[level];
                          onUpdate({ feats: newFeats });
                          setExpandedFeat(null);
                        }}>
                        {sel ? 'Remove' : 'Select this feat'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
