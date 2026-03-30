import { useState } from 'react';
import type { Character } from '../../types';
import { CLASS_MAP } from '../../data/classes';
import { getSpellSlotRow, slotRowToSpellSlots } from '../../data/spellSlots';
import { rollDie, hpPerLevel, abilityModifier } from '../../lib/gameUtils';

interface LevelUpProps {
  character: Character;
  onConfirm: (updates: Partial<Character>) => void;
  onCancel: () => void;
}

export default function LevelUp({ character, onConfirm, onCancel }: LevelUpProps) {
  const cls = CLASS_MAP[character.class_name];
  const newLevel = character.level + 1;
  const conMod = abilityModifier(character.constitution);
  const averageHP = hpPerLevel(cls?.hit_die ?? 8, character.constitution);

  const [hpChoice, setHpChoice] = useState<'average' | 'roll'>('average');
  const [rolledHP, setRolledHP] = useState<number | null>(null);
  const [subclass, setSubclass] = useState(character.subclass ?? '');

  // Subclasses that unlock at this exact level
  const newSubclasses = cls?.subclasses.filter(sc => sc.unlock_level === newLevel) ?? [];
  const needsSubclassChoice = newSubclasses.length > 0 && !character.subclass;

  function roll() {
    const result = rollDie(cls?.hit_die ?? 8) + conMod;
    setRolledHP(Math.max(1, result));
  }

  const hpGain = hpChoice === 'average' ? averageHP : (rolledHP ?? averageHP);

  // Build new spell slots for the new level
  function buildNewSlots(): Character['spell_slots'] {
    if (!cls?.is_spellcaster) return character.spell_slots;
    const newRow = getSpellSlotRow(cls.name, newLevel);
    const newSlotDef = slotRowToSpellSlots(newRow);

    // Merge: preserve used counts, add new slots
    const merged: Character['spell_slots'] = {};
    for (const [lvl, def] of Object.entries(newSlotDef)) {
      const existing = character.spell_slots[lvl];
      const prevUsed = existing?.used ?? 0;
      merged[lvl] = {
        total: def.total,
        used: Math.min(prevUsed, def.total),
      };
    }
    return merged;
  }

  function confirm() {
    const updates: Partial<Character> = {
      level: newLevel,
      max_hp: character.max_hp + hpGain,
      current_hp: character.current_hp + hpGain,
      spell_slots: buildNewSlots(),
    };
    if (subclass && !character.subclass) {
      updates.subclass = subclass;
    }
    onConfirm(updates);
  }

  const canConfirm = (!needsSubclassChoice || !!subclass) &&
    (hpChoice === 'average' || rolledHP !== null);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 'var(--space-2)' }}>Level Up!</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>
          {character.name} reaches level {newLevel} {character.class_name}
        </p>

        {/* HP section */}
        <div className="section-header">Hit Points</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <button
            className={hpChoice === 'average' ? 'btn-gold' : 'btn-secondary'}
            onClick={() => setHpChoice('average')}
          >
            Take Average (+{averageHP} HP)
          </button>
          <button
            className={hpChoice === 'roll' ? 'btn-gold' : 'btn-secondary'}
            onClick={() => { setHpChoice('roll'); setRolledHP(null); }}
          >
            Roll d{cls?.hit_die ?? 8}
          </button>
        </div>

        {hpChoice === 'roll' && (
          <div style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button className="btn-primary" onClick={roll}>
              Roll d{cls?.hit_die ?? 8}{conMod >= 0 ? `+${conMod}` : conMod}
            </button>
            {rolledHP !== null && (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--text-gold)' }}>
                +{rolledHP} HP
              </span>
            )}
          </div>
        )}

        <div className="panel" style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Current Max HP</span>
            <span>{character.max_hp}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--hp-full)' }}>
            <span>HP Gained</span>
            <span>+{hpChoice === 'average' ? averageHP : (rolledHP ?? '?')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-md)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-2)', color: 'var(--text-gold)', fontWeight: 700 }}>
            <span>New Max HP</span>
            <span>{character.max_hp + (hpChoice === 'average' ? averageHP : (rolledHP ?? 0))}</span>
          </div>
        </div>

        {/* Subclass choice if applicable */}
        {needsSubclassChoice && (
          <>
            <div className="section-header">Choose Subclass</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-heading)' }}>
              At level {newLevel}, {character.class_name}s choose a subclass.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
              {newSubclasses.map(sc => (
                <button
                  key={sc.name}
                  onClick={() => setSubclass(sc.name)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)',
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: subclass === sc.name ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
                    background: subclass === sc.name ? 'rgba(201,146,42,0.1)' : 'var(--bg-sunken)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: subclass === sc.name ? 'var(--text-gold)' : 'var(--text-primary)' }}>
                    {sc.name}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{sc.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Spell slots preview */}
        {cls?.is_spellcaster && (
          <>
            <div className="section-header">Spell Slots at Level {newLevel}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
              {Object.entries(buildNewSlots()).map(([lvl, slot]) => {
                const prev = character.spell_slots[lvl]?.total ?? 0;
                const gained = slot.total - prev;
                return (
                  <div key={lvl} className="panel" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {['1st','2nd','3rd','4th','5th','6th','7th','8th','9th'][Number(lvl) - 1]}
                    </div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: gained > 0 ? 'var(--text-gold)' : 'var(--text-primary)' }}>
                      {slot.total}
                      {gained > 0 && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--hp-full)', marginLeft: 4 }}>+{gained}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary btn-lg" onClick={confirm} disabled={!canConfirm} style={{ flex: 1, justifyContent: 'center' }}>
            Advance to Level {newLevel}
          </button>
        </div>
      </div>
    </div>
  );
}
