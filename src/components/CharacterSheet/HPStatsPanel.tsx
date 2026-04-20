import { useState } from 'react';
import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDie, abilityModifier } from '../../lib/gameUtils';
import ConditionPickerModal from './ConditionPickerModal';
import { CONDITION_MAP } from '../../data/conditions';
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
  // v2.50.0: clicking the "Defenses" label opens character settings to edit.
  onOpenSettings?: () => void;
}

const SPELLCASTERS = ['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard','Artificer'];

export default function HPStatsPanel({
  character, computed, onUpdateAC, onUpdateSpeed, onToggleInspiration, onUpdateConditions, onUpdateExhaustionLevel, acTooltip, defenseChips = [], onOpenSettings,
}: HPStatsPanelProps) {
  // v2.72.0: editingAC state removed — AC is no longer quick-editable on the chip.
  // v2.77.0: editingSpeed state removed — Speed is no longer quick-editable either.
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
    // v2.54.0: RAW: Initiative is a DEX check. Conditions that impose
    // disadvantage on ability checks (Frightened, Poisoned) apply to it.
    const activeConditions: ConditionName[] = character.active_conditions ?? [];
    const disadvSources = activeConditions.filter(c => CONDITION_MAP[c]?.abilityCheckDisadvantage);
    const hasDisadvantage = disadvSources.length > 0;
    const roll1 = rollDie(20);
    const roll2 = hasDisadvantage ? rollDie(20) : roll1;
    const d20 = hasDisadvantage ? Math.min(roll1, roll2) : roll1;
    const disadvLabel = hasDisadvantage ? ` (Disadv. — ${disadvSources.join(', ')})` : '';
    triggerRoll({
      result: d20, dieType: 20, modifier: initMod, total: d20 + initMod,
      label: `Initiative${disadvLabel}`,
    });
  }

  const activeConditions: ConditionName[] = character.active_conditions ?? [];
  const exhaustionLevel = character.exhaustion_level ?? 0;
  const hasAnyCondition = activeConditions.length > 0 || exhaustionLevel > 0;

  const stats = [
    // v2.46.0: INSP removed — Inspiration toggle moved into CharacterHeader (between Rest and HP block)
    // v2.72.0: AC chip is now READ-ONLY at all times. Quick-edit removed to
    // prevent accidental AC changes during play. AC is modified only via:
    //   (a) Settings → Edit Stats → Combat Stats (gated behind
    //       advanced_edits_unlocked, with an override input), and
    //   (b) equipping/unequipping armor in the Inventory tab (auto-recalc,
    //       intentional — plate mail should change AC).
    // v2.75.0: Labels spelled out fully ("AC" → "Armor Class", etc.) per user
    // request. The label <div> uppercases via CSS, so source text stays readable.
    // maxWidth bumped 80→110 and label fontSize 7→8 to fit longer words.
    { label: 'Armor Class', value: character.armor_class,                                            color: 'var(--c-gold-l)', tooltip: acTooltip ?? 'To change AC, equip armor in the Inventory tab or use Settings → Edit Stats (override).' },
    { label: 'Initiative',  value: initMod >= 0 ? `+${initMod}` : String(initMod),                  color: '#60a5fa',         clickable: true,  onClick: rollInitiative },
    // v2.53.0: SPEED reflects condition automatically — Grappled/Restrained/Paralyzed/Stunned/
    // Unconscious/Petrified set effective speed to 0. Tooltip explains which condition is responsible.
    // v2.77.0: Speed chip is now READ-ONLY at all times (matches the AC
    // treatment from v2.72.0). Quick-edit removed to prevent accidental
    // speed changes during play. Speed is modified only via:
    //   Settings → Edit Stats → Combat Stats → Speed (gated behind
    //   advanced_edits_unlocked).
    (() => {
      const speedZeroSources = activeConditions.filter(c => CONDITION_MAP[c]?.speedZero || CONDITION_MAP[c]?.cantMove);
      const isImmobilized = speedZeroSources.length > 0;
      return {
        label: 'Speed',
        value: isImmobilized ? '0ft' : `${character.speed}ft`,
        color: isImmobilized ? 'var(--c-red-l)' : 'var(--t-2)',
        tooltip: isImmobilized
          ? `Speed 0 — ${speedZeroSources.join(', ')}. Base speed ${character.speed}ft.`
          : 'To change Speed, use Settings → Edit Stats.',
      };
    })(),
    { label: 'Proficiency', value: `+${computed.proficiency_bonus}`,                                 color: '#a78bfa' },
    // v2.45.0: PASS PERC removed — redundant with the Skills list which shows passive perception
    // alongside the live perception modifier on the left side of the sheet.
    // v2.33.3: Conditions as a compact chip — clickable to open the modal
    // v2.50.0: Count only reflects the actual active_conditions array length.
    // Exhaustion level is surfaced via the tooltip and the modal but not
    // double-counted in the chip number (was previously +1ing for any nonzero
    // exhaustion level, causing 5 conditions + level 1 exhaustion to display 6).
    // v2.75.0: Label spelled out as "Conditions". Exhaustion now surfaces
    // INLINE as a small "Exhaustion N" badge between the count and the label
    // when exhaustion_level > 0, so both states are visible at a glance.
    ...(onUpdateConditions ? [{
      label: 'Conditions',
      value: activeConditions.length || '—',
      subValue: exhaustionLevel > 0 ? `Exhaustion ${exhaustionLevel}` : undefined,
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
      { label: 'Spell Attack', value: spellAttack >= 0 ? `+${spellAttack}` : String(spellAttack), color: '#c084fc' },
      { label: 'Spell DC',     value: spellDC,                                                     color: '#c084fc' },
    ] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Stat chips strip — v2.45.0: defense chips render inline at the end so
          they share the same wrap row with INSP/AC/INIT/SPEED/PROF/COND.
          v2.75.0: Labels are now spelled out ("Armor Class", "Initiative",
          "Proficiency", "Conditions", etc.). Chips widened 80→110px and
          label font bumped 7→8 to accommodate the longer text. Conditions
          chip supports a `subValue` which renders as a small row between
          the big value and the label — used to show "Exhaustion N" inline. */}
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
              flex: '1 1 auto', minWidth: 64, maxWidth: 110,
              transition: 'all var(--tr-fast)',
            }}
            onMouseEnter={e => { if ((stat as any).onClick || (stat as any).editable) (e.currentTarget as HTMLDivElement).style.borderColor = `${stat.color}55`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${stat.color}22`; }}
          >
            <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 13, color: stat.color, lineHeight: 1 }}>
              {stat.value}
            </div>
            {(stat as any).subValue && (
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, color: stat.color, marginTop: 2, lineHeight: 1 }}>
                {(stat as any).subValue}
              </div>
            )}
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginTop: 3 }}>
              {stat.label}
            </div>
          </div>
        ))}

        {/* v2.45.0: Defense chips inline. Pill shape distinguishes them from stat boxes.
            Border style encodes kind: solid = resistance, thicker double-style = immunity, dashed = vulnerability.
            v2.50.0: Added clickable "Defenses" label that jumps into Settings → Damage Modifiers. */}
        {defenseChips.length > 0 && (
          <>
            <div style={{ width: 1, height: 22, background: 'var(--c-border)', marginLeft: 4, marginRight: 2, alignSelf: 'center' }} />
            <button
              onClick={onOpenSettings}
              disabled={!onOpenSettings}
              title={onOpenSettings ? 'Click to edit your damage modifiers in Settings' : undefined}
              style={{
                fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 9,
                letterSpacing: '0.14em', textTransform: 'uppercase' as const,
                color: 'var(--t-3)', background: 'transparent',
                border: 'none', padding: '0 6px',
                cursor: onOpenSettings ? 'pointer' : 'default',
                height: 22, alignSelf: 'center', minHeight: 0,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (onOpenSettings) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-gold-l)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-3)'; }}
            >
              Defenses
            </button>
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
