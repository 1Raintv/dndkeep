// v2.869: compute one ordered turn-effect proposal without database/log writes.
// The caller owns persistence and retries; never recalculate a saved proposal.
import { rollDiceExpr } from './dice';
import { applyDamageToPools } from './hp';
import { resolveDamageAtZero } from './deathSaves';

export interface TurnTick {
  kind: 'damage' | 'heal' | 'temp_hp';
  timing: 'turn_start' | 'turn_end';
  dice?: string;                 // XdY rolled fresh each tick
  flat?: number;                 // added to the dice total
  damageType?: string;
  saveEnds?: { ability: string; dc: number };
  /** Remove the buff after it fires once (Acid Arrow's delayed 2d4). */
  oneShot?: boolean;
}

export interface TickingBuff { key: string; name: string; turnTick?: TurnTick }
export interface TurnTickState<B extends TickingBuff> {
  current_hp: number; max_hp: number; temp_hp: number;
  death_save_failures: number; death_save_successes: number;
  is_stable: boolean; is_dead: boolean; active_buffs: readonly B[] | null;
}
export interface TurnTickEvent {
  eventType: 'damage_at_0_hp_failure_added' | 'damage_applied' | 'save_requested'
    | 'healing_applied' | 'temp_hp_gained' | 'spell_effect_removed';
  payload: Record<string, unknown>;
}

/** Pure apart from the injectable canonical dice source. Save-ends remains a
 * request for the DM; concentration and typed defenses belong to later work.
 * Preserve the existing higher-temp-HP policy until replacement choice exists. */
export function planTurnTicks<B extends TickingBuff>(
  state: TurnTickState<B>, isCharacter: boolean, timing: TurnTick['timing'],
  roll: (expression: string) => number = expression => rollDiceExpr(expression).total,
) {
  const buffs = state.active_buffs ?? [];
  const ticking = state.is_dead ? [] : buffs.filter(b => b.turnTick?.timing === timing);
  const maxHp = state.max_hp;
  let hp = state.current_hp, tempHp = state.temp_hp;
  let failures = state.death_save_failures, successes = state.death_save_successes;
  let isStable = state.is_stable, isDead = state.is_dead;
  const removedKeys: string[] = [];
  const events: TurnTickEvent[] = [];
  for (const buff of ticking) {
    if (isDead) break;
    const tick = buff.turnTick!;
    const diceTotal = tick.dice ? roll(tick.dice) : 0;
    const amount = diceTotal + (tick.flat ?? 0);

    if (tick.kind === 'damage' && amount > 0) {
      if (hp === 0 && isCharacter && !isDead) {
        // RAW: damage while at 0 HP = one death-save failure (ticks
        // aren't attacks, so no crit doubling); it also breaks
        // stability.
        // v2.869 audit: damage still consumes temp HP at zero, and a
        // sufficiently large hit kills immediately even on the first failure.
        tempHp = applyDamageToPools(hp,tempHp,amount).tempAfter;
        const damageState=resolveDamageAtZero(amount,maxHp,failures);
        failures=damageState.failures;isStable=damageState.isStable;isDead=damageState.isDead;
        events.push({
          eventType: 'damage_at_0_hp_failure_added',
          payload: { source_buff: buff.name, tick: true, amount, temp_hp_after:tempHp, failures, became_dead: isDead, massive_damage_death:damageState.massiveDamage },
        });
      } else if (hp > 0 || !isCharacter) {
        const hpBefore = hp;
        // v2.636 — pool math consolidated into rules/hp.ts
        const tickApplied = applyDamageToPools(hp, tempHp, amount);
        tempHp = tickApplied.tempAfter;
        const toHp = tickApplied.dmgToHp;
        hp = tickApplied.hpAfter;
        const overflow = hpBefore > 0 && hp === 0 ? Math.max(0, toHp - hpBefore) : 0;
        if (isCharacter && hpBefore > 0 && hp === 0 && overflow >= maxHp && maxHp > 0) {
          isDead = true;
          failures = 3;
        }
        events.push({
          eventType: 'damage_applied',
          payload: {
            amount, damage_type: tick.damageType ?? 'untyped',
            source_buff: buff.name, tick: true, timing,
            hp_after: hp, temp_hp_after: tempHp,
            dropped_to_0: hpBefore > 0 && hp === 0,
            massive_damage_death: isDead && failures === 3 && overflow >= maxHp && maxHp > 0,
          },
        });
      }
      // RAW order for Searing Smite: damage first, THEN the save.
      if (tick.saveEnds && !isDead) {
        events.push({
          eventType: 'save_requested',
          payload: {
            ability: tick.saveEnds.ability, dc: tick.saveEnds.dc,
            source_buff: buff.name, tick: true,
            on_success: `${buff.name} ends — remove the buff`,
          },
        });
      }
    } else if (tick.kind === 'heal' && amount > 0 && hp < maxHp) {
      const hpBefore = hp;
      hp = Math.min(maxHp, hp + amount);
      if (hpBefore === 0 && hp > 0) {
        // RAW: regaining any HP resets both death-save counters.
        failures = 0; successes = 0; isStable = false;
      }
      events.push({
        eventType: 'healing_applied',
        payload: { amount: hp - hpBefore, source_buff: buff.name, tick: true, hp_after: hp, woke_up: hpBefore === 0 },
      });
    } else if (tick.kind === 'temp_hp' && amount > 0) {
      // Existing automatic policy: keep the higher pool; never stack.
      const next = Math.max(tempHp, amount);
      if (next !== tempHp) {
        tempHp = next;
        events.push({
          eventType: 'temp_hp_gained',
          payload: { amount: next, source_buff: buff.name, tick: true },
        });
      }
    }

    if (tick.oneShot) {
      removedKeys.push(buff.key);
      events.push({
        eventType: 'spell_effect_removed',
        payload: { source_buff: buff.name, reason: 'one_shot_tick_fired' },
      });
    }
  }

  return {
    updates: {
      current_hp: hp, temp_hp: tempHp, death_save_failures: failures,
      death_save_successes: successes, is_stable: isStable, is_dead: isDead,
      active_buffs: buffs.filter(b => !removedKeys.includes(b.key)),
    },
    events,
  };
}
