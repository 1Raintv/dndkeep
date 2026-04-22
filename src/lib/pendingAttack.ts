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

  const d20 = rollD20();
  const bonus = atk.attack_bonus ?? 0;
  const total = d20 + bonus;

  let hitResult: HitResult;
  if (d20 === 20) hitResult = 'crit';
  else if (d20 === 1) hitResult = 'fumble';
  else if (atk.target_ac != null && total >= atk.target_ac) hitResult = 'hit';
  else hitResult = 'miss';

  const { data: updated } = await supabase
    .from('pending_attacks')
    .update({
      attack_d20: d20,
      attack_total: total,
      hit_result: hitResult,
      state: 'attack_rolled',
    })
    .eq('id', attackId)
    .select()
    .single();

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
      individual_results: [d20],
      total,
      hit_result: hitResult,
      target_ac: atk.target_ac,
    },
  });

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

  const d20 = rollD20();
  const total = d20 + saveBonus;
  const dc = atk.save_dc ?? 10;

  let result: 'passed' | 'failed';
  if (d20 === 20) result = 'passed';
  else if (d20 === 1) result = 'failed';
  else result = total >= dc ? 'passed' : 'failed';

  const { data: updated } = await supabase
    .from('pending_attacks')
    .update({
      save_d20: d20,
      save_total: total,
      save_result: result,
    })
    .eq('id', attackId)
    .select()
    .single();

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
      bonus: saveBonus,
      total,
      result,
      trigger_attack_name: atk.attack_name,
      trigger_attacker: atk.attacker_name,
    },
  });

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
  const { rolls, modifier, total } = rollDiceExpr(diceExpr);
  let finalDamage = total;

  // Save-based: failed save = full damage; passed save = half or none
  if (atk.attack_kind === 'save' && atk.save_result === 'passed') {
    if (atk.save_success_effect === 'half') finalDamage = Math.floor(total / 2);
    else finalDamage = 0;
  }

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
    },
  });

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
      .select('id, current_hp, max_hp, temp_hp, name, is_dead, is_stable, death_save_successes, death_save_failures, campaign_id, participant_type, hidden_from_players, concentration_spell_id')
      .eq('id', atk.target_participant_id)
      .single();

    if (tgt) {
      const dmg = atk.damage_final;
      const tempBefore = tgt.temp_hp ?? 0;
      const tempAfter = Math.max(0, tempBefore - dmg);
      const dmgThroughTemp = tempBefore - tempAfter;
      const dmgToHP = dmg - dmgThroughTemp;
      const hpBefore = tgt.current_hp ?? 0;
      let hpAfter = Math.max(0, hpBefore - dmgToHP);

      // 2024: damage ≥ max_hp at 0 HP = instant death
      let isDead = tgt.is_dead;
      let deathFailures = tgt.death_save_failures ?? 0;
      let isStable = tgt.is_stable;

      if (hpBefore === 0 && !isDead) {
        // Damage at 0 HP = 1 failure (2 on a melee crit — we'll track crit separately later)
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
    .select('id, concentration_spell, constitution, level, saving_throw_proficiencies')
    .eq('id', part.entity_id)
    .single();
  if (!charRow) return;

  const concentrationSpell: string | null = (charRow as any).concentration_spell ?? null;
  if (!concentrationSpell) return;   // not concentrating — nothing to save

  const con = (charRow as any).constitution ?? 10;
  const lvl = (charRow as any).level ?? 1;
  const profs: string[] = ((charRow as any).saving_throw_proficiencies ?? []) as string[];
  const hasConProf = profs.some(p => p.toLowerCase() === 'con' || p.toLowerCase() === 'constitution');

  const conMod = abilityModifier(con);
  const pb = proficiencyBonus(lvl);
  const bonus = conMod + (hasConProf ? pb : 0);
  const dc = Math.max(10, Math.floor(ctx.damage / 2));

  const d20 = Math.floor(Math.random() * 20) + 1;
  const total = d20 + bonus;
  const passed = total >= dc || d20 === 20;   // nat 20 always succeeds (RAW)
  const autoFail = d20 === 1;                 // nat 1 always fails (RAW)
  const saved = autoFail ? false : passed;

  // Emit the save roll for the log
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
    },
  });

  if (!saved) {
    // Drop concentration
    await supabase
      .from('characters')
      .update({ concentration_spell: null, concentration_rounds_remaining: null })
      .eq('id', (charRow as any).id);

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
  }
}
