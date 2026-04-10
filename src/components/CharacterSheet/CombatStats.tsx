import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { formatModifier, rollDie } from '../../lib/gameUtils';
import { useDiceRoll } from '../../context/DiceRollContext';
import { CONDITION_MAP } from '../../data/conditions';

interface CombatStatsProps {
  character: Character;
  computed: ComputedStats;
  onUpdateHP: (currentHp: number, tempHp: number) => void;
}

const SAVE_ABBREV: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

export default function CombatStats({ character, computed, onUpdateHP }: CombatStatsProps) {
  const [tempInput, setTempInput] = useState('');
  const [lastSave, setLastSave] = useState<{ ability: string; d20: number; total: number } | null>(null);
  const { triggerRoll } = useDiceRoll();

  function applyTemp() {
    const v = parseInt(tempInput, 10);
    if (!isNaN(v) && v >= 0) {
      onUpdateHP(character.current_hp, v);
      setTempInput('');
    }
  }

  function rollSave(ability: string) {
    const isProficient = character.saving_throw_proficiencies?.includes(ability as any);
    const abilityKey = ability as 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
    const mod = computed.modifiers[abilityKey] + (isProficient ? computed.proficiency_bonus : 0);

    // Check for auto-fail
    const hasAutoFail = (character.active_conditions ?? []).some(c =>
      (CONDITION_MAP[c]?.autoFailSaves as string[] | undefined)?.includes(ability)
    );

    let d20: number;
    if (hasAutoFail) {
      d20 = 1;
      setLastSave({ ability, d20: 1, total: 1 + mod });
      triggerRoll({ result: 1, dieType: 20, modifier: mod, total: 1 + mod, label: `${SAVE_ABBREV[ability]} Save (Auto-Fail)` });
      return;
    }

    // Check for disadvantage on DEX saves from Restrained
    const hasDisadvantage = (character.active_conditions ?? []).some(c =>
      (CONDITION_MAP[c]?.savingThrowDisadvantage as string[] | undefined)?.includes(ability)
    );

    const roll1 = rollDie(20);
    const roll2 = hasDisadvantage ? rollDie(20) : roll1;
    d20 = hasDisadvantage ? Math.min(roll1, roll2) : roll1;
    const total = d20 + mod;

    setLastSave({ ability, d20, total });
    const suffix = hasDisadvantage ? ' (Disadv.)' : '';
    triggerRoll({ result: 0, dieType: 20, modifier: mod, label: `${SAVE_ABBREV[ability]} Save${suffix}` });
  }

  const hitDiceRemaining = character.level - (character.hit_dice_spent ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

      {/* Saving throws — clickable */}
      <div>
        <div className="section-header">Saving Throws <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 400, color: 'var(--t-3)', textTransform: 'none', letterSpacing: 0 }}>— click to roll</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
          {(['strength','dexterity','constitution','intelligence','wisdom','charisma'] as const).map(ab => {
            const isProficient = character.saving_throw_proficiencies?.includes(ab);
            const mod = computed.modifiers[ab] + (isProficient ? computed.proficiency_bonus : 0);
            const isLast = lastSave?.ability === ab;
            return (
              <button
                key={ab}
                onClick={() => rollSave(ab)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                  border: isLast ? '1px solid var(--c-gold-bdr)' : '1px solid transparent',
                  background: isLast ? 'var(--c-gold-bg)' : 'transparent',
                  transition: 'all var(--tr-fast)',
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isProficient ? 'var(--c-gold-l)' : 'transparent',
                  border: `1.5px solid ${isProficient ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
                }} />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', flex: 1, textTransform: 'capitalize' }}>{ab}</span>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: mod >= 0 ? 'var(--c-green-l)' : 'var(--c-red-l)', minWidth: 30, textAlign: 'right' }}>
                  {formatModifier(mod)}
                </span>
              </button>
            );
          })}
        </div>
        {lastSave && (
          <div style={{ marginTop: 6, padding: '4px 8px', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)', display: 'flex', gap: 8 }}>
            <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{SAVE_ABBREV[lastSave.ability]}</span>
            <span>d20={lastSave.d20}</span>
            <span style={{ fontWeight: 700 }}>→ {lastSave.total}</span>
          </div>
        )}
      </div>

      {/* Temp HP */}
      <div>
        <div className="section-header">Temporary HP</div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          <div style={{
            fontSize: 'var(--fs-xl)', fontWeight: 800, lineHeight: 1, minWidth: 40,
            color: character.temp_hp > 0 ? '#60a5fa' : 'var(--t-3)',
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

      {/* Hit dice */}
      <div>
        <div className="section-header">Hit Dice</div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline' }}>
          <span style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, color: hitDiceRemaining > 0 ? 'var(--t-1)' : 'var(--t-3)', lineHeight: 1 }}>
            {hitDiceRemaining}
          </span>
          <span style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>/ {character.level}</span>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>remaining · use during Short Rest</span>
        </div>
      </div>
    </div>
  );
}
