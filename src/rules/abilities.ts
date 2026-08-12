/**
 * abilities.ts — v2.643 (audit 4.4): THE ability-modifier function.
 *
 * floor((score − 10) / 2) was inlined 50+ times across 21 files (plus
 * local `mod()` lambdas) with no canonical home — the same duplication
 * class that hid real bugs in the dice (3.2) and damage (3.3)
 * consolidations. All call sites now import from here; never inline the
 * formula again (CODING_STANDARDS.md).
 *
 * Math.floor, not truncation: for scores below 10 the value is negative
 * and must round DOWN (score 9 → -1, score 1 → -5). `(9-10)/2|0` or
 * Math.trunc would give 0 and -4 — wrong.
 */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// ─── v2.655.0 — Ability score increases ───────────────────────────
//
// The character creator computed "base + background" in THREE places
// (the create handler, the HP preview, the spell-ability preview) and
// never applied the level-4/8/12/16/19 ASIs a player picks while
// building above level 1. Those choices were recorded as provenance in
// `ability_score_improvements` and then dropped — so a character built
// at level 5 with "+1 WIS at level 4" was saved with the ASI on record
// and the point missing from the score.
//
// It hid well: an odd→even bump (12 → 13) leaves the modifier
// unchanged, so the sheet looks right. An even→odd bump (14 → 15)
// silently costs a whole point of modifier on every roll, save and DC
// that ability touches — and, for Constitution, on max HP.

export type AbilityName =
  | 'strength' | 'dexterity' | 'constitution'
  | 'intelligence' | 'wisdom' | 'charisma';

export type AbilityScoreSet = Record<AbilityName, number>;

/**
 * One increase. `ability2`/`amount2` carry the "+1 to two different
 * abilities" branch of an ASI — the creator's own picker writes that
 * shape, but the code that consumed it only ever read the first pair,
 * so half of every split ASI was lost even in the provenance record.
 */
export interface AbilityIncrease {
  ability: string;
  amount: number;
  ability2?: string;
  amount2?: number;
}

/** RAW 2024: ASIs cannot raise a score above 20. */
export const MAX_ABILITY_SCORE = 20;

const ABILITY_NAMES: ReadonlySet<string> = new Set<AbilityName>([
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
]);

/** True for a recognised ability key (case-insensitive). */
export function isAbilityName(value: string | null | undefined): value is AbilityName {
  return !!value && ABILITY_NAMES.has(value.toLowerCase());
}

/**
 * Flatten increases into `ability → total`, expanding the split-ASI
 * second pair. Unrecognised ability names are skipped rather than
 * throwing: this data comes from a jsonb column and old rows are not
 * worth crashing a character sheet over.
 */
export function totalIncreasesByAbility(
  increases: readonly AbilityIncrease[],
): Partial<Record<AbilityName, number>> {
  const totals: Partial<Record<AbilityName, number>> = {};
  const add = (ability: string | undefined, amount: number | undefined) => {
    if (!isAbilityName(ability) || typeof amount !== 'number' || !amount) return;
    const key = ability.toLowerCase() as AbilityName;
    totals[key] = (totals[key] ?? 0) + amount;
  };
  for (const inc of increases) {
    add(inc.ability, inc.amount);
    add(inc.ability2, inc.amount2);
  }
  return totals;
}

/**
 * Build the full increase list for a freshly-created character:
 * the background's +2/+1, then every level ASI the player picked.
 *
 * A split ASI ("+1 to two different abilities") is emitted as TWO
 * records rather than one record carrying `ability2`. `ASIRecord` in
 * src/types has no second pair, so a single record could only ever
 * store half the choice — which is precisely how the creator used to
 * lose it. A flat (ability, amount, source) list is also what the
 * settings stat editor reconciles against.
 */
export function buildAbilityIncreases(
  background: { asi_primary: string; asi_secondary: string } | null | undefined,
  asiChoices: Record<string | number, AbilityIncrease> | null | undefined,
): Array<{ ability: AbilityName; amount: number; source: string }> {
  const out: Array<{ ability: AbilityName; amount: number; source: string }> = [];
  const push = (ability: string | undefined, amount: number | undefined, source: string) => {
    if (!isAbilityName(ability) || typeof amount !== 'number' || !amount) return;
    out.push({ ability: ability.toLowerCase() as AbilityName, amount, source });
  };

  if (background) {
    push(background.asi_primary, 2, 'background');
    push(background.asi_secondary, 1, 'background');
  }
  for (const [level, choice] of Object.entries(asiChoices ?? {})) {
    if (!choice) continue;
    push(choice.ability, choice.amount, `level_${level}`);
    push(choice.ability2, choice.amount2, `level_${level}`);
  }
  return out;
}

/**
 * Apply every increase to the base scores, capped at 20.
 *
 * The cap is applied to the FINAL total, not per increase, so
 * +1 then +1 onto an 19 lands on 20 rather than being clamped twice.
 */
export function applyAbilityIncreases(
  base: AbilityScoreSet,
  increases: readonly AbilityIncrease[],
): AbilityScoreSet {
  const totals = totalIncreasesByAbility(increases);
  const out = { ...base };
  for (const [ability, bump] of Object.entries(totals)) {
    const key = ability as AbilityName;
    out[key] = Math.min(MAX_ABILITY_SCORE, (out[key] ?? 10) + (bump ?? 0));
  }
  return out;
}
