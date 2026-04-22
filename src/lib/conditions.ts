// v2.110.0 — Phase H of the Combat Backbone
//
// Condition application + removal with automatic cascades, plus the
// advantage/disadvantage state machine consumed by rollAttackRoll.
//
// Architectural split:
//   - conditions.ts (this file): state mutations + read helpers. No attack
//     or damage logic — stays pipeline-agnostic so pendingAttack.ts, the
//     movement lib, and future buff pipeline can all consume it.
//   - CONDITION_MAP in src/data/conditions.ts: static data about each 2024
//     PHB condition (attackDisadvantage, critWithin5ft, etc.)
//
// Cascade rules per 2024 PHB:
//   - Unconscious ⇒ also apply Prone + Incapacitated
//   - Paralyzed   ⇒ also apply Incapacitated
//   - Stunned     ⇒ also apply Incapacitated
//   - Petrified   ⇒ also apply Incapacitated
//   - Removing the parent removes cascaded children iff their source is
//     tagged 'cascade:{parent}'.

import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';
import { CONDITION_MAP } from '../data/conditions';

export interface ApplyConditionInput {
  participantId: string;
  conditionName: string;            // e.g. 'Prone', 'Restrained'
  source?: string;                  // e.g. 'spell:hold_person', 'cascade:Unconscious'
  casterParticipantId?: string;     // who inflicted it (for concentration tracking)
  campaignId?: string;
  encounterId?: string | null;
  emitEvent?: boolean;              // default true
}

const CASCADE: Record<string, string[]> = {
  Unconscious: ['Prone', 'Incapacitated'],
  Paralyzed:   ['Incapacitated'],
  Stunned:     ['Incapacitated'],
  Petrified:   ['Incapacitated'],
};

export async function applyCondition(input: ApplyConditionInput): Promise<void> {
  if (!CONDITION_MAP[input.conditionName]) return;

  // v2.116.0 — Phase H pt 7: Exhaustion has a level; route through the
  // dedicated adjuster. Each applyCondition('Exhaustion') call bumps the
  // level by 1 (cap 6 = death).
  if (input.conditionName === 'Exhaustion') {
    await adjustExhaustion({
      participantId: input.participantId,
      delta: 1,
      campaignId: input.campaignId,
      encounterId: input.encounterId,
      emitEvent: input.emitEvent,
    });
    return;
  }

  const { data: part } = await supabase
    .from('combat_participants')
    .select('active_conditions, condition_sources, name, participant_type, campaign_id, encounter_id')
    .eq('id', input.participantId)
    .single();
  if (!part) return;

  const existing: string[] = (part.active_conditions ?? []) as string[];
  const sources = { ...((part.condition_sources ?? {}) as Record<string, any>) };

  const toApply = new Set<string>();
  toApply.add(input.conditionName);

  // Walk cascade tree (depth 1 — no deep recursion; PHB cascades never chain)
  const cascaded = CASCADE[input.conditionName] ?? [];

  // v2.119.0 — Phase I: respect the 'condition_cascade_auto' automation.
  // When resolved to 'off', only the named condition is applied — cascades
  // are left to the DM to manage manually. Per-character override supported
  // for character participants (via automation_overrides on characters).
  if (cascaded.length > 0) {
    let charAutoRow: any = null;
    if (part.participant_type === 'character') {
      const { data: entity } = await supabase
        .from('combat_participants')
        .select('entity_id')
        .eq('id', input.participantId)
        .maybeSingle();
      if (entity?.entity_id) {
        const { data: ch } = await supabase
          .from('characters')
          .select('automation_overrides, advanced_automations_unlocked')
          .eq('id', entity.entity_id as string)
          .maybeSingle();
        charAutoRow = ch;
      }
    }
    const { data: campRow } = await supabase
      .from('campaigns')
      .select('automation_defaults')
      .eq('id', part.campaign_id as string)
      .maybeSingle();
    const { resolveAutomation } = await import('./automations');
    const cascadeSetting = resolveAutomation(
      'condition_cascade_auto',
      charAutoRow,
      campRow as any,
    );
    if (cascadeSetting !== 'off') {
      for (const c of cascaded) toApply.add(c);
    }
  }

  const nextConditions = [...existing];
  let actuallyApplied: string[] = [];
  for (const c of toApply) {
    if (!nextConditions.includes(c)) {
      nextConditions.push(c);
      actuallyApplied.push(c);
      // Cascaded conditions get a synthetic source so removal can clean them
      const isCascade = c !== input.conditionName;
      sources[c] = {
        source: isCascade
          ? `cascade:${input.conditionName}`
          : (input.source ?? 'manual'),
        ...(input.casterParticipantId && !isCascade
          ? { casterParticipantId: input.casterParticipantId }
          : {}),
      };
    }
  }

  if (actuallyApplied.length === 0) return;

  await supabase
    .from('combat_participants')
    .update({
      active_conditions: nextConditions,
      condition_sources: sources,
    })
    .eq('id', input.participantId);

  if (input.emitEvent !== false) {
    const chainId = newChainId();
    await emitCombatEvent({
      campaignId: input.campaignId ?? (part.campaign_id as string),
      encounterId: input.encounterId ?? (part.encounter_id as string | null),
      chainId,
      sequence: 0,
      actorType: 'system',
      actorName: 'System',
      targetType: part.participant_type as any,
      targetName: part.name as string,
      eventType: 'condition_applied',
      payload: {
        condition: input.conditionName,
        cascaded: actuallyApplied.filter(c => c !== input.conditionName),
        source: input.source ?? 'manual',
      },
    });
  }
}

export interface RemoveConditionInput {
  participantId: string;
  conditionName: string;
  campaignId?: string;
  encounterId?: string | null;
  emitEvent?: boolean;
}

export async function removeCondition(input: RemoveConditionInput): Promise<void> {
  // v2.116.0 — Phase H pt 7: removing Exhaustion clears the level entirely
  // (represents a long rest or Greater Restoration). Decrement-by-one is
  // handled via adjustExhaustion({delta:-1}) for callers that need it.
  if (input.conditionName === 'Exhaustion') {
    await adjustExhaustion({
      participantId: input.participantId,
      newLevel: 0,
      campaignId: input.campaignId,
      encounterId: input.encounterId,
      emitEvent: input.emitEvent,
    });
    return;
  }

  const { data: part } = await supabase
    .from('combat_participants')
    .select('active_conditions, condition_sources, name, participant_type, campaign_id, encounter_id')
    .eq('id', input.participantId)
    .single();
  if (!part) return;

  const existing: string[] = (part.active_conditions ?? []) as string[];
  if (!existing.includes(input.conditionName)) return;

  const sources = { ...((part.condition_sources ?? {}) as Record<string, any>) };

  // Remove the named condition and anything sourced as cascade:{name}
  const cascadeTag = `cascade:${input.conditionName}`;
  const toRemove = new Set<string>([input.conditionName]);
  for (const [cond, meta] of Object.entries(sources)) {
    if (meta?.source === cascadeTag) toRemove.add(cond);
  }

  const nextConditions = existing.filter(c => !toRemove.has(c));
  for (const c of toRemove) delete sources[c];

  await supabase
    .from('combat_participants')
    .update({
      active_conditions: nextConditions,
      condition_sources: sources,
    })
    .eq('id', input.participantId);

  if (input.emitEvent !== false) {
    const chainId = newChainId();
    await emitCombatEvent({
      campaignId: input.campaignId ?? (part.campaign_id as string),
      encounterId: input.encounterId ?? (part.encounter_id as string | null),
      chainId,
      sequence: 0,
      actorType: 'system',
      actorName: 'System',
      targetType: part.participant_type as any,
      targetName: part.name as string,
      eventType: 'condition_removed',
      payload: {
        condition: input.conditionName,
        cascaded_removed: [...toRemove].filter(c => c !== input.conditionName),
      },
    });
  }
}

export function hasCondition(activeConditions: string[] | null, name: string): boolean {
  if (!activeConditions) return false;
  return activeConditions.includes(name);
}

// ─── Save / damage / movement condition effects ──────────────────
// v2.111.0 — Phase H pt 2: thin readers consumed by pendingAttack and
// movement libs so they don't each re-import CONDITION_MAP.

const ABILITY_MAP: Record<string, string> = {
  STR: 'strength',  DEX: 'dexterity',  CON: 'constitution',
  INT: 'intelligence', WIS: 'wisdom', CHA: 'charisma',
};

/**
 * Does the target auto-fail saves of this ability because of a condition?
 * Paralyzed/Unconscious/Petrified/Stunned all set autoFailSaves = [STR, DEX].
 */
export function conditionsAutoFailSave(
  conditions: string[],
  abilityCode: string,   // 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'
): boolean {
  const full = ABILITY_MAP[abilityCode];
  if (!full) return false;
  for (const c of conditions) {
    const m = CONDITION_MAP[c];
    if (m?.autoFailSaves?.includes(full as any)) return true;
  }
  return false;
}

/**
 * Does the target have disadvantage on saves of this ability because of a
 * condition? Restrained sets savingThrowDisadvantage = [DEX].
 */
export function conditionsDisadvantageSave(
  conditions: string[],
  abilityCode: string,
): boolean {
  const full = ABILITY_MAP[abilityCode];
  if (!full) return false;
  for (const c of conditions) {
    const m = CONDITION_MAP[c];
    if (m?.savingThrowDisadvantage?.includes(full as any)) return true;
  }
  return false;
}

/**
 * Does the target have resistance to all damage because of a condition?
 * Petrified only, currently.
 */
export function conditionsResistAll(conditions: string[]): boolean {
  for (const c of conditions) {
    const m = CONDITION_MAP[c];
    if (m?.resistanceAll) return true;
  }
  return false;
}

/**
 * Is the target's speed zeroed by a condition?
 * Grappled / Restrained / Paralyzed / Stunned / Unconscious / Petrified.
 */
export function conditionsSpeedZero(conditions: string[]): boolean {
  for (const c of conditions) {
    const m = CONDITION_MAP[c];
    if (m?.speedZero) return true;
  }
  return false;
}

// ─── Concentration break cleanup ─────────────────────────────────
// v2.111.0 — Phase H pt 2: when a caster drops concentration, every condition
// they placed via that spell comes off automatically. We match on:
//   source === `spell:${spellName.toLowerCase()}` AND
//   casterParticipantId === the caster's participant id.
// Returns number of conditions removed across all targets.
export async function clearConditionsFromConcentration(
  campaignId: string,
  encounterId: string | null,
  casterParticipantId: string,
  spellName: string,
): Promise<number> {
  const needle = `spell:${spellName.toLowerCase()}`;

  // Pull all participants in the campaign/encounter and scan their
  // condition_sources for a match. Small numbers — direct read is fine.
  let query = supabase
    .from('combat_participants')
    .select('id, name, participant_type, active_conditions, condition_sources, encounter_id');
  if (encounterId) {
    query = query.eq('encounter_id', encounterId);
  } else {
    query = query.eq('campaign_id', campaignId);
  }
  const { data: rows } = await query;
  if (!rows) return 0;

  let removedCount = 0;
  for (const row of rows) {
    const sources = (row.condition_sources ?? {}) as Record<string, any>;
    const toRemove: string[] = [];
    for (const [cond, meta] of Object.entries(sources)) {
      if (
        meta?.source === needle
        && meta?.casterParticipantId === casterParticipantId
      ) {
        toRemove.push(cond);
      }
    }
    for (const cond of toRemove) {
      await removeCondition({
        participantId: row.id as string,
        conditionName: cond,
        campaignId,
        encounterId: row.encounter_id as string | null,
      });
      removedCount++;
    }
  }

  return removedCount;
}

// ─── Advantage / disadvantage resolution ──────────────────────────
// 2024 PHB: advantage and disadvantage don't stack — having both cancels to
// a normal roll. getAdvantageState surveys both participants' conditions and
// the physical distance (for attackAdvantageReceived-within-5ft cases like
// Prone) and returns the net state.

export type AdvantageState = 'advantage' | 'disadvantage' | 'normal';

export function getAdvantageState(
  attackerConditions: string[],
  targetConditions: string[],
  distanceCells: number,
): AdvantageState {
  let adv = false;
  let dis = false;

  // From the ATTACKER's conditions
  for (const c of attackerConditions) {
    const m = CONDITION_MAP[c];
    if (!m) continue;
    if (m.attackDisadvantage) dis = true;
  }
  // Invisible attacker: 2024 RAW grants advantage on attacks (not in CONDITION_MAP flag explicitly)
  if (attackerConditions.includes('Invisible')) adv = true;

  // From the TARGET's conditions
  for (const c of targetConditions) {
    const m = CONDITION_MAP[c];
    if (!m) continue;
    // Prone grants advantage to attackers within 5ft, disadvantage beyond 5ft
    // (the Prone entry sets attackAdvantageReceived=true — but RAW is
    // distance-conditional for Prone only)
    if (c === 'Prone') {
      if (distanceCells <= 1) adv = true;
      else dis = true;
      continue;
    }
    if (m.attackAdvantageReceived) adv = true;
  }
  // Invisible target: 2024 RAW grants disadvantage to attackers
  if (targetConditions.includes('Invisible')) dis = true;

  if (adv && dis) return 'normal';
  if (adv) return 'advantage';
  if (dis) return 'disadvantage';
  return 'normal';
}

/**
 * Whether a melee attack from within 5 ft (Chebyshev distance ≤ 1) against
 * the target auto-crits — Paralyzed or Unconscious per 2024 PHB.
 */
export function meleeAutoCritApplies(
  targetConditions: string[],
  distanceCells: number,
): boolean {
  if (distanceCells > 1) return false;
  for (const c of targetConditions) {
    const m = CONDITION_MAP[c];
    if (m?.critWithin5ft) return true;
  }
  return false;
}

// ─── Exhaustion (2024 PHB) ───────────────────────────────────────
// v2.116.0 — Phase H pt 7.
//
// Rules:
//   Level 1-5: -2 * level to d20 rolls + -5 ft * level to speed
//   Level 6:   death
//
// Design:
//   - combat_participants.exhaustion_level is the canonical level (0-6)
//   - 'Exhaustion' is ALSO kept in active_conditions so UI code uniformly
//     displays it alongside other conditions
//   - applyCondition('Exhaustion') bumps level by 1 (caps at 6)
//   - removeCondition('Exhaustion') clears level to 0 (represents a long
//     rest / Greater Restoration for the whole stack)

export interface ExhaustionPenalty {
  d20Penalty: number;     // negative number, e.g. -4 for level 2
  speedPenalty: number;   // negative number, e.g. -10 for level 2
  isDead: boolean;        // level 6 means death
  level: number;
}

export function getExhaustionPenalty(level: number | null | undefined): ExhaustionPenalty {
  const lvl = Math.max(0, Math.min(6, level ?? 0));
  return {
    d20Penalty: -2 * lvl,
    speedPenalty: -5 * lvl,
    isDead: lvl >= 6,
    level: lvl,
  };
}

/**
 * Increment the target's exhaustion level by 1. Auto-applies the 'Exhaustion'
 * condition name for UI, handles level-6 auto-death, emits events.
 * Can also be called with delta = -1 to reduce (long rest), or with a fixed
 * newLevel to set directly.
 */
export interface AdjustExhaustionInput {
  participantId: string;
  delta?: number;                       // +1 by default
  newLevel?: number;                    // if provided, overrides delta
  campaignId?: string;
  encounterId?: string | null;
  emitEvent?: boolean;
}

export async function adjustExhaustion(input: AdjustExhaustionInput): Promise<number> {
  const { data: part } = await supabase
    .from('combat_participants')
    .select('exhaustion_level, active_conditions, name, participant_type, campaign_id, encounter_id, is_dead')
    .eq('id', input.participantId)
    .single();
  if (!part) return 0;

  const current = (part.exhaustion_level as number | null) ?? 0;
  const delta = input.delta ?? 1;
  const next = input.newLevel != null
    ? Math.max(0, Math.min(6, input.newLevel))
    : Math.max(0, Math.min(6, current + delta));

  if (next === current) return current;

  const existingConds = ((part.active_conditions ?? []) as string[]);
  const nextConds = next === 0
    ? existingConds.filter(c => c !== 'Exhaustion')
    : (existingConds.includes('Exhaustion') ? existingConds : [...existingConds, 'Exhaustion']);

  // Level 6 = death per 2024 RAW
  const updates: Record<string, any> = {
    exhaustion_level: next,
    active_conditions: nextConds,
  };
  if (next >= 6 && !part.is_dead) {
    updates.is_dead = true;
    updates.current_hp = 0;
  }

  await supabase
    .from('combat_participants')
    .update(updates)
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
      eventType: 'exhaustion_adjusted',
      payload: {
        from_level: current,
        to_level: next,
        d20_penalty: -2 * next,
        speed_penalty: -5 * next,
        caused_death: next >= 6 && !part.is_dead,
      },
    });
  }

  return next;
}
