// src/rules/targetOrder.ts — pure target grouping / ordering rules (SRD 5.2.1).
//
// v2.746.0 — Every target list in the app (TargetPickerModal, SpellTarget-
// PickerModal, SpellHealPickerModal, MultiTargetSavePicker, MonsterActionPanel,
// LegendaryActionResolverModal, BuffTargetPickerModal, MultiAttackPickerModal,
// ClassAbilityResolveModal) used to FILTER dead participants out and list the
// rest in encounter order. Two user reports motivated this module:
//   1. "the area a character damages doesn't register the tokens there" — the
//      0-HP / dead creatures standing in a Fireball were dropped from the
//      list entirely, so the player could not target them at all.
//   2. "ordering of targets" — living enemies were buried between allies and
//      corpses instead of sitting at the top.
// The 2024 rules are explicit that 0 HP and death are NOT the same thing and
// that neither removes a creature from the world (quotes from the official
// SRD 5.2.1 PDF, extracted with pdftotext):
//   - "Damage at 0 Hit Points. If you take any damage while you have 0 Hit
//     Points, you suffer a Death Saving Throw failure. If the damage is from a
//     Critical Hit, you suffer two failures instead. If the damage equals or
//     exceeds your Hit Point maximum, you die."  → a creature at 0 HP is a
//     legal (and consequential) attack target, so it must stay in the list.
//   - "Monster Death. A monster dies the instant it drops to 0 Hit Points,
//     although a Game Master can ignore this rule for an individual monster
//     and treat it like a character."  → a 0-HP monster whose row still has
//     is_dead=false is the GM exercising exactly that option; we honour the
//     row, never the type.
//   - "Dead. A dead creature has no Hit Points and can't regain them unless it
//     is first revived by magic such as the Raise Dead or Revivify spell."
//     → dead creatures are still the TARGET of Revivify / Raise Dead, so they
//     stay listed (at the bottom) rather than being filtered out.
// Nothing in this module decides whether an attack is *allowed* — resolvers
// keep their own is_dead gates. It only classifies and orders, and it is the
// single home for that logic so the nine pickers cannot drift apart again.
//
// Zero component / supabase / data-table imports, same contract as
// rules/dice.ts. The one import is lib/participantType, itself a zero-import
// leaf (verified v2.746) — re-implementing the 'creature'|'monster'|'npc'
// alias check here would be the duplicate-implementation sin.

import { isCreatureParticipantType } from '../lib/participantType';

/** Buckets a target list is split into, in display order (see the two ORDER
 *  constants). 'self' is only ever present when the caller opts in via
 *  `allowSelfTarget`. */
export type TargetGroup = 'hostile' | 'ally' | 'self' | 'down' | 'dead';

/** Attack / damage order: living enemies first, corpses last. */
export const TARGET_GROUP_ORDER: readonly TargetGroup[] = ['hostile', 'ally', 'self', 'down', 'dead'];

/** Heal order: the creatures at 0 HP are the ones a heal exists for, so they
 *  lead; the dead (who "can't regain [Hit Points] unless … first revived")
 *  still trail so a revive spell can reach them. */
export const HEAL_GROUP_ORDER: readonly TargetGroup[] = ['down', 'ally', 'self', 'hostile', 'dead'];

export const TARGET_GROUP_LABEL: Record<TargetGroup, string> = {
  hostile: 'Enemies',
  ally: 'Allies',
  self: 'Yourself',
  down: 'At 0 HP',
  dead: 'Dead',
};

/** Groups `autoSelectIds` pre-checks for an area effect. Dead creatures in
 *  the area are listed and tickable but never pre-checked — most damage
 *  spells are wasted on a corpse, and the ones that want one (Revivify) are
 *  single-target anyway. */
export const AUTO_SELECT_GROUPS: readonly TargetGroup[] = ['hostile', 'ally', 'down'];

/** The minimum shape a participant needs. Structural on purpose so the
 *  full CombatParticipant, MonsterActionPanel's MiniParticipant and the
 *  legendary resolver's rows all fit without adapters. */
export interface TargetLike {
  id: string;
  name: string;
  participant_type: string;
  /** Virtual field flattened from combatants (v2.317); null when the JOIN
   *  missed, which we treat as "HP unknown" — NOT as 0 HP. */
  current_hp?: number | null;
  max_hp?: number | null;
  is_dead?: boolean | null;
}

export interface RankedTarget<T extends TargetLike = TargetLike> {
  target: T;
  group: TargetGroup;
  isSelf: boolean;
  /** Measured distance in feet, or null when it could not be measured
   *  (no map, unplaced token, theatre of the mind). */
  distanceFt: number | null;
  /** FAIL-OPEN: true whenever no range limit applies or the distance is
   *  unknown. Only false when a real measurement exceeds a real limit
   *  (or the caller's `inRange` predicate said so). */
  inRange: boolean;
  /** True when `inRange` came from an actual check rather than the
   *  fail-open default. `autoSelectIds` uses this so a picker with no map
   *  never pre-checks the whole encounter. */
  rangeKnown: boolean;
}

export interface RankOptions<T extends TargetLike> {
  /** The acting participant. Dropped from the result unless
   *  `allowSelfTarget`, in which case it lands in the 'self' group (or
   *  'down'/'dead' if that is its state).
   *  Object form only (v2.746): a bare id was accepted at first, and two
   *  pickers that filter the caster OUT of `targets` passed one — the
   *  ranker could not resolve a side, so allies were grouped and labelled
   *  "Enemies". Pass `participant_type` whenever the actor is not in
   *  `targets`; the type system now makes the omission visible at the
   *  call site instead of in the picker. */
  self?: { id: string; participant_type?: string } | null;
  allowSelfTarget?: boolean;
  /** Footprint-aware distance in feet; return null when unmeasurable. */
  distanceFt?: (t: T) => number | null;
  /** Range limit in feet. Null/undefined = no limit. */
  maxRangeFt?: number | null;
  /** Overrides the maxRangeFt check — e.g. an AoE "is this token inside the
   *  cone" predicate. Return null to mean "could not determine" (fail-open). */
  inRange?: (t: T) => boolean | null;
  /** Group order; defaults to TARGET_GROUP_ORDER. */
  order?: readonly TargetGroup[];
}

/** Which side of the table a participant sits on. The app has no faction
 *  model, so this is the same heuristic every picker already used
 *  ('character' vs everything else). It mislabels a recruited monster as
 *  hostile — that only affects ORDER, never eligibility. */
export function sideOf(t: Pick<TargetLike, 'participant_type'>): 'characters' | 'creatures' {
  return isCreatureParticipantType(t.participant_type) ? 'creatures' : 'characters';
}

export function isHostileTo(
  a: Pick<TargetLike, 'participant_type'>,
  b: Pick<TargetLike, 'participant_type'>,
): boolean {
  return sideOf(a) !== sideOf(b);
}

/** Only the row's is_dead flag counts — set by three death-save failures,
 *  massive damage, or a resolver's monsterDied. A 0-HP monster with
 *  is_dead=false is the GM "treat[ing] it like a character" (SRD) and is
 *  NOT dead. */
export function isDead(t: Pick<TargetLike, 'is_dead'>): boolean {
  return !!t.is_dead;
}

/** "Down" = at 0 Hit Points or dead. Unknown HP (null) is NOT down — a
 *  participant whose combatant JOIN failed must not sink to the bottom of
 *  the list just because we could not read its HP. */
export function isDown(t: Pick<TargetLike, 'current_hp' | 'is_dead'>): boolean {
  if (isDead(t)) return true;
  return typeof t.current_hp === 'number' && t.current_hp <= 0;
}

/** Classify one target relative to the actor. Dead beats down beats self
 *  beats side, so a downed actor targeting itself shows under 'down'. */
export function targetGroup(
  t: TargetLike,
  self?: Pick<TargetLike, 'id' | 'participant_type'> | null,
): TargetGroup {
  if (isDead(t)) return 'dead';
  if (isDown(t)) return 'down';
  if (self && t.id === self.id) return 'self';
  if (self && isHostileTo(t, self)) return 'hostile';
  // No actor to measure against → nothing can be "hostile"; every living
  // target is listed together (legacy encounter order preserved by the
  // stable sort's name/id tiebreak).
  return self ? 'ally' : 'hostile';
}

/** Sort key: group → in range before out → nearer first (unknown distance
 *  last) → self after others → name → id. Total and deterministic so two
 *  pickers showing the same encounter list it identically. */
export function compareRanked<T extends TargetLike>(
  a: RankedTarget<T>,
  b: RankedTarget<T>,
  order: readonly TargetGroup[] = TARGET_GROUP_ORDER,
): number {
  const ga = order.indexOf(a.group), gb = order.indexOf(b.group);
  if (ga !== gb) return (ga === -1 ? order.length : ga) - (gb === -1 ? order.length : gb);
  if (a.inRange !== b.inRange) return a.inRange ? -1 : 1;
  const da = a.distanceFt, db = b.distanceFt;
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }
  if (a.isSelf !== b.isSelf) return a.isSelf ? 1 : -1;
  const n = a.target.name.localeCompare(b.target.name);
  if (n !== 0) return n;
  return a.target.id.localeCompare(b.target.id);
}

/** Rank a participant list for display. Drops ONLY the actor (unless
 *  allowSelfTarget) — never a dead or downed creature; those sink to the
 *  bottom instead so Revivify / "damage at 0 HP" remain possible. */
export function rankTargets<T extends TargetLike>(
  targets: readonly T[],
  opts: RankOptions<T> = {},
): RankedTarget<T>[] {
  const selfId = opts.self?.id ?? null;
  // Hostility needs the actor's participant_type: take it from the option
  // object when given, else from the actor's own row in `targets`. With
  // neither, every living target lands in the top group (still "living
  // first, down, then dead" — only the enemy/ally split is lost).
  const selfType = opts.self?.participant_type;
  const selfRef: Pick<TargetLike, 'id' | 'participant_type'> | null = selfId === null
    ? null
    : selfType
      ? { id: selfId, participant_type: selfType }
      : targets.find(t => t.id === selfId) ?? null;
  const order = opts.order ?? TARGET_GROUP_ORDER;
  const ranked: RankedTarget<T>[] = [];
  for (const t of targets) {
    const isSelf = selfId !== null && t.id === selfId;
    if (isSelf && !opts.allowSelfTarget) continue;
    const distanceFt = opts.distanceFt ? opts.distanceFt(t) : null;
    let inRange = true, rangeKnown = false;
    if (opts.inRange) {
      const r = opts.inRange(t);
      if (r !== null) { inRange = r; rangeKnown = true; }
    } else if (opts.maxRangeFt != null && distanceFt !== null) {
      inRange = distanceFt <= opts.maxRangeFt;
      rangeKnown = true;
    }
    ranked.push({ target: t, group: targetGroup(t, selfRef), isSelf, distanceFt, inRange, rangeKnown });
  }
  return ranked.sort((a, b) => compareRanked(a, b, order));
}

export interface RankedGroup<T extends TargetLike = TargetLike> {
  group: TargetGroup;
  label: string;
  items: RankedTarget<T>[];
}

/** Split an already-ranked list into non-empty groups, in `order`, for
 *  pickers that render section headers. Preserves the ranked order within
 *  each group. */
export function groupRanked<T extends TargetLike>(
  ranked: readonly RankedTarget<T>[],
  order: readonly TargetGroup[] = TARGET_GROUP_ORDER,
): RankedGroup<T>[] {
  const out: RankedGroup<T>[] = [];
  for (const group of order) {
    const items = ranked.filter(r => r.group === group);
    if (items.length) out.push({ group, label: TARGET_GROUP_LABEL[group], items });
  }
  return out;
}

/** Ids to pre-check for an area / "everyone within N ft" selection: targets
 *  whose range check actually ran and passed, in one of AUTO_SELECT_GROUPS.
 *  Dead creatures in the area are deliberately left unchecked (listed with an
 *  in-area mark by the caller); a list with no measurable ranges selects
 *  nothing rather than everything. */
export function autoSelectIds<T extends TargetLike>(
  ranked: readonly RankedTarget<T>[],
  groups: readonly TargetGroup[] = AUTO_SELECT_GROUPS,
): string[] {
  return ranked
    .filter(r => r.rangeKnown && r.inRange && groups.includes(r.group))
    .map(r => r.target.id);
}
