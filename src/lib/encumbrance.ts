// v2.133.0 — Phase L pt 1 of the non-combat annex.
//
// Encumbrance helpers: carrying capacity, inventory weight, status check.
// Pure functions — no DB access, no React. Future ships will wire these
// into the character sheet (UI) and the combat flow (auto-apply
// Encumbered condition via the Phase H condition system).
//
// 2024 PHB rules (p.29):
//
//   CARRYING CAPACITY = Strength × 15 lbs
//
//   Base rule: if total carried weight exceeds your capacity, you have
//   the Encumbered condition (speed halved, disadvantage on STR/DEX/CON
//   checks, saves, and attacks).
//
//   Optional variant rule (2014 carryover, PHB p.176): three-tier system
//     * Encumbered       : weight > 5 × STR   → speed −10 ft
//     * Heavily encumbered: weight > 10 × STR → speed −20 ft + disadv
//                                               on STR/DEX/CON checks,
//                                               saves, and attacks
//     * Max: 15 × STR   (also the base-rule threshold)
//
// We expose both as enum results via `encumbranceStatus(character, variant?)`
// so callers can pick the rule that matches their table.

import type { Character } from '../types';
import { currencyWeightLbs } from './currency';

// v2.316: HP/conditions/buffs/death-save reads come from combatants
// via JOIN. See src/lib/combatParticipantNormalize.ts.
import { JOINED_COMBATANT_FIELDS } from './combatParticipantNormalize';

// ─── Constants ───────────────────────────────────────────────────
const CAPACITY_MULTIPLIER = 15;           // base 2024 rule: STR × 15 lbs
const VARIANT_ENCUMBERED_MULT = 5;        // variant: > STR × 5 → encumbered
const VARIANT_HEAVY_MULT = 10;            // variant: > STR × 10 → heavily enc.

// ─── Capacity ────────────────────────────────────────────────────

/**
 * Base 2024 carrying capacity in pounds: `strength × 15`.
 * A Strength 10 character tops out at 150 lbs of carried gear.
 */
export function carryingCapacityLbs(strength: number): number {
  return Math.max(0, Math.floor(strength)) * CAPACITY_MULTIPLIER;
}

/**
 * Returns the three variant-rule thresholds for a given Strength score.
 * Useful for UI that renders progress bars with color-coded zones.
 *   { encumbered: STR × 5, heavy: STR × 10, max: STR × 15 }
 */
export function carryingCapacityTiers(strength: number): {
  encumbered: number;
  heavy: number;
  max: number;
} {
  const s = Math.max(0, Math.floor(strength));
  return {
    encumbered: s * VARIANT_ENCUMBERED_MULT,
    heavy: s * VARIANT_HEAVY_MULT,
    max: s * CAPACITY_MULTIPLIER,
  };
}

// ─── Weight ──────────────────────────────────────────────────────

/**
 * Sum of inventory item weights (weight × quantity). Items without a
 * weight field contribute 0. Equipped status is irrelevant for carry —
 * wearing armor still counts toward capacity per RAW.
 */
export function inventoryWeightLbs(character: Character): number {
  const items = character.inventory ?? [];
  let total = 0;
  for (const it of items) {
    const w = it.weight ?? 0;
    const q = it.quantity ?? 1;
    total += w * q;
  }
  return total;
}

/**
 * Total weight the character is currently carrying: inventory + coin pouch.
 * Coin weight is 1 lb per 50 coins regardless of denomination (PHB p.156).
 */
export function currentWeightLbs(character: Character): number {
  const itemWeight = inventoryWeightLbs(character);
  const coinWeight = character.currency ? currencyWeightLbs(character.currency) : 0;
  return itemWeight + coinWeight;
}

// ─── Status ──────────────────────────────────────────────────────

export type EncumbranceStatus =
  | 'unencumbered'     // carrying below the first threshold
  | 'encumbered'       // speed reduction (−10 variant OR > capacity base)
  | 'heavy'            // variant-only: speed −20, disadv on physical rolls
  | 'over_max';        // carrying more than STR × 15 — can't carry more

export interface EncumbranceResult {
  status: EncumbranceStatus;
  currentLbs: number;
  capacityLbs: number;        // base rule threshold (STR × 15)
  ratio: number;              // currentLbs / capacityLbs (for progress bars)
  tiers: ReturnType<typeof carryingCapacityTiers>;
}

/**
 * Compute encumbrance status. `variant` toggles between the 2024 base rule
 * (single threshold at STR × 15) and the optional 3-tier rule.
 *   - 'base'    : unencumbered ≤ capacity < encumbered (any overage)
 *   - 'variant' : unencumbered ≤ 5STR < encumbered ≤ 10STR < heavy ≤ 15STR < over_max
 */
export function encumbranceStatus(
  character: Character,
  variant: 'base' | 'variant' = 'base',
): EncumbranceResult {
  const str = (character as any).strength ?? 10;
  const currentLbs = currentWeightLbs(character);
  const tiers = carryingCapacityTiers(str);
  const capacityLbs = tiers.max;
  const ratio = capacityLbs > 0 ? currentLbs / capacityLbs : 0;

  let status: EncumbranceStatus;
  if (variant === 'variant') {
    if (currentLbs > tiers.max) status = 'over_max';
    else if (currentLbs > tiers.heavy) status = 'heavy';
    else if (currentLbs > tiers.encumbered) status = 'encumbered';
    else status = 'unencumbered';
  } else {
    // Base 2024: single threshold at capacity; anything over = encumbered.
    // We still flag 'over_max' past STR × 15 × 2 (push/drag/lift limit)
    // for parity with the 3-tier model.
    if (currentLbs > tiers.max * 2) status = 'over_max';
    else if (currentLbs > tiers.max) status = 'encumbered';
    else status = 'unencumbered';
  }

  return { status, currentLbs, capacityLbs, ratio, tiers };
}

/** Convenience predicate — whether the character has the Encumbered condition. */
export function isEncumbered(
  character: Character,
  variant: 'base' | 'variant' = 'base',
): boolean {
  const s = encumbranceStatus(character, variant).status;
  return s === 'encumbered' || s === 'heavy' || s === 'over_max';
}

/**
 * Speed penalty in feet for the 3-tier variant rule:
 *   unencumbered  → 0
 *   encumbered    → -10
 *   heavy         → -20
 *   over_max      → effectively unable to move; return -999 so callers
 *                   clamp speed to 0
 * Base rule returns 0 for unencumbered, -∞ (speed halved — but that's a
 * condition effect, not a flat penalty). Callers for the base rule should
 * apply the `Encumbered` condition directly rather than reading this.
 */
export function variantSpeedPenaltyFt(status: EncumbranceStatus): number {
  switch (status) {
    case 'unencumbered': return 0;
    case 'encumbered':   return -10;
    case 'heavy':        return -20;
    case 'over_max':     return -999;
  }
}

// v2.135.0 — Phase L pt 3: bridge between carried weight and Phase H's
// condition pipeline. Call this whenever a character's inventory, currency,
// or strength changes (or at combat encounter start).
//
// Behavior matrix:
//   variant='off'         → no-op regardless of weight
//   should be encumbered  → apply 'Encumbered' with source='encumbrance'
//                           IF the condition isn't already present
//   should NOT be enc.    → remove 'Encumbered' ONLY if it was applied by
//                           this sync (source === 'encumbrance'). DM-applied
//                           Encumbered (e.g. a homebrew circumstance) is
//                           left alone — we never clobber manual tags.
//
// Runs against the character's ACTIVE combat_participant row (looked up by
// entity_id = character.id + participant_type = 'character'). If the
// character isn't currently in combat, the sync exits quietly — encumbrance
// is a combat-time concern (mechanical disadvantage); narrative effects
// out of combat are the DM's call.
//
// Dynamic imports (supabase, applyCondition, removeCondition) avoid the
// cyclic dependency that would form with static imports of './conditions'.

export interface SyncEncumbranceConditionInput {
  characterId: string;
  character: Character;
  /** Optional pre-fetched variant (saves a DB round-trip). If omitted and
   *  campaignId is provided, the helper looks it up from the campaigns row. */
  variant?: 'off' | 'base' | 'variant';
  campaignId?: string;
  encounterId?: string | null;
}

export async function syncEncumbranceCondition(
  input: SyncEncumbranceConditionInput,
): Promise<void> {
  const { supabase } = await import('./supabase');

  // Resolve the variant setting. Prefer caller-provided value; otherwise
  // look it up on the campaigns row. Missing campaign → default to 'off'
  // (safe conservative — no auto-application unless DM opted in).
  let variant = input.variant;
  if (!variant && input.campaignId) {
    const { data: camp } = await supabase
      .from('campaigns')
      .select('encumbrance_variant')
      .eq('id', input.campaignId)
      .maybeSingle();
    variant = ((camp?.encumbrance_variant as any) ?? 'off') as 'off' | 'base' | 'variant';
  }
  if (!variant || variant === 'off') return;

  // v2.147.0 — Phase N pt 5: determine which tier applies, not just
  // a boolean. Under 'base' (2024 RAW), only Encumbered exists at one
  // threshold (>15× STR). Under 'variant' (optional 2014 3-tier),
  // tier 1 ('encumbered' status, >5× STR) → Encumbered, tier 2
  // ('heavy' or 'over_max', >10× STR) → HeavilyEncumbered.
  const status = encumbranceStatus(
    input.character,
    variant === 'variant' ? 'variant' : 'base',
  ).status;

  // Which condition name we WANT to be active (or null if unencumbered)
  let wantCondition: 'Encumbered' | 'HeavilyEncumbered' | null;
  if (variant === 'variant') {
    if (status === 'encumbered') wantCondition = 'Encumbered';
    else if (status === 'heavy' || status === 'over_max') wantCondition = 'HeavilyEncumbered';
    else wantCondition = null;
  } else {
    // base rule: single-tier Encumbered when over capacity, nothing otherwise
    wantCondition = (status === 'encumbered' || status === 'heavy' || status === 'over_max')
      ? 'Encumbered'
      : null;
  }

  // Find the character's active combat participant, if any.
  const { data: part } = await (supabase as any)
    .from('combat_participants')
    .select('id, active_conditions, condition_sources, campaign_id, encounter_id, ' + JOINED_COMBATANT_FIELDS)
    .eq('entity_id', input.characterId)
    .eq('participant_type', 'character')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!part) return;   // not in combat — encumbrance is narrative only

  const conditions: string[] = (part.active_conditions ?? []) as string[];
  const sources = (part.condition_sources ?? {}) as Record<string, { source?: string }>;

  // Check both possible tags and their sources. We only manage tags we
  // previously applied (source='encumbrance') — never clobber a DM-set
  // Encumbered or HeavilyEncumbered tag.
  const hasEnc = conditions.includes('Encumbered');
  const hasHeavy = conditions.includes('HeavilyEncumbered');
  const encSource = sources['Encumbered']?.source;
  const heavySource = sources['HeavilyEncumbered']?.source;

  const { applyCondition, removeCondition } = await import('./conditions');
  const campaignId = (part.campaign_id ?? input.campaignId) as string | undefined;
  const encounterId = (part.encounter_id ?? input.encounterId) as string | null | undefined;

  // Remove any ENC-managed tag that no longer matches the desired state.
  if (wantCondition !== 'Encumbered' && hasEnc && encSource === 'encumbrance') {
    await removeCondition({
      participantId: part.id as string,
      conditionName: 'Encumbered',
      campaignId, encounterId,
    });
  }
  if (wantCondition !== 'HeavilyEncumbered' && hasHeavy && heavySource === 'encumbrance') {
    await removeCondition({
      participantId: part.id as string,
      conditionName: 'HeavilyEncumbered',
      campaignId, encounterId,
    });
  }
  // Apply the desired tag if it isn't already there.
  if (wantCondition === 'Encumbered' && !hasEnc) {
    await applyCondition({
      participantId: part.id as string,
      conditionName: 'Encumbered',
      source: 'encumbrance',
      campaignId, encounterId,
    });
  } else if (wantCondition === 'HeavilyEncumbered' && !hasHeavy) {
    await applyCondition({
      participantId: part.id as string,
      conditionName: 'HeavilyEncumbered',
      source: 'encumbrance',
      campaignId, encounterId,
    });
  }
}
