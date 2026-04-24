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
  // v2.88.0: Turn-scoped Standard Action effects surface as visible badges
  // next to AC so the player + DM see them at a glance regardless of tab.
  dashingThisTurn?: boolean;
  dodgingThisTurn?: boolean;
}

const SPELLCASTERS = ['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard','Artificer'];

export default function HPStatsPanel({
  character, computed, onUpdateAC, onUpdateSpeed, onToggleInspiration, onUpdateConditions, onUpdateExhaustionLevel, acTooltip, defenseChips = [], onOpenSettings, dashingThisTurn = false, dodgingThisTurn = false,
}: HPStatsPanelProps) {
  // v2.72.0: editingAC state removed — AC is no longer quick-editable on the chip.
  // v2.77.0: editingSpeed state removed — Speed is no longer quick-editable either.
  const [showConditionModal, setShowConditionModal] = useState(false);
  // v2.185.0 — Phase Q.0 pt 26: stat-popover state. One open at a time.
  // Right now only Proficiency uses it; AC will reuse this same state in
  // v2.186 by adding 'ac' to the union. Click the chip to open, click
  // anywhere outside (handled inline below) or click the chip again to
  // close. Read-only — these popovers explain the math, they don't edit.
  const [statPopover, setStatPopover] = useState<null | 'proficiency' | 'ac'>(null);
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
      logHistory: { characterId: character.id, userId: character.user_id },
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
      // v2.136.0 — Phase L pt 4: Encumbered halves Speed. Listed AFTER the
      // zero check so a Restrained character still shows 0 (zero wins).
      const halvedSources = activeConditions.filter(c => CONDITION_MAP[c]?.speedHalved);
      const isHalved = halvedSources.length > 0;
      // v2.143.0 — Phase N pt 1: mirror the canonical canMove() math from
      // lib/movement.ts so the Speed chip doesn't drift from actual
      // combat behavior. Order: zero → exhaustion (−5 per level) → halve.
      // Dash doubling is combat-only and doesn't apply to this display.
      const speedAfterExhaustion = Math.max(0, character.speed - 5 * exhaustionLevel);
      const displaySpeed = isImmobilized
        ? 0
        : (isHalved ? Math.floor(speedAfterExhaustion / 2) : speedAfterExhaustion);
      const hasExhaustionPenalty = exhaustionLevel > 0 && !isImmobilized;
      // Build tooltip pieces describing what's been applied, in order.
      const tooltipPieces: string[] = [];
      if (isImmobilized) tooltipPieces.push(`Speed 0 — ${speedZeroSources.join(', ')}`);
      else {
        if (hasExhaustionPenalty) tooltipPieces.push(`−${5 * exhaustionLevel}ft from Exhaustion ${exhaustionLevel}`);
        if (isHalved) tooltipPieces.push(`Halved by ${halvedSources.join(', ')}`);
      }
      const tooltip = tooltipPieces.length > 0
        ? `${tooltipPieces.join(' · ')}. Base speed ${character.speed}ft.`
        : 'To change Speed, use Settings → Edit Stats.';
      // Color: red if immobilized, amber if anything reduces it, else default.
      const reduced = isHalved || hasExhaustionPenalty;
      return {
        label: 'Speed',
        value: isImmobilized ? '0ft' : `${displaySpeed}ft`,
        color: isImmobilized ? 'var(--c-red-l)' : (reduced ? '#fbbf24' : 'var(--t-2)'),
        tooltip,
      };
    })(),
    // v2.185.0 — Phase Q.0 pt 26: Proficiency chip clickable, opens
    // a popover showing the PHB formula: ceil(level/4) + 1. The
    // popover is rendered below the strip with absolute positioning.
    {
      label: 'Proficiency',
      value: `+${computed.proficiency_bonus}`,
      color: '#a78bfa',
      clickable: true,
      onClick: () => setStatPopover(p => p === 'proficiency' ? null : 'proficiency'),
      tooltip: 'Click to see the equation',
    },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>

      {/* v2.185.0 — Phase Q.0 pt 26: stat popover. Absolutely positioned
          inside the panel so it stacks above whatever sits below the
          chips strip (typically the HP bar). Click-outside dismissal is
          handled by an invisible overlay with onClick={() => setStatPopover(null)}.
          We use a portal-free approach because this needs to render
          inline relative to the chip — fancy popper.js positioning
          would be overkill for a single click target. */}
      {statPopover === 'proficiency' && (() => {
        const lvl = character.level;
        const tier = Math.ceil(Math.max(1, Math.min(20, lvl)) / 4);
        const bonus = tier + 1;
        return (
          <>
            {/* Click-outside scrim */}
            <div
              onClick={() => setStatPopover(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'transparent' }}
            />
            <div
              role="dialog"
              aria-label="Proficiency Bonus breakdown"
              style={{
                position: 'absolute', top: 64, left: 8, zIndex: 51,
                background: 'var(--c-card)',
                border: '1px solid #a78bfa55',
                borderLeft: '3px solid #a78bfa',
                borderRadius: 'var(--r-md)',
                padding: '12px 14px',
                minWidth: 260, maxWidth: 320,
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a78bfa' }}>
                  Proficiency Bonus
                </span>
                <button
                  onClick={() => setStatPopover(null)}
                  aria-label="Close"
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--t-3)',
                    cursor: 'pointer', fontSize: 14, lineHeight: 1,
                    padding: 0, minWidth: 0, minHeight: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.6 }}>
                Per the 2024 PHB, your proficiency bonus is determined by your
                character level using the formula{' '}
                <code style={{ background: 'var(--c-raised)', padding: '1px 5px', borderRadius: 4, color: 'var(--t-1)' }}>
                  ⌈level ÷ 4⌉ + 1
                </code>.
              </div>
              <div style={{
                marginTop: 10, padding: '10px 12px',
                background: 'var(--c-raised)', borderRadius: 'var(--r-md)',
                fontFamily: 'var(--ff-stat)', fontSize: 14, color: 'var(--t-1)',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div>Character level: <strong style={{ color: '#a78bfa' }}>{lvl}</strong></div>
                <div>⌈{lvl} ÷ 4⌉ = <strong style={{ color: '#a78bfa' }}>{tier}</strong></div>
                <div>{tier} + 1 = <strong style={{ color: '#a78bfa' }}>+{bonus}</strong></div>
              </div>
              <div style={{ marginTop: 8, fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
                Levels 1–4: +2 · 5–8: +3 · 9–12: +4 · 13–16: +5 · 17–20: +6
              </div>
            </div>
          </>
        );
      })()}

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

        {/* v2.88.0: Turn-scoped Standard Action effects surface as visible
            chips in the vitals strip so the player + DM see them at a glance.
            Both clear on End Turn (ActionEconomy.onNewTurn). */}
        {(dashingThisTurn || dodgingThisTurn) && (
          <>
            <div style={{ width: 1, height: 22, background: 'var(--c-border)', marginLeft: 4, marginRight: 2, alignSelf: 'center' }} />
            {dashingThisTurn && (
              <span
                title="Dashing this turn: extra Movement equal to your Speed (2024 PHB)"
                style={{
                  fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                  padding: '3px 9px', borderRadius: 999,
                  color: '#60a5fa', background: 'rgba(96,165,250,0.15)',
                  border: '1px solid rgba(96,165,250,0.5)',
                  alignSelf: 'center',
                }}
              >
                Dashing
              </span>
            )}
            {dodgingThisTurn && (
              <span
                title="Dodging: attack rolls against you have Disadvantage; you make DEX saves with Advantage (until start of your next turn)"
                style={{
                  fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                  padding: '3px 9px', borderRadius: 999,
                  color: '#60a5fa', background: 'rgba(96,165,250,0.15)',
                  border: '1px solid rgba(96,165,250,0.5)',
                  alignSelf: 'center',
                }}
              >
                Dodging
              </span>
            )}
          </>
        )}

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
