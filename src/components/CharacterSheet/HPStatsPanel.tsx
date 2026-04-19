import { useState } from 'react';
import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDie, abilityModifier } from '../../lib/gameUtils';
import { CONDITION_MAP } from '../../data/conditions';
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
}

const SPELLCASTERS = ['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard','Artificer'];

export default function HPStatsPanel({
  character, computed, onUpdateAC, onUpdateSpeed, onToggleInspiration, onUpdateConditions, onUpdateExhaustionLevel, acTooltip,
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

  function removeCondition(name: ConditionName) {
    if (!onUpdateConditions) return;
    onUpdateConditions(activeConditions.filter(c => c !== name));
  }

  const stats = [
    { label: 'INSP', value: character.inspiration ? 'YES' : '—', color: character.inspiration ? 'var(--c-amber-l)' : 'var(--t-3)', clickable: true, onClick: onToggleInspiration, tooltip: character.inspiration ? 'Inspired! Click to remove' : 'No Inspiration. Click to grant' },
    { label: 'AC',        value: character.armor_class,                                            color: 'var(--c-gold-l)', editable: editsUnlocked, onEdit: () => { if (!editsUnlocked) return; setAcInput(String(character.armor_class)); setEditingAC(true); }, tooltip: editsUnlocked ? (acTooltip ?? '10 + DEX (Unarmored)') : 'Locked — unlock in Settings → Edit Stats' },
    { label: 'INIT',      value: initMod >= 0 ? `+${initMod}` : String(initMod),                  color: '#60a5fa',         clickable: true,  onClick: rollInitiative },
    { label: 'SPEED',     value: `${character.speed}ft`,                                           color: 'var(--t-2)',      editable: editsUnlocked, onEdit: () => { if (!editsUnlocked) return; setSpeedInput(String(character.speed)); setEditingSpeed(true); }, tooltip: editsUnlocked ? undefined : 'Locked — unlock in Settings → Edit Stats' },
    { label: 'PROF',      value: `+${computed.proficiency_bonus}`,                                 color: '#a78bfa' },
    { label: 'PASS PERC', value: 10 + (computed.skills['Perception']?.total ?? 0),                color: 'var(--t-2)' },
    ...(isSpellcaster ? [
      { label: 'SPL ATK', value: spellAttack >= 0 ? `+${spellAttack}` : String(spellAttack), color: '#c084fc' },
      { label: 'SPL DC',  value: spellDC,                                                     color: '#c084fc' },
    ] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

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

      {/* v2.29: Conditions strip — pills + modal trigger, no emotes */}
      {onUpdateConditions && (
        <>
          <div style={{
            background: 'var(--c-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-md)',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-3)' }}>
                Conditions
              </span>
              <button
                onClick={() => setShowConditionModal(true)}
                title="Manage conditions"
                style={{
                  marginLeft: 'auto', fontSize: 10, lineHeight: 1, padding: '3px 10px',
                  borderRadius: 999, cursor: 'pointer', minHeight: 0,
                  background: 'var(--c-raised)', border: '1px solid var(--c-border-m)',
                  color: 'var(--t-2)', fontWeight: 700, letterSpacing: '0.06em',
                }}
              >
                Manage
              </button>
            </div>

            {!hasAnyCondition ? (
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>
                None
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {/* Exhaustion pill (if > 0) — shown first, with level */}
                {exhaustionLevel > 0 && (
                  <button
                    onClick={() => onUpdateExhaustionLevel?.(Math.max(0, exhaustionLevel - 1))}
                    title={`Exhaustion ${exhaustionLevel} — click to decrease`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                      background: exhaustionLevel === 6 ? 'rgba(229,57,53,0.18)' : 'rgba(245,158,11,0.18)',
                      border: `1px solid ${exhaustionLevel === 6 ? 'var(--c-red-l)' : '#f59e0b'}55`,
                      color: exhaustionLevel === 6 ? 'var(--c-red-l)' : '#f59e0b',
                    }}
                  >
                    <span>Exhaustion {exhaustionLevel}</span>
                    <span style={{ opacity: 0.6, marginLeft: 2, fontSize: 10 }}>×</span>
                  </button>
                )}

                {/* Other active condition pills */}
                {activeConditions.map(name => {
                  const c = CONDITION_MAP[name];
                  const color = c?.color ?? '#64748b';
                  return (
                    <button
                      key={name}
                      onClick={() => removeCondition(name)}
                      title={`${c?.description ?? name} — click to remove`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                        background: `${color}18`,
                        border: `1px solid ${color}55`,
                        color,
                      }}
                    >
                      <span>{name}</span>
                      <span style={{ opacity: 0.6, marginLeft: 2, fontSize: 10 }}>×</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {showConditionModal && (
            <ConditionPickerModal
              activeConditions={activeConditions}
              exhaustionLevel={exhaustionLevel}
              onUpdateConditions={onUpdateConditions}
              onUpdateExhaustionLevel={lvl => onUpdateExhaustionLevel?.(lvl)}
              onClose={() => setShowConditionModal(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
