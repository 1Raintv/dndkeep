import { useState } from 'react';
import type { Character, Campaign } from '../../types';
import { CLASS_COMBAT_ABILITIES, type ClassAbility, type SaveSpec } from '../../data/classAbilities';
import { PSION_DISCIPLINES } from '../../data/psionDisciplines';
import { SPECIES } from '../../data/species';
import { logAction } from '../shared/ActionLog';
import { rollDice } from '../../lib/spellParser';
import { useToast } from '../shared/Toast';
import { computeStats } from '../../lib/gameUtils';
import ClassAbilityResolveModal, { formatOutcomesLog, type TargetOutcome } from '../Combat/ClassAbilityResolveModal';
import { supabase } from '../../lib/supabase';
import SlotBoxes, { PALETTE_TEAL, PALETTE_PSI, type SlotBoxesPalette } from './_shared/SlotBoxes';
import PsionicDicePool from './_shared/PsionicDicePool';

interface Props {
 character: Character;
 combatFilter: 'all' | 'action' | 'bonus' | 'reaction' | 'limited';
 onUpdate: (u: Partial<Character>) => void;
 userId?: string;
 campaignId?: string | null;
 // v2.247.0 — full Campaign object enables willing-fail automation
 // resolution in the save resolver modal. Optional so older callers
 // (solo character pages, share view) still compile; the modal just
 // falls back to the registry default when campaign is null.
 campaign?: Campaign | null;
}

const ACTION_LABELS: Record<string, string> = {
 action: ' Action',
 bonus: ' Bonus',
 reaction: ' Reaction',
 special: '⬡ Special',
 free: 'Free',
};

const ACTION_COLORS: Record<string, string> = {
 action: '#60a5fa',
 bonus: '#fbbf24',
 reaction: '#34d399',
 special: '#c084fc',
 free: 'var(--t-3)',
};

// v2.246.0 — Save chip resolver. Returns the numeric DC for an ability
// save spec, falling through to the character's spell save DC when the
// spec sets `dc: 'spell'`. Returns null if the ability is save-less or
// the character isn't a spellcaster (then the chip is hidden — better
// than showing "DC ?"). Pure function so it can be reused by the v2.247
// target picker.
function resolveSaveDC(save: SaveSpec | undefined, character: Character): number | null {
 if (!save) return null;
 if (typeof save.dc === 'number') return save.dc;
 // 'spell' — derive from the character's spellcasting class.
 const computed = computeStats(character);
 return computed.spell_save_dc ?? null;
}

// v2.324.0 — T3 limited-use refactor: UseTracker now wraps the shared
// SlotBoxes primitive (purple PSI for psionic uses, teal for once-per-rest,
// gold default). The previous design had two modes (>8 = ±1 stepper, ≤8 =
// raw chiclet rail). T3 spec drops the ±1 stepper entirely — even at 12
// uses, the user clicks individual boxes. SlotBoxes handles size scaling
// (sm 12×12 when max > 8 to keep the row narrow; md 16×16 otherwise for
// thumb-tap comfort).
function UseTracker({ abilityName, max, rest, character, onUpdate, palette }: {
 abilityName: string; max: number; rest: 'short' | 'long';
 character: Character; onUpdate: (u: Partial<Character>) => void;
 palette?: SlotBoxesPalette;
}) {
 const uses = ((character.feature_uses as Record<string, number>) ?? {})[abilityName] ?? 0;

 function handleToggle(_idx: number, isExpending: boolean) {
  const next = isExpending ? uses + 1 : uses - 1;
  const clamped = Math.min(max, Math.max(0, next));
  onUpdate({
   feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [abilityName]: clamped }
  });
 }

 // Default palette for rest-based features is teal; callers may override
 // (e.g. psionic disciplines pass PALETTE_PSI).
 const pal = palette ?? PALETTE_TEAL;
 const size = max > 8 ? 'sm' : 'md';
 const restWord = rest === 'short' ? 'Short' : 'Long';

 return (
  <SlotBoxes
   total={max}
   used={uses}
   onToggle={handleToggle}
   size={size}
   palette={pal}
   ariaLabel={`${abilityName} uses`}
   ariaLabelPrefix={`${abilityName} use`}
   title={(_, available) =>
    available
     ? `Use ${abilityName} (${restWord} Rest recovers)`
     : `Restore use (${restWord} Rest recovers)`
   }
  />
 );
}

function getMaxUses(ability: ClassAbility, character: Character): number | undefined {
 if (ability.maxUsesFn) {
 const val = ability.maxUsesFn(character);
 if (val === 999) return undefined; // unlimited
 return val;
 }
 // v2.376.0 — fall back to flat maxUses (used by species traits like
 // Healing Hands, Large Form). Returns undefined for unlimited.
 if (typeof ability.maxUses === 'number') {
 return ability.maxUses;
 }
 return undefined;
}

// Resolve dynamic values in descriptions
function getPsionicDieSize(level: number): string {
 if (level >= 17) return 'd12';
 if (level >= 11) return 'd10';
 if (level >= 5) return 'd8';
 return 'd6';
}

function getPsionicDieCount(level: number): number {
 if (level >= 17) return 12;
 if (level >= 13) return 10;
 if (level >= 9) return 8;
 if (level >= 5) return 6;
 return 4;
}

function resolveDesc(desc: string | ((c: Character) => string), character: Character): string {
 const raw = typeof desc === 'function' ? desc(character) : desc;
 return raw.replace('{{sneak_dice}}', String(Math.ceil(character.level / 2)));
}

export default function ClassAbilitiesSection({ character, combatFilter, onUpdate, userId, campaignId, campaign }: Props) {
 const { showToast } = useToast();
 const [justUsed, setJustUsed] = useState<string | null>(null);
 const [psionicRollHistory, setPsionicRollHistory] = useState<{ value: number; die: string }[]>([]);
 // v2.80.0: which ability card is expanded (click chevron to open detail panel)
 const [expandedAbility, setExpandedAbility] = useState<string | null>(null);
 // v2.247.0 — save resolver modal. Holds the ability + computed DC at
 // the time of the click so the modal renders consistent values even
 // if the character's stats change while it's open. cost is the
 // `cost` argument forwarded into finalizeUse so the existing
 // tracker-deduction path runs identically after the modal confirms.
 const [resolveModal, setResolveModal] = useState<{
 ability: ClassAbility; saveDC: number; cost?: number;
 } | null>(null);

 // v2.190.0 — Phase Q.0 pt 31: refresh a depleted once-per-rest feature
 // by spending Psionic Energy Dice. The "Restore (N PED)" button only
 // renders when the feature is depleted AND the pool has enough dice
 // (see button render around the Use button). This handler does both
 // the deduction and the feature_uses decrement in one update, then
 // logs to the action log so the DM + party see it.
 async function restoreUseFromPed(ability: ClassAbility) {
 const restoreCost = (ability as any).pedRestoreCost as number | undefined;
 if (typeof restoreCost !== 'number' || restoreCost <= 0) return;
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 // v2.368.0 — When class_resources['psionic-energy-dice'] is undefined
 // (newly-created Psion who hasn't spent yet), the pre-v2.368 fallback
 // `?? 0` made this think the pool was empty even though chiclets
 // showed full from getPsionicDieCount fallback. User-reported bug:
 // "Free Misty Step doesn't refund like it should." Fix: fall back to
 // getPsionicDieCount(level), matching the chiclet display source.
 const fallbackDice = getPsionicDieCount(character.level);
 const currentDice = (resources['psionic-energy-dice'] as number | undefined) ?? fallbackDice;
 if (currentDice < restoreCost) {
 showToast(`Not enough Psionic Energy Dice. Need ${restoreCost}, have ${currentDice}.`, 'warn');
 return;
 }
 const fu = ((character.feature_uses as Record<string, number>) ?? {});
 const used = fu[ability.name] ?? 0;
 if (used <= 0) return; // nothing to restore
 onUpdate({
 class_resources: { ...resources, 'psionic-energy-dice': currentDice - restoreCost },
 feature_uses: { ...fu, [ability.name]: Math.max(0, used - 1) },
 });
 await logAction({
 campaignId: campaignId ?? null,
 characterId: character.id,
 characterName: character.name,
 actionType: 'roll',
 actionName: `Restored ${ability.name} (spent ${restoreCost} PED)`,
 notes: `Refreshed feature use mid-rest. ${currentDice - restoreCost} PED remaining.`,
 });
 setJustUsed(`restore:${ability.name}`);
 setTimeout(() => setJustUsed(curr => curr === `restore:${ability.name}` ? null : curr), 1800);
 }

 // v2.247.0 — Use button entry. For save-bearing abilities (`save?`
 // present) AND an active campaign, we open the save resolver modal
 // first. The modal calls finalizeAbilityUse on confirm, passing the
 // per-target outcomes. Out-of-combat (no encounter) falls through to
 // the existing direct-use path with a warning toast in the modal so
 // the player can still log the cast manually.
 //
 // Non-save abilities (and abilities without an encounter context)
 // skip the modal and run finalizeAbilityUse directly.
 async function handleUseAbility(ability: ClassAbility, cost?: number) {
 if (ability.save && campaignId) {
 const dc = resolveSaveDC(ability.save, character);
 if (dc != null) {
 // Probe for an active encounter. If none, fall through — class
 // abilities still need to work outside combat (Telekinesis to
 // move an object, etc.). The modal would just show "no targets"
 // which is annoying for the common out-of-combat case.
 const { data: enc } = await supabase
 .from('combat_encounters')
 .select('id')
 .eq('campaign_id', campaignId)
 .eq('status', 'active')
 .maybeSingle();
 if (enc?.id) {
 setResolveModal({ ability, saveDC: dc, cost });
 return;
 }
 }
 }
 await finalizeAbilityUse(ability, cost, []);
 }

 /** v2.247.0 — Resource-deduction + log path. Called either directly
  *  by handleUseAbility (no save / no encounter) or by the save
  *  resolver modal's onConfirmed (with per-target outcomes). When
  *  outcomes are present, the log entry summarizes them via
  *  formatOutcomesLog instead of the generic "Used X" line. */
 async function finalizeAbilityUse(
 ability: ClassAbility,
 cost?: number,
 outcomes: TargetOutcome[] = [],
 ) {
 // v2.189.0 — Phase Q.0 pt 30: explicit Psionic Energy Die cost gate.
 // Abilities with `pedCost: N` (Warp Space=1, Mass Teleport=4, etc.)
 // require N dice in the pool; insufficient pool aborts with an alert
 // rather than silently deducting and going negative. Pool deduction
 // happens here in one shot rather than in the legacy isPool branch
 // below (which always deducted exactly 1, regardless of cost).
 const pedCost = (ability as any).pedCost as number | undefined;
 if (typeof pedCost === 'number' && pedCost > 0) {
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 // v2.368.0 — same uninit fix as restoreUseFromPed: when the pool
 // hasn't been materialized yet, fall back to getPsionicDieCount
 // (matches the chiclet display source) instead of 0. Pre-v2.368
 // a fresh Psion clicking Cast on Warp Space / Mass Teleport /
 // Duplicitous Target hit "Need N, have 0" toast because the
 // resource key was undefined.
 const fallbackDice = getPsionicDieCount(character.level);
 const currentDice = (resources['psionic-energy-dice'] as number | undefined) ?? fallbackDice;
 if (currentDice < pedCost) {
 // Insufficient pool — bail before logging or flashing.
 showToast(`Not enough Psionic Energy Dice. Need ${pedCost}, have ${currentDice}.`, 'warn');
 return;
 }
 const nextResources = { ...resources, 'psionic-energy-dice': currentDice - pedCost };
 onUpdate({ class_resources: nextResources });
 }

 // Mark as used if it has limited uses
 // v2.370.0 — Skip the feature_uses write for the PED pool row.
 // For pool rows (Psionic Energy Dice itself, plus any future
 // isPool-typed pool tracker), the source of truth is class_resources.
 // Writing feature_uses alongside is dead data — the chiclet display
 // ignores it — and risks downstream confusion (long-rest reset
 // logic, history events, etc.). Pre-v2.370 every Spend Die click
 // wrote feature_uses['Psionic Energy Dice']++ in addition to
 // decrementing the pool, which is the suspected cause of the
 // reported "first die spent gets refunded" bug. Per-feature
 // limited-use rows (Free Misty Step, Action Surge, etc.) still
 // write feature_uses since that IS their tracker.
 if (cost !== undefined && !((ability as any).isPool && (ability as any).psionicDie)) {
 const current = ((character.feature_uses as Record<string, number>) ?? {})[ability.name] ?? 0;
 onUpdate({
 feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [ability.name]: current + 1 }
 });
 }
 // v2.189.0 — Legacy isPool deduction: still fires for the
 // Psionic Energy Dice row itself (which has isPool but no
 // pedCost — clicking Spend Die on that row deducts exactly 1
 // and rolls). For abilities with pedCost set, we skip this
 // branch since deduction already happened above.
 // v2.367.0 — Fixed: when class_resources['psionic-energy-dice']
 // is undefined (newly created Psion, never spent before), the
 // pre-v2.367 guard `!== undefined` skipped the entire deduction
 // block and the user saw no change. Initialize from
 // getMaxUses(ability, character) when undefined so the very
 // first Spend correctly drops the pool from full → full-1.
 if (typeof pedCost !== 'number' && (ability.id === 'psionic-energy-dice' || (ability as any).isPool)) {
  const resources = { ...(character.class_resources as Record<string, number> ?? {}) };
  const fallbackMax = getMaxUses(ability, character) ?? 0;
  const current = (resources['psionic-energy-dice'] as number | undefined) ?? fallbackMax;
  resources['psionic-energy-dice'] = Math.max(0, current - 1);
  onUpdate({ class_resources: resources });
 }
 // For psionic energy dice — roll the die and show in action log
 let diceExpr: string | undefined;
 let rollResult: { total: number; rolls: number[] } | undefined;
 if ((ability as any).psionicDie) {
 const dieSize = getPsionicDieSize(character.level);
 diceExpr = `1${dieSize}`;
 rollResult = rollDice(diceExpr);
 }
 // Resolve description (may be a function)
 const desc = resolveDesc((ability as any).description ?? '', character);
 // v2.247.0 — when outcomes are present, the log notes summarize the
 // per-target save resolution (formatOutcomesLog) instead of the
 // truncated description. The description is still available in the
 // ability card for anyone who wants the full text.
 const saveDC = ability.save ? resolveSaveDC(ability.save, character) : null;
 const outcomeNote = (outcomes.length > 0 && ability.save && saveDC != null)
 ? formatOutcomesLog(ability.name, saveDC, ability.save.ability, outcomes)
 : null;
 // Log to action log
 await logAction({
 campaignId: campaignId ?? null,
 characterId: character.id,
 characterName: character.name,
 actionType: (ability as any).psionicDie ? 'roll' : ability.actionType === 'action' ? 'spell' :
 ability.actionType === 'bonus' ? 'spell' :
 ability.actionType === 'reaction' ? 'save' : 'roll',
 actionName: (ability as any).psionicDie
 ? `Spent Psionic Energy Die (1${getPsionicDieSize(character.level)})`
 : `Used ${ability.name}`,
 diceExpression: diceExpr,
 individualResults: rollResult?.rolls,
 total: rollResult?.total ?? 0,
 notes: (ability as any).psionicDie
 ? `Rolled 1${getPsionicDieSize(character.level)} = ${rollResult?.total} · ${getPsionicDieCount(character.level) - 1} dice remaining`
 : outcomeNote ?? (desc.slice(0, 100) + (desc.length > 100 ? '…' : '')),
 });
 // Store psionic roll for inline display
 if ((ability as any).psionicDie && rollResult) {
 const dieSize = getPsionicDieSize(character.level);
 setPsionicRollHistory(prev => [{ value: rollResult!.total, die: dieSize }, ...prev].slice(0, 5));
 }
 // Brief flash feedback
 setJustUsed(ability.name);
 setTimeout(() => setJustUsed(null), 2000);
 }
 const abilities = CLASS_COMBAT_ABILITIES[character.class_name] ?? [];

 // Inject active/both psychic disciplines as usable abilities
 const disciplineAbilities: ClassAbility[] = [];
 if (character.class_name === 'Psion') {
 const chosen: string[] = Array.isArray((character.class_resources as any)?.['psion-disciplines'])
 ? (character.class_resources as any)['psion-disciplines'] as string[]
 : [];
 for (const id of chosen) {
 const disc = PSION_DISCIPLINES.find(d => d.id === id);
 if (!disc || disc.type === 'passive') continue;
 disciplineAbilities.push({
 name: disc.name,
 actionType: disc.actionType ?? 'action',
 description: disc.description,
 minLevel: 2,
 isPool: true,
 rest: 'long',
 // Mark as psionic die cost
 ...(disc.dieCost ? { psionicDie: true } : {}),
 } as any);
 }
 }
 const allAbilities = [...abilities, ...disciplineAbilities];

 // v2.376.0 — Surface species traits with an explicit actionType as
 // clickable rows in the Actions tab. Pre-v2.376 Cat's Claws, Healing
 // Hands, Stone's Endurance, Breath Weapon, Large Form, Feline Agility
 // etc. only existed in the Features tab — players had to track them
 // mentally during combat. Now they render as ClassAbility-shaped rows
 // here. Passive traits (Darkvision, Brave, Fey Ancestry) have no
 // actionType so they're correctly excluded.
 const speciesAbilities: ClassAbility[] = [];
 const speciesData = SPECIES.find(s => s.name === character.species);
 if (speciesData) {
 for (const trait of speciesData.traits) {
 const t = trait as any;
 // Only traits with explicit actionType get surfaced. Passive
 // traits (Darkvision, Brave, etc.) lack actionType and stay
 // in the Features tab.
 if (!t.actionType) continue;
 speciesAbilities.push({
 name: trait.name,
 actionType: t.actionType,
 description: trait.description,
 minLevel: 1, // species traits available from level 1
 ...(typeof t.maxUses === 'number' ? { maxUses: t.maxUses } : {}),
 ...(t.rest ? { rest: t.rest } : {}),
 ...(t.range ? { range: t.range } : {}),
 } as any);
 }
 }
 const speciesAbilitySet = new Set(speciesAbilities.map(a => a.name));
 const allAbilitiesWithSpecies = [...allAbilities, ...speciesAbilities];

 // Filter by level and action type
 const filtered = allAbilitiesWithSpecies.filter(a => {
 if (a.minLevel > character.level) return false;
 if (combatFilter === 'limited') return a.maxUsesFn !== undefined || typeof a.maxUses === 'number' || (a as any).isPool === true || (a as any).psionicDie === true;
 if (combatFilter === 'all') return true;
 if (combatFilter === 'action') return a.actionType === 'action';
 if (combatFilter === 'bonus') return a.actionType === 'bonus';
 if (combatFilter === 'reaction') return a.actionType === 'reaction';
 return true;
 });

 if (filtered.length === 0) return null;

 return (
 <>
 <div style={{ marginTop: 'var(--sp-3)' }}>
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
 letterSpacing: '0.12em', textTransform: 'uppercase' as const,
 color: '#a78bfa', marginBottom: 8,
 }}>
 {character.class_name} Abilities
 </div>

 {/* Split disciplines into their own sub-section */}
 {disciplineAbilities.length > 0 && filtered.some(a => disciplineAbilities.includes(a)) && (
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
 textTransform: 'uppercase' as const, color: '#c084fc', marginBottom: 6, marginTop: 4 }}>
 Psychic Disciplines
 </div>
 )}
 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
 {filtered.map(ability => {
 const maxUses = getMaxUses(ability, character);
 const acColor = ACTION_COLORS[ability.actionType] ?? 'var(--t-3)';
 const descShort = resolveDesc(ability.description, character);
 const descLong = (ability as any).descriptionLong
 ? resolveDesc((ability as any).descriptionLong, character)
 : null;
 const isExpanded = expandedAbility === ability.name;

 return (
 <div
 key={ability.name}
 style={{
 // v2.238.0 — wrapper now mirrors the regular spell-row wrapper:
 // single thin border that recolors on expand, no left-only accent
 // stripe (the stripe moved INSIDE the row as grid col 1, matching
 // the spell rows below). Background tint flips on expand using
 // the action-type color, the same way spell rows tint by school.
 background: isExpanded ? `${acColor}08` : 'var(--c-surface)',
 border: `1px solid ${isExpanded ? `${acColor}45` : `${acColor}25`}`,
 borderRadius: 'var(--r-md)',
 overflow: 'hidden',
 transition: 'all 0.15s',
 }}
 >
 {/* v2.238.0 — Row converted from flex to the same 8-column grid
     used by the regular spell rows below
     (`70px 3px 1fr 46px 70px 74px 16px 170px`). Mapping:
       Col 0: action-type badge (replaces "Lvl 2" badge)
       Col 1: 3px color stripe (action color, same as school stripe)
       Col 2: name + concentration-style chip + subtitle line
              (recovery + tracker chiclets if any)
       Col 3: empty
       Col 4: empty
       Col 5: PED cost OR last-rolled PED value chip
       Col 6: chevron (when there's an expanded panel)
       Col 7: Use / Spend / Trigger button + optional Restore button
     The whole row is click-to-expand (matching spell rows) when an
     expanded panel exists; otherwise click is a no-op.
     The always-visible short description sits as a slim band BELOW
     the grid row — preserves the v2.86.0 UX where a player can read
     what an ability does without expanding. */}
 {(() => {
 // v2.324.0 — T3: every row is now expandable so the description
 // (moved out of the always-visible band into the expanded panel)
 // is always reachable. Roll history + stats grid still gate on
 // their own data inside the panel.
 const canExpand = true;
 const ped = (ability as any).pedCost as number | undefined;
 // v2.324.0 — T3: button text "Cast" replaces "Use" for the default
 // case. PED-cost abilities become "Cast (N PED)". Reactions remain
 // "Trigger" (semantically distinct — the player isn't initiating).
 // Pure die-spend rows keep "Spend Die (1dN)" since they roll, not cast.
 const restingLabel =
 typeof ped === 'number' && ped > 0 ? `Cast (${ped} PED)` :
 ability.actionType === 'reaction' ? 'Trigger' :
 (ability as any).psionicDie ? `Spend Die (1${getPsionicDieSize(character.level)})` :
 (ability as any).isPool ? 'Spend Die' : 'Cast';
 const isFlashing = justUsed === ability.name;
 const ACTION_BADGE_LABEL: Record<string, string> = {
 action: 'ACTION', bonus: 'BONUS', reaction: 'REACT', special: 'SPCL', free: 'FREE',
 };
 const actionBadge = ACTION_BADGE_LABEL[ability.actionType] ?? 'ABLY';
 // Recovery label — secondary line that mirrors a spell row's
 // "school" subtitle. Falls back to action label when no rest.
 const recoveryLabel = ability.rest === 'short' ? 'Short Rest'
 : ability.rest === 'long' ? 'Long Rest'
 : (ability as any).isPool ? 'Resource Pool'
 : (ability as any).psionicDie ? 'Psionic Die'
 : 'At Will';
 // v2.324.0 — T3: PED-pool ability gets a dedicated PsionicDicePool
 // tracker (purple SlotBoxes + N/max readout, sourced from the
 // class_resources['psionic-energy-dice'] number rather than
 // feature_uses, since other abilities deduct from class_resources).
 const isPedPoolRow = ability.isPool === true && (ability as any).psionicDie === true;
 // v2.324.0 — T3: range string (Psi Warper backfill) joined into
 // the subtitle line as "{recovery} · {range}" when present.
 const rangeStr = (ability as any).range as string | undefined;
 // v2.324.0 — T3: psionic disciplines (injected with `psionicDie`)
 // get the purple PSI palette to visually distinguish from regular
 // long-rest features that use TEAL.
 const trackerPalette = (ability as any).psionicDie ? PALETTE_PSI : PALETTE_TEAL;

 return (
 <div
 onClick={() => { if (canExpand) setExpandedAbility(isExpanded ? null : ability.name); }}
 style={{
 display: 'grid',
 // v2.371.0 — Unified template, matches SpellsTab + WeaponsTracker.
 // Order: LEAD(70) BAR(3) NAME(1fr) TIME(46) RANGE(70) HIT-DC(74)
 // EFFECT(80) BUTTONS(180) CHEVRON(16). Empty cells where the
 // surface doesn't have data so columns line up across tabs.
 gridTemplateColumns: '70px 3px 1fr 46px 70px 36px 74px 80px 180px 110px 16px',
 alignItems: 'center', gap: '0 8px',
 padding: '7px 10px',
 cursor: canExpand ? 'pointer' : 'default',
 minHeight: 44,
 }}
 >
 {/* Col 0: action-type badge (visual analog to "Lvl N" on spell rows) */}
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
 <span style={{
 fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 800,
 color: acColor,
 padding: '3px 8px', borderRadius: 6,
 border: `1px solid ${acColor}45`,
 background: `${acColor}10`,
 whiteSpace: 'nowrap' as const,
 letterSpacing: '0.06em',
 }} title={`Action type: ${ability.actionType}`}>
 {actionBadge}
 </span>
 </div>

 {/* Col 1: 3px color stripe — same visual function as spell row's school bar */}
 <div style={{ width: 3, height: 30, borderRadius: 2, background: acColor, opacity: 0.75 }} />

 {/* Col 2: name + chips + subtitle (recovery + tracker chiclets) */}
 <div style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
 <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {ability.name}
 </span>
 {/* v2.373.0 — Resource chip moved to TAGS column (col 5) as a
     "P" chip. NAME cell stays clean — name only. */}
 </div>
 <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1, whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
 <span style={{ flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
  {recoveryLabel}{rangeStr ? ` · ${rangeStr}` : ''}
 </span>
 {/* v2.373.0 — Chiclets moved out of this subtitle into the
     dedicated CHARGES column (col 9) at the far right of the
     row. Per user feedback: "things that have charges...
     should be off to the right of the cast button so that you
     can clearly see how many you have left to use." Pre-v2.373
     the PsionicDicePool / UseTracker rendered inline here in
     the NAME subtitle, mixing chiclet state with descriptive
     text. */}
 </div>
 </div>

 {/* Col 3: TIME — for now empty since action type lives in the LEAD
     badge. Reserved so the column reserves visual width consistent
     with SpellsTab. */}
 <div />

 {/* Col 4: RANGE — reads ability.range (e.g. "30 ft", "Self",
     "60 ft"). Empty when the ability has no spatial component
     (e.g. self-targeting Action Surge). Aligns with SpellsTab's
     RANGE column for visual consistency across both tabs. */}
 <div style={{ fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {(ability as any).range ?? ''}
 </div>

 {/* Col 5: TAGS — small chips signaling AoE / Pool for class
     abilities. v2.373.0 — class abilities don't carry spell-level
     concentration (that's tracked at the spell layer), so the C
     chip is omitted here. The "P" chip replaces the inline
     Resource chip that previously sat in the NAME cell — moves
     visual weight to the consistent column position. */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexWrap: 'wrap' as const }}>
 {ability.isPool && (
 <span
 title="Resource pool — see remaining charges to the right"
 style={{
 fontSize: 9, fontWeight: 800,
 color: '#60a5fa',
 background: 'rgba(96,165,250,0.12)',
 border: '1px solid rgba(96,165,250,0.4)',
 borderRadius: 4, padding: '1px 4px',
 lineHeight: 1.2, fontFamily: 'var(--ff-stat)',
 }}
 >P</span>
 )}
 {(ability as any).isAoE && (
 <span
 title="Area-of-effect ability"
 style={{
 fontSize: 8, fontWeight: 800,
 color: '#fb923c',
 background: 'rgba(251,146,60,0.14)',
 border: '1px solid rgba(251,146,60,0.4)',
 borderRadius: 4, padding: '1px 3px',
 lineHeight: 1.2, fontFamily: 'var(--ff-stat)',
 letterSpacing: '0.02em',
 }}
 >AoE</span>
 )}
 </div>

 {/* Col 6: HIT/DC — Save chip for save-bearing abilities. Renders
     "DC X · YYY" matching the spell modal's save-pill format. Tooltip
     shows the on-fail / on-success consequences when present. Empty
     when the ability has no `save` field — keeps non-save abilities
     visually identical to v2.245. */}
 <div style={{ textAlign: 'center' }}>
 {ability.save && (() => {
 const dc = resolveSaveDC(ability.save, character);
 if (dc == null) return null;
 const tip = [
 `DC ${dc} ${ability.save.ability} save`,
 ability.save.onFailure ? `On fail: ${ability.save.onFailure}` : '',
 ability.save.onSuccess ? `On save: ${ability.save.onSuccess}` : '',
 ].filter(Boolean).join('\n');
 return (
 <span
 title={tip}
 style={{
 display: 'inline-flex', alignItems: 'center', gap: 4,
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 11,
 padding: '2px 7px', borderRadius: 999,
 background: 'rgba(167,139,250,0.12)',
 border: '1px solid rgba(167,139,250,0.4)',
 color: '#a78bfa',
 letterSpacing: '0.04em',
 whiteSpace: 'nowrap' as const,
 }}>
 <span style={{ fontSize: 8, fontWeight: 700, opacity: 0.7 }}>DC</span>
 {dc}
 <span style={{ fontSize: 9, opacity: 0.85 }}>{ability.save.ability}</span>
 </span>
 );
 })()}
 </div>

 {/* Col 6: EFFECT — PED cost chip OR last-rolled PED value badge.
     Aligns with SpellsTab's EFFECT column (where damage dice render
     for spells); for class abilities this column shows the resource
     economics. pedCost and psionicDie are mutually exclusive on a
     given ability. */}
 <div style={{ textAlign: 'center' }}>
 {(ability as any).psionicDie ? (() => {
 const hasRoll = psionicRollHistory.length > 0;
 return (
 <span
 title={hasRoll ? `Last roll: ${psionicRollHistory[0].value} on 1${psionicRollHistory[0].die}` : 'No rolls yet — click Spend Die to roll'}
 style={{
 display: 'inline-flex', alignItems: 'center', gap: 3,
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 12,
 padding: '1px 7px', borderRadius: 999,
 background: hasRoll ? 'rgba(232,121,249,0.18)' : 'transparent',
 border: `1px solid ${hasRoll ? 'rgba(232,121,249,0.5)' : 'rgba(232,121,249,0.2)'}`,
 color: hasRoll ? '#e879f9' : 'rgba(232,121,249,0.4)',
 transition: 'background 0.25s, border-color 0.25s, color 0.25s',
 }}>
 <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.7 }}>ROLL</span>
 {hasRoll ? psionicRollHistory[0].value : '—'}
 </span>
 );
 })() : typeof ped === 'number' && ped > 0 ? (
 <span style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 11,
 color: '#e879f9', background: 'rgba(232,121,249,0.1)',
 border: '1px solid rgba(232,121,249,0.35)',
 borderRadius: 999, padding: '1px 6px',
 }} title={`Costs ${ped} Psionic Energy Die${ped === 1 ? '' : 's'}`}>
 {ped} PED
 </span>
 ) : null}
 </div>

 {/* Col 7: BUTTONS — Use button + optional Restore button.
     Aligns with SpellsTab's BUTTONS column (Cast + Damage). Click
     handlers stop propagation so they don't trigger the row-level
     expand toggle. */}
 <div onClick={e => {
 const target = e.target as HTMLElement;
 if (target.closest('button')) e.stopPropagation();
 }} style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'nowrap' as const, alignItems: 'center', width: '100%' }}>
 {ability.actionType !== 'free' && (
 <button
 onClick={() => handleUseAbility(ability, maxUses !== undefined ? 1 : undefined)}
 style={{
 padding: '4px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 background: isFlashing ? '#34d399' : acColor + '20',
 border: `1px solid ${isFlashing ? '#34d399' : acColor + '60'}`,
 color: isFlashing ? '#000' : acColor,
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
 letterSpacing: '0.04em',
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 flexShrink: 0, minHeight: 0,
 textAlign: 'center' as const,
 }}
 >
 {isFlashing ? 'Used!' : restingLabel}
 </button>
 )}
 {/* PED-restore button — only when feature is depleted AND
     player has enough PEDs. Same conditions as v2.190.0. */}
 {(ability as any).pedRestoreCost !== undefined && maxUses !== undefined && (() => {
 const restoreCost = (ability as any).pedRestoreCost as number;
 const used = ((character.feature_uses as Record<string, number>) ?? {})[ability.name] ?? 0;
 if (used < maxUses) return null;
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 // v2.368.0 — Same uninit fix as restoreUseFromPed handler. The
 // chiclet display falls back to the pool max when the resource
 // is uninitialized; this disable check has to use the same
 // fallback or it leaves the button disabled with full chiclets,
 // which is what the user reported as "doesn't refund."
 const fallbackDice = getPsionicDieCount(character.level);
 const currentDice = (resources['psionic-energy-dice'] as number | undefined) ?? fallbackDice;
 const insufficient = currentDice < restoreCost;
 const flashKey = `restore:${ability.name}`;
 const restoreFlashing = justUsed === flashKey;
 return (
 <button
 onClick={() => restoreUseFromPed(ability)}
 disabled={insufficient}
 title={insufficient
 ? `Need ${restoreCost} Psionic Energy Die${restoreCost === 1 ? '' : 's'} (have ${currentDice})`
 : `Spend ${restoreCost} PED to refresh this feature mid-rest`}
 style={{
 padding: '4px 10px', borderRadius: 'var(--r-md)',
 cursor: insufficient ? 'not-allowed' : 'pointer',
 background: restoreFlashing
 ? '#34d399'
 : insufficient
 ? 'var(--c-raised)'
 : 'rgba(232,121,249,0.12)',
 border: `1px solid ${
 restoreFlashing ? '#34d399' :
 insufficient ? 'var(--c-border)' :
 'rgba(232,121,249,0.45)'
 }`,
 color: restoreFlashing
 ? '#000'
 : insufficient
 ? 'var(--t-3)'
 : '#e879f9',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
 letterSpacing: '0.04em',
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 flexShrink: 0, minHeight: 0,
 opacity: insufficient ? 0.55 : 1,
 }}
 >
 {restoreFlashing ? 'Restored!' : `+${restoreCost} PED`}
 </button>
 );
 })()}
 </div>

 {/* Col 9: CHARGES — chiclet tracker for limited-use abilities.
     v2.373.0: moved here from inside the NAME subtitle so the user
     can scan all "what's left" indicators in a consistent column
     position at the far right of the row, after the Cast button.
     PED pool uses PsionicDicePool (purple, sourced from
     class_resources['psionic-energy-dice']); other limited-use
     abilities (Free Misty Step, Action Surge, etc.) use UseTracker
     (sourced from feature_uses[ability.name]). Empty for at-will
     abilities (no maxUses). */}
 <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
 {isPedPoolRow && maxUses !== undefined ? (
 (() => {
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 const remaining = (resources['psionic-energy-dice'] as number | undefined) ?? maxUses;
 const used = Math.max(0, maxUses - remaining);
 return (
 <PsionicDicePool
 character={character}
 total={maxUses}
 used={used}
 onChange={(newUsed) => {
 const newRemaining = Math.max(0, maxUses - newUsed);
 onUpdate({
 class_resources: { ...resources, 'psionic-energy-dice': newRemaining },
 });
 }}
 />
 );
 })()
 ) : maxUses !== undefined && ability.rest ? (
 <UseTracker
 abilityName={ability.name}
 max={maxUses}
 rest={ability.rest}
 character={character}
 onUpdate={onUpdate}
 palette={trackerPalette}
 />
 ) : null}
 </div>

 {/* Col 10: CHEVRON — last column, matches SpellsTab. Only renders
     content when there's an expanded panel; the cell is always
     present so columns line up regardless. */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 {canExpand && (
 <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
 )}
 </div>
 </div>
 );
 })()}

 {/* v2.324.0 — T3: description moved out of the always-visible band
     into the expanded panel. Short description renders first
     (replaces the band's previous role); long description follows
     when present. Layout still mirrors the regular spell row's
     expanded panel: stats grid on top, prose body below. */}
 {isExpanded && (
 <div style={{
 padding: '10px 14px 12px 14px',
 borderTop: `1px solid ${acColor}20`,
 background: 'rgba(255,255,255,0.015)',
 }}>
 {/* Stats grid — adapted to ability fields rather than spell fields. */}
 <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 10, alignItems: 'center' }}>
 {(() => {
 const ped = (ability as any).pedCost as number | undefined;
 const rangeStr = (ability as any).range as string | undefined;
 const stats: Array<[string, string | null]> = [
 ['Action', ACTION_LABELS[ability.actionType]?.replace(/^[^A-Za-z]+/, '') ?? ability.actionType],
 ['Range', rangeStr ?? null],
 ['Recovery', ability.rest === 'short' ? 'Short Rest' : ability.rest === 'long' ? 'Long Rest' : 'At Will'],
 ['Uses', maxUses !== undefined ? String(maxUses) : null],
 ['Cost', typeof ped === 'number' && ped > 0 ? `${ped} PED` : null],
 ];
 return stats.filter(([, v]) => v != null).map(([k, v]) => (
 <div key={k}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>{k}</div>
 <div style={{ fontSize: 12, color: 'var(--t-1)' }}>{v}</div>
 </div>
 ));
 })()}
 </div>
 {/* Short description first — what was previously the always-visible
     band. Always rendered when the panel is open. */}
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
 lineHeight: 1.5, marginBottom: descLong ? 10 : 0,
 }}>
 {descShort}
 </div>
 {descLong && (
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
 lineHeight: 1.6, whiteSpace: 'pre-wrap' as const,
 }}>
 {descLong}
 </div>
 )}
 {(ability as any).psionicDie && psionicRollHistory.length > 0 && (
 <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' as const }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginRight: 4 }}>
 Recent Rolls:
 </span>
 {psionicRollHistory.map((r, i) => (
 <span key={i} style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: i === 0 ? 13 : 11,
 padding: '1px 7px', borderRadius: 999,
 background: i === 0 ? 'rgba(232,121,249,0.2)' : 'rgba(232,121,249,0.07)',
 border: `1px solid rgba(232,121,249,${i === 0 ? '0.5' : '0.2'})`,
 color: '#e879f9',
 flexShrink: 0,
 }}>
 {r.value}
 </span>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 {/* v2.247.0 — Save resolver modal. Mounts when handleUseAbility
     detects a save-bearing ability + active encounter and stashes
     the ability + DC into resolveModal. The portal lifts the modal
     out of any nested overflow:hidden so it covers the sheet
     properly. */}
 {resolveModal && campaignId && (
 <ClassAbilityResolveModal
 open={!!resolveModal}
 onClose={() => setResolveModal(null)}
 ability={resolveModal.ability}
 saveDC={resolveModal.saveDC}
 character={character}
 campaign={campaign ?? null}
 campaignId={campaignId}
 onConfirmed={(outcomes) => {
 const m = resolveModal;
 // Run the actual deduction + log AFTER the modal's setState
 // settles. setResolveModal(null) is fired by the modal's
 // onClose right after onConfirmed, so we don't need to do it
 // here.
 finalizeAbilityUse(m.ability, m.cost, outcomes);
 }}
 />
 )}
 </>
 );
}
