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

export type HitPointAdjustmentMode = 'damage' | 'heal' | 'set';
/** v2.806: never silently turn a decimal, exponent or partial input into damage.
 * Setting zero is valid; zero damage/healing is not an adjustment. */
export function parseHitPointAdjustment(text:string,mode:HitPointAdjustmentMode):number|null {
 const value=text.trim();if(!/^\d+$/.test(value))return null;
 const amount=Number(value);
 return Number.isSafeInteger(amount)&&amount<=2147483647&&(mode==='set'?amount>=0:amount>0)?amount:null;
}
/** Preview and manual HP controls share the canonical temp-first damage rules.
 * The persistence layer must check the captured HP revision before applying. */
export function adjustedHitPointPools(state:{current_hp:number;max_hp:number;temp_hp:number},mode:HitPointAdjustmentMode,amount:number){
 if(![state.current_hp,state.max_hp,state.temp_hp,amount].every(n=>Number.isSafeInteger(n)&&n>=0)
  ||(mode!=='set'&&state.current_hp>state.max_hp)||amount>2147483647||(!['damage','heal','set'].includes(mode))||(mode!=='set'&&amount===0))return null;
 if(mode==='damage'){
  const result=applyDamageToPools(state.current_hp,state.temp_hp,amount);
  return {current_hp:result.hpAfter,temp_hp:result.tempAfter};
 }
 return {current_hp:mode==='heal'?applyHealing(state.current_hp,state.max_hp,amount):Math.min(state.max_hp,amount),temp_hp:state.temp_hp};
}
