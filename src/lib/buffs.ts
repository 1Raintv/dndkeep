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
import { emitCombatEvent, newChainId } from './combatEvents';
import { rollDie } from './gameUtils';
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
}

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
      'active_buffs, name, participant_type, campaign_id, encounter_id, ' +
        JOINED_COMBATANT_FIELDS
    )
    .eq('id', input.participantId)
    .single();
  if (!partRaw) return;
  const part = normalizeParticipantRow(partRaw);

  const current = ((part.active_buffs ?? []) as ActiveBuff[]);
  // De-duplicate on key — replace existing entry if already present
  const next = current.filter(b => b.key !== input.buff.key).concat(input.buff);

  await supabase
    .from('combat_participants')
    .update({ active_buffs: next })
    .eq('id', input.participantId);

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
      'active_buffs, name, participant_type, campaign_id, encounter_id, ' +
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

  await supabase
    .from('combat_participants')
    .update({ active_buffs: next })
    .eq('id', input.participantId);

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
  opts: { targetParticipantId: string | null; isMelee: boolean },
): BuffBonus[] {
  const out: BuffBonus[] = [];
  for (const b of attackerBuffs) {
    if (!b.damageRider) continue;
    if (b.onlyMelee && !opts.isMelee) continue;
    if (b.onlyRanged && opts.isMelee) continue;
    if (b.onlyVsTargetParticipantId && b.onlyVsTargetParticipantId !== opts.targetParticipantId) continue;
    out.push({ buff: b, dice: b.damageRider.dice });
  }
  return out;
}

/** Roll a simple NdM expression. Returns individual die results + total. */
export function rollDiceExpr(expr: string): { rolls: number[]; total: number } {
  const m = expr.trim().match(/^(\d+)d(\d+)$/i);
  if (!m) return { rolls: [], total: 0 };
  const count = parseInt(m[1], 10);
  const size = parseInt(m[2], 10);
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(rollDie(size));
  return { rolls, total: rolls.reduce((s, r) => s + r, 0) };
}

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
      'id, name, participant_type, active_buffs, encounter_id, ' +
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

type BuffSpellEntry =
  | { scope: 'per_target'; template: (casterId: string) => Omit<ActiveBuff, 'source' | 'casterParticipantId'> }
  | { scope: 'on_caster_per_target'; template: (casterId: string, targetId: string) => Omit<ActiveBuff, 'source' | 'casterParticipantId'> }
  | { scope: 'on_caster_only'; template: (casterId: string) => Omit<ActiveBuff, 'source' | 'casterParticipantId'> };

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
      damageRider: { dice: '1d6', damageType: 'piercing' }, // actually "weapon damage type" per RAW — 1d6 added to weapon's type on hit. Simplified here.
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
      onlyMelee: true,
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
}): Promise<number> {
  const key = input.spellName.trim().toLowerCase();
  const entry = BUFF_SPELL_REGISTRY[key];
  if (!entry) return 0;

  const source = `spell:${key}`;
  let applied = 0;

  if (entry.scope === 'per_target') {
    for (const tid of input.targetParticipantIds) {
      const tpl = entry.template(input.casterParticipantId);
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
    const tpl = entry.template(input.casterParticipantId, tid);
    await applyBuff({
      participantId: input.casterParticipantId,
      buff: { ...tpl, source, casterParticipantId: input.casterParticipantId },
      campaignId: input.campaignId,
      encounterId: input.encounterId,
    });
    applied = 1;
  } else {
    const tpl = entry.template(input.casterParticipantId);
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
