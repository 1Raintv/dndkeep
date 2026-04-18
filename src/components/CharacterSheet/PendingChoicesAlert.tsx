import { useState } from 'react';
import type { Character } from '../../types';
import { PSION_DISCIPLINES, getDisciplineCount } from '../../data/psionDisciplines';

interface Props {
  character: Character;
  onUpdate: (u: Partial<Character>) => void;
}

export default function PendingChoicesAlert({ character, onUpdate }: Props) {
  const [showDisciplinePicker, setShowDisciplinePicker] = useState(false);
  const [discSearch, setDiscSearch] = useState('');
  const [expandedDisc, setExpandedDisc] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const level = character.level;
  const className = character.class_name;

  // ── PSION DISCIPLINE TRACKING ─────────────────────────────────────────────
  // NOTE: This component only handles discipline choices now. Cantrip/spell
  // pending prompts live in SpellCompletionBanner, which reads from the
  // canonical spellLimits helpers and works for all spellcaster classes —
  // having the Psion-specific duplicate here caused double-prompts.
  const currentDisciplines: string[] = Array.isArray(
    (character.class_resources as Record<string, unknown>)?.['psion-disciplines']
  )
    ? ((character.class_resources as Record<string, string[]>)['psion-disciplines'])
    : [];

  const expectedDisciplines = className === 'Psion' && level >= 2
    ? getDisciplineCount(level)
    : 0;
  const missingDisciplines = Math.max(0, expectedDisciplines - currentDisciplines.length);

  const hasAlerts = missingDisciplines > 0;
  if (!hasAlerts) return null;

  // Discipline picker helpers — keep selected disciplines in the list so
  // users can unselect an accidentally-picked one without hunting. Picked
  // ones render grayed out with a Remove button instead of Choose.
  const filteredDiscs = PSION_DISCIPLINES.filter(d =>
    discSearch === '' ||
    d.name.toLowerCase().includes(discSearch.toLowerCase()) ||
    d.description.toLowerCase().includes(discSearch.toLowerCase())
  );

  function selectDiscipline(name: string) {
    const next = [...currentDisciplines, name];
    onUpdate({
      class_resources: {
        ...((character.class_resources as Record<string, unknown>) ?? {}),
        'psion-disciplines': next,
      },
    });
  }

  function removeDiscipline(name: string) {
    const next = currentDisciplines.filter(d => d !== name);
    onUpdate({
      class_resources: {
        ...((character.class_resources as Record<string, unknown>) ?? {}),
        'psion-disciplines': next,
      },
    });
  }

  return (
    <div style={{
      marginBottom: 16, borderRadius: 'var(--r-lg)',
      border: '1px solid rgba(251,191,36,0.35)',
      background: 'rgba(251,191,36,0.04)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
        <span style={{ fontSize: 15 }}>📋</span>
        <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: '#fbbf24', flex: 1 }}>
          Choices needed for your character
        </span>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'transparent', border: 'none', color: 'var(--t-3)', cursor: 'pointer', fontSize: 11, padding: '2px 6px' }}
        >
          Dismiss
        </button>
      </div>

      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Discipline choice */}
        {missingDisciplines > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 12,
                color: '#ef4444', background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 999, padding: '1px 8px',
              }}>
                {currentDisciplines.length}/{expectedDisciplines}
              </span>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', flex: 1 }}>
                Psionic Disciplines — choose {missingDisciplines} more
              </span>
              <button
                onClick={() => setShowDisciplinePicker(p => !p)}
                style={{
                  padding: '3px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                  background: '#e879f9', border: 'none', color: '#000',
                  fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
                }}
              >
                {showDisciplinePicker ? 'Close' : 'Choose →'}
              </button>
            </div>

            {/* Current selections */}
            {currentDisciplines.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {currentDisciplines.map(name => (
                  <span key={name} style={{
                    padding: '2px 9px', borderRadius: 999,
                    background: 'rgba(232,121,249,0.12)', border: '1px solid rgba(232,121,249,0.35)',
                    fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700, color: '#e879f9',
                  }}>
                    ✓ {name}
                  </span>
                ))}
              </div>
            )}

            {/* Inline discipline picker */}
            {showDisciplinePicker && (
              <div style={{ border: '1px solid rgba(232,121,249,0.25)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-raised)' }}>
                  <input
                    type="text"
                    placeholder="Search disciplines..."
                    value={discSearch}
                    onChange={e => setDiscSearch(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', padding: '5px 8px', borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--c-border)', background: 'var(--c-card)',
                      color: 'var(--t-1)', fontFamily: 'var(--ff-body)', fontSize: 12,
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {filteredDiscs.map(disc => {
                    const isExpanded = expandedDisc === disc.id;
                    const isSelected = currentDisciplines.includes(disc.name);
                    const typeColor = disc.type === 'passive' ? '#34d399' : disc.type === 'active' ? '#fbbf24' : '#60a5fa';
                    return (
                      <div key={disc.id} style={{
                        borderBottom: '1px solid var(--c-border)',
                        // Selected rows are visibly dimmer so the user's eye
                        // skips them when scanning — but they remain fully
                        // interactive so an accidental pick can be undone.
                        background: isSelected ? 'rgba(232,121,249,0.04)' : 'transparent',
                        opacity: isSelected ? 0.65 : 1,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: isSelected ? '#e879f9' : 'var(--t-1)' }}>
                                {isSelected && '✓ '}{disc.name}
                              </span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, color: typeColor,
                                background: typeColor + '15', border: `1px solid ${typeColor}40`,
                                borderRadius: 999, padding: '1px 5px',
                              }}>
                                {disc.type === 'passive' ? '✓ PASSIVE' : disc.type === 'active' ? '⚡ ACTIVE' : '◈ BOTH'}
                              </span>
                              {disc.dieCost && (
                                <span style={{ fontSize: 9, color: '#e879f9', background: 'rgba(232,121,249,0.1)', border: '1px solid rgba(232,121,249,0.3)', borderRadius: 999, padding: '1px 5px' }}>
                                  {disc.dieCost}
                                </span>
                              )}
                            </div>
                            {!isExpanded && (
                              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4 }}>
                                {disc.description.slice(0, 85)}{disc.description.length > 85 ? '…' : ''}
                              </div>
                            )}
                            {isExpanded && (
                              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', lineHeight: 1.55, marginTop: 3 }}>
                                {disc.description}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                            {isSelected ? (
                              <button
                                onClick={() => removeDiscipline(disc.name)}
                                style={{
                                  padding: '3px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
                                  color: '#ef4444', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
                                }}
                              >
                                Remove
                              </button>
                            ) : (
                              <button
                                onClick={() => selectDiscipline(disc.name)}
                                style={{
                                  padding: '3px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                                  background: 'rgba(232,121,249,0.15)', border: '1px solid rgba(232,121,249,0.4)',
                                  color: '#e879f9', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
                                }}
                              >
                                Choose
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedDisc(isExpanded ? null : disc.id)}
                              style={{
                                padding: '2px 6px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                                background: 'transparent', border: '1px solid var(--c-border)',
                                color: 'var(--t-3)', fontFamily: 'var(--ff-body)', fontSize: 10,
                              }}
                            >
                              {isExpanded ? 'Less' : 'More'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredDiscs.length === 0 && (
                    <div style={{ padding: 12, textAlign: 'center', fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)' }}>
                      No disciplines match "{discSearch}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cantrip reminder removed — SpellCompletionBanner shows this for
            all spellcaster classes using canonical spellLimits data. */}

      </div>
    </div>
  );
}
