import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { rollDie, abilityModifier } from '../../lib/gameUtils';
import { SKILLS } from '../../data/skills';

interface QuickRollProps {
  character: Character;
  computed: ComputedStats;
}

interface RollResult {
  label: string;
  dice: number;
  modifier: number;
  total: number;
  natural: number;
  timestamp: number;
}

const ABILITY_LABELS: { key: keyof Character; short: string; label: string }[] = [
  { key: 'strength',     short: 'STR', label: 'Strength Check' },
  { key: 'dexterity',    short: 'DEX', label: 'Dexterity Check' },
  { key: 'constitution', short: 'CON', label: 'Constitution Check' },
  { key: 'intelligence', short: 'INT', label: 'Intelligence Check' },
  { key: 'wisdom',       short: 'WIS', label: 'Wisdom Check' },
  { key: 'charisma',     short: 'CHA', label: 'Charisma Check' },
];

export default function QuickRoll({ character, computed }: QuickRollProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<RollResult[]>([]);
  const [activeSection, setActiveSection] = useState<'abilities' | 'saves' | 'skills'>('abilities');

  function roll(label: string, modifier: number) {
    const natural = rollDie(20);
    const total = natural + modifier;
    const result: RollResult = { label, dice: 20, modifier, total, natural, timestamp: Date.now() };
    setResults(prev => [result, ...prev].slice(0, 5));
  }

  function modStr(mod: number) {
    return (mod >= 0 ? '+' : '') + mod;
  }

  function getResultColor(natural: number) {
    if (natural === 20) return 'var(--color-gold-bright)';
    if (natural === 1) return 'var(--color-crimson-bright)';
    return 'var(--text-primary)';
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Quick Roll — roll ability checks, saves, and skills"
        style={{
          position: 'fixed',
          bottom: 'var(--space-10)',
          right: 'var(--space-4)',
          zIndex: 90,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: open
            ? 'linear-gradient(160deg, var(--color-crimson) 0%, var(--color-blood) 100%)'
            : 'linear-gradient(160deg, var(--color-gold-dim) 0%, var(--color-gold) 100%)',
          border: `2px solid ${open ? 'var(--color-crimson-bright)' : 'var(--color-gold-bright)'}`,
          boxShadow: open ? 'var(--shadow-crimson)' : 'var(--shadow-gold), 0 4px 12px rgba(0,0,0,0.5)',
          fontSize: 22,
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? '✕' : '🎲'}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="animate-fade-in"
          style={{
            position: 'fixed',
            bottom: 70,
            right: 'var(--space-4)',
            zIndex: 89,
            width: 320,
            maxHeight: '70vh',
            background: 'linear-gradient(160deg, var(--color-charcoal) 0%, var(--color-obsidian) 100%)',
            border: '1px solid var(--border-gold)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg), var(--shadow-gold)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-gold)' }}>
              Quick Roll — {character.name}
            </span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Prof +{computed.proficiency_bonus}
            </span>
          </div>

          {/* Last results */}
          {results.length > 0 && (
            <div style={{ padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
              {results.slice(0, 3).map((r, i) => (
                <div key={r.timestamp} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  opacity: 1 - i * 0.25,
                  padding: '2px 0',
                }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {r.label}
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)' }}>
                      d20={r.natural} {r.modifier >= 0 ? '+' : ''}{r.modifier}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)',
                      color: getResultColor(r.natural),
                      textShadow: r.natural === 20 ? '0 0 8px rgba(201,146,42,0.8)' : r.natural === 1 ? '0 0 8px rgba(220,38,38,0.6)' : 'none',
                    }}>
                      {r.natural === 20 ? '⭐ ' : r.natural === 1 ? '💀 ' : ''}{r.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
            {(['abilities', 'saves', 'skills'] as const).map(s => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                style={{
                  flex: 1, padding: 'var(--space-2)',
                  fontFamily: 'var(--font-heading)', fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: 'transparent', border: 'none',
                  borderBottom: activeSection === s ? '2px solid var(--color-gold)' : '2px solid transparent',
                  color: activeSection === s ? 'var(--text-gold)' : 'var(--text-muted)',
                  cursor: 'pointer', marginBottom: -1,
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Roll buttons */}
          <div style={{ overflowY: 'auto', padding: 'var(--space-3)' }}>
            {activeSection === 'abilities' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {ABILITY_LABELS.map(({ key, short, label }) => {
                  const score = character[key] as number;
                  const mod = abilityModifier(score);
                  return (
                    <button
                      key={key}
                      onClick={() => roll(label, mod)}
                      className="btn-secondary btn-sm"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) var(--space-3)' }}
                    >
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>{short}</span>
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-gold)' }}>{modStr(mod)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeSection === 'saves' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {ABILITY_LABELS.map(({ key, short }) => {
                  const score = character[key] as number;
                  const baseMod = abilityModifier(score);
                  const abilityName = key as string;
                  const isProficient = character.saving_throw_proficiencies.includes(abilityName as never);
                  const mod = baseMod + (isProficient ? computed.proficiency_bonus : 0);
                  return (
                    <button
                      key={key}
                      onClick={() => roll(`${short} Save`, mod)}
                      className="btn-secondary btn-sm"
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: 'var(--space-2) var(--space-3)',
                        borderColor: isProficient ? 'var(--border-gold)' : undefined,
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                        {isProficient && <span style={{ color: 'var(--color-gold)' }}>◆ </span>}
                        {short}
                      </span>
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-gold)' }}>{modStr(mod)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeSection === 'skills' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {SKILLS.map(skill => {
                  const abilityScore = character[skill.ability as keyof Character] as number;
                  const baseMod = abilityModifier(abilityScore);
                  const isProf = character.skill_proficiencies.includes(skill.name);
                  const isExpert = character.skill_expertises?.includes(skill.name);
                  const profBonus = isExpert ? computed.proficiency_bonus * 2 : isProf ? computed.proficiency_bonus : 0;
                  const mod = baseMod + profBonus;
                  return (
                    <button
                      key={skill.name}
                      onClick={() => roll(skill.name, mod)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '4px var(--space-3)',
                        borderRadius: 'var(--radius-sm)',
                        border: isProf ? '1px solid var(--border-gold)' : '1px solid transparent',
                        background: 'transparent', cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-raised)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: isProf ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {isExpert ? '◆◆ ' : isProf ? '◆ ' : ''}{skill.name}
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({skill.ability.slice(0, 3).toUpperCase()})</span>
                      </span>
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-gold)' }}>
                        {modStr(mod)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
