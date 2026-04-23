// v2.97.0 — Phase E of the Combat Backbone
//
// Pending attack state machine. Every attack routes through this pipeline so
// reactions (v2.98), fudging, and resistances can intercept cleanly between
// states.
//
// Flow:
//   declareAttack()  → row in 'declared'
//   rollAttackRoll() → 'attack_rolled' (hit/miss/crit)
//   rollDamage()     → 'damage_rolled'
//   applyDamage()    → 'applied' (writes to target HP)
//   cancelAttack()   → 'canceled' (terminal)
//   fudgeDamage()    → updates damage_final and emits hidden dm_fudge event
//
// Every transition emits a structured combat_event on the shared chain_id so
// the Phase A log renders the full story end-to-end.

import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';
import { offerReactionsFor } from './pendingReaction';
import { abilityModifier, proficiencyBonus } from './gameUtils';
import { getAdvantageState, meleeAutoCritApplies, conditionsAutoFailSave, conditionsDisadvantageSave, conditionsResistAll, clearConditionsFromConcentration } from './conditions';
import {
  getAttackRollBonuses, getSaveBonuses, getDamageRiders,
  rollDiceExpr as rollBuffDice,
  clearBuffsFromConcentration, removeBuff,
} from './buffs';
import type { ActiveBuff } from './buffs';
import { resolveAutomation } from './automations';
import { CONDITION_MAP } from '../data/conditions';
import { effectiveCombatAC } from './armorClass';
import type { PendingAttack, HitResult } from '../types';

// ─── Dice helpers ────────────────────────────────────────────────
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

// Parses dice expressions like "2d8+3" or "1d6" and returns the individual
// rolls + modifier. Falls back to [0, 0] on parse failure.
export function rollDiceExpr(expr: string): { rolls: number[]; modifier: number; total: number } {
  const m = /^\s*(\d+)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) return { rolls: [], modifier: 0, total: 0 };
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
  return { rolls, modifier: mod, total: rolls.reduce((a, b) => a + b, 0) + mod };
}

// On a crit, double the dice (not modifier) per 2024 PHB.
function doubleDice(expr: string): string {
  const m = /^\s*(\d+)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) return expr;
  const count = parseInt(m[1], 10) * 2;
  const sides = m[2];
  const mod = m[3] ? m[3].replace(/\s+/g, '') : '';
  return `${count}d${sides}${mod}`;
}

// ─── Declare ─────────────────────────────────────────────────────

export interface DeclareAttackInput {
  campaignId: string;
  encounterId?: string | null;

  attackerParticipantId?: string | null;
  attackerName: string;
  attackerType: 'character' | 'monster' | 'npc' | 'system';

  targetParticipantId?: string | null;
  targetName: string;
  targetType?: 'character' | 'monster' | 'npc' | 'object' | 'area' | 'self' | null;

  attackSource?: string;          // 'monster_action' | 'weapon' | 'spell' | 'ability'
  attackName: string;
  attackKind: 'attack_roll' | 'save' | 'auto_hit';

  attackBonus?: number | null;
  targetAC?: number | null;
  saveDC?: number | null;
  saveAbility?: string | null;
  saveSuccessEffect?: string | null;

  damageDice?: string | null;
  damageType?: string | null;

  /** v2.103.0 — Phase F: cover level. 'total' auto-misses the attack. */
  coverLevel?: 'none' | 'half' | 'three_quarters' | 'total' | null;
  /** v2.103.0 — If set, persist this cover level on the target's
   *  persistent_cover for this attacker so future attacks inherit it. */
  persistCover?: boolean;
}

export async function declareAttack(input: DeclareAttackInput): Promise<PendingAttack | null> {
  const chainId = newChainId();
  const { data, error } = await supabase
    .from('pending_attacks')
    .insert({
      campaign_id: input.campaignId,
      encounter_id: input.encounterId ?? null,
      attacker_participant_id: input.attackerParticipantId ?? null,
      attacker_name: input.attackerName,
      attacker_type: input.attackerType,
      target_participant_id: input.targetParticipantId ?? null,
      target_name: input.targetName,
      target_type: input.targetType ?? null,
      attack_source: input.attackSource ?? null,
      attack_name: input.attackName,
      attack_kind: input.attackKind,
      attack_bonus: input.attackBonus ?? null,
      target_ac: input.targetAC ?? null,
      save_dc: input.saveDC ?? null,
      save_ability: input.saveAbility ?? null,
      save_success_effect: input.saveSuccessEffect ?? null,
      damage_dice: input.damageDice ?? null,
      damage_type: input.damageType ?? null,
      cover_level: input.coverLevel ?? 'none',
      state: 'declared',
      chain_id: chainId,
    })
    .select()
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.warn('[pendingAttack] declare failed:', error?.message);
    return null;
  }

  // v2.103.0 — Phase F: write cover through to the target's persistent_cover
  // map if requested. Non-'none' values stick; 'none' clears any existing
  // entry for this attacker.
  if (
    input.persistCover
    && input.targetParticipantId
    && input.attackerParticipantId
  ) {
    const { data: tgt } = await supabase
      .from('combat_participants')
      .select('persistent_cover')
      .eq('id', input.targetParticipantId)
      .single();
    const current = (tgt?.persistent_cover as Record<string, string>) ?? {};
    const next = { ...current };
    if (!input.coverLevel || input.coverLevel === 'none') {
      delete next[input.attackerParticipantId];
    } else {
      next[input.attackerParticipantId] = input.coverLevel;
    }
    await supabase
      .from('combat_participants')
      .update({ persistent_cover: next })
      .eq('id', input.targetParticipantId);
  }

  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId ?? null,
    chainId,
    sequence: 0,
    actorType: input.attackerType === 'system' ? 'system' : input.attackerType === 'character' ? 'player' : 'monster',
    actorName: input.attackerName,
    targetType: input.targetType ?? null,
    targetName: input.targetName,
    eventType: 'attack_declared',
    payload: {
      attack_name: input.attackName,
      attack_kind: input.attackKind,
      attack_source: input.attackSource ?? null,
      attack_bonus: input.attackBonus ?? null,
      target_ac: input.targetAC ?? null,
      save_dc: input.saveDC ?? null,
      save_ability: input.saveAbility ?? null,
      damage_dice: input.damageDice ?? null,
      damage_type: input.damageType ?? null,
    },
  });

  return data as PendingAttack;
}

// ─── Multi-target declare ────────────────────────────────────────
// v2.104.0 — Phase F pt 3c: AoE spells that hit multiple participants.
// Creates one pending_attacks row per target, sharing chain_id (so the log
// reads as one event) and damage_group_id (so dice roll once and the values
// are reused across siblings). Per-target save is still independent.

export interface DeclareMultiTargetInput
  extends Omit<DeclareAttackInput,
    | 'targetParticipantId'
    | 'targetName'
    | 'targetType'
  > {
  targets: Array<{
    participantId: string;
    name: string;
    type: 'character' | 'monster' | 'npc';
    /** v2.146.0 — Phase N pt 4: optional per-target cover override.
     *  Callers with a battle map compute this via
     *  deriveCoverFromWalls(attacker, this target, walls, gridSize) so
     *  each target in an AoE gets its own cover level. When omitted,
     *  falls through to the batch-level `coverLevel` and then 'none'. */
    coverLevel?: 'none' | 'half' | 'three_quarters' | 'total';
  }>;
}

export async function declareMultiTargetAttack(
  input: DeclareMultiTargetInput
): Promise<PendingAttack[]> {
  if (input.targets.length === 0) return [];

  // For single-target calls, fall through to declareAttack so we don't create
  // an unnecessary damage_group_id. Callers can use either helper.
  if (input.targets.length === 1) {
    const t = input.targets[0];
    const single = await declareAttack({
      ...input,
      targetParticipantId: t.participantId,
      targetName: t.name,
      targetType: t.type,
    });
    return single ? [single] : [];
  }

  const chainId = newChainId();
  const damageGroupId = crypto.randomUUID();
  const rows = input.targets.map(t => ({
    campaign_id: input.campaignId,
    encounter_id: input.encounterId ?? null,
    attacker_participant_id: input.attackerParticipantId ?? null,
    attacker_name: input.attackerName,
    attacker_type: input.attackerType,
    target_participant_id: t.participantId,
    target_name: t.name,
    target_type: t.type,
    attack_source: input.attackSource ?? null,
    attack_name: input.attackName,
    attack_kind: input.attackKind,
    attack_bonus: input.attackBonus ?? null,
    target_ac: input.targetAC ?? null,
    save_dc: input.saveDC ?? null,
    save_ability: input.saveAbility ?? null,
    save_success_effect: input.saveSuccessEffect ?? null,
    damage_dice: input.damageDice ?? null,
    damage_type: input.damageType ?? null,
    // v2.146.0 — Phase N pt 4: per-target cover takes precedence over the
    // batch-level blanket value. Callers that compute wall-derived cover
    // per target (DeclareAttackModal in AoE mode) set t.coverLevel; the
    // batch value is the fallback for targets with no walls in between
    // or for AoEs used without a battle map.
    cover_level: t.coverLevel ?? input.coverLevel ?? 'none',
    state: 'declared',
    chain_id: chainId,
    damage_group_id: damageGroupId,
  }));

  const { data, error } = await supabase
    .from('pending_attacks')
    .insert(rows)
    .select();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.warn('[pendingAttack] multi-declare failed:', error?.message);
    return [];
  }

  // Emit a single attack_declared event with the target list so the log shows
  // one natural "Fireball targeting Orc, Goblin, Ogre" entry instead of three
  // duplicate entries.
  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId ?? null,
    chainId,
    sequence: 0,
    actorType: input.attackerType === 'system' ? 'system' : input.attackerType === 'character' ? 'player' : 'monster',
    actorName: input.attackerName,
    targetType: null,
    targetName: input.targets.map(t => t.name).join(', '),
    eventType: 'attack_declared',
    payload: {
      attack_name: input.attackName,
      attack_kind: input.attackKind,
      attack_source: input.attackSource ?? null,
      save_dc: input.saveDC ?? null,
      save_ability: input.saveAbility ?? null,
      damage_dice: input.damageDice ?? null,
      damage_type: input.damageType ?? null,
      multi_target: true,
      target_count: input.targets.length,
      targets: input.targets.map(t => ({ name: t.name, type: t.type })),
    },
  });

  return data as PendingAttack[];
}

// ─── Roll attack (attack_kind='attack_roll' only) ────────────────
export async function rollAttackRoll(attackId: string): Promise<PendingAttack | null> {
  const { data: row } = await supabase
    .from('pending_attacks')
    .select('*')
    .eq('id', attackId)
    .single();
  if (!row) return null;
  const atk = row as PendingAttack;

  if (atk.state !== 'declared') return atk;
  if (atk.attack_kind !== 'attack_roll') return atk;

  // v2.110.0 — Phase H: condition-aware advantage/disadvantage.
  // Load both combatants' active_conditions + token positions, compute the
  // net state, then roll 2d20 with take-higher or take-lower as appropriate.
  //
  // v2.156.0 — Phase P pt 4: also load target's active_buffs so the AC
  // comparison includes temporary bonuses like Shield of Faith (+2),
  // Haste (+2), and Shield (+5). Layered at hit-resolution time via
  // effectiveCombatAC — buff AC is NEVER persisted to
  // character.armor_class because buffs have durations and drop on
  // concentration break / next turn.
  let attackerConditions: string[] = [];
  let targetConditions: string[] = [];
  let attackerBuffs: ActiveBuff[] = [];
  let targetBuffs: ActiveBuff[] = [];
  let attackerExhaustion = 0;
  let distanceCells = 99;  // default "ranged / far" — no auto-crit, no Prone bonus
  if (atk.attacker_participant_id && atk.target_participant_id) {
    const [aRes, tRes] = await Promise.all([
      supabase
        .from('combat_participants')
        .select('active_conditions, active_buffs, exhaustion_level, entity_id, participant_type, name')
        .eq('id', atk.attacker_participant_id)
        .maybeSingle(),
      supabase
        .from('combat_participants')
        .select('active_conditions, active_buffs, entity_id, participant_type, name')
        .eq('id', atk.target_participant_id)
        .maybeSingle(),
    ]);
    attackerConditions = ((aRes.data?.active_conditions as string[] | null) ?? []);
    targetConditions = ((tRes.data?.active_conditions as string[] | null) ?? []);
    attackerBuffs = ((aRes.data?.active_buffs as ActiveBuff[] | null) ?? []);
    targetBuffs = ((tRes.data?.active_buffs as ActiveBuff[] | null) ?? []);
    attackerExhaustion = ((aRes.data?.exhaustion_level as number | null) ?? 0);

    // Attempt distance lookup via the campaign's active battle map tokens.
    // If either token is missing we fall back to the default "far" distance,
    // which means no Prone-within-5ft advantage and no auto-crit.
    if (aRes.data && tRes.data) {
      const { data: bm } = await supabase
        .from('battle_maps')
        .select('tokens')
        .eq('campaign_id', atk.campaign_id)
        .eq('active', true)
        .maybeSingle();
      const tokens = (bm?.tokens as any[]) ?? [];
      const matchToken = (p: { entity_id: string; participant_type: string; name: string }) =>
        tokens.find((t: any) => {
          if (!t || typeof t.row !== 'number' || typeof t.col !== 'number') return false;
          if (p.participant_type === 'character') return t.character_id === p.entity_id;
          return (t.name ?? '').toLowerCase() === p.name.toLowerCase();
        });
      const at = matchToken(aRes.data as any);
      const tt = matchToken(tRes.data as any);
      if (at && tt) {
        distanceCells = Math.max(Math.abs(at.row - tt.row), Math.abs(at.col - tt.col));
      }
    }
  }

  const advantageState = getAdvantageState(attackerConditions, targetConditions, distanceCells);
  const bonus = atk.attack_bonus ?? 0;

  // Advantage/disadvantage: roll 2d20 and take higher / lower. Normal: 1d20.
  let d20: number;
  let d20Alt: number | null = null;
  if (advantageState === 'normal') {
    d20 = rollD20();
  } else {
    const r1 = rollD20();
    const r2 = rollD20();
    d20Alt = advantageState === 'advantage' ? Math.min(r1, r2) : Math.max(r1, r2);
    d20 = advantageState === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2);
  }

  // v2.113.0 — Phase H pt 4: buff bonuses to attack roll (e.g., Bless +1d4).
  // Melee vs ranged inferred from attack_source — weapon attacks are assumed
  // melee unless source hints "ranged" (future enhancement can inspect weapon
  // properties). Spell attacks don't distinguish in Bless logic either.
  const isMelee = (atk.attack_source ?? '').toLowerCase() !== 'ranged';
  const attackBonuses = getAttackRollBonuses(attackerBuffs, { isMelee });
  type RolledBonus = { buff: ActiveBuff; dice: string; rolls: number[]; total: number };
  const rolledAttackBonuses: RolledBonus[] = attackBonuses.map(b => {
    const r = rollBuffDice(b.dice);
    return { buff: b.buff, dice: b.dice, rolls: r.rolls, total: r.total };
  });
  const buffAttackTotal = rolledAttackBonuses.reduce((s, r) => s + r.total, 0);

  // v2.116.0 — Phase H pt 7: 2024 exhaustion penalty (-2 per level to d20)
  const exhaustionPenalty = -2 * attackerExhaustion;

  const total = d20 + bonus + buffAttackTotal + exhaustionPenalty;

  // v2.103.0 — Phase F: cover mechanics per 2024 PHB.
  //   half cover:           +2 AC (still targetable)
  //   three-quarters cover: +5 AC (still targetable)
  //   total cover:          untargetable — auto-miss, no attack roll resolves
  //
  // Nat 20 still crits through half / three-quarters cover (RAW crit bypasses
  // AC comparison). Total cover is a hard gate: the attack never reaches a
  // valid target, so even a nat 20 misses.
  //
  // v2.156.0 — Phase P pt 4: also fold in buff AC bonuses from target's
  // active_buffs (Shield +5, Shield of Faith +2, Haste +2). These stack
  // on top of the snapshot AC and cover bonus. Only pure additive
  // acBonus buffs apply; override-style spells (Mage Armor wearing
  // armor, Barkskin AC-floor) require DM manual handling — those
  // semantics aren't supported yet.
  const coverLevel = (atk.cover_level ?? 'none') as 'none' | 'half' | 'three_quarters' | 'total';
  const coverAcBonus = coverLevel === 'half' ? 2 : coverLevel === 'three_quarters' ? 5 : 0;
  const baseAc = atk.target_ac ?? 10;
  const buffAc = effectiveCombatAC(baseAc, targetBuffs) - baseAc;
  const effectiveAc = baseAc + coverAcBonus + buffAc;

  // v2.110.0 — Phase H: auto-crit when target is Paralyzed/Unconscious and
  // attacker is within 5 ft melee range. Still bypassed by total cover.
  const autoCrit = meleeAutoCritApplies(targetConditions, distanceCells);

  let hitResult: HitResult;
  if (coverLevel === 'total') hitResult = 'miss';
  else if (d20 === 20) hitResult = 'crit';
  else if (d20 === 1) hitResult = 'fumble';
  else if (autoCrit && total >= effectiveAc) hitResult = 'crit';   // hit + auto-crit trigger
  else if (autoCrit && total < effectiveAc) hitResult = 'miss';    // miss stays a miss
  else if (total >= effectiveAc) hitResult = 'hit';
  else hitResult = 'miss';

  const { data: updated } = await supabase
    .from('pending_attacks')
    .update({
      attack_d20: d20,
      attack_total: total,
      hit_result: hitResult,
      // Store effective AC (with cover bonus baked in) so the log and the
      // resolution modal both show what the attacker actually had to beat.
      target_ac: effectiveAc,
      state: 'attack_rolled',
    })
    .eq('id', attackId)
    .select()
    .single();

  // Emit a dedicated cover event first so the log reads naturally:
  //   1. Cover applied (half / three-quarters / total)
  //   2. Attack roll
  if (coverLevel !== 'none') {
    await emitCombatEvent({
      campaignId: atk.campaign_id,
      encounterId: atk.encounter_id,
      chainId: atk.chain_id,
      sequence: 0,
      actorType: 'system',
      actorName: 'System',
      targetType: atk.target_type,
      targetName: atk.target_name,
      eventType: 'cover_applied',
      payload: {
        level: coverLevel,
        ac_bonus: coverAcBonus,
        auto_miss: coverLevel === 'total',
        base_ac: atk.target_ac,
        effective_ac: effectiveAc,
      },
    });
  }

  await emitCombatEvent({
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
    chainId: atk.chain_id,
    sequence: 1,
    actorType: atk.attacker_type === 'system' ? 'system' : atk.attacker_type === 'character' ? 'player' : 'monster',
    actorName: atk.attacker_name,
    targetType: atk.target_type,
    targetName: atk.target_name,
    eventType: 'attack_roll',
    payload: {
      action_name: atk.attack_name,
      dice_expression: `1d20${bonus >= 0 ? '+' : ''}${bonus}`,
      individual_results: d20Alt != null ? [d20, d20Alt] : [d20],
      total,
      hit_result: hitResult,
      target_ac: atk.target_ac,
      // v2.110.0 — Phase H condition integration
      advantage_state: advantageState,
      auto_crit: autoCrit && (hitResult === 'crit' || hitResult === 'hit'),
      // v2.113.0 — Phase H pt 4 buff contributions
      buff_contributions: rolledAttackBonuses.map(r => ({
        key: r.buff.key,
        name: r.buff.name,
        dice: r.dice,
        rolls: r.rolls,
        total: r.total,
      })),
      buff_total: buffAttackTotal,
      // v2.116.0 — Phase H pt 7 exhaustion penalty
      exhaustion_level: attackerExhaustion,
      exhaustion_penalty: exhaustionPenalty,
    },
  });

  // v2.113.0 — Phase H pt 4: emit a dedicated buff_contributed event per
  // buff so the log can render "Bless contributed 3 to the hit" inline.
  for (const r of rolledAttackBonuses) {
    await emitCombatEvent({
      campaignId: atk.campaign_id,
      encounterId: atk.encounter_id,
      chainId: atk.chain_id,
      sequence: 2,
      actorType: 'system',
      actorName: r.buff.name,
      targetType: atk.attacker_type,
      targetName: atk.attacker_name,
      eventType: 'buff_contributed',
      payload: {
        key: r.buff.key,
        source: r.buff.source,
        applies_to: 'attack_roll',
        dice: r.dice,
        rolls: r.rolls,
        total: r.total,
      },
    });
  }

  // v2.98.0 — Phase E: offer reactions (Shield, etc.) to the target now that
  // we have a hit/miss. If any offers are created, the resolution pauses on
  // the DM side until all offers terminate. Fire-and-forget from here.
  if (updated) {
    const updatedAtk = updated as PendingAttack;
    await offerReactionsFor(updatedAtk, 'post_attack_roll');
  }

  return (updated as PendingAttack) ?? null;
}

// ─── Roll save (attack_kind='save' only) ─────────────────────────
// v2.102.0 — Phase F pt 3a: per-target save prompt.
//
// Rolls 1d20 + saveBonus for the target and stashes the result on the
// pending_attacks row. Does NOT change state — the attack stays in 'declared'
// because damage still needs to be rolled next. rollDamage reads save_result
// to determine half / zero / full damage.
//
// Nat 20 auto-succeeds, nat 1 auto-fails per 2024 PHB.
export async function rollSave(
  attackId: string,
  saveBonus: number,
): Promise<PendingAttack | null> {
  const { data: row } = await supabase
    .from('pending_attacks')
    .select('*')
    .eq('id', attackId)
    .single();
  if (!row) return null;
  const atk = row as PendingAttack;

  if (atk.attack_kind !== 'save') return atk;
  if (atk.save_result) return atk;   // already rolled

  // v2.111.0 — Phase H pt 2: look up target's active conditions for save
  // modifications. Auto-fail wins over disadvantage (e.g., Paralyzed target
  // fails DEX saves outright regardless of modifier).
  let targetConditions: string[] = [];
  let targetBuffs: ActiveBuff[] = [];
  let targetExhaustion = 0;
  if (atk.target_participant_id) {
    const { data: tRow } = await supabase
      .from('combat_participants')
      .select('active_conditions, active_buffs, exhaustion_level')
      .eq('id', atk.target_participant_id)
      .maybeSingle();
    targetConditions = ((tRow?.active_conditions as string[] | null) ?? []);
    targetBuffs = ((tRow?.active_buffs as ActiveBuff[] | null) ?? []);
    targetExhaustion = ((tRow?.exhaustion_level as number | null) ?? 0);
  }
  const ability = atk.save_ability ?? '';
  const autoFail = conditionsAutoFailSave(targetConditions, ability);
  const saveDisadvantage = !autoFail && conditionsDisadvantageSave(targetConditions, ability);

  // v2.103.0 — Phase F: half / three-quarters cover grants +2 / +5 to DEX
  // saves (2024 PHB). Doesn't apply to other save abilities.
  const coverLevel = (atk.cover_level ?? 'none') as 'none' | 'half' | 'three_quarters' | 'total';
  const coverSaveBonus =
    atk.save_ability === 'DEX'
      ? (coverLevel === 'half' ? 2 : coverLevel === 'three_quarters' ? 5 : 0)
      : 0;

  // v2.113.0 — Phase H pt 4: Bless save bonus (+1d4). Readers return all
  // buffs that modify saves; we roll each and add to effectiveBonus.
  const saveBuffBonuses = getSaveBonuses(targetBuffs);
  type RolledSaveBonus = { buff: ActiveBuff; dice: string; rolls: number[]; total: number };
  const rolledSaveBuffs: RolledSaveBonus[] = saveBuffBonuses.map(b => {
    const r = rollBuffDice(b.dice);
    return { buff: b.buff, dice: b.dice, rolls: r.rolls, total: r.total };
  });
  const buffSaveTotal = rolledSaveBuffs.reduce((s, r) => s + r.total, 0);

  // v2.116.0 — Phase H pt 7: 2024 exhaustion applies to ALL d20 rolls
  // including saves. -2 per level.
  const saveExhaustionPenalty = -2 * targetExhaustion;

  const effectiveBonus = saveBonus + coverSaveBonus + buffSaveTotal + saveExhaustionPenalty;

  // Auto-fail: force result=failed, d20=0 shown as cosmetic 1, no actual roll
  let d20: number;
  let d20Alt: number | null = null;
  let total: number;
  if (autoFail) {
    d20 = 1;                                   // cosmetic — always a "nat 1" for log readability
    total = 1 + effectiveBonus;
  } else if (saveDisadvantage) {
    const r1 = rollD20();
    const r2 = rollD20();
    d20 = Math.min(r1, r2);
    d20Alt = Math.max(r1, r2);
    total = d20 + effectiveBonus;
  } else {
    d20 = rollD20();
    total = d20 + effectiveBonus;
  }
  const dc = atk.save_dc ?? 10;

  let result: 'passed' | 'failed';
  if (autoFail) result = 'failed';
  else if (d20 === 20) result = 'passed';
  else if (d20 === 1) result = 'failed';
  else result = total >= dc ? 'passed' : 'failed';

  // v2.139.0 — Phase M pt 2: Legendary Resistance decision point.
  // When a monster target has LR charges left AND the save failed, flip
  // pending_lr_decision=true so the DM gets prompted. The DM picks:
  //   - Accept (acceptLegendaryResistance) → save_result='passed',
  //     legendary_resistance_used++, save becomes a success
  //   - Decline (declineLegendaryResistance) → save stays 'failed',
  //     damage proceeds normally
  // rollDamage guards on pending_lr_decision so it can't run while the
  // prompt is open. No prompt when: save passed, no target, target isn't
  // a monster, or no LR charges remain.
  let triggerLrPrompt = false;
  if (result === 'failed' && atk.target_participant_id && atk.target_type === 'monster') {
    const { data: lrRow } = await supabase
      .from('combat_participants')
      .select('legendary_resistance, legendary_resistance_used')
      .eq('id', atk.target_participant_id)
      .maybeSingle();
    const lrTotal = (lrRow?.legendary_resistance as number | null) ?? 0;
    const lrUsed = (lrRow?.legendary_resistance_used as number | null) ?? 0;
    if (lrTotal > 0 && lrUsed < lrTotal) {
      triggerLrPrompt = true;
    }
  }

  const { data: updated } = await supabase
    .from('pending_attacks')
    .update({
      save_d20: d20,
      save_total: total,
      save_result: result,
      pending_lr_decision: triggerLrPrompt,
    })
    .eq('id', attackId)
    .select()
    .single();

  if (coverSaveBonus > 0) {
    await emitCombatEvent({
      campaignId: atk.campaign_id,
      encounterId: atk.encounter_id,
      chainId: atk.chain_id,
      sequence: 0,
      actorType: 'system',
      actorName: 'System',
      targetType: atk.target_type,
      targetName: atk.target_name,
      eventType: 'cover_applied',
      payload: {
        level: coverLevel,
        save_bonus: coverSaveBonus,
        save_ability: atk.save_ability,
      },
    });
  }

  await emitCombatEvent({
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
    chainId: atk.chain_id,
    sequence: 1,
    actorType: atk.target_type === 'character' ? 'player' : atk.target_type === 'monster' ? 'monster' : 'system',
    actorName: atk.target_name,
    targetType: 'self',
    targetName: atk.target_name,
    eventType: 'save_rolled',
    payload: {
      save_type: 'attack',
      ability: atk.save_ability,
      dc,
      d20,
      bonus: effectiveBonus,
      base_bonus: saveBonus,
      cover_bonus: coverSaveBonus,
      total,
      result,
      trigger_attack_name: atk.attack_name,
      trigger_attacker: atk.attacker_name,
      // v2.111.0 — Phase H pt 2: condition-sourced save mods
      auto_fail: autoFail,
      disadvantage: saveDisadvantage,
      individual_results: d20Alt != null ? [d20, d20Alt] : undefined,
      // v2.113.0 — Phase H pt 4 buff contributions
      buff_contributions: rolledSaveBuffs.map(r => ({
        key: r.buff.key,
        name: r.buff.name,
        dice: r.dice,
        rolls: r.rolls,
        total: r.total,
      })),
      buff_total: buffSaveTotal,
      // v2.116.0 — Phase H pt 7 exhaustion penalty
      exhaustion_level: targetExhaustion,
      exhaustion_penalty: saveExhaustionPenalty,
    },
  });

  // v2.113.0 — Phase H pt 4: emit dedicated buff_contributed events for saves
  for (const r of rolledSaveBuffs) {
    await emitCombatEvent({
      campaignId: atk.campaign_id,
      encounterId: atk.encounter_id,
      chainId: atk.chain_id,
      sequence: 2,
      actorType: 'system',
      actorName: r.buff.name,
      targetType: atk.target_type,
      targetName: atk.target_name,
      eventType: 'buff_contributed',
      payload: {
        key: r.buff.key,
        source: r.buff.source,
        applies_to: 'save_roll',
        dice: r.dice,
        rolls: r.rolls,
        total: r.total,
      },
    });
  }

  // v2.124.0 — Phase J: if this is a Counterspell save, propagate the outcome
  // back to the pending_spell_casts row. attack_name convention is
  // 'Counterspell vs ${spell}' or 'Counterspell vs ${spell} (L{n})'.
  if ((atk.attack_name ?? '').startsWith('Counterspell')) {
    const { data: psc } = await supabase
      .from('pending_spell_casts')
      .select('id, state')
      .eq('counterspell_attack_id', atk.id)
      .maybeSingle();
    if (psc && psc.state === 'counterspell_offered') {
      // result is already defined above — scope it
      const caster_saved = result === 'passed';
      await supabase
        .from('pending_spell_casts')
        .update({
          state: caster_saved ? 'resolved' : 'countered',
          outcome: caster_saved ? 'saved_through' : 'countered',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', psc.id);

      await emitCombatEvent({
        campaignId: atk.campaign_id,
        encounterId: atk.encounter_id,
        chainId: atk.chain_id,
        sequence: 71,
        actorType: 'system',
        actorName: 'System',
        targetType: atk.target_type,
        targetName: atk.target_name,
        eventType: 'spell_counterspell_resolved',
        payload: {
          spell_cast_id: psc.id,
          target_saved: caster_saved,
          outcome: caster_saved ? 'saved_through' : 'countered',
          save_d20: d20,
          save_total: total,
        },
      });
    }
  }

  return (updated as PendingAttack) ?? null;
}

// ─── Roll damage ─────────────────────────────────────────────────
export async function rollDamage(attackId: string): Promise<PendingAttack | null> {
  const { data: row } = await supabase
    .from('pending_attacks')
    .select('*')
    .eq('id', attackId)
    .single();
  if (!row) return null;
  const atk = row as PendingAttack;

  if (!atk.damage_dice) return atk;
  if (atk.state === 'damage_rolled' || atk.state === 'applied' || atk.state === 'canceled') return atk;

  // v2.139.0 — Phase M pt 2: block damage while the DM has a pending LR
  // decision. The prompt modal either flips save_result to 'passed' (LR
  // used) or leaves it 'failed' (LR declined); either way it clears
  // pending_lr_decision and the damage roll can proceed.
  if (atk.pending_lr_decision) return atk;

  // attack_roll path: only damage on hit/crit; miss/fumble skip damage → state shifts to applied=0
  if (atk.attack_kind === 'attack_roll') {
    if (atk.hit_result === 'miss' || atk.hit_result === 'fumble') {
      const { data: updated } = await supabase
        .from('pending_attacks')
        .update({
          damage_final: 0,
          damage_raw: 0,
          state: 'damage_rolled',
        })
        .eq('id', attackId)
        .select()
        .single();
      return (updated as PendingAttack) ?? null;
    }
  }

  // Crit doubles dice count (modifier unchanged)
  const isCrit = atk.hit_result === 'crit';
  const diceExpr = isCrit ? doubleDice(atk.damage_dice) : atk.damage_dice;

  // v2.104.0 — Phase F: multi-target damage reuse. If this attack is in a
  // damage_group and a sibling already rolled, reuse those dice results so
  // every target in the AoE takes the same base damage (differentiated only
  // by save result). The first sibling to roll is canonical.
  let rolls: number[];
  let modifier: number;
  let total: number;
  let reusedFromGroup = false;

  if (atk.damage_group_id) {
    const { data: prior } = await supabase
      .from('pending_attacks')
      .select('damage_rolls, damage_raw')
      .eq('damage_group_id', atk.damage_group_id)
      .not('damage_rolls', 'is', null)
      .limit(1)
      .maybeSingle();
    if (prior && prior.damage_rolls && prior.damage_raw != null) {
      rolls = prior.damage_rolls as number[];
      total = prior.damage_raw as number;
      // Derive modifier from the dice expression (raw_total = sum(rolls) + mod)
      const sum = rolls.reduce((a, b) => a + b, 0);
      modifier = total - sum;
      reusedFromGroup = true;
    } else {
      const fresh = rollDiceExpr(diceExpr);
      rolls = fresh.rolls; modifier = fresh.modifier; total = fresh.total;
    }
  } else {
    const fresh = rollDiceExpr(diceExpr);
    rolls = fresh.rolls; modifier = fresh.modifier; total = fresh.total;
  }

  // v2.113.0 — Phase H pt 4: damage riders from attacker buffs (Hunter's
  // Mark +1d6, Hex +1d6 necrotic, etc.). Target-scoped buffs only fire when
  // attacking the marked creature. Per 2024 PHB weapon-damage-dice rules,
  // these DO double on a crit — we double the rider dice expression to match
  // the base weapon crit treatment. On a miss or save-for-none the riders
  // don't fire at all.
  let rolledDamageRiders: Array<{
    buff: ActiveBuff; dice: string; rolls: number[]; total: number; damageType: string;
  }> = [];
  let riderTotal = 0;
  const riderEligible =
    (atk.attack_kind === 'attack_roll' && (atk.hit_result === 'hit' || atk.hit_result === 'crit'))
    || (atk.attack_kind === 'save' && atk.save_result !== 'passed')
    || (atk.attack_kind === 'save' && atk.save_result === 'passed' && atk.save_success_effect === 'half');

  if (riderEligible && atk.attacker_participant_id) {
    const { data: aRow } = await supabase
      .from('combat_participants')
      .select('active_buffs')
      .eq('id', atk.attacker_participant_id)
      .maybeSingle();
    const attackerBuffs = ((aRow?.active_buffs as ActiveBuff[] | null) ?? []);
    const isMeleeDmg = (atk.attack_source ?? '').toLowerCase() !== 'ranged';
    const riders = getDamageRiders(attackerBuffs, {
      targetParticipantId: atk.target_participant_id ?? null,
      isMelee: isMeleeDmg,
    });
    for (const rider of riders) {
      // Crit doubles the dice — Hunter's Mark/Hex weapon-damage-dice per RAW
      const diceToRoll = isCrit ? doubleDice(rider.dice) : rider.dice;
      const r = rollBuffDice(diceToRoll);
      rolledDamageRiders.push({
        buff: rider.buff,
        dice: diceToRoll,
        rolls: r.rolls,
        total: r.total,
        damageType: rider.buff.damageRider?.damageType ?? 'untyped',
      });
      riderTotal += r.total;
    }
    // Halve riders too if save for half
    if (atk.attack_kind === 'save' && atk.save_result === 'passed' && atk.save_success_effect === 'half') {
      riderTotal = Math.floor(riderTotal / 2);
    }
  }

  let finalDamage = total;

  // Save-based: failed save = full damage; passed save = half or none
  if (atk.attack_kind === 'save' && atk.save_result === 'passed') {
    if (atk.save_success_effect === 'half') finalDamage = Math.floor(total / 2);
    else finalDamage = 0;
  }

  // Riders add on top after save-reduction logic above (save-for-half
  // already halves the rider total to match).
  finalDamage = finalDamage + riderTotal;

  const { data: updated } = await supabase
    .from('pending_attacks')
    .update({
      damage_rolls: rolls,
      damage_raw: total,
      damage_final: finalDamage,
      state: 'damage_rolled',
    })
    .eq('id', attackId)
    .select()
    .single();

  await emitCombatEvent({
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
    chainId: atk.chain_id,
    sequence: 2,
    actorType: atk.attacker_type === 'system' ? 'system' : atk.attacker_type === 'character' ? 'player' : 'monster',
    actorName: atk.attacker_name,
    targetType: atk.target_type,
    targetName: atk.target_name,
    eventType: 'damage_rolled',
    payload: {
      action_name: atk.attack_name,
      dice_expression: diceExpr,
      individual_results: rolls,
      modifier,
      total: finalDamage,
      raw_total: total,
      damage_type: atk.damage_type,
      crit: isCrit,
      shared_from_group: reusedFromGroup,
      // v2.113.0 — Phase H pt 4 damage riders
      damage_riders: rolledDamageRiders.map(r => ({
        key: r.buff.key,
        name: r.buff.name,
        dice: r.dice,
        rolls: r.rolls,
        total: r.total,
        damage_type: r.damageType,
      })),
      rider_total: riderTotal,
    },
  });

  // v2.113.0 — Phase H pt 4: per-rider buff_contributed event so the log
  // shows "Hunter's Mark added 4 piercing damage" alongside the main hit.
  for (const r of rolledDamageRiders) {
    await emitCombatEvent({
      campaignId: atk.campaign_id,
      encounterId: atk.encounter_id,
      chainId: atk.chain_id,
      sequence: 3,
      actorType: 'system',
      actorName: r.buff.name,
      targetType: atk.target_type,
      targetName: atk.target_name,
      eventType: 'buff_contributed',
      payload: {
        key: r.buff.key,
        source: r.buff.source,
        applies_to: 'damage_rider',
        dice: r.dice,
        rolls: r.rolls,
        total: r.total,
        damage_type: r.damageType,
        crit_doubled: isCrit,
      },
    });
  }

  // v2.114.0 — Phase H pt 5: consume single-use riders (e.g., Absorb
  // Elements rider — +1d6 on next melee attack only). Must come after the
  // contribution events so the log still shows the rider's final hurrah.
  if (atk.attacker_participant_id) {
    const singleUseKeys = rolledDamageRiders
      .filter(r => r.buff.singleUse)
      .map(r => r.buff.key);
    for (const key of singleUseKeys) {
      await removeBuff({
        participantId: atk.attacker_participant_id,
        key,
        reason: 'consumed',
        campaignId: atk.campaign_id,
        encounterId: atk.encounter_id,
      });
    }
  }

  // v2.99.0 — Phase E: offer post-damage reactions (Uncanny Dodge, Absorb
  // Elements) once damage is rolled but not yet applied. These can halve the
  // final damage before it hits HP.
  if (updated) {
    await offerReactionsFor(updated as PendingAttack, 'post_damage_roll');
  }

  return (updated as PendingAttack) ?? null;
}

// ─── Apply damage ────────────────────────────────────────────────
export async function applyDamage(attackId: string): Promise<PendingAttack | null> {
  const { data: row } = await supabase
    .from('pending_attacks')
    .select('*')
    .eq('id', attackId)
    .single();
  if (!row) return null;
  const atk = row as PendingAttack;

  if (atk.state !== 'damage_rolled') return atk;

  // If no target participant (e.g., target was free-text) we still mark applied
  if (atk.target_participant_id && atk.damage_final != null && atk.damage_final > 0) {
    const { data: tgt } = await supabase
      .from('combat_participants')
      .select('id, current_hp, max_hp, temp_hp, name, is_dead, is_stable, death_save_successes, death_save_failures, campaign_id, participant_type, hidden_from_players, concentration_spell_id, active_conditions')
      .eq('id', atk.target_participant_id)
      .single();

    if (tgt) {
      // v2.111.0 — Phase H pt 2: Petrified (and any future condition flagged
      // resistanceAll) halves damage taken. Emits a resistance_applied event
      // before the damage settles so the log shows WHY the number shrank.
      const targetConditions = (tgt.active_conditions ?? []) as string[];
      const resistAll = conditionsResistAll(targetConditions);
      let dmg = atk.damage_final;
      if (resistAll && dmg > 0) {
        const halved = Math.floor(dmg / 2);
        await emitCombatEvent({
          campaignId: atk.campaign_id,
          encounterId: atk.encounter_id,
          chainId: atk.chain_id,
          sequence: 5,
          actorType: 'system',
          actorName: 'System',
          targetType: 'character',
          targetName: tgt.name,
          eventType: 'resistance_applied',
          payload: {
            source: 'condition',
            conditions: targetConditions.filter(c => CONDITION_MAP[c]?.resistanceAll),
            original_damage: dmg,
            reduced_damage: halved,
          },
        });
        dmg = halved;
        // Persist the reduced damage_final so the applied event below reads
        // the right number and future reads of this row are consistent.
        await supabase
          .from('pending_attacks')
          .update({ damage_final: dmg })
          .eq('id', attackId);
      }

      const tempBefore = tgt.temp_hp ?? 0;
      const tempAfter = Math.max(0, tempBefore - dmg);
      const dmgThroughTemp = tempBefore - tempAfter;
      const dmgToHP = dmg - dmgThroughTemp;
      const hpBefore = tgt.current_hp ?? 0;
      let hpAfter = Math.max(0, hpBefore - dmgToHP);

      // v2.162.0 — Phase Q.0 pt 3: massive damage instant death (PHB
      // 2014 + 2024 RAW). When damage reduces a character to 0 HP AND
      // the remaining damage equals or exceeds their HP maximum, they
      // die outright — no death saves. Example: 30 max HP at 5 HP
      // takes 40 damage → 5 absorbs to 0, remaining 35 ≥ 30 max →
      // instant death.
      //
      // Order of checks matters: massive damage applies BEFORE the
      // existing "damage at 0 HP = failed save" branch, because a
      // creature that gets dropped this turn shouldn't also accrue a
      // death save failure from the same hit.
      let isDead = tgt.is_dead;
      let deathFailures = tgt.death_save_failures ?? 0;
      let isStable = tgt.is_stable;

      const wentDownThisHit = hpBefore > 0 && hpAfter === 0;
      const damageOverflow = wentDownThisHit ? Math.max(0, dmgToHP - hpBefore) : 0;
      const massiveDamageDeath =
        wentDownThisHit && damageOverflow >= (tgt.max_hp ?? 0);

      if (massiveDamageDeath) {
        isDead = true;
        deathFailures = 3;
        await emitCombatEvent({
          campaignId: atk.campaign_id,
          encounterId: atk.encounter_id,
          chainId: atk.chain_id,
          sequence: 4,
          actorType: 'system',
          actorName: 'System',
          targetType: tgt.participant_type === 'monster' ? 'monster' : 'character',
          targetName: tgt.name,
          eventType: 'massive_damage_death',
          payload: {
            hp_before: hpBefore,
            damage_to_hp: dmgToHP,
            overflow: damageOverflow,
            max_hp: tgt.max_hp,
          },
        });
      }

      if (hpBefore === 0 && !isDead) {
        // Damage at 0 HP = 1 failure (2 on a melee crit per RAW)
        const isCrit = atk.hit_result === 'crit';
        deathFailures = Math.min(3, deathFailures + (isCrit ? 2 : 1));
        if (deathFailures >= 3) isDead = true;

        await emitCombatEvent({
          campaignId: atk.campaign_id,
          encounterId: atk.encounter_id,
          chainId: atk.chain_id,
          sequence: 4,
          actorType: 'system',
          actorName: 'System',
          targetType: 'character',
          targetName: tgt.name,
          eventType: 'damage_at_0_hp_failure_added',
          payload: { failures: deathFailures, crit: isCrit },
        });

        if (isDead) {
          await emitCombatEvent({
            campaignId: atk.campaign_id,
            encounterId: atk.encounter_id,
            chainId: atk.chain_id,
            sequence: 5,
            actorType: 'system',
            actorName: 'System',
            targetType: 'character',
            targetName: tgt.name,
            eventType: 'died',
            payload: {},
          });
        }
      } else if (hpAfter === 0 && hpBefore > 0) {
        // Dropped to 0 — massive damage instant death check
        const maxHp = tgt.max_hp ?? 0;
        if (dmgToHP - hpBefore >= maxHp) {
          isDead = true;
          hpAfter = 0;
          await emitCombatEvent({
            campaignId: atk.campaign_id,
            encounterId: atk.encounter_id,
            chainId: atk.chain_id,
            sequence: 4,
            actorType: 'system',
            actorName: 'System',
            targetType: 'character',
            targetName: tgt.name,
            eventType: 'died',
            payload: { massive_damage: true, damage: dmgToHP, max_hp: maxHp },
          });
        } else {
          await emitCombatEvent({
            campaignId: atk.campaign_id,
            encounterId: atk.encounter_id,
            chainId: atk.chain_id,
            sequence: 4,
            actorType: 'system',
            actorName: 'System',
            targetType: 'character',
            targetName: tgt.name,
            eventType: 'dropped_to_0_hp',
            payload: { damage: dmgToHP },
          });
        }
      }

      // Any damage taken while unstable removes Stable — RAW
      if (dmg > 0 && isStable) isStable = false;

      await supabase
        .from('combat_participants')
        .update({
          current_hp: hpAfter,
          temp_hp: tempAfter,
          is_dead: isDead,
          is_stable: isStable,
          death_save_failures: deathFailures,
        })
        .eq('id', tgt.id);

      // v2.116.0 — Phase H pt 7: death-tied cleanup.
      // When a participant dies:
      //   1. Their concentration drops → remove conditions/buffs they placed
      //      on OTHERS via spells (Hold Person's Paralyzed wears off, Bless
      //      bonus vanishes, Hunter's Mark rider cleared, etc.)
      //   2. Their own active_buffs clear (they don't benefit while dead)
      //   3. active_conditions stays — a dead body can still be Prone/etc.
      //      for description purposes, though it's moot mechanically
      if (isDead && !tgt.is_dead) {
        const { data: deadRow } = await supabase
          .from('combat_participants')
          .select('concentration_spell_id, entity_id, participant_type')
          .eq('id', tgt.id)
          .maybeSingle();

        // Drop concentration on character's DB row
        if (deadRow?.participant_type === 'character' && deadRow.entity_id) {
          await supabase
            .from('characters')
            .update({ concentration_spell: null, concentration_rounds_remaining: null })
            .eq('id', deadRow.entity_id);
        }

        // Clear own buffs + concentration pointer on the participant
        await supabase
          .from('combat_participants')
          .update({
            active_buffs: [],
            concentration_spell_id: null,
          })
          .eq('id', tgt.id);

        // Walk the campaign for anything this caster had placed via
        // concentration. We don't know the spell name (concentration_spell
        // on characters was just cleared), so we do broad cleanup: remove
        // any condition or buff on any participant where casterParticipantId
        // equals this one.
        const { data: allRows } = await supabase
          .from('combat_participants')
          .select('id, active_conditions, condition_sources, active_buffs, encounter_id')
          .eq('encounter_id', atk.encounter_id);
        for (const row of (allRows ?? [])) {
          const sources = ((row.condition_sources ?? {}) as Record<string, any>);
          const condsToRemove: string[] = [];
          for (const [cond, meta] of Object.entries(sources)) {
            if (meta?.casterParticipantId === tgt.id) condsToRemove.push(cond);
          }
          for (const c of condsToRemove) {
            const { removeCondition: rc } = await import('./conditions');
            await rc({
              participantId: row.id as string,
              conditionName: c,
              campaignId: atk.campaign_id,
              encounterId: row.encounter_id as string | null,
            });
          }
          const buffs = ((row.active_buffs ?? []) as ActiveBuff[]);
          const buffsToRemove = buffs
            .filter(b => b.casterParticipantId === tgt.id)
            .map(b => b.key);
          for (const k of buffsToRemove) {
            await removeBuff({
              participantId: row.id as string,
              key: k,
              reason: 'caster_died',
              campaignId: atk.campaign_id,
              encounterId: row.encounter_id as string | null,
            });
          }
        }

        await emitCombatEvent({
          campaignId: atk.campaign_id,
          encounterId: atk.encounter_id,
          chainId: atk.chain_id,
          sequence: 6,
          actorType: 'system',
          actorName: 'System',
          targetType: (deadRow?.participant_type ?? 'character') as any,
          targetName: tgt.name,
          eventType: 'participant_died',
          payload: {
            cleanup: 'buffs_and_concentration_dropped',
          },
        });
      }

      // v2.99.0 — Phase E: concentration save on damage.
      // Only characters maintain concentration. Target must be a character
      // who's currently concentrating, and damage must exceed 0. DC per RAW.
      if (dmg > 0 && tgt.participant_type === 'character' && !isDead) {
        await runConcentrationSave({
          campaignId: atk.campaign_id,
          encounterId: atk.encounter_id,
          chainId: atk.chain_id,
          participantId: tgt.id,
          targetName: tgt.name,
          damage: dmg,
        });
      }
    }
  }

  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from('pending_attacks')
    .update({ state: 'applied', applied_at: now })
    .eq('id', attackId)
    .select()
    .single();

  await emitCombatEvent({
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
    chainId: atk.chain_id,
    sequence: 3,
    actorType: atk.attacker_type === 'system' ? 'system' : atk.attacker_type === 'character' ? 'player' : 'monster',
    actorName: atk.attacker_name,
    targetType: atk.target_type,
    targetName: atk.target_name,
    eventType: 'damage_applied',
    payload: {
      action_name: atk.attack_name,
      total: atk.damage_final,
      damage_type: atk.damage_type,
    },
  });

  return (updated as PendingAttack) ?? null;
}

// ─── Cancel ──────────────────────────────────────────────────────
export async function cancelAttack(attackId: string): Promise<void> {
  await supabase
    .from('pending_attacks')
    .update({ state: 'canceled' })
    .eq('id', attackId);
}

// ─── Fudge damage ────────────────────────────────────────────────
// DM override of damage_final while still in damage_rolled state. Emits a
// hidden dm_fudge event recording the original → new delta so the campaign log
// is truthful to the DM but the player only sees the adjusted number.
export async function fudgeDamage(
  attackId: string,
  newDamage: number,
  reason?: string
): Promise<void> {
  const { data: row } = await supabase
    .from('pending_attacks')
    .select('*')
    .eq('id', attackId)
    .single();
  if (!row) return;
  const atk = row as PendingAttack;

  if (atk.state !== 'damage_rolled') return;
  const original = atk.damage_final ?? 0;
  if (original === newDamage) return;

  await supabase
    .from('pending_attacks')
    .update({
      damage_final: newDamage,
      damage_was_fudged: true,
      damage_fudge_reason: reason ?? null,
    })
    .eq('id', attackId);

  await emitCombatEvent({
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
    chainId: atk.chain_id,
    sequence: 99,
    actorType: 'dm',
    actorName: 'DM',
    targetType: atk.target_type,
    targetName: atk.target_name,
    eventType: 'dm_fudge',
    payload: {
      attack_id: attackId,
      attack_name: atk.attack_name,
      original_damage: original,
      new_damage: newDamage,
      delta: newDamage - original,
      reason: reason ?? null,
    },
    visibility: 'hidden_from_players',
  });
}

// ─── Active pending attack for campaign ─────────────────────────
export async function getActivePendingAttack(campaignId: string): Promise<PendingAttack | null> {
  const { data } = await supabase
    .from('pending_attacks')
    .select('*')
    .eq('campaign_id', campaignId)
    .in('state', ['declared', 'attack_rolled', 'damage_rolled'])
    .order('declared_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PendingAttack) ?? null;
}

// ─── Save bonus lookup for target ────────────────────────────────
// v2.102.0 — Phase F pt 3a: resolve the target's save bonus for a given
// ability. For character targets: ability modifier + proficiency (if save
// proficient). For monster/npc targets: 0 by default — DM overrides manually.
export async function getTargetSaveBonus(
  participantId: string,
  ability: string,   // 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'
): Promise<{ bonus: number; breakdown: string }> {
  const { data: part } = await supabase
    .from('combat_participants')
    .select('participant_type, entity_id')
    .eq('id', participantId)
    .single();
  if (!part) return { bonus: 0, breakdown: '0 (no participant)' };

  if (part.participant_type !== 'character') {
    return { bonus: 0, breakdown: 'manual entry (monster/npc)' };
  }

  const { data: c } = await supabase
    .from('characters')
    .select('level, constitution, strength, dexterity, intelligence, wisdom, charisma, saving_throw_proficiencies')
    .eq('id', part.entity_id)
    .single();
  if (!c) return { bonus: 0, breakdown: '0 (no character)' };

  const abilityMap: Record<string, number> = {
    STR: (c as any).strength ?? 10,
    DEX: (c as any).dexterity ?? 10,
    CON: (c as any).constitution ?? 10,
    INT: (c as any).intelligence ?? 10,
    WIS: (c as any).wisdom ?? 10,
    CHA: (c as any).charisma ?? 10,
  };
  const abiFull: Record<string, string> = {
    STR: 'strength', DEX: 'dexterity', CON: 'constitution',
    INT: 'intelligence', WIS: 'wisdom', CHA: 'charisma',
  };

  const score = abilityMap[ability] ?? 10;
  const mod = abilityModifier(score);
  const profs: string[] = ((c as any).saving_throw_proficiencies ?? []) as string[];
  const full = abiFull[ability];
  const hasProf = profs.some(p => p.toLowerCase() === ability.toLowerCase() || p.toLowerCase() === full);
  const pb = proficiencyBonus((c as any).level ?? 1);
  const bonus = mod + (hasProf ? pb : 0);
  const breakdown = hasProf
    ? `${mod >= 0 ? '+' : ''}${mod} (${ability}) + ${pb} (prof) = ${bonus >= 0 ? '+' : ''}${bonus}`
    : `${mod >= 0 ? '+' : ''}${mod} (${ability}) = ${bonus >= 0 ? '+' : ''}${bonus}`;
  return { bonus, breakdown };
}

// ─── Concentration save on damage ────────────────────────────────
// 2024 PHB: when a concentrating caster takes damage, they must succeed on a
// CON save (DC = max(10, floor(damage/2))) or lose concentration. Auto-rolled
// per Phase I 'Concentration save on damage' automation (default ON).
//
// Rider: War Caster feat gives advantage — we treat that as a passthrough for
// now and revisit in Phase H when the buff pipeline lands.
export interface ConcentrationSaveContext {
  campaignId: string;
  encounterId: string | null;
  chainId: string;
  participantId: string;       // combat_participants row
  targetName: string;
  damage: number;
}

export async function runConcentrationSave(ctx: ConcentrationSaveContext): Promise<void> {
  // Resolve participant → character
  const { data: part } = await supabase
    .from('combat_participants')
    .select('entity_id, participant_type')
    .eq('id', ctx.participantId)
    .single();
  if (!part || part.participant_type !== 'character') return;

  const { data: charRow } = await supabase
    .from('characters')
    .select('id, concentration_spell, constitution, level, saving_throw_proficiencies, automation_overrides, advanced_automations_unlocked')
    .eq('id', part.entity_id)
    .single();
  if (!charRow) return;

  const concentrationSpell: string | null = (charRow as any).concentration_spell ?? null;
  if (!concentrationSpell) return;   // not concentrating — nothing to save

  // v2.117.0 — Phase I: resolve the 'concentration_on_damage' automation
  // via the three-tier system (character override if unlocked → campaign
  // default → registry default). Off skips the save entirely; Auto runs the
  // current logic; Prompt currently falls through to Auto — the full
  // pending_concentration_saves table + modal lands in v2.119.
  const { data: campaignRow } = await supabase
    .from('campaigns')
    .select('automation_defaults')
    .eq('id', ctx.campaignId)
    .maybeSingle();
  const automationSetting = resolveAutomation(
    'concentration_on_damage',
    charRow as any,
    campaignRow as any,
  );

  if (automationSetting === 'off') {
    // Skipped — log it so the player/DM can see why concentration survived.
    await emitCombatEvent({
      campaignId: ctx.campaignId,
      encounterId: ctx.encounterId,
      chainId: ctx.chainId,
      sequence: 60,
      actorType: 'system',
      actorName: 'System',
      targetType: 'self',
      targetName: ctx.targetName,
      eventType: 'automation_skipped',
      payload: {
        automation: 'concentration_on_damage',
        reason: 'resolver_returned_off',
        spell: concentrationSpell,
        damage: ctx.damage,
      },
    });
    return;
  }

  // v2.118.0 — Phase I pt 2: compute save mechanics once, used by both paths.
  const con = (charRow as any).constitution ?? 10;
  const lvl = (charRow as any).level ?? 1;
  const profs: string[] = ((charRow as any).saving_throw_proficiencies ?? []) as string[];
  const hasConProf = profs.some(p => p.toLowerCase() === 'con' || p.toLowerCase() === 'constitution');

  const conMod = abilityModifier(con);
  const pb = proficiencyBonus(lvl);
  const bonus = conMod + (hasConProf ? pb : 0);
  const dc = Math.max(10, Math.floor(ctx.damage / 2));

  // 'prompt' branch: insert a pending_concentration_saves row and return.
  // The player's modal subscribes via realtime, shows the damage/DC/spell,
  // and on click calls resolvePendingConcentrationSave which reuses the
  // same roll-and-drop logic as the auto path.
  if (automationSetting === 'prompt') {
    const PROMPT_TIMEOUT_SECONDS = 120;
    const offeredAt = new Date();
    const expiresAt = new Date(offeredAt.getTime() + PROMPT_TIMEOUT_SECONDS * 1000);
    await supabase
      .from('pending_concentration_saves')
      .insert({
        campaign_id: ctx.campaignId,
        encounter_id: ctx.encounterId,
        chain_id: ctx.chainId,
        participant_id: ctx.participantId,
        character_id: (charRow as any).id,
        spell_name: concentrationSpell,
        damage: ctx.damage,
        dc,
        con_bonus: bonus,
        has_con_prof: hasConProf,
        state: 'offered',
        offered_at: offeredAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    await emitCombatEvent({
      campaignId: ctx.campaignId,
      encounterId: ctx.encounterId,
      chainId: ctx.chainId,
      sequence: 60,
      actorType: 'system',
      actorName: 'System',
      targetType: 'self',
      targetName: ctx.targetName,
      eventType: 'concentration_save_prompted',
      payload: {
        spell: concentrationSpell,
        dc,
        damage: ctx.damage,
        expires_in_seconds: PROMPT_TIMEOUT_SECONDS,
        automation_setting: 'prompt',
      },
    });
    return;
  }

  // 'auto' branch: roll and resolve inline.
  await performConcentrationSave({
    ctx,
    charId: (charRow as any).id,
    concentrationSpell,
    dc,
    bonus,
    resolutionSource: 'player',   // 'auto' is effectively the player accepting by default
    automationSetting,
  });
}

// ─── Shared concentration save resolver ──────────────────────────
// v2.118.0 — Phase I pt 2: extracted from runConcentrationSave so that both
// the 'auto' automation branch and the prompt-resolution path (called when
// the player clicks "Roll Save" in the modal, or on 120s timeout) share one
// implementation. Rolls the d20, emits save_rolled, and on failure drops
// concentration + cleans up spell-sourced conditions and buffs.

export interface PerformConcentrationSaveInput {
  ctx: ConcentrationSaveContext;
  charId: string;
  concentrationSpell: string;
  dc: number;
  bonus: number;
  resolutionSource: 'player' | 'timeout';
  automationSetting: string;
}

export async function performConcentrationSave(
  input: PerformConcentrationSaveInput,
): Promise<{ saved: boolean; d20: number; total: number }> {
  const { ctx, charId, concentrationSpell, dc, bonus } = input;

  const d20 = Math.floor(Math.random() * 20) + 1;
  const total = d20 + bonus;
  const passed = total >= dc || d20 === 20;   // nat 20 always succeeds (RAW)
  const autoFail = d20 === 1;                 // nat 1 always fails (RAW)
  const saved = autoFail ? false : passed;

  await emitCombatEvent({
    campaignId: ctx.campaignId,
    encounterId: ctx.encounterId,
    chainId: ctx.chainId,
    sequence: 60,
    actorType: 'player',
    actorName: ctx.targetName,
    targetType: 'self',
    targetName: ctx.targetName,
    eventType: 'save_rolled',
    payload: {
      save_type: 'concentration',
      ability: 'CON',
      dc,
      d20,
      bonus,
      total,
      result: saved ? 'passed' : 'failed',
      trigger: 'damage',
      damage: ctx.damage,
      concentration_spell: concentrationSpell,
      automation_setting: input.automationSetting,
      resolution_source: input.resolutionSource,
    },
  });

  if (!saved) {
    await supabase
      .from('characters')
      .update({ concentration_spell: null, concentration_rounds_remaining: null })
      .eq('id', charId);

    await supabase
      .from('combat_participants')
      .update({ concentration_spell_id: null })
      .eq('id', ctx.participantId);

    await emitCombatEvent({
      campaignId: ctx.campaignId,
      encounterId: ctx.encounterId,
      chainId: ctx.chainId,
      sequence: 61,
      actorType: 'system',
      actorName: 'System',
      targetType: 'self',
      targetName: ctx.targetName,
      eventType: 'concentration_broken',
      payload: {
        spell: concentrationSpell,
        reason: 'failed_save',
        dc,
        total,
      },
    });

    await clearConditionsFromConcentration(
      ctx.campaignId,
      ctx.encounterId,
      ctx.participantId,
      concentrationSpell,
    );
    await clearBuffsFromConcentration(
      ctx.campaignId,
      ctx.encounterId,
      ctx.participantId,
      concentrationSpell,
    );
  }

  return { saved, d20, total };
}

// ─── Resolve a pending prompt row ────────────────────────────────
// Called from ConcentrationSavePromptModal on player action or timeout.

export async function resolvePendingConcentrationSave(
  pendingId: string,
  resolutionSource: 'player' | 'timeout',
): Promise<void> {
  const { data: row } = await supabase
    .from('pending_concentration_saves')
    .select('*')
    .eq('id', pendingId)
    .single();
  if (!row || row.state !== 'offered') return;

  const ctx: ConcentrationSaveContext = {
    campaignId: row.campaign_id as string,
    encounterId: row.encounter_id as string | null,
    chainId: row.chain_id as string,
    participantId: row.participant_id as string,
    targetName: '',            // filled from participants below for event payload
    damage: row.damage as number,
  };

  const { data: part } = await supabase
    .from('combat_participants')
    .select('name')
    .eq('id', ctx.participantId)
    .maybeSingle();
  ctx.targetName = (part?.name as string | null) ?? 'Unknown';

  const { saved, d20, total } = await performConcentrationSave({
    ctx,
    charId: row.character_id as string,
    concentrationSpell: row.spell_name as string,
    dc: row.dc as number,
    bonus: row.con_bonus as number,
    resolutionSource,
    automationSetting: 'prompt',
  });

  await supabase
    .from('pending_concentration_saves')
    .update({
      state: resolutionSource === 'timeout' ? 'expired' : 'resolved',
      decided_at: new Date().toISOString(),
      d20, total,
      result: saved ? 'passed' : 'failed',
      resolution_source: resolutionSource,
    })
    .eq('id', pendingId);
}
