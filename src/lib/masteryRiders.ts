// v2.630.0 — Weapon Mastery riders, Ship B part 1 (SRD 5.2.1).
//
// Automates the on-hit mastery properties for PLAYER weapon attacks:
//   Sap    — hit: target gets Disadvantage on its next attack roll
//            (marker buff on the target, consumed on that roll, or
//            expires at the start of the attacker's next turn)
//   Slow   — hit + damage: target Speed −10 ft until the start of the
//            attacker's next turn (buff; applyBuff de-dupes by key so
//            multiple Slow hits never stack, per RAW)
//   Vex    — hit + damage: attacker has Advantage on their next attack
//            roll against THAT target (marker on the attacker, scoped
//            via onlyVsTargetParticipantId, consumed on use, expires
//            end of attacker's next turn — swept at start of the turn
//            after via the same expiry hook)
//   Topple — hit: target makes a CON save (DC 8 + attack ability mod
//            + PB); fail → Prone via the existing condition system
//   Push   — hit: DM-facing event "may push target up to 10 ft
//            straight away" (auto token movement is a later ship)
//
// Graze / Cleave / Nick land in Ship B part 2.
//
// Riders fire only when the attacker is a character whose
// weapon_masteries includes the weapon (matched through
// masteryForWeapon, which handles "Longsword +1"-style names).
// Dynamic imports below avoid a require cycle with pendingAttack.
import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';
import { masteryForWeapon, MASTERY_WEAPONS, type MasteryName } from '../data/weaponMastery';
import type { ActiveBuff } from './buffs';
import type { PendingAttack } from '../types';

export const MASTERY_SAP_KEY = 'mastery_sapped';
export const MASTERY_VEX_KEY = 'mastery_vexed';
export const MASTERY_SLOW_KEY = 'mastery_slowed';

export interface MasteryContext {
  mastery: MasteryName;
  abilityMod: number;
  profBonus: number;
}

function mod(score: number | null | undefined): number {
  return Math.floor((((score as number) ?? 10) - 10) / 2);
}

/** Mastery context for this attack, or null when the attacker isn't a
 *  character, has no mastery in this weapon, or the weapon is unknown. */
export async function getMasteryContext(atk: PendingAttack): Promise<MasteryContext | null> {
  if (atk.attacker_type !== 'character' || !atk.attacker_participant_id) return null;
  const mastery = masteryForWeapon(atk.attack_name);
  if (!mastery) return null;

  const { data: part } = await supabase
    .from('combat_participants')
    .select('entity_id, participant_type')
    .eq('id', atk.attacker_participant_id)
    .maybeSingle();
  if (!part || part.participant_type !== 'character' || !part.entity_id) return null;

  const { data: ch } = await (supabase as any)
    .from('characters')
    .select('weapon_masteries, level, strength, dexterity')
    .eq('id', part.entity_id)
    .maybeSingle();
  if (!ch) return null;

  const chosen: string[] = (ch.weapon_masteries as string[] | null) ?? [];
  const weaponEntry = MASTERY_WEAPONS.find(w =>
    (atk.attack_name ?? '').trim().toLowerCase().startsWith(w.name.toLowerCase()),
  );
  if (!weaponEntry || !chosen.includes(weaponEntry.name)) return null;

  const isRanged = weaponEntry.group === 'simple_ranged' || weaponEntry.group === 'martial_ranged';
  const abilityMod = isRanged
    ? mod(ch.dexterity)
    : weaponEntry.finesse
      ? Math.max(mod(ch.strength), mod(ch.dexterity))
      : mod(ch.strength);
  const profBonus = 2 + Math.floor((((ch.level as number) ?? 1) - 1) / 4);
  return { mastery: weaponEntry.mastery, abilityMod, profBonus };
}

/** Marker survey for rollAttackRoll: does the attacker carry a Sap
 *  marker (forced disadvantage) or a Vex marker valid against this
 *  target (advantage)? Returns the buff keys to consume after the
 *  roll resolves. */
export function surveyMasteryMarkers(
  attackerBuffs: ActiveBuff[],
  targetParticipantId: string | null,
): { adv: boolean; dis: boolean; consumeKeys: string[] } {
  let adv = false;
  let dis = false;
  const consumeKeys: string[] = [];
  for (const b of attackerBuffs) {
    if (b.key === MASTERY_SAP_KEY) {
      dis = true;
      consumeKeys.push(b.key);        // "its next attack roll" — any target
    }
    if (
      b.key === MASTERY_VEX_KEY &&
      targetParticipantId &&
      b.onlyVsTargetParticipantId === targetParticipantId
    ) {
      adv = true;
      consumeKeys.push(b.key);        // consumed only vs the vexed target
    }
  }
  return { adv, dis, consumeKeys };
}

/** Remove consumed markers from the attacker after their roll. */
export async function consumeMasteryMarkers(
  atk: PendingAttack,
  consumeKeys: string[],
): Promise<void> {
  if (consumeKeys.length === 0 || !atk.attacker_participant_id) return;
  const { removeBuff } = await import('./buffs');
  for (const key of consumeKeys) {
    await removeBuff({
      participantId: atk.attacker_participant_id,
      key,
      reason: 'mastery_marker_consumed',
      campaignId: atk.campaign_id,
      encounterId: atk.encounter_id,
    });
  }
}

/** Fire the on-hit mastery rider for this attack. Call from
 *  applyDamage after damage lands (hit implied). `damageDealt` gates
 *  Slow and Vex, which require the hit to deal damage per RAW. */
export async function applyOnHitMasteryRiders(input: {
  atk: PendingAttack;
  damageDealt: number;
  targetIsDead: boolean;
}): Promise<void> {
  const { atk, damageDealt, targetIsDead } = input;
  if (!atk.target_participant_id || !atk.attacker_participant_id) return;
  const ctx = await getMasteryContext(atk);
  if (!ctx) return;

  const { applyBuff } = await import('./buffs');
  const base = {
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
  };

  switch (ctx.mastery) {
    case 'Sap': {
      if (targetIsDead) return;
      await applyBuff({
        ...base,
        participantId: atk.target_participant_id,
        buff: {
          key: MASTERY_SAP_KEY,
          name: 'Sapped',
          source: `mastery:${atk.attack_name}`,
          casterParticipantId: atk.attacker_participant_id,
          // Swept at the start of the attacker's next turn if unused.
          expiresAtStartOfTurnOf: atk.attacker_participant_id,
        } as ActiveBuff,
      });
      return;
    }
    case 'Slow': {
      if (targetIsDead || damageDealt <= 0) return;
      await applyBuff({
        ...base,
        participantId: atk.target_participant_id,
        buff: {
          key: MASTERY_SLOW_KEY,
          name: 'Slowed (Mastery)',
          source: `mastery:${atk.attack_name}`,
          casterParticipantId: atk.attacker_participant_id,
          expiresAtStartOfTurnOf: atk.attacker_participant_id,
        } as ActiveBuff,
      });
      return;
    }
    case 'Vex': {
      if (damageDealt <= 0) return;
      await applyBuff({
        ...base,
        participantId: atk.attacker_participant_id,   // marker rides on the ATTACKER
        buff: {
          key: MASTERY_VEX_KEY,
          name: 'Vexed',
          source: `mastery:${atk.attack_name}`,
          onlyVsTargetParticipantId: atk.target_participant_id,
          // RAW: before the end of your next turn — swept at the start
          // of the turn AFTER the attacker's next (nearest hook that
          // never expires it early).
          expiresAtStartOfTurnOf: atk.attacker_participant_id,
          expiresSkipFirst: true,
        } as ActiveBuff,
      });
      return;
    }
    case 'Topple': {
      if (targetIsDead) return;
      const dc = 8 + ctx.abilityMod + ctx.profBonus;
      const { getTargetSaveBonus } = await import('./pendingAttack');
      const { bonus, breakdown } = await getTargetSaveBonus(atk.target_participant_id, 'CON');
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + bonus;
      const failed = total < dc;
      await emitCombatEvent({
        campaignId: atk.campaign_id,
        encounterId: atk.encounter_id,
        chainId: atk.chain_id ?? newChainId(),
        sequence: 7,
        actorType: 'system',
        actorName: 'System',
        targetType: atk.target_type,
        targetName: atk.target_name,
        eventType: 'save_rolled',
        payload: {
          kind: 'mastery_topple',
          ability: 'CON',
          dc,
          d20,
          bonus,
          breakdown,
          total,
          success: !failed,
          label: `Topple (${atk.attack_name}): CON save ${total} vs DC ${dc} — ${failed ? 'failed, Prone' : 'held footing'}`,
        },
      });
      if (failed) {
        const { applyCondition } = await import('./conditions');
        await applyCondition({
          participantId: atk.target_participant_id,
          conditionName: 'Prone',
          source: `mastery:topple:${atk.attack_name}`,
          casterParticipantId: atk.attacker_participant_id,
          campaignId: atk.campaign_id,
          encounterId: atk.encounter_id,
        });
      }
      return;
    }
    case 'Push': {
      if (targetIsDead) return;
      await emitCombatEvent({
        campaignId: atk.campaign_id,
        encounterId: atk.encounter_id,
        chainId: atk.chain_id ?? newChainId(),
        sequence: 7,
        actorType: 'system',
        actorName: 'System',
        targetType: atk.target_type,
        targetName: atk.target_name,
        eventType: 'generic_roll',
        payload: {
          kind: 'mastery_push',
          label: `Push (${atk.attack_name}): ${atk.attacker_name} may move ${atk.target_name} up to 10 ft straight away (Large or smaller).`,
        },
      });
      return;
    }
    default:
      return;   // Graze / Cleave / Nick — Ship B part 2
  }
}

/** v2.631.0 — Graze: on a miss with a mastered Graze weapon, the
 *  target takes damage equal to the ability modifier used for the
 *  attack roll (same damage type as the weapon; unmodifiable except
 *  by the modifier itself, so resistances still apply — kept simple:
 *  flat application through temp HP first). Characters dropped to 0
 *  by Graze enter the normal death-save flow at their turn start;
 *  monsters at 0 die. Known gap: concentration-at-0 auto-drop lives
 *  in applyDamage and is not duplicated here (DM handles the rare
 *  mod-damage finishing blow on a concentrating PC). */
export async function grazeOnMiss(atk: PendingAttack): Promise<void> {
  if (!atk.target_participant_id) return;
  const ctx = await getMasteryContext(atk);
  if (!ctx || ctx.mastery !== 'Graze') return;
  const dmg = ctx.abilityMod;
  if (dmg <= 0) return;   // negative/zero modifier deals nothing

  const { normalizeParticipantRow, JOINED_COMBATANT_FIELDS } = await import('./combatParticipantNormalize');
  const { data: tgtRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, combatant_id, participant_type, ' + JOINED_COMBATANT_FIELDS)
    .eq('id', atk.target_participant_id)
    .maybeSingle();
  if (!tgtRaw) return;
  const tgt = normalizeParticipantRow(tgtRaw);
  if (tgt.is_dead) return;

  const tempBefore = (tgt.temp_hp as number | null) ?? 0;
  const hpBefore = (tgt.current_hp as number | null) ?? 0;
  const tempAfter = Math.max(0, tempBefore - dmg);
  const toHp = Math.max(0, dmg - tempBefore);
  const hpAfter = Math.max(0, hpBefore - toHp);
  const droppedTo0 = hpAfter === 0 && hpBefore > 0;
  const monsterDied = droppedTo0 && tgt.participant_type !== 'character';

  const combatantId = (tgt as any).combatant_id as string | null;
  if (!combatantId) return;
  await (supabase as any)
    .from('combatants')
    .update({
      current_hp: hpAfter,
      temp_hp: tempAfter,
      ...(monsterDied ? { is_dead: true } : {}),
    })
    .eq('id', combatantId);

  await emitCombatEvent({
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
    chainId: atk.chain_id ?? newChainId(),
    sequence: 7,
    actorType: 'system',
    actorName: 'System',
    targetType: atk.target_type,
    targetName: atk.target_name,
    eventType: 'damage_applied',
    payload: {
      kind: 'mastery_graze',
      damage: dmg,
      label: `Graze (${atk.attack_name}): the miss still deals ${dmg} damage`,
    },
  });
  if (droppedTo0) {
    await emitCombatEvent({
      campaignId: atk.campaign_id,
      encounterId: atk.encounter_id,
      chainId: atk.chain_id ?? newChainId(),
      sequence: 8,
      actorType: 'system',
      actorName: 'System',
      targetType: atk.target_type,
      targetName: atk.target_name,
      eventType: monsterDied ? 'died' : 'dropped_to_0_hp',
      payload: { via: 'mastery_graze', damage: dmg },
    });
  }
}

/** Start-of-turn expiry sweep. Call from advanceTurn with the full
 *  participant list: removes mastery marker buffs whose
 *  expiresAtStartOfTurnOf matches the participant whose turn is
 *  starting. Vex sets expiresSkipFirst so it survives through the end
 *  of the attacker's next turn (flag cleared on first sweep, removed
 *  on the second). */
export async function sweepExpiredMasteryMarkers(
  incomingParticipantId: string,
  rows: Array<{ id?: string; encounter_id?: string | null; campaign_id?: string; active_buffs?: unknown }>,
): Promise<void> {
  const { removeBuff, applyBuff } = await import('./buffs');
  for (const row of rows) {
    const buffs = ((row.active_buffs ?? []) as ActiveBuff[]).filter(
      b => (b as any).expiresAtStartOfTurnOf === incomingParticipantId,
    );
    for (const b of buffs) {
      if ((b as any).expiresSkipFirst) {
        await applyBuff({
          participantId: row.id as string,
          campaignId: row.campaign_id as string | undefined,
          encounterId: row.encounter_id ?? null,
          emitEvent: false,
          buff: { ...(b as any), expiresSkipFirst: undefined } as ActiveBuff,
        });
        continue;
      }
      await removeBuff({
        participantId: row.id as string,
        key: b.key,
        reason: 'mastery_marker_expired',
        campaignId: row.campaign_id as string | undefined,
        encounterId: row.encounter_id ?? null,
      });
    }
  }
}
