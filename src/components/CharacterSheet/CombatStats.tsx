import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { formatModifier } from '../../lib/gameUtils';

interface CombatStatsProps {
  character: Character;
  computed: ComputedStats;
  onUpdateHP: (currentHp: number, tempHp: number) => void;
}

// NOTE: AC, Initiative, Speed, Prof Bonus, Spell DC, Spell Attack, Passive Perception
// are ALL shown in CharacterHeader. This component only shows what the header doesn't:
// saving throw proficiencies, hit dice, temp HP controls.

export default function CombatStats({ character, computed, onUpdateHP }: CombatStatsProps) {
  const [hpDelta, setHpDelta] = useState('');
  const [tempInput, setTempInput] = useState('');
  const [mode, setMode] = useState<'damage' | 'heal'>('damage');

  function applyDelta() {
    const value = parseInt(hpDelta, 10);
    if (!value || value <= 0) return;
    if (mode === 'heal') {
      onUpdateHP(Math.min(character.max_hp, character.current_hp + value), character.temp_hp);
    } else {
      const absorbed = Math.min(character.temp_hp, value);
      const remainder = value - absorbed;
      onUpdateHP(Math.max(0, character.current_hp - remainder), Math.max(0, character.temp_hp - absorbed));
    }
    setHpDelta('');
  }

  function applyTemp() {
    const v = parseInt(tempInput, 10);
    if (!isNaN(v) && v >= 0) { onUpdateHP(character.current_hp, v); setTempInput(''); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Temp HP */}
      <div>
        <div className="section-header">Temporary HP</div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, color: '#60a5fa', minWidth: 40 }}>
            {character.temp_hp > 0 ? `+${character.temp_hp}` : '—'}
          </div>
          <input
            type="number"
            min={0}
            value={tempInput}
            onChange={e => setTempInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyTemp()}
            placeholder="Set temp HP"
            style={{ width: 120, fontSize: 'var(--fs-sm)' }}
          />
          <button className="btn-secondary btn-sm" onClick={applyTemp}>Set</button>
        </div>
      </div>

      {/* HP damage/heal controls */}
      <div>
        <div className="section-header">Apply HP Change</div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setMode(m => m === 'damage' ? 'heal' : 'damage')}
            style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
              border: mode === 'damage' ? '1px solid rgba(220,38,38,0.4)' : '1px solid rgba(5,150,105,0.4)',
              background: mode === 'damage' ? 'var(--c-red-bg)' : 'var(--c-green-bg)',
              color: mode === 'damage' ? 'var(--c-red-l)' : 'var(--c-green-l)' }}>
            {mode === 'damage' ? '− Damage' : '+ Heal'}
          </button>
          <input
            type="number" min={0} value={hpDelta} onChange={e => setHpDelta(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyDelta()}
            placeholder="Amount" style={{ width: 90, fontSize: 'var(--fs-sm)' }}
          />
          <button className="btn-secondary btn-sm" onClick={applyDelta} disabled={!hpDelta}>Apply</button>
        </div>
      </div>

      {/* Saving throw proficiencies */}
      <div>
        <div className="section-header">Saving Throws</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['strength','dexterity','constitution','intelligence','wisdom','charisma'] as const).map(ab => {
            const isProficient = character.saving_throw_proficiencies?.includes(ab);
            const mod = computed.modifiers[ab] + (isProficient ? computed.proficiency_bonus : 0);
            return (
              <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isProficient ? 'var(--c-gold-l)' : 'transparent', border: `1.5px solid ${isProficient ? 'var(--c-gold)' : 'var(--c-border-m)'}`, flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', flex: 1, textTransform: 'capitalize' }}>{ab}</span>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: mod >= 0 ? 'var(--c-green-l)' : 'var(--c-red-l)', minWidth: 32, textAlign: 'right' }}>
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
          <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--t-1)' }}>
            {character.level - (character.hit_dice_spent ?? 0)}
          </span>
          <span style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>
            / {character.level} d{/* hit die from class */}
          </span>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>remaining</span>
        </div>
      </div>
    </div>
  );
}
