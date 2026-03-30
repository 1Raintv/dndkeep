import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { formatModifier } from '../../lib/gameUtils';

interface CombatStatsProps {
  character: Character;
  computed: ComputedStats;
  onUpdateHP: (currentHp: number, tempHp: number) => void;
}

function HPBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const color = pct > 0.5 ? 'var(--hp-full)'
              : pct > 0.25 ? 'var(--hp-mid)'
              : current > 0 ? 'var(--hp-low)'
              : 'var(--hp-dead)';
  return (
    <div className="hp-bar-container" style={{ marginTop: 'var(--space-2)' }}>
      <div className="hp-bar-fill" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  );
}

export default function CombatStats({ character, computed, onUpdateHP }: Omit<CombatStatsProps, 'onUpdate'>) {
  const [hpDelta, setHpDelta] = useState('');

  const hpPct = character.max_hp > 0 ? Math.max(0, character.current_hp / character.max_hp) : 0;
  const hpColor = hpPct > 0.5 ? 'var(--hp-full)'
                : hpPct > 0.25 ? 'var(--hp-mid)'
                : character.current_hp > 0 ? 'var(--hp-low)'
                : 'var(--hp-dead)';

  function applyDelta(mode: 'damage' | 'heal' | 'temp') {
    const value = parseInt(hpDelta, 10);
    if (isNaN(value) || value <= 0) return;
    if (mode === 'temp') {
      onUpdateHP(character.current_hp, Math.max(character.temp_hp, value));
    } else if (mode === 'damage') {
      const absorbed = Math.min(character.temp_hp, value);
      const remainder = value - absorbed;
      onUpdateHP(Math.max(0, character.current_hp - remainder), Math.max(0, character.temp_hp - absorbed));
    } else {
      onUpdateHP(Math.min(character.max_hp, character.current_hp + value), character.temp_hp);
    }
    setHpDelta('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') applyDelta('heal');
  }

  return (
    <section>
      <div className="section-header">Combat</div>

      {/* Read-only stat grid — edit these in Character Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className="stat-box">
          <div className="stat-box-label">AC</div>
          <div className="stat-box-value">{character.armor_class}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Initiative</div>
          <div className="stat-box-value">{formatModifier(computed.initiative)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Speed</div>
          <div className="stat-box-value">{character.speed}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>ft</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Prof. Bonus</div>
          <div className="stat-box-value">{formatModifier(computed.proficiency_bonus)}</div>
        </div>
      </div>

      {/* Spell stats row — only shown for casters */}
      {(() => {
        const colCount = 1
          + (computed.spell_save_dc    != null ? 1 : 0)
          + (computed.spell_attack_bonus != null ? 1 : 0);
        if (colCount === 1) return null;
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div className="stat-box">
              <div className="stat-box-label">Passive Perception</div>
              <div className="stat-box-value">{computed.passive_perception}</div>
            </div>
            {computed.spell_save_dc != null && (
              <div className="stat-box">
                <div className="stat-box-label">Spell Save DC</div>
                <div className="stat-box-value">{computed.spell_save_dc}</div>
              </div>
            )}
            {computed.spell_attack_bonus != null && (
              <div className="stat-box">
                <div className="stat-box-label">Spell Attack</div>
                <div className="stat-box-value">{formatModifier(computed.spell_attack_bonus)}</div>
              </div>
            )}
          </div>
        );
      })()}


      <div className="panel" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-1)' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Hit Points
          </span>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Max {character.max_hp}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', margin: 'var(--space-2) 0' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 700, color: hpColor, lineHeight: 1 }}>
            {character.current_hp}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-lg)' }}>/ {character.max_hp}</span>
          {character.temp_hp > 0 && (
            <span style={{ marginLeft: 'var(--space-2)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 'var(--radius-sm)', padding: '0 var(--space-2)' }}>
              +{character.temp_hp} tmp
            </span>
          )}
        </div>

        <HPBar current={character.current_hp} max={character.max_hp} />

        {/* HP Adjustment Controls — enter amount then click action */}
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <input
            type="number"
            min="1"
            value={hpDelta}
            onChange={e => setHpDelta(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter amount..."
            style={{ textAlign: 'center', fontSize: 'var(--text-md)' }}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              className="btn-danger btn-sm"
              onClick={() => applyDelta('damage')}
              disabled={!hpDelta}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Damage
            </button>
            <button
              className="btn-gold btn-sm"
              onClick={() => applyDelta('heal')}
              disabled={!hpDelta}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Heal
            </button>
            <button
              className="btn-sm btn-secondary"
              onClick={() => applyDelta('temp')}
              disabled={!hpDelta}
              style={{ flex: 1, justifyContent: 'center', borderColor: '#60a5fa', color: '#60a5fa' }}
            >
              Temp HP
            </button>
          </div>
        </div>
      </div>

      <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', letterSpacing: '0.04em' }}>
        Edit AC, Speed, Max HP, and Initiative Bonus in Character Settings.
      </p>

      {/* Passive Perception for non-casters (casters have it in the row above) */}
      {computed.spell_save_dc == null && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <div className="stat-box" style={{ maxWidth: 160 }}>
            <div className="stat-box-label">Passive Perception</div>
            <div className="stat-box-value">{computed.passive_perception}</div>
          </div>
        </div>
      )}
    </section>
  );
}