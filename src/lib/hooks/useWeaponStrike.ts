// v2.266.0 — Shared weapon strike hook.
//
// Extracts the dice + log + history + 3D roller pipeline from
// WeaponsTracker.handleHit / handleDamage so other surfaces (the
// Inventory tab's new Strike button, future quick-bar shortcuts)
// can swing weapons without forking the math.
//
// What this returns: { roll, lastRoll, clearLastRoll }.
//   - roll('hit', weapon) rolls 1d20 + atkBonus + bless + buff,
//     applies disadvantage from conditions, writes roll_logs +
//     action_log, fires the 3D dice tray.
//   - roll('damage', weapon, opts) rolls weapon.damageDice (with
//     crit dice doubling when opts.crit), adds bless dice + bonuses,
//     writes the same logs.
//   - lastRoll holds the most recent result so callers can render an
//     inline result chip without re-querying anything.
//
// Why a hook and not plain functions: the dice context
// (`triggerRoll` from useDiceRoll) and the local lastRoll state are
// hook-scoped. Functions wouldn't have access to either, and we'd
// need to thread the context through every call site.

import { useState } from 'react';
import type { WeaponItem } from '../../types';
import { rollDie, computeActiveBonuses } from '../gameUtils';
import { CONDITION_MAP } from '../../data/conditions';
import { useDiceRoll } from '../../context/DiceRollContext';
import { logAction } from '../../components/shared/ActionLog';
import { supabase } from '../supabase';

export interface StrikeResult {
  weaponName: string;
  /** Final to-hit total (nat + bonuses). 0 when the result is a damage roll. */
  hit: number;
  /** Natural d20 roll for the attack — surfaces crit/miss to the UI. */
  nat: number;
  damage: number;
  damageType: string;
  crit: boolean;
  miss: boolean;
  /** What we can say about hit-vs-AC without the target's AC handy. The
   *  DM's BattleMap / NPC adjudicates the unknown case. */
  hitVsAC: 'hit' | 'miss' | 'crit' | 'unknown';
}

export interface UseWeaponStrikeOptions {
  /** Auth user id. Used as the legacy `character_id` field on
   *  roll_logs + action_log. Don't confuse with `historyCharacterId`
   *  below — these are different keys for historical reasons. */
  characterId?: string;
  characterName?: string;
  /** The character row id (character.id). Drives character_history
   *  insertion via the dice context. Separate from `characterId`
   *  because some legacy call sites pass the auth id there. */
  historyCharacterId?: string;
  userId?: string;
  campaignId?: string | null;
  activeConditions?: string[];
  /** Active buffs on the character — feeds bless dice + flat attack
   *  bonus through computeActiveBonuses. */
  activeBuffs?: any[];
}

export function useWeaponStrike(opts: UseWeaponStrikeOptions) {
  const {
    characterId, characterName,
    historyCharacterId, userId,
    campaignId,
    activeConditions = [],
    activeBuffs = [],
  } = opts;

  const [lastRoll, setLastRoll] = useState<StrikeResult | null>(null);
  const { triggerRoll } = useDiceRoll();
  // logHistory mirrors WeaponsTracker's pattern: dice context only
  // writes to character_history when it has both ids.
  const logHistory = historyCharacterId && userId
    ? { characterId: historyCharacterId, userId }
    : undefined;

  async function rollHit(weapon: WeaponItem): Promise<StrikeResult> {
    const buffBonuses = computeActiveBonuses(activeBuffs);
    const blessRoll = buffBonuses.blessActive ? rollDie(4) : 0;
    const hasDisadvantage = activeConditions.some(c => CONDITION_MAP[c]?.attackDisadvantage);
    const roll1 = rollDie(20);
    const nat = hasDisadvantage ? Math.min(roll1, rollDie(20)) : roll1;
    const hit = nat + weapon.attackBonus + blessRoll + buffBonuses.attackBonus;
    const hitVsAC: StrikeResult['hitVsAC'] = nat === 20 ? 'crit'
      : nat === 1 ? 'miss'
      : 'unknown';

    const result: StrikeResult = {
      weaponName: weapon.name,
      hit, nat,
      damage: lastRoll?.weaponName === weapon.name ? lastRoll.damage : 0,
      damageType: weapon.damageType,
      crit: nat === 20,
      miss: nat === 1,
      hitVsAC,
    };
    setLastRoll(result);

    triggerRoll({
      result: nat, dieType: 20, modifier: weapon.attackBonus, total: hit,
      label: `${weapon.name} — d20${weapon.attackBonus >= 0 ? '+' : ''}${weapon.attackBonus}`,
      logHistory,
    });

    if (characterId) {
      // user_id is required by roll_logs schema. WeaponsTracker has
      // the same insert shape and ships fine because RLS/the row's
      // trigger fills it in, but TS strict mode rejects the call.
      // Passing it explicitly satisfies the type and is correct.
      await supabase.from('roll_logs').insert({
        user_id: userId ?? characterId,
        character_id: characterId,
        campaign_id: campaignId ?? null,
        label: `${weapon.name} — To Hit`,
        dice_expression: `1d20+${weapon.attackBonus}`,
        individual_results: [nat],
        total: hit,
        modifier: weapon.attackBonus,
      });
      await logAction({
        campaignId, characterId, characterName: characterName ?? '',
        actionType: 'attack', actionName: `${weapon.name} (Hit Roll)`,
        diceExpression: `1d20+${weapon.attackBonus}`,
        individualResults: [nat], total: hit,
        hitResult: nat === 20 ? 'crit' : nat === 1 ? 'fumble' : '',
        notes: `To hit: ${hit}`,
      });
    }
    return result;
  }

  async function rollDamage(weapon: WeaponItem, options?: { crit?: boolean }): Promise<StrikeResult> {
    const isCrit = !!options?.crit;
    const buffBonuses = computeActiveBonuses(activeBuffs);
    // Roll damage dice. On a crit, RAW 2024 doubles the dice rolled
    // (not the modifier). We honor that here by parsing damageDice
    // with `(\d+)d(\d+)` and rolling 2× the count.
    const dice = weapon.damageDice;
    let total = 0;
    const individualRolls: number[] = [];
    if (dice === 'flat') {
      // Unarmed Strike 2024 PHB — flat 1 + STR mod (no dice).
      // damageBonus already encodes "1 + STR mod" for unarmed.
      total = weapon.damageBonus;
    } else {
      const m = dice.match(/(\d+)d(\d+)/g);
      if (m) {
        for (const expr of m) {
          const [count, sides] = expr.split('d').map(Number);
          const realCount = isCrit ? count * 2 : count;
          for (let i = 0; i < realCount; i++) {
            const r = rollDie(sides);
            individualRolls.push(r);
            total += r;
          }
        }
      }
      total += weapon.damageBonus;
    }
    // Bless adds 1d4 to damage too when active and the hit landed —
    // we don't gate on hit here since rollDamage is called explicitly
    // (the player chose to roll). Buff blessActive is the only signal.
    if (buffBonuses.blessActive) {
      const b = rollDie(4);
      individualRolls.push(b);
      total += b;
    }
    total = Math.max(1, total);

    const result: StrikeResult = {
      weaponName: weapon.name,
      hit: lastRoll?.weaponName === weapon.name ? lastRoll.hit : 0,
      nat: lastRoll?.weaponName === weapon.name ? lastRoll.nat : 0,
      damage: total,
      damageType: weapon.damageType,
      crit: lastRoll?.weaponName === weapon.name ? lastRoll.crit : false,
      miss: false,
      hitVsAC: lastRoll?.weaponName === weapon.name ? lastRoll.hitVsAC : 'unknown',
    };
    setLastRoll(result);

    // 3D dice tray — show the dice with their face value rather than
    // a synthetic die. Use the first parsed die's sides if available.
    const firstDie = dice.match(/\d+d(\d+)/);
    const dieType = firstDie ? parseInt(firstDie[1]) : 6;
    triggerRoll({
      result: individualRolls[0] ?? total,
      dieType,
      modifier: weapon.damageBonus,
      total,
      label: `${weapon.name} damage${isCrit ? ' (CRIT)' : ''} — ${dice}${weapon.damageBonus >= 0 ? '+' : ''}${weapon.damageBonus}`,
      logHistory,
    });

    if (characterId) {
      await supabase.from('roll_logs').insert({
        user_id: userId ?? characterId,
        character_id: characterId,
        campaign_id: campaignId ?? null,
        label: `${weapon.name} — Damage${isCrit ? ' (CRIT)' : ''}`,
        dice_expression: `${dice}+${weapon.damageBonus}`,
        individual_results: individualRolls,
        total,
        modifier: weapon.damageBonus,
      });
      await logAction({
        campaignId, characterId, characterName: characterName ?? '',
        actionType: 'damage', actionName: `${weapon.name} (Damage)${isCrit ? ' (CRIT)' : ''}`,
        diceExpression: `${dice}+${weapon.damageBonus}`,
        individualResults: individualRolls, total,
        notes: `${weapon.damageType} damage`,
      });
    }
    return result;
  }

  function clearLastRoll() {
    setLastRoll(null);
  }

  return { rollHit, rollDamage, lastRoll, clearLastRoll };
}
