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
  onToggleInspiration?: () => void;
  acTooltip?: string;
}

const SPELLCASTERS = ['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard','Artificer'];

function hpColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.6) return 'var(--hp-full)';
  if (pct > 0.25) return 'var(--hp-mid)';
  return 'var(--hp-low)';
}

export default function HPStatsPanel({ character, computed, onUpdateHP, onUpdateAC, onUpdateSpeed, onToggleInspiration, acTooltip }: HPStatsPanelProps) {
  const [value, setValue] = useState('');
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

  function applyDamage() { const n = parseInt(value); if (!isNaN(n) && n > 0) { onUpdateHP(-n); setValue(''); } }
  function applyHeal()   { const n = parseInt(value); if (!isNaN(n) && n > 0) { onUpdateHP(n); setValue(''); } }
  function applyTemp()   { const n = parseInt(value); if (!isNaN(n) && n >= 0) { onUpdateHP(0, n); setValue(''); } }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applyDamage();
  }

  function rollInitiative() {
    const d20 = rollDie(20);
    triggerRoll({ result: d20, dieType: 20, modifier: initMod, total: d20 + initMod, label: 'Initiative' });
  }

  const stats = [
    { label: 'INSP', value: character.inspiration ? '✦' : '○', color: character.inspiration ? 'var(--c-amber-l)' : 'var(--t-3)', clickable: true, onClick: onToggleInspiration, tooltip: character.inspiration ? 'Inspired! Click to remove' : 'No Inspiration. Click to grant' },
    { label: 'AC 🛡',     value: character.armor_class,                                            color: 'var(--c-gold-l)', editable: true,   onEdit: () => { setAcInput(String(character.armor_class)); setEditingAC(true); }, tooltip: acTooltip ?? '10 + DEX (Unarmored)' },
    { label: 'INIT ⚡',   value: initMod >= 0 ? `+${initMod}` : String(initMod),                  color: '#60a5fa',         clickable: true,  onClick: rollInitiative },
    { label: 'SPEED',     value: `${character.speed}ft`,                                           color: 'var(--t-2)',      editable: true,   onEdit: () => { setSpeedInput(String(character.speed)); setEditingSpeed(true); } },
    { label: 'PROF',      value: `+${computed.proficiency_bonus}`,                                 color: '#a78bfa' },
    { label: 'PASS PERC', value: 10 + (computed.skills['Perception']?.total ?? 0),                color: 'var(--t-2)' },
    ...(isSpellcaster ? [
      { label: 'SPL ATK', value: spellAttack >= 0 ? `+${spellAttack}` : String(spellAttack), color: '#c084fc' },
      { label: 'SPL DC',  value: spellDC,                                                     color: '#c084fc' },
    ] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* HP Card */}
      <div style={{
        background: 'var(--c-card)',
        border: `1px solid ${hpCol}40`,
        borderRadius: 'var(--r-xl)',
        padding: '14px 16px',
        boxShadow: `0 0 16px ${hpCol}08`,
      }}>
        {/* HP numbers */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 8 }}>
          <span className={hpPct < 0.25 && character.current_hp > 0 ? 'hp-critical' : ''}
            style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: '2.8rem', color: hpCol, lineHeight: 1 }}>
            {character.current_hp}
          </span>
          <span style={{ fontSize: 14, color: 'var(--t-3)', fontWeight: 500, paddingBottom: 4 }}>/ {character.max_hp}</span>
          {character.temp_hp > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', padding: '2px 7px', borderRadius: 999, paddingBottom: 4 }}>
              +{character.temp_hp} temp
            </span>
          )}
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-3)', paddingBottom: 6, marginLeft: 2 }}>HP</span>
        </div>

        {/* HP bar */}
        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 999, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(1, hpPct * 100)}%`, background: hpCol, borderRadius: 999, transition: 'width 0.4s ease, background 0.3s ease', boxShadow: `0 0 8px ${hpCol}` }} />
        </div>

        {/* Single input + 3 action buttons */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              setValue(raw);
            }}
            onKeyDown={handleKey}
            placeholder=""
            style={{
              flex: 1, fontSize: 14, fontFamily: 'var(--ff-stat)', fontWeight: 600,
              textAlign: 'center', padding: '6px 8px', borderRadius: 8,
              border: '1px solid var(--c-border-m)', background: 'var(--c-raised)',
              color: 'var(--t-1)', minWidth: 0,
              MozAppearance: 'textfield',
            }}
          />
          <button
            onClick={applyDamage}
            style={{ fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-str-bdr)', background: 'var(--stat-str-bg)', color: 'var(--stat-str)', transition: 'all var(--tr-fast)', whiteSpace: 'nowrap' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--stat-str-bg)')}
          >
            Damage
          </button>
          <button
            onClick={applyHeal}
            style={{ fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', minHeight: 0, border: '1px solid var(--stat-dex-bdr)', background: 'var(--stat-dex-bg)', color: 'var(--stat-dex)', transition: 'all var(--tr-fast)', whiteSpace: 'nowrap' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,222,128,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--stat-dex-bg)')}
          >
            Heal
          </button>
          <button
            onClick={applyTemp}
            style={{ fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', transition: 'all var(--tr-fast)', whiteSpace: 'nowrap' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(96,165,250,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(96,165,250,0.08)')}
          >
            Temp
          </button>
        </div>
      </div>

      {/* Stat chips strip */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {stats.map(stat => (
          <div
            key={stat.label}
            onClick={stat.onClick ?? (stat.editable ? stat.onEdit : undefined)}
            title={(stat as any).tooltip}
            style={{
              background: 'var(--c-card)', border: `1px solid ${stat.color}22`,
              borderRadius: 'var(--r-md)', padding: '5px 8px', textAlign: 'center',
              cursor: (stat as any).onClick || (stat as any).editable ? 'pointer' : 'default',
              flex: '1 1 auto', minWidth: 48, maxWidth: 80,
              transition: 'all var(--tr-fast)',
            }}
            onMouseEnter={e => { if ((stat as any).onClick || (stat as any).editable) (e.currentTarget as HTMLDivElement).style.borderColor = `${stat.color}55`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${stat.color}22`; }}
          >
            {stat.label === 'AC' && editingAC ? (
              <input autoFocus type="number" value={acInput}
                onChange={e => setAcInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt(acInput); if (!isNaN(v)) onUpdateAC?.(v); setEditingAC(false); } if (e.key === 'Escape') setEditingAC(false); }}
                onBlur={() => { const v = parseInt(acInput); if (!isNaN(v)) onUpdateAC?.(v); setEditingAC(false); }}
                style={{ width: '100%', textAlign: 'center', fontSize: 13, fontFamily: 'var(--ff-stat)', fontWeight: 700, background: 'transparent', border: 'none', color: stat.color, outline: 'none' }}
              />
            ) : stat.label === 'SPEED' && editingSpeed ? (
              <input autoFocus type="number" value={speedInput}
                onChange={e => setSpeedInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt(speedInput); if (!isNaN(v)) onUpdateSpeed?.(v); setEditingSpeed(false); } if (e.key === 'Escape') setEditingSpeed(false); }}
                onBlur={() => { const v = parseInt(speedInput); if (!isNaN(v)) onUpdateSpeed?.(v); setEditingSpeed(false); }}
                style={{ width: '100%', textAlign: 'center', fontSize: 13, fontFamily: 'var(--ff-stat)', fontWeight: 700, background: 'transparent', border: 'none', color: stat.color, outline: 'none' }}
              />
            ) : (
              <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 13, color: stat.color, lineHeight: 1 }}>
                {stat.value}
              </div>
            )}
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginTop: 3 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
