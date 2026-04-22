// v2.150.0 — Phase O pt 3 of Spell Wiring.
//
// Heal spell routing helpers. Unlike attacks/saves, heals don't pass
// through pending_attacks — there's no hit/miss/save to resolve. The
// effect is direct: pick target(s), roll heal dice, apply HP to each
// via combat_participants.current_hp (capped at max_hp).
//
// Two bugs in the pre-v2.150 heal path that this module fixes:
//
//   1. parseDice in SpellCastButton uses regex /^\d+d\d+$/ which
//      doesn't match "1d8 + MOD" or "3d8 + MOD" — the overwhelming
//      majority of healing dice. Old rollHeal silently returned early
//      for those, producing no dice roll and no log entry.
//   2. No HP application — rollHeal wrote to action_log but never
//      updated the target's HP. DM had to manually bump HP after
//      seeing the chat message.
//
// Scope: single-target (Cure Wounds, Healing Word, Heal, Regenerate)
// + multi-target (Mass Cure Wounds, Mass Healing Word). Out-of-scope
// for v2.150: Aid (max HP boost), False Life (self temp HP), Aura of
// Vitality (concentration bonus action tick), Prayer of Healing (out
// of combat 10 min cast), Mass Heal (700 HP distributive pool).

import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';

// ─── Registry ────────────────────────────────────────────────────────

export type HealRollMode =
  | 'once'        // roll dice once, apply same amount to every target (RAW 2024 for mass heals)
  | 'per_target'; // re-roll per target (homebrew / future; not used by SRD 2024 spells)

export interface HealSpellDef {
  name: string;         // lowercase match against spell.name
  maxTargets: number;
  rollMode: HealRollMode;
}

export const HEAL_SPELLS: HealSpellDef[] = [
  { name: 'cure wounds',        maxTargets: 1, rollMode: 'once' },
  { name: 'healing word',       maxTargets: 1, rollMode: 'once' },
  { name: 'heal',               maxTargets: 1, rollMode: 'once' },
  { name: 'regenerate',         maxTargets: 1, rollMode: 'once' },
  { name: 'mass cure wounds',   maxTargets: 6, rollMode: 'once' },
  { name: 'mass healing word',  maxTargets: 6, rollMode: 'once' },
];

const REGISTRY_MAP: Record<string, HealSpellDef> = Object.fromEntries(
  HEAL_SPELLS.map(h => [h.name, h]),
);

export function findHealSpell(spellName: string): HealSpellDef | undefined {
  return REGISTRY_MAP[spellName.trim().toLowerCase()];
}

// ─── Dice resolution ─────────────────────────────────────────────────

/**
 * Parse a heal dice expression with optional MOD substitution and
 * flat bonuses. Handles:
 *
 *   "1d8 + MOD"       → { diceCount:1, diceSides:8, flatBonus: spellMod }
 *   "3d8 + MOD"       → { diceCount:3, diceSides:8, flatBonus: spellMod }
 *   "1d8"             → { diceCount:1, diceSides:8, flatBonus: 0 }
 *   "1d4 + 4"         → { diceCount:1, diceSides:4, flatBonus: 4 }
 *   "70"              → { diceCount:0, diceSides:0, flatBonus: 70 } (flat heal)
 *   null/"" → null
 *
 * Returns null for anything we can't parse — callers should fall back
 * to a manual-roll UX or log the spell with no HP delta.
 */
export function resolveHealDice(
  healDiceExpr: string | null | undefined,
  spellMod: number,
): { diceCount: number; diceSides: number; flatBonus: number } | null {
  if (!healDiceExpr) return null;
  const expr = healDiceExpr.replace(/\s+/g, '').toUpperCase();

  // Dice portion: optional XdY at the start. Null count/sides = flat heal.
  const dicePart = expr.match(/^(\d+)D(\d+)/);
  let diceCount = 0;
  let diceSides = 0;
  let rest = expr;
  if (dicePart) {
    diceCount = parseInt(dicePart[1], 10);
    diceSides = parseInt(dicePart[2], 10);
    rest = expr.slice(dicePart[0].length);
  }

  // Bonus portion: sum all `+N` or `+MOD` tokens.
  let flatBonus = 0;
  while (rest.length > 0) {
    const m = rest.match(/^\+(MOD|\d+)/);
    if (!m) break;
    flatBonus += m[1] === 'MOD' ? spellMod : parseInt(m[1], 10);
    rest = rest.slice(m[0].length);
  }
  if (rest.length > 0) {
    // Leftover we don't understand — check if the WHOLE thing was a flat
    // number like "70" or "700".
    if (!dicePart) {
      const flat = expr.match(/^(\d+)$/);
      if (flat) return { diceCount: 0, diceSides: 0, flatBonus: parseInt(flat[1], 10) };
    }
    return null;
  }

  if (diceCount === 0 && flatBonus === 0) return null;
  return { diceCount, diceSides, flatBonus };
}

/**
 * Roll a resolved heal expression. Returns the total rolled amount and
 * the individual die results for log display.
 */
export function rollResolvedHeal(
  resolved: { diceCount: number; diceSides: number; flatBonus: number },
): { total: number; rolls: number[] } {
  const rolls: number[] = [];
  for (let i = 0; i < resolved.diceCount; i++) {
    rolls.push(Math.floor(Math.random() * resolved.diceSides) + 1);
  }
  const total = rolls.reduce((a, b) => a + b, 0) + resolved.flatBonus;
  return { total, rolls };
}

// ─── HP application ──────────────────────────────────────────────────

export interface ApplyHealInput {
  participantId: string;
  healAmount: number;
  casterName: string;
  spellName: string;
  campaignId: string;
  encounterId: string | null;
  chainId: string;
  sequence: number;
  /** Set by caller when logging multiple applications in one cast. */
  totalTargets: number;
  /** Visibility flag mirror of the damage event log pattern. */
  hiddenFromPlayers: boolean;
}

/**
 * Apply healing to a combat participant, capped at max_hp. Emits a
 * heal_applied event for the log + revives from 0 HP if the target was
 * unconscious (sets is_stable=false, clears death save counters, since
 * any positive HP wakes the character per RAW 2024 p.195).
 *
 * Returns the actual amount healed after the max-HP cap (may be less
 * than healAmount if target was near full).
 */
export async function applyHealToParticipant(
  input: ApplyHealInput,
): Promise<number> {
  const { data: part } = await supabase
    .from('combat_participants')
    .select('id, current_hp, max_hp, is_dead, is_stable, death_save_successes, death_save_failures, name, hidden_from_players')
    .eq('id', input.participantId)
    .maybeSingle();
  if (!part) return 0;

  // Dead creatures can't be healed by normal healing (only Revivify, Raise
  // Dead, etc). Heal spells in the v2.150 registry don't revive the
  // dead, so we no-op without error — UI should disallow picking dead
  // targets, but this guards the race condition of "target dies
  // between picker open and confirm."
  if (part.is_dead) return 0;

  const currentHp = (part.current_hp as number | null) ?? 0;
  const maxHp = (part.max_hp as number | null) ?? 0;
  const cappedHeal = Math.max(0, Math.min(input.healAmount, maxHp - currentHp));
  const newHp = currentHp + cappedHeal;

  // If the target was unconscious (0 HP), any positive heal wakes them
  // and clears death save counters per RAW 2024 p.195.
  const wasUnconscious = currentHp === 0;
  const updates: Record<string, any> = { current_hp: newHp };
  if (wasUnconscious && cappedHeal > 0) {
    updates.is_stable = false;
    updates.death_save_successes = 0;
    updates.death_save_failures = 0;
  }

  await supabase
    .from('combat_participants')
    .update(updates)
    .eq('id', input.participantId);

  // Emit event so the combat log captures the heal. Mirrors the shape of
  // the damage_applied events so the DMScreen log renders naturally.
  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId: input.chainId,
    sequence: input.sequence,
    actorType: 'player',
    actorName: input.casterName,
    targetType: null,
    targetName: part.name as string,
    eventType: 'healing_applied',
    payload: {
      spell_name: input.spellName,
      heal_amount_rolled: input.healAmount,
      heal_amount_applied: cappedHeal,
      hp_before: currentHp,
      hp_after: newHp,
      woke_from_unconscious: wasUnconscious && cappedHeal > 0,
      total_targets: input.totalTargets,
    },
    visibility: input.hiddenFromPlayers ? 'hidden_from_players' : 'public',
  });

  return cappedHeal;
}

/**
 * Convenience wrapper — generate a chain_id for a full heal cast so
 * all per-target applications share one chain. Use once per cast, then
 * pass the chainId plus incrementing sequence to applyHealToParticipant.
 */
export function newHealChainId(): string {
  return newChainId();
}
