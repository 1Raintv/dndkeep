import { useState } from 'react';
import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDie, abilityModifier } from '../../lib/gameUtils';
import ConditionPickerModal from './ConditionPickerModal';
import type { Character, ComputedStats, ConditionName } from '../../types';

interface HPStatsPanelProps {
  character: Character;
  computed: ComputedStats;
  onUpdateAC?: (ac: number) => void;
  onUpdateSpeed?: (speed: number) => void;
  onToggleInspiration?: () => void;
  onUpdateConditions?: (next: ConditionName[]) => void;
  onUpdateExhaustionLevel?: (level: number) => void;
  acTooltip?: string;
  // v2.45.0: defense chips render inline at the end of the stats row.
  // Each chip carries its own per-type color so Fire is orange, Cold is blue, etc.
  defenseChips?: Array<{ label: string; color: string; kind: 'res' | 'imm' | 'vul' }>;
}

const SPELLCASTERS = ['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard','Artificer'];

export default function HPStatsPanel({
  character, computed, onUpdateAC, onUpdateSpeed, onToggleInspiration, onUpdateConditions, onUpdateExhaustionLevel, acTooltip, defenseChips = [],
}: HPStatsPanelProps) {
  const [editingAC, setEditingAC] = useState(false);
  const [acInput, setAcInput] = useState('');
  const [editingSpeed, setEditingSpeed] = useState(false);
  const [speedInput, setSpeedInput] = useState('');
  const [showConditionModal, setShowConditionModal] = useState(false);
  const { triggerRoll } = useDiceRoll();

  const editsUnlocked = !!character.advanced_edits_unlocked;

  const isSpellcaster = SPELLCASTERS.includes(character.class_name);
  const spellAbility = { Bard: 'charisma', Cleric: 'wisdom', Druid: 'wisdom', Paladin: 'charisma', Ranger: 'wisdom', Sorcerer: 'charisma', Warlock: 'charisma', Wizard: 'intelligence', Artificer: 'intelligence' }[character.class_name] ?? 'intelligence';
  const spellMod = abilityModifier(character[spellAbility as keyof Character] as number ?? 10);
  const spellAttack = spellMod + computed.proficiency_bonus;
  const spellDC = 8 + spellAttack;
  const initMod = computed.modifiers.dexterity + (character.initiative_bonus ?? 0);

  function rollInitiative() {
    const d20 = rollDie(20);
    triggerRoll({ result: d20, dieType: 20, modifier: initMod, total: d20 + initMod, label: 'Initiative' });
  }

  const activeConditions: ConditionName[] = character.active_conditions ?? [];
  const exhaustionLevel = character.exhaustion_level ?? 0;
  const hasAnyCondition = activeConditions.length > 0 || exhaustionLevel > 0;

  const stats = [
    { label: 'INSP', value: character.inspiration ? 'YES' : '—', color: character.inspiration ? 'var(--c-amber-l)' : 'var(--t-3)', clickable: true, onClick: onToggleInspiration, tooltip: character.inspiration ? 'Inspired! Click to remove' : 'No Inspiration. Click to grant' },
    { label: 'AC',        value: character.armor_class,                                            color: 'var(--c-gold-l)', editable: editsUnlocked, onEdit: () => { if (!editsUnlocked) return; setAcInput(String(character.armor_class)); setEditingAC(true); }, tooltip: editsUnlocked ? (acTooltip ?? '10 + DEX (Unarmored)') : 'Locked — unlock in Settings → Edit Stats' },
    { label: 'INIT',      value: initMod >= 0 ? `+${initMod}` : String(initMod),                  color: '#60a5fa',         clickable: true,  onClick: rollInitiative },
    { label: 'SPEED',     value: `${character.speed}ft`,                                           color: 'var(--t-2)',      editable: editsUnlocked, onEdit: () => { if (!editsUnlocked) return; setSpeedInput(String(character.speed)); setEditingSpeed(true); }, tooltip: editsUnlocked ? undefined : 'Locked — unlock in Settings → Edit Stats' },
    { label: 'PROF',      value: `+${computed.proficiency_bonus}`,                                 color: '#a78bfa' },
    // v2.45.0: PASS PERC removed — redundant with the Skills list which shows passive perception
    // alongside the live perception modifier on the left side of the sheet.
    // v2.33.3: Conditions as a compact chip — clickable to open the modal
    ...(onUpdateConditions ? [{
      label: 'COND',
      value: (activeConditions.length + (exhaustionLevel > 0 ? 1 : 0)) || '—',
      color: hasAnyCondition ? (exhaustionLevel === 6 ? 'var(--c-red-l)' : '#f59e0b') : 'var(--t-3)',
      clickable: true,
      onClick: () => setShowConditionModal(true),
      tooltip: hasAnyCondition
        ? [
            ...(exhaustionLevel > 0 ? [`Exhaustion ${exhaustionLevel}`] : []),
            ...activeConditions,
          ].join(', ') + ' — click to manage'
        : 'No conditions — click to add',
    }] : []),
    ...(isSpellcaster ? [
      { label: 'SPL ATK', value: spellAttack >= 0 ? `+${spellAttack}` : String(spellAttack), color: '#c084fc' },
      { label: 'SPL DC',  value: spellDC,                                                     color: '#c084fc' },
    ] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Stat chips strip — v2.45.0: defense chips render inline at the end so
          they share the same wrap row with INSP/AC/INIT/SPEED/PROF/COND. */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
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

        {/* v2.45.0: Defense chips inline. Pill shape distinguishes them from stat boxes.
            Border style encodes kind: solid = resistance, thicker double-style = immunity, dashed = vulnerability. */}
        {defenseChips.length > 0 && (
          <>
            <div style={{ width: 1, height: 22, background: 'var(--c-border)', marginLeft: 4, marginRight: 2, alignSelf: 'center' }} />
            {defenseChips.map((chip, i) => (
              <span
                key={`${chip.kind}-${chip.label}-${i}`}
                title={chip.kind === 'res' ? `Resistant to ${chip.label} (half damage)` : chip.kind === 'imm' ? `Immune to ${chip.label} (no damage)` : `Vulnerable to ${chip.label} (double damage)`}
                style={{
                  fontFamily: 'var(--ff-body)', fontSize: 11,
                  fontWeight: chip.kind === 'imm' ? 800 : 700,
                  color: chip.color,
                  background: chip.color + (chip.kind === 'imm' ? '22' : '12'),
                  border: chip.kind === 'imm'
                    ? `2px solid ${chip.color}66`
                    : chip.kind === 'vul'
                      ? `1px dashed ${chip.color}66`
                      : `1px solid ${chip.color}55`,
                  borderRadius: 999, padding: '4px 10px',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  height: 22, lineHeight: 1,
                }}
              >
                {chip.kind === 'imm' && <span style={{ fontSize: 8, opacity: 0.85 }}>IMM</span>}
                {chip.kind === 'vul' && <span style={{ fontSize: 8, opacity: 0.85 }}>VUL</span>}
                {chip.label}
              </span>
            ))}
          </>
        )}
      </div>

      {/* v2.33.3: Conditions modal — opened by the COND chip in the stats strip above */}
      {onUpdateConditions && showConditionModal && (
        <ConditionPickerModal
          activeConditions={activeConditions}
          exhaustionLevel={exhaustionLevel}
          onUpdateConditions={onUpdateConditions}
          onUpdateExhaustionLevel={lvl => onUpdateExhaustionLevel?.(lvl)}
          onClose={() => setShowConditionModal(false)}
        />
      )}
    </div>
  );
}
