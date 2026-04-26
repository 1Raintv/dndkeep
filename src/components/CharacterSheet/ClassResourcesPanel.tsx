import type { Character } from '../../types';
import { getCharacterResources, RECOVERY_LABELS, type ClassResourceDef } from '../../data/classResources';

interface ClassResourcesPanelProps {
  character: Character;
  onUpdate: (resources: Record<string, number>) => void;
}

const RECOVERY_COLORS = {
  short: 'var(--c-amber-l)',
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
      <div style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-4)', textAlign: 'center' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {(['short', 'long', 'day'] as const).map(recoveryType => {
        const group = grouped[recoveryType];
        if (!group?.length) return null;
        return (
          <div key={recoveryType}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              marginBottom: 'var(--sp-2)',
            }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: RECOVERY_COLORS[recoveryType] }}>
                {RECOVERY_LABELS[recoveryType]} Recovery
              </div>
              <div style={{ flex: 1, height: 1, background: `${RECOVERY_COLORS[recoveryType]}30` }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {group.map(r => {
                const max = getMax(r);
                const cur = getCurrent(r);
                const isUnlimited = max === 999;
                const isToggle = max === 1 && r.id !== 'lay-on-hands';
                const color = RECOVERY_COLORS[r.recovery];
                const depleted = !isUnlimited && cur <= 0;

                return (
                  <div key={r.id} style={{
                    padding: 'var(--sp-3) var(--sp-4)',
                    borderRadius: 'var(--r-md)',
                    border: `1px solid ${depleted ? 'var(--c-border)' : color}40`,
                    background: depleted ? '#080d14' : `${color}08`,
                    opacity: depleted ? 0.65 : 1,
                    transition: 'all var(--tr-fast)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)' }}>
                      {/* Icon + name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 2 }}>
                          <span style={{ fontSize: 16, lineHeight: 1 }}>{r.emoji}</span>
                          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: depleted ? 'var(--t-2)' : 'var(--t-1)' }}>
                            {r.name}
                          </span>
                        </div>
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5, margin: 0 }}>
                          {r.description}
                        </p>
                      </div>

                      {/* Controls */}
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--sp-1)' }}>
                        {isUnlimited ? (
                          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color }}>
                            {isUnlimited && max !== 999 ? max : '∞'}
                          </span>
                        ) : isToggle ? (
                          /* Toggle button */
                          <button
                            onClick={() => toggle(r)}
                            style={{
                              fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)',
                              padding: 'var(--sp-1) var(--sp-3)', borderRadius: 'var(--r-sm)',
                              border: `1px solid ${cur > 0 ? color : 'var(--c-border)'}`,
                              background: cur > 0 ? `${color}20` : 'transparent',
                              color: cur > 0 ? color : 'var(--t-2)',
                              cursor: 'pointer', transition: 'all var(--tr-fast)',
                            }}
                          >
                            {cur > 0 ? 'Available' : 'Used'}
                          </button>
                        ) : (
                          /* Pool counter — pips for any pool up to the
                             max single Psion PED count (12). v2.264.0:
                             previously capped at 6 pips and switched to
                             a +/- number stepper above that, but the
                             stepper looked out of place next to the
                             other resource rows and the user feedback
                             called it out. Pips scale fine up to 12;
                             we just wrap into 2 rows once it gets
                             past 8 so the panel doesn't grow too wide. */
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <div style={{
                              display: 'flex',
                              gap: 3,
                              flexWrap: 'wrap' as const,
                              justifyContent: 'flex-end',
                              maxWidth: max > 8 ? 8 * 14 + 7 * 3 : undefined, // 8 pips per row
                            }}>
                              {Array.from({ length: max }).map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    // Click pip to toggle: clicking a
                                    // filled pip empties down to its
                                    // index; clicking an empty pip
                                    // fills up to its position.
                                    const filled = i < cur;
                                    if (filled) onUpdate({ ...current, [r.id]: i });
                                    else onUpdate({ ...current, [r.id]: i + 1 });
                                  }}
                                  style={{
                                    width: 14, height: 14, borderRadius: '50%',
                                    border: `2px solid ${color}`,
                                    background: i < cur ? color : 'transparent',
                                    cursor: 'pointer', padding: 0,
                                    transition: 'all var(--tr-fast)',
                                  }}
                                />
                              ))}
                            </div>

                            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>
                              {cur} of {max} remaining
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
