// src/rules/hp.ts — pure HP / temp-HP pool rules (2024 PHB).
//
// Zero-import leaf module, same contract as rules/dice.ts: no components,
// no supabase, no data tables. Callers own all side effects (DB writes,
// combat events, death saves) — this module only does the arithmetic.
//
// Before consolidation (v2.636) this math was re-implemented inline in six
// places (pendingAttack applyDamage + retaliation, auras, masteryRiders
// Graze, buffs ticks, PartyDashboard DM panel) and the concentration DC in
// five, with divergent rounding (ceil vs floor) and an inconsistently
// applied DC 30 cap.

export interface DamageApplication {
  hpAfter: number;
  tempAfter: number;
  /** Portion of the damage the temp-HP pool absorbed. */
  absorbedByTemp: number;
  /** Portion that reached real HP (>= 0). */
  dmgToHp: number;
  /** True when this damage took the target from >0 HP to 0. */
  droppedTo0: boolean;
}

/**
 * Apply damage against temp HP first, then current HP, per 2024 RAW.
 * HP floors at 0 — death saves / massive-damage / instant-death handling
 * stays with the caller, which knows the target's max HP and context.
 */
export function applyDamageToPools(
  hpBefore: number,
  tempBefore: number,
  damage: number,
): DamageApplication {
  const dmg = Math.max(0, damage);
  const tempAfter = Math.max(0, tempBefore - dmg);
  const absorbedByTemp = tempBefore - tempAfter;
  const dmgToHp = dmg - absorbedByTemp;
  const hpAfter = Math.max(0, hpBefore - dmgToHp);
  return { hpAfter, tempAfter, absorbedByTemp, dmgToHp, droppedTo0: hpBefore > 0 && hpAfter === 0 };
}

/**
 * Healing goes to current HP only, capped at max. Temp HP is a separate
 * pool untouched by healing (2024 RAW — they're independent).
 */
export function applyHealing(hpBefore: number, maxHp: number, amount: number): number {
  return Math.min(maxHp, hpBefore + Math.max(0, amount));
}

/**
 * Concentration save DC: 10 or half the damage taken (ROUND DOWN),
 * whichever is higher, capped at 30 — 2024 PHB. Temp-HP absorption still
 * counts toward "damage taken" (pass the full pre-absorption amount).
 */
export function concentrationDC(damageTaken: number): number {
  return Math.min(30, Math.max(10, Math.floor(damageTaken / 2)));
}
