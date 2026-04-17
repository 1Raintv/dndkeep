import { useState } from 'react';
import type { Character } from '../../types';
import { SPELLS } from '../../data/spells';
import { getSpellCounts } from '../../lib/spellLimits';

interface Props {
  character: Character;
  onGoToSpells: () => void;
}

// Expected cantrips per class at each level
function getExpectedCantrips(className: string, level: number): number {
  const tables: Record<string, number[]> = {
    Psion:      [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    Wizard:     [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    Sorcerer:   [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    Warlock:    [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    Druid:      [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    Cleric:     [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    Bard:       [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    Artificer:  [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  };
  const table = tables[className];
  if (!table) return 0;
  return table[Math.min(level - 1, 19)] ?? 0;
}

// How many prepared/known non-cantrip spells the character should have
function getExpectedSpells(character: Character): { min: number; note: string } {
  const { class_name, level, intelligence, wisdom, charisma } = character;
  const intMod = Math.floor((intelligence - 10) / 2);
  const wisMod = Math.floor((wisdom - 10) / 2);
  const chaMod = Math.floor((charisma - 10) / 2);

  switch (class_name) {
    case 'Wizard':
      return { min: intMod + level, note: `INT mod (${intMod}) + level (${level})` };
    case 'Psion':
      return { min: intMod + level, note: `INT mod (${intMod}) + level (${level})` };
    case 'Cleric':
    case 'Druid':
      return { min: wisMod + level, note: `WIS mod (${wisMod}) + level (${level})` };
    case 'Paladin':
      return { min: chaMod + Math.floor(level / 2), note: `CHA mod (${chaMod}) + half level (${Math.floor(level / 2)})` };
    case 'Ranger':
      return { min: wisMod + Math.floor(level / 2), note: `WIS mod (${wisMod}) + half level (${Math.floor(level / 2)})` };
    case 'Artificer':
      return { min: intMod + Math.ceil(level / 2), note: `INT mod (${intMod}) + half level rounded up (${Math.ceil(level / 2)})` };
    case 'Bard':
    case 'Sorcerer':
    case 'Warlock':
      // These classes have "spells known" tables, not prepared — skip the warning
      return { min: 0, note: '' };
    default:
      return { min: 0, note: '' };
  }
}

// Get highest accessible spell level for this character
function getMaxSpellLevel(character: Character): number {
  return Object.entries(character.spell_slots).reduce((max, [k, s]: [string, any]) => {
    return (s.total ?? 0) > 0 ? Math.max(max, parseInt(k, 10)) : max;
  }, 0);
}

export default function SpellCompletionBanner({ character, onGoToSpells }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const classSpells = SPELLS.filter(s => s.classes.includes(character.class_name));
  const classCantrips = classSpells.filter(s => s.level === 0);
  const maxSpellLevel = getMaxSpellLevel(character);

  const counts = getSpellCounts(character);
  const currentCantrips = counts.cantrips;
  const expectedCantrips = getExpectedCantrips(character.class_name, character.level);

  const currentPrepared = counts.prepared;
  const { min: expectedPrepared, note: preparedNote } = getExpectedSpells(character);

  const missingCantrips = Math.max(0, expectedCantrips - currentCantrips);
  const missingSpells = Math.max(0, expectedPrepared - currentPrepared);

  // Check for new spell level access (e.g., just gained 5th level slots)
  const newLevelAccess: number[] = [];
  if (maxSpellLevel > 0) {
    const slotsAtMaxLevel = character.spell_slots[String(maxSpellLevel)];
    const hasSpellsAtMax = character.prepared_spells.some(id => {
      const spell = SPELLS.find(s => s.id === id);
      return spell && spell.level === maxSpellLevel;
    });
    if ((slotsAtMaxLevel as any)?.total > 0 && !hasSpellsAtMax && maxSpellLevel > 1) {
      newLevelAccess.push(maxSpellLevel);
    }
  }

  const hasAlerts = missingCantrips > 0 || missingSpells > 0 || newLevelAccess.length > 0;
  if (!hasAlerts) return null;

  return (
    <div style={{
      margin: '0 0 16px 0',
      borderRadius: 'var(--r-lg)',
      border: '1px solid rgba(239,68,68,0.4)',
      background: 'rgba(239,68,68,0.06)',
      padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: '#ef4444', marginBottom: 6 }}>
            Spells need to be assigned
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {missingCantrips > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999, padding: '1px 8px', minWidth: 40, textAlign: 'center' as const }}>
                  {currentCantrips}/{expectedCantrips}
                </span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
                  cantrips chosen — {missingCantrips} still needed
                </span>
              </div>
            )}
            {missingSpells > 0 && preparedNote && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999, padding: '1px 8px', minWidth: 40, textAlign: 'center' as const }}>
                  {currentPrepared}/{expectedPrepared}
                </span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
                  prepared spells — {missingSpells} still needed
                </span>
              </div>
            )}
            {newLevelAccess.map(lvl => (
              <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 13, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999, padding: '1px 8px', minWidth: 40, textAlign: 'center' as const }}>
                  New!
                </span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
                  You now have access to {lvl === 1 ? '1st' : lvl === 2 ? '2nd' : lvl === 3 ? '3rd' : `${lvl}th`}-level spells — add one to your prepared list
                </span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, flexShrink: 0 }}>
          <button
            onClick={onGoToSpells}
            style={{
              padding: '5px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
              background: '#ef4444', border: 'none', color: '#fff',
              fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
            }}
          >
            Go to Spells
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{
              padding: '3px 8px', borderRadius: 'var(--r-md)', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--c-border)',
              color: 'var(--t-3)', fontFamily: 'var(--ff-body)', fontSize: 10,
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
