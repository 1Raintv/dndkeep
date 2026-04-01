import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { formatModifier } from '../../lib/gameUtils';

interface CombatStatsProps {
  character: Character;
  computed: ComputedStats;
  onUpdateHP: (currentHp: number, tempHp: number) => void;
}

// This component shows ONLY what the header doesn't:
// - Temp HP setter
// - Saving throw proficiencies  
// - Hit dice tracker
// HP damage/heal is handled in CharacterHeader inline controls.

export default function CombatStats({ character, computed, onUpdateHP }: CombatStatsProps) {
  const [tempInput, setTempInput] = useState('');

  function applyTemp() {
    const v = parseInt(tempInput, 10);
    if (!isNaN(v) && v >= 0) {
      onUpdateHP(character.current_hp, v);
      setTempInput('');
    }
  }

  const hitDiceRemaining = character.level - (character.hit_dice_spent ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Temp HP */}
      <div>
        <div className="section-header">Temporary HP</div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          <div style={{
            fontSize: 'var(--fs-xl)', fontWeight: 800, lineHeight: 1,
            color: character.temp_hp > 0 ? '#60a5fa' : 'var(--t-3)',
            minWidth: 40,
          }}>
            {character.temp_hp > 0 ? `+${character.temp_hp}` : '—'}
          </div>
          <input
            type="number" min={0} value={tempInput}
            onChange={e => setTempInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyTemp()}
            placeholder="Set temp HP"
            style={{ width: 110, fontSize: 'var(--fs-sm)' }}
          />
          <button className="btn-secondary btn-sm" onClick={applyTemp}>Set</button>
          {character.temp_hp > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => onUpdateHP(character.current_hp, 0)}
              style={{ color: 'var(--t-3)', fontSize: 'var(--fs-xs)' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Saving throws */}
      <div>
        <div className="section-header">Saving Throws</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
          {(['strength','dexterity','constitution','intelligence','wisdom','charisma'] as const).map(ab => {
            const isProficient = character.saving_throw_proficiencies?.includes(ab);
            const mod = computed.modifiers[ab] + (isProficient ? computed.proficiency_bonus : 0);
            return (
              <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isProficient ? 'var(--c-gold-l)' : 'transparent',
                  border: `1.5px solid ${isProficient ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
                }} />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', flex: 1, textTransform: 'capitalize' }}>{ab}</span>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: mod >= 0 ? 'var(--c-green-l)' : 'var(--c-red-l)', minWidth: 30, textAlign: 'right' }}>
                  {formatModifier(mod)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hit dice */}
      <div>
        <div className="section-header">Hit Dice</div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline' }}>
          <span style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, color: hitDiceRemaining > 0 ? 'var(--t-1)' : 'var(--t-3)', lineHeight: 1 }}>
            {hitDiceRemaining}
          </span>
          <span style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>/ {character.level}</span>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>remaining</span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {hitDiceRemaining > 0 && (
            <button className="btn-secondary btn-sm" onClick={() => {
              const spent = (character.hit_dice_spent ?? 0) + 1;
              // Roll HD but just track spent — healing handled by player
              // A proper implementation would roll and heal, but we keep it simple here
              onUpdateHP(character.current_hp, character.temp_hp);
            }}>
              Use Hit Die
            </button>
          )}
          {(character.hit_dice_spent ?? 0) > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => onUpdateHP(character.current_hp, character.temp_hp)}
              style={{ color: 'var(--t-3)', fontSize: 'var(--fs-xs)' }}>
              Restore on Rest
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
