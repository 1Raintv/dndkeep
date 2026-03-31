import type { Character } from '../../types';
import { getCharacterResources, RECOVERY_LABELS, type ClassResourceDef } from '../../data/classResources';
import { abilityModifier } from '../../lib/gameUtils';

interface ClassResourcesPanelProps {
  character: Character;
  onUpdate: (resources: Record<string, number>) => void;
}

const RECOVERY_COLORS = {
  short: 'var(--color-amber)',
  long: '#60a5fa',
  day: '#a78bfa',
};

export default function ClassResourcesPanel({ character, onUpdate }: ClassResourcesPanelProps) {
  const abilityScores = {
    strength: character.strength,
    dexterity: character.dexterity,
    constitution: character.constitution,
    intelligence: character.intelligence,
    wisdom: character.wisdom,
    charisma: character.charisma,
  };

  const resources = getCharacterResources(character.class_name, character.level, abilityScores);
  const current = (character.class_resources ?? {}) as Record<string, number>;

  if (!resources.length) {
    return (
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', padding: 'var(--space-4)', textAlign: 'center' }}>
        No tracked resources for {character.class_name} yet.
      </div>
    );
  }

  function getCurrent(r: ClassResourceDef): number {
    const max = r.getMax(character.level, abilityScores);
    if (max === 999) return current[r.id] ?? 1; // On/off toggle
    return current[r.id] ?? max; // Default to full
  }

  function getMax(r: ClassResourceDef): number {
    return r.getMax(character.level, abilityScores);
  }

  function use(r: ClassResourceDef) {
    const max = getMax(r);
    if (max === 999) return; // Can't "use" unlimited
    const cur = getCurrent(r);
    if (cur <= 0) return;
    onUpdate({ ...current, [r.id]: cur - 1 });
  }

  function restore(r: ClassResourceDef, amount = 1) {
    const max = getMax(r);
    if (max === 999) return;
    const cur = getCurrent(r);
    onUpdate({ ...current, [r.id]: Math.min(max, cur + amount) });
  }

  function restoreAll(r: ClassResourceDef) {
    const max = getMax(r);
    if (max === 999) return;
    onUpdate({ ...current, [r.id]: max });
  }

  function toggle(r: ClassResourceDef) {
    // For "once per turn" reminders - toggle used/available
    const cur = current[r.id] ?? 1;
    onUpdate({ ...current, [r.id]: cur > 0 ? 0 : 1 });
  }

  // Group by recovery type
  const grouped: Record<string, ClassResourceDef[]> = {};
  for (const r of resources) {
    if (!grouped[r.recovery]) grouped[r.recovery] = [];
    grouped[r.recovery].push(r);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {(['short', 'long', 'day'] as const).map(recoveryType => {
        const group = grouped[recoveryType];
        if (!group?.length) return null;
        return (
          <div key={recoveryType}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              marginBottom: 'var(--space-2)',
            }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: RECOVERY_COLORS[recoveryType] }}>
                {RECOVERY_LABELS[recoveryType]} Recovery
              </div>
              <div style={{ flex: 1, height: 1, background: `${RECOVERY_COLORS[recoveryType]}30` }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {group.map(r => {
                const max = getMax(r);
                const cur = getCurrent(r);
                const isUnlimited = max === 999;
                const isToggle = max === 1 && r.id !== 'lay-on-hands';
                const isPool = !isUnlimited && !isToggle;
                const color = RECOVERY_COLORS[r.recovery];
                const depleted = !isUnlimited && cur <= 0;

                return (
                  <div key={r.id} style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${depleted ? 'var(--border-subtle)' : color}40`,
                    background: depleted ? 'var(--bg-sunken)' : `${color}08`,
                    opacity: depleted ? 0.65 : 1,
                    transition: 'all var(--transition-fast)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                      {/* Icon + name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
                          <span style={{ fontSize: 16, lineHeight: 1 }}>{r.emoji}</span>
                          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: depleted ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                            {r.name}
                          </span>
                        </div>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                          {r.description}
                        </p>
                      </div>

                      {/* Controls */}
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-1)' }}>
                        {isUnlimited ? (
                          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color }}>
                            {isUnlimited && max !== 999 ? max : '∞'}
                          </span>
                        ) : isToggle ? (
                          /* Toggle button */
                          <button
                            onClick={() => toggle(r)}
                            style={{
                              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)',
                              padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)',
                              border: `1px solid ${cur > 0 ? color : 'var(--border-subtle)'}`,
                              background: cur > 0 ? `${color}20` : 'transparent',
                              color: cur > 0 ? color : 'var(--text-muted)',
                              cursor: 'pointer', transition: 'all var(--transition-fast)',
                            }}
                          >
                            {cur > 0 ? 'Available' : 'Used'}
                          </button>
                        ) : (
                          /* Pool counter */
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            {/* Pips for small pools */}
                            {max <= 6 && (
                              <div style={{ display: 'flex', gap: 3 }}>
                                {Array.from({ length: max }).map((_, i) => (
                                  <button
                                    key={i}
                                    onClick={() => {
                                      // Click pip to toggle
                                      const filled = i < cur;
                                      if (filled) onUpdate({ ...current, [r.id]: i });
                                      else onUpdate({ ...current, [r.id]: i + 1 });
                                    }}
                                    style={{
                                      width: 14, height: 14, borderRadius: '50%',
                                      border: `2px solid ${color}`,
                                      background: i < cur ? color : 'transparent',
                                      cursor: 'pointer', padding: 0,
                                      transition: 'all var(--transition-fast)',
                                    }}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Number for large pools */}
                            {max > 6 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <button
                                  onClick={() => use(r)}
                                  disabled={cur <= 0}
                                  style={{
                                    width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-subtle)', background: 'var(--bg-raised)',
                                    cursor: cur > 0 ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700,
                                    color: cur > 0 ? 'var(--color-crimson-bright)' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >
                                  −
                                </button>
                                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-lg)', color, minWidth: 32, textAlign: 'center', lineHeight: 1 }}>
                                  {cur}
                                </span>
                                <button
                                  onClick={() => restore(r)}
                                  disabled={cur >= max}
                                  style={{
                                    width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                                    border: `1px solid ${color}50`, background: `${color}10`,
                                    cursor: cur < max ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700,
                                    color: cur < max ? color : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            )}

                            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)' }}>
                              {max > 6 ? `${cur} / ${max}` : `${cur} of ${max} remaining`}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Returns which resources recover on a short rest */
export function getShortRestResources(className: string, level: number): string[] {
  const abilityScores = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
  return getCharacterResources(className, level, abilityScores)
    .filter(r => r.recovery === 'short')
    .map(r => r.id);
}

/** Returns which resources recover on a long rest */
export function getLongRestResources(className: string, level: number): string[] {
  const abilityScores = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
  return getCharacterResources(className, level, abilityScores)
    .filter(r => r.recovery === 'long' || r.recovery === 'day')
    .map(r => r.id);
}
