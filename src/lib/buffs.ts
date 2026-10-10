// v2.113.0 — Phase H pt 4 of the Combat Backbone
//
// Buff pipeline. Buffs differ from conditions:
//   - Conditions are *statuses* (Prone, Restrained) that usually penalize
//     the participant who has them.
//   - Buffs are *bonuses* applied to a participant whose attacks/saves/
//     damage rolls gain extra dice or bonuses. Bless, Hunter's Mark, Hex,
//     Divine Favor, Absorb Elements rider all live here.
//
// Storage: combat_participants.active_buffs jsonb array. Multiple concurrent
// buffs from different sources stack (Bless + Divine Favor on one caster),
// but the same `key` de-duplicates on apply.
//
// Readers are pure — they take the buff array and return applicable bonuses.
// pendingAttack.ts calls them at roll time to assemble the final dice.

import { supabase } from './supabase';
import { checkedWrite } from './api/checked';
import { asJsonb } from './jsonbCast';
import { emitCombatEvent, newChainId } from './combatEvents';
import {damageRiderForAttack,type DamageRiderAttack} from '../rules/damageRiders';
import { rollDiceExpr } from '../rules/dice';
import type { TurnTick } from '../rules/turnTicks';
// v2.315: active_buffs reads come from combatants via JOIN.
import {
  JOINED_COMBATANT_FIELDS,
  normalizeParticipantRow,
} from './combatParticipantNormalize';

export interface ActiveBuff {
  key: string;
  name: string;
  source: string;
  casterParticipantId?: string;
  attackRollBonus?: string;                // dice expr, e.g. '1d4'
  saveBonus?: string;                      // dice expr, e.g. '1d4'
  damageRider?: { dice: string; damageType: string };
  onlyVsTargetParticipantId?: string;
  onlyMelee?: boolean;
  onlyRanged?: boolean;
  /** v2.114.0 — Phase H pt 5: consumed after the first qualifying use
   *  (Absorb Elements rider — one melee attack only). */
  singleUse?: boolean;
  /** v2.602.0 — automation arc ship 4b: recurring per-turn tick
   *  (Acid Arrow, Heroism, Regenerate, Searing Smite). Processed by
   *  the saved turn-effect transaction from advanceTurn. */
  turnTick?: TurnTick;
  /** v2.607.0 — ship 4c: temp HP granted when the buff is applied
   *  (Armor of Agathys 5×slot). RAW: temp HP never stack — applyBuff
   *  keeps the higher of current vs grant. */
  grantTempHp?: number;
  /** v2.607.0 — ship 4c: flat damage dealt to a creature that hits
   *  the buff holder with a melee attack (Armor of Agathys 5×slot
   *  cold). requiresTempHp gates on the holder still having temp HP
   *  when the hit lands (RAW "while you have these Hit Points");
   *  pendingAttack.applyDamage fires it and removes the buff when
   *  the pool empties. */
  meleeRetaliation?: { damage: number; damageType: string; requiresTempHp?: boolean };
  /** Start-boundary markers (Sap/Slow); the skip flag supports old saved Vex. */
  expiresAtStartOfTurnOf?: string;
  expiresSkipFirst?: boolean;
  /** v2.869: Vex arms on the next own start and expires at that turn's end. */
  expiresAtEndOfTurnOf?: string;
  expiresAfterNextTurnStarts?: boolean;
}

/** v2.602.0 — Per-turn tick spec carried on a buff. Amount per tick is
 *  roll(dice) + flat; either part may be absent.
 *  - 'damage' subtracts through temp HP first (RAW order); a character
 *    ticked while at 0 HP takes a death-save failure instead
 *    (damage-at-0 rule), with the massive-damage instant-death check.
 *  - 'heal' caps at max HP; healing a character up from 0 resets both
 *    death-save counters (RAW: any HP regained resets them).
 *  - 'temp_hp' keeps the HIGHER of current vs granted (temp HP never
 *    stack, PHB 2024).
 *  saveEnds does NOT auto-roll — participants don't carry save
 *  bonuses, so a fabricated roll would be wrong. It emits a
 *  save_requested event (RAW order: damage first, then the save) and
 *  the DM removes the buff on a success via the existing buff UI. */
export type { TurnTick } from '../rules/turnTicks';

// ─── Apply / remove ──────────────────────────────────────────────

export interface ApplyBuffInput {
  participantId: string;
  buff: ActiveBuff;
  campaignId?: string;
  encounterId?: string | null;
  emitEvent?: boolean;
}

export async function applyBuff(input: ApplyBuffInput): Promise<void> {
  const { data: partRaw } = await (supabase as any)
    .from('combat_participants')
    .select(
      'combatant_id, name, participant_type, campaign_id, encounter_id, ' +
        JOINED_COMBATANT_FIELDS
    )
    .eq('id', input.participantId)
    .single();
  if (!partRaw) return;
  const part = normalizeParticipantRow(partRaw);

  const current = ((part.active_buffs ?? []) as ActiveBuff[]);
  // De-duplicate on key — replace existing entry if already present
  const next = current.filter(b => b.key !== input.buff.key).concat(input.buff);

  // v2.318: writes go to combatants (the source-of-truth post-Phase 3).
  // combatant_id is guaranteed non-null by the cp_ensure_combatant_link
  // BEFORE INSERT trigger from v2.315.
  const combatantId = part.combatant_id as string | null;
  if (!combatantId) {
    console.warn('[applyBuff] participant missing combatant_id; skipping write', input.participantId);
    return;
  }
  // v2.607.0 — grantTempHp buffs (Armor of Agathys) apply their pool
  // in the same write. RAW: temp HP never stack — keep the higher.
  const buffUpdates: Record<string, any> = { active_buffs: asJsonb(next) };
  let tempGranted = 0;
  if ((input.buff.grantTempHp ?? 0) > 0) {
    const currentTemp = (part.temp_hp as number | null) ?? 0;
    const granted = input.buff.grantTempHp as number;
    if (granted > currentTemp) {
      buffUpdates.temp_hp = granted;
      tempGranted = granted;
    }
  }
  await checkedWrite('combatants.update apply-buff', { combatantId }, (supabase as any)
    .from('combatants')
    .update(buffUpdates)
    .eq('id', combatantId));

  if (tempGranted > 0 && input.campaignId) {
    await emitCombatEvent({
      campaignId: input.campaignId,
      encounterId: input.encounterId ?? null,
      chainId: newChainId(),
      sequence: 0,
      actorType: 'system',
      actorName: 'System',
      targetType: part.participant_type === 'character' ? 'player' : 'monster',
      targetName: part.name as string,
      eventType: 'temp_hp_gained',
      payload: { amount: tempGranted, source_buff: input.buff.name },
    });
  }

  if (input.emitEvent !== false) {
    await emitCombatEvent({
      campaignId: input.campaignId ?? (part.campaign_id as string),
      encounterId: input.encounterId ?? (part.encounter_id as string | null),
      chainId: newChainId(),
      sequence: 0,
      actorType: 'system',
      actorName: 'System',
      targetType: part.participant_type as any,
      targetName: part.name as string,
      eventType: 'buff_applied',
      payload: {
        key: input.buff.key,
        name: input.buff.name,
        source: input.buff.source,
      },
    });
  }
}

export interface RemoveBuffInput {
  participantId: string;
  key: string;
  reason?: string;                    // 'concentration_broken' | 'consumed' | 'expired' | 'manual'
  campaignId?: string;
  encounterId?: string | null;
  emitEvent?: boolean;
}

export async function removeBuff(input: RemoveBuffInput): Promise<void> {
  const { data: partRaw } = await (supabase as any)
    .from('combat_participants')
    .select(
      'combatant_id, name, participant_type, campaign_id, encounter_id, ' +
        JOINED_COMBATANT_FIELDS
    )
    .eq('id', input.participantId)
    .single();
  if (!partRaw) return;
  const part = normalizeParticipantRow(partRaw);

  const current = ((part.active_buffs ?? []) as ActiveBuff[]);
  const removed = current.find(b => b.key === input.key);
  if (!removed) return;
  const next = current.filter(b => b.key !== input.key);

  // v2.318: writes go to combatants.
  const combatantId = part.combatant_id as string | null;
  if (!combatantId) {
    console.warn('[removeBuff] participant missing combatant_id; skipping write', input.participantId);
    return;
  }
  await checkedWrite('combatants.update remove-buff', { combatantId }, supabase
    .from('combatants')
    .update({ active_buffs: asJsonb(next) })
    .eq('id', combatantId));

  if (input.emitEvent !== false) {
    await emitCombatEvent({
      campaignId: input.campaignId ?? (part.campaign_id as string),
      encounterId: input.encounterId ?? (part.encounter_id as string | null),
      chainId: newChainId(),
      sequence: 0,
      actorType: 'system',
      actorName: 'System',
      targetType: part.participant_type as any,
      targetName: part.name as string,
      eventType: 'buff_removed',
      payload: {
        key: input.key,
        name: removed.name,
        reason: input.reason ?? 'manual',
      },
    });
  }
}

// ─── Roll-time readers ───────────────────────────────────────────
// These return the BUFFS themselves, not pre-rolled dice — the attack code
// rolls + emits events so the log can show "Bless contributed 3 to the hit".

export interface BuffBonus {
  buff: ActiveBuff;
  dice: string;
  rolled?: number;   // filled in after roll
}

/** Attack-roll bonuses (currently: Bless). Ranged/melee filters honored. */
export function getAttackRollBonuses(
  attackerBuffs: ActiveBuff[],
  opts: { isMelee: boolean },
): BuffBonus[] {
  const out: BuffBonus[] = [];
  for (const b of attackerBuffs) {
    if (!b.attackRollBonus) continue;
    if (b.onlyMelee && !opts.isMelee) continue;
    if (b.onlyRanged && opts.isMelee) continue;
    out.push({ buff: b, dice: b.attackRollBonus });
  }
  return out;
}

/** Save-roll bonuses (currently: Bless). No melee/ranged context needed. */
export function getSaveBonuses(targetBuffs: ActiveBuff[]): BuffBonus[] {
  const out: BuffBonus[] = [];
  for (const b of targetBuffs) {
    if (!b.saveBonus) continue;
    out.push({ buff: b, dice: b.saveBonus });
  }
  return out;
}

/** Damage riders (Hunter's Mark, Hex, Divine Favor). Target-specific
 *  riders only fire when attacking the marked creature. */
export function getDamageRiders(
  attackerBuffs: ActiveBuff[],
  opts: DamageRiderAttack,
): BuffBonus[] {
  const out: BuffBonus[] = [];
  for (const b of attackerBuffs) {
    const rider=damageRiderForAttack(b,opts);
    if(rider?.damageRider)out.push({buff:rider,dice:rider.damageRider.dice});
  }
  return out;
}

/**
 * Roll an NdM(±K) expression. Returns individual die results + total.
 *
 * v2.636 dice consolidation: delegates to the canonical parser in
 * src/rules/dice.ts. The old local implementation only matched bare "NdM"
 * and silently returned total 0 for anything with a modifier — a buff tick
 * or damage rider defined as "2d4+2" contributed nothing. The canonical
 * parser handles "NdM", "NdM±K", and bare integers.
 */
export { rollDiceExpr };

// ─── Concentration cleanup ───────────────────────────────────────
// v2.113.0 — Phase H pt 4: parallel to clearConditionsFromConcentration.
// When a caster drops concentration, every buff they placed via that spell
// comes off automatically (Bless targets lose the bonus, Hunter's Mark/Hex
// lose the damage rider, etc.).
export async function clearBuffsFromConcentration(
  campaignId: string,
  encounterId: string | null,
  casterParticipantId: string,
  spellName: string,
): Promise<number> {
  const needle = `spell:${spellName.toLowerCase()}`;

  let query = (supabase as any)
    .from('combat_participants')
    .select(
      'id, name, participant_type, encounter_id, ' +
        JOINED_COMBATANT_FIELDS
    );
  if (encounterId) {
    query = query.eq('encounter_id', encounterId);
  } else {
    query = query.eq('campaign_id', campaignId);
  }
  const { data: rowsRaw } = await query;
  if (!rowsRaw) return 0;
  const rows = rowsRaw.map(normalizeParticipantRow);

  let removedCount = 0;
  for (const row of rows) {
    const buffs = ((row.active_buffs ?? []) as ActiveBuff[]);
    const matchingKeys = buffs
      .filter(b => b.source === needle && b.casterParticipantId === casterParticipantId)
      .map(b => b.key);
    for (const key of matchingKeys) {
      await removeBuff({
        participantId: row.id as string,
        key,
        reason: 'concentration_broken',
        campaignId,
        encounterId: row.encounter_id as string | null,
      });
      removedCount++;
    }
  }
  return removedCount;
}

// ─── Spell → buff registry ───────────────────────────────────────
// v2.114.0 — Phase H pt 5: known concentration/buff spells and the buff
// template they produce per target. `applyBuffFromSpell` looks up a spell
// name here and applies the right buff to each target.
//
// Design: each registry entry is either:
//   - { scope: 'per_target', template: fn(caster) → ActiveBuff(noTarget) }
//       — the same buff applies to each target independently (Bless gives
//         each target the Bless buff on themselves; the buff modifies their
//         own attacks/saves).
//   - { scope: 'on_caster_per_target', template: fn(caster, target) → ActiveBuff }
//       — the buff applies to the caster but is scoped to the chosen target
//         (Hunter's Mark / Hex: rider on caster's attacks vs the marked one).
//   - { scope: 'on_caster_only', template: fn(caster) → ActiveBuff }
//       — Divine Favor: caster only, no target parameter.
//
// Spell names are looked up case-insensitively.

/** v2.602.0 — caster-derived numbers some templates need (Heroism's
 *  temp HP = spellcasting mod; Searing Smite's save DC). Resolved by
 *  applyBuffFromSpell from the caster's character row when the entry
 *  sets needsCasterStats; undefined when unresolvable (NPC caster,
 *  fetch failure) — templates must default sanely. */
export interface CasterStats {
  spellMod: number;
  saveDC: number;
  /** v2.607.0 — slot level the spell was cast at (threaded from
   *  SpellCastButton for scaling templates like Armor of Agathys).
   *  Undefined for cantrips / unknown callers. */
  slotLevel?: number;
}

type BuffSpellEntry =
  | { scope: 'per_target'; needsCasterStats?: boolean; template: (casterId: string, stats?: CasterStats) => Omit<ActiveBuff, 'source' | 'casterParticipantId'> }
  | { scope: 'on_caster_per_target'; needsCasterStats?: boolean; template: (casterId: string, targetId: string, stats?: CasterStats) => Omit<ActiveBuff, 'source' | 'casterParticipantId'> }
  | { scope: 'on_caster_only'; needsCasterStats?: boolean; template: (casterId: string, stats?: CasterStats) => Omit<ActiveBuff, 'source' | 'casterParticipantId'> };

export const BUFF_SPELL_REGISTRY: Record<string, BuffSpellEntry> = {
  bless: {
    scope: 'per_target',
    template: () => ({
      key: 'bless',
      name: 'Bless',
      attackRollBonus: '1d4',
      saveBonus: '1d4',
    }),
  },
  "hunter's mark": {
    scope: 'on_caster_per_target',
    template: (_casterId, targetId) => ({
      key: 'hunters_mark',
      name: "Hunter's Mark",
      damageRider: { dice: '1d6', damageType: 'force' }, // SRD 5.2.1, Hunter's Mark
      onlyVsTargetParticipantId: targetId,
    }),
  },
  hex: {
    scope: 'on_caster_per_target',
    template: (_casterId, targetId) => ({
      key: 'hex',
      name: 'Hex',
      damageRider: { dice: '1d6', damageType: 'necrotic' },
      onlyVsTargetParticipantId: targetId,
    }),
  },
  'divine favor': {
    scope: 'on_caster_only',
    template: () => ({
      key: 'divine_favor',
      name: 'Divine Favor',
      damageRider: { dice: '1d4', damageType: 'radiant' },
    }),
  },
  // v2.607.0 — ship 4c. SRD 5.2.1: 5 Temp HP; a creature that hits
  // you with a melee attack roll while you have these HP takes 5
  // Cold damage. +5 to both per slot level above 1. Not
  // concentration (1 hour) — the buff ends when the pool empties
  // (handled in pendingAttack) or manually.
  'armor of agathys': {
    scope: 'on_caster_only',
    template: (_casterId, stats) => {
      const slot = Math.max(1, stats?.slotLevel ?? 1);
      const n = 5 * slot;
      return {
        key: 'armor_of_agathys',
        name: 'Armor of Agathys',
        grantTempHp: n,
        meleeRetaliation: { damage: n, damageType: 'cold', requiresTempHp: true },
      };
    },
  },
  // v2.602.0 — automation arc ship 4b: start/end-of-turn ticks.
  'acid arrow': {
    scope: 'per_target',
    template: () => ({
      key: 'acid_arrow',
      name: 'Acid Arrow',
      // SRD 5.2.1: "2d4 Acid damage at the end of its next turn."
      // One-shot: the buff removes itself after the tick fires.
      turnTick: { kind: 'damage', timing: 'turn_end', dice: '2d4', damageType: 'acid', oneShot: true },
    }),
  },
  heroism: {
    scope: 'per_target',
    needsCasterStats: true,
    template: (_casterId, stats) => ({
      key: 'heroism',
      name: 'Heroism',
      // SRD 5.2.1: temp HP equal to the caster's spellcasting ability
      // modifier at the start of each of the target's turns (also
      // Immune to Frightened — tracked via the condition system).
      turnTick: { kind: 'temp_hp', timing: 'turn_start', flat: Math.max(0, stats?.spellMod ?? 0) },
    }),
  },
  regenerate: {
    scope: 'per_target',
    template: () => ({
      key: 'regenerate',
      name: 'Regenerate',
      // SRD 5.2.1: the target regains 1 HP at the start of each of
      // its turns (the upfront 4d8+15 is applied at cast, not here).
      turnTick: { kind: 'heal', timing: 'turn_start', flat: 1 },
    }),
  },
  'searing smite': {
    scope: 'per_target',
    needsCasterStats: true,
    template: (_casterId, stats) => ({
      key: 'searing_smite',
      name: 'Searing Smite',
      // SRD 5.2.1: at the start of each of its turns the target takes
      // 1d6 Fire damage and THEN makes a CON save; success ends the
      // spell. Damage-then-save order is preserved by planTurnTicks.
      turnTick: { kind: 'damage', timing: 'turn_start', dice: '1d6', damageType: 'fire', saveEnds: { ability: 'CON', dc: stats?.saveDC ?? 13 } },
    }),
  },
};

/**
 * Apply the buff(s) produced by a concentration/self-buff spell. Caller
 * passes the caster's participant id and the affected target participant
 * ids (may be empty or caster-only depending on the spell's scope).
 */
export async function applyBuffFromSpell(input: {
  campaignId: string;
  encounterId: string | null;
  spellName: string;
  casterParticipantId: string;
  targetParticipantIds: string[];   // may be empty for caster-only spells
  /** v2.602.0 — lets needsCasterStats entries resolve the caster's
   *  spellcasting mod / save DC from their character row. */
  casterCharacterId?: string;
  /** v2.607.0 — slot level the spell was cast at, for scaling
   *  templates (Armor of Agathys). */
  castSlotLevel?: number;
}): Promise<number> {
  const key = input.spellName.trim().toLowerCase();
  const entry = BUFF_SPELL_REGISTRY[key];
  if (!entry) return 0;

  // v2.602.0 — resolve caster stats when the entry needs them.
  // v2.607.0 — slot level rides along whenever the caller provides it.
  let stats: CasterStats | undefined =
    input.castSlotLevel != null ? { spellMod: 0, saveDC: 13, slotLevel: input.castSlotLevel } : undefined;
  if (entry.needsCasterStats && input.casterCharacterId) {
    try {
      const { data: ch } = await supabase
        .from('characters')
        .select('*')
        .eq('id', input.casterCharacterId)
        .maybeSingle();
      if (ch) {
        const { computeStats } = await import('./gameUtils');
        const cs = computeStats(ch as any);
        const pb = cs.proficiency_bonus;
        stats = {
          spellMod: (cs.spell_attack_bonus ?? 0) - pb,
          saveDC: cs.spell_save_dc ?? 13,
          slotLevel: input.castSlotLevel,
        };
      }
    } catch (e) {
      console.warn('[applyBuffFromSpell] caster stats resolution failed; templates use defaults', e);
    }
  }

  const source = `spell:${key}`;
  let applied = 0;

  if (entry.scope === 'per_target') {
    for (const tid of input.targetParticipantIds) {
      const tpl = entry.template(input.casterParticipantId, stats);
      await applyBuff({
        participantId: tid,
        buff: { ...tpl, source, casterParticipantId: input.casterParticipantId },
        campaignId: input.campaignId,
        encounterId: input.encounterId,
      });
      applied++;
    }
  } else if (entry.scope === 'on_caster_per_target') {
    // Bind the rider to the first target (HM/Hex RAW is single-target).
    const tid = input.targetParticipantIds[0];
    if (!tid) return 0;
    const tpl = entry.template(input.casterParticipantId, tid, stats);
    await applyBuff({
      participantId: input.casterParticipantId,
      buff: { ...tpl, source, casterParticipantId: input.casterParticipantId },
      campaignId: input.campaignId,
      encounterId: input.encounterId,
    });
    applied = 1;
  } else {
    const tpl = entry.template(input.casterParticipantId, stats);
    await applyBuff({
      participantId: input.casterParticipantId,
      buff: { ...tpl, source, casterParticipantId: input.casterParticipantId },
      campaignId: input.campaignId,
      encounterId: input.encounterId,
    });
    applied = 1;
  }

  return applied;
}
