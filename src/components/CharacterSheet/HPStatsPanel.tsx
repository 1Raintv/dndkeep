import { useState } from 'react';
import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDie, abilityModifier } from '../../lib/gameUtils';
import type { Character, ComputedStats } from '../../types';

interface HPStatsPanelProps {
  character: Character;
  computed: ComputedStats;
  onUpdateHP: (delta: number, tempHP?: number) => void;
  onUpdateAC?: (ac: number) => void;
  onUpdateSpeed?: (speed: number) => void;
}

const SPELLCASTERS = ['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard','Artificer'];

function hpColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.6) return 'var(--hp-full)';
  if (pct > 0.25) return 'var(--hp-mid)';
  return 'var(--hp-low)';
}

export default function HPStatsPanel({ character, computed, onUpdateHP, onUpdateAC, onUpdateSpeed }: HPStatsPanelProps) {
  const [damageInput, setDamageInput] = useState('');
  const [healInput, setHealInput] = useState('');
  const [tempInput, setTempInput] = useState('');
  const [editingAC, setEditingAC] = useState(false);
  const [acInput, setAcInput] = useState('');
  const [editingSpeed, setEditingSpeed] = useState(false);
  const [speedInput, setSpeedInput] = useState('');
  const { triggerRoll } = useDiceRoll();

  const hpCol = hpColor(character.current_hp, character.max_hp);
  const hpPct = character.max_hp > 0 ? Math.min(1, character.current_hp / character.max_hp) : 0;

  const isSpellcaster = SPELLCASTERS.includes(character.class_name);
  const spellAbility = { Bard: 'charisma', Cleric: 'wisdom', Druid: 'wisdom', Paladin: 'charisma', Ranger: 'wisdom', Sorcerer: 'charisma', Warlock: 'charisma', Wizard: 'intelligence', Artificer: 'intelligence' }[character.class_name] ?? 'intelligence';
  const spellMod = abilityModifier(character[spellAbility as keyof Character] as number ?? 10);
  const spellAttack = spellMod + computed.proficiency_bonus;
  const spellDC = 8 + spellAttack;
  const initMod = computed.modifiers.dexterity + (character.initiative_bonus ?? 0);

  function applyDamage() {
    const v = parseInt(damageInput);
    if (!isNaN(v) && v > 0) { onUpdateHP(-v); setDamageInput(''); }
  }
  function applyHeal() {
    const v = parseInt(healInput);
    if (!isNaN(v) && v > 0) { onUpdateHP(v); setHealInput(''); }
  }
  function applyTemp() {
    const v = parseInt(tempInput);
    if (!isNaN(v) && v >= 0) { onUpdateHP(0, v); setTempInput(''); }
  }
  function rollInitiative() {
    const d20 = rollDie(20);
    triggerRoll({ result: d20, dieType: 20, modifier: initMod, total: d20 + initMod, label: 'Initiative' });
  }

  const stats = [
    { label: 'AC', value: character.armor_class, color: 'var(--c-gold-l)', editable: true, onEdit: () => { setAcInput(String(character.armor_class)); setEditingAC(true); } },
    { label: 'INIT', value: initMod >= 0 ? `+${initMod}` : String(initMod), color: '#60a5fa', clickable: true, onClick: rollInitiative },
    { label: 'SPEED', value: `${character.speed}ft`, color: 'var(--t-2)', editable: true, onEdit: () => { setSpeedInput(String(character.speed)); setEditingSpeed(true); } },
    { label: 'PROF', value: `+${computed.proficiency_bonus}`, color: '#a78bfa' },
    { label: 'PASS PERC', value: 10 + (computed.skills['Perception']?.total ?? 0), color: 'var(--t-2)' },
    ...(isSpellcaster ? [
      { label: 'SPELL ATK', value: spellAttack >= 0 ? `+${spellAttack}` : String(spellAttack), color: '#c084fc' },
      { label: 'SPELL DC', value: spellDC, color: '#c084fc' },
    ] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* HP Block */}
      <div style={{ background: 'var(--c-card)', border: `1px solid ${hpCol}30`, borderRadius: 'var(--r-xl)', padding: '16px 20px' }}>
        {/* Numbers row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: '3rem', color: hpCol, lineHeight: 1 }}>
              {character.current_hp}
            </span>
            <span style={{ fontSize: 14, color: 'var(--t-3)', fontWeight: 500 }}>/ {character.max_hp}</span>
          </div>
          {character.temp_hp > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', padding: '2px 8px', borderRadius: 999, marginBottom: 6 }}>
              +{character.temp_hp} temp
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 8 }}>
            Hit Points
          </span>
        </div>

        {/* HP bar */}
        <div style={{ height: 6, background: 'var(--c-raised)', borderRadius: 999, overflow: 'hidden', marginBottom: 14, position: 'relative' }}>
          <div style={{ height: '100%', width: `${hpPct * 100}%`, background: `linear-gradient(90deg, ${hpCol}cc, ${hpCol})`, borderRadius: 999, transition: 'width 0.4s ease, background 0.3s ease', boxShadow: `0 0 10px ${hpCol}60` }} />
          {character.temp_hp > 0 && (
            <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: `${Math.min(30, (character.temp_hp / character.max_hp) * 100)}%`, background: 'rgba(96,165,250,0.4)', borderRadius: 999 }} />
          )}
        </div>

        {/* Three input controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {/* Damage */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--stat-str)' }}>Damage</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number" min={0} value={damageInput} onChange={e => setDamageInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyDamage()}
                placeholder="0"
                style={{ flex: 1, fontSize: 13, fontFamily: 'var(--ff-stat)', textAlign: 'center', padding: '5px 4px', borderRadius: 6, border: '1px solid var(--stat-str-bdr)', background: 'var(--stat-str-bg)', color: 'var(--stat-str)', minWidth: 0 }}
              />
              <button onClick={applyDamage} disabled={!damageInput}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-str-bdr)', background: 'var(--stat-str-bg)', color: 'var(--stat-str)' }}>
                Hit
              </button>
            </div>
          </div>

          {/* Heal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--stat-dex)' }}>Heal</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number" min={0} value={healInput} onChange={e => setHealInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyHeal()}
                placeholder="0"
                style={{ flex: 1, fontSize: 13, fontFamily: 'var(--ff-stat)', textAlign: 'center', padding: '5px 4px', borderRadius: 6, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)', minWidth: 0 }}
              />
              <button onClick={applyHeal} disabled={!healInput}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)' }}>
                Heal
              </button>
            </div>
          </div>

          {/* Temp HP */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#60a5fa' }}>Temp HP</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number" min={0} value={tempInput} onChange={e => setTempInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyTemp()}
                placeholder="0"
                style={{ flex: 1, fontSize: 13, fontFamily: 'var(--ff-stat)', textAlign: 'center', padding: '5px 4px', borderRadius: 6, border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.06)', color: '#60a5fa', minWidth: 0 }}
              />
              <button onClick={applyTemp} disabled={!tempInput}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.06)', color: '#60a5fa' }}>
                Set
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {stats.map(stat => (
          <div
            key={stat.label}
            onClick={stat.onClick ?? (stat.editable ? stat.onEdit : undefined)}
            style={{
              background: 'var(--c-card)', border: `1px solid ${stat.color}20`,
              borderRadius: 'var(--r-md)', padding: '6px 10px', textAlign: 'center',
              cursor: stat.onClick || stat.editable ? 'pointer' : 'default',
              flex: '1 0 auto', minWidth: 52, transition: 'all var(--tr-fast)',
            }}
            onMouseEnter={e => { if (stat.onClick || stat.editable) (e.currentTarget as HTMLDivElement).style.borderColor = `${stat.color}50`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${stat.color}20`; }}
          >
            {/* Editing AC */}
            {stat.label === 'AC' && editingAC ? (
              <input autoFocus type="number" value={acInput}
                onChange={e => setAcInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { const v = parseInt(acInput); if (!isNaN(v)) onUpdateAC?.(v); setEditingAC(false); }
                  if (e.key === 'Escape') setEditingAC(false);
                }}
                onBlur={() => { const v = parseInt(acInput); if (!isNaN(v)) onUpdateAC?.(v); setEditingAC(false); }}
                style={{ width: 36, textAlign: 'center', fontSize: 14, fontFamily: 'var(--ff-stat)', fontWeight: 700, background: 'transparent', border: 'none', color: stat.color, outline: 'none' }}
              />
            ) : stat.label === 'SPEED' && editingSpeed ? (
              <input autoFocus type="number" value={speedInput}
                onChange={e => setSpeedInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { const v = parseInt(speedInput); if (!isNaN(v)) onUpdateSpeed?.(v); setEditingSpeed(false); }
                  if (e.key === 'Escape') setEditingSpeed(false);
                }}
                onBlur={() => { const v = parseInt(speedInput); if (!isNaN(v)) onUpdateSpeed?.(v); setEditingSpeed(false); }}
                style={{ width: 40, textAlign: 'center', fontSize: 14, fontFamily: 'var(--ff-stat)', fontWeight: 700, background: 'transparent', border: 'none', color: stat.color, outline: 'none' }}
              />
            ) : (
              <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 15, color: stat.color, lineHeight: 1 }}>
                {stat.value}
              </div>
            )}
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-3)', marginTop: 3 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
