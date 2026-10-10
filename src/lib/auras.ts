import {rollSavingThrow,exhaustionPenalty} from '../rules/savingThrows';
import {parseDiceGroups,rollDiceGroups} from '../rules/dice';
import {rollSaveBonuses} from '../rules/saveBonuses';
import {readAuraSaveState} from './api/auraSaveState';
import {readAuraDamageDefenses} from './api/auraDamageDefenses';
import {applyDamageAffinities} from '../rules/damageAffinities';
// v2.634.0 — Aura / proximity engine (2024 Emanation rules).
//
// RAW basis, verified against the 2024 rules glossary and the 2024
// Spirit Guardians entry:
//
//   Emanation (area of effect): "An Emanation moves with the creature
//   or object that is its origin unless it is an instantaneous or a
//   stationary effect. An Emanation's origin (creature or object)
//   isn't included in the area of effect unless its creator decides
//   otherwise."
//
//   Spirit Guardians (2024): "Any other creature's Speed is halved in
//   the Emanation, and whenever the Emanation enters a creature's
//   space and whenever a creature enters the Emanation or ends its
//   turn there, the creature must make a Wisdom saving throw. ...
//   A creature makes this save only once per turn."
//
// ⚠ This is NOT the 2014 behaviour. 2014 read "enters the area for the
// first time on a turn or starts its turn there". 2024 replaces
// "starts" with "ENDS its turn there" and adds the moving-emanation
// trigger. src/data/spells.ts still carries the 2014 SRD 5.1 text for
// spirit-guardians — the engine implements 2024; the spell text needs
// its own SRD 5.2.1 pass (logged for chat 22).
//
// Trigger identities shared with the atomic aura review pipeline:
//   'creature_entered'  — a creature moved from outside to inside
//   'emanation_entered' — the ORIGIN moved, sweeping the area over a
//                         creature that was previously outside
//   'turn_end'          — a creature ended its turn inside
//
// "Once per turn" is enforced through combat_participants
// .once_per_turn_used (the array added in v2.633 for Cleave), keyed
// per aura instance. v2.634 also corrects WHEN that array clears: it
// now clears for EVERY participant at each turn boundary, not just the
// incoming one, because "once per turn" in 5e means the turn currently
// in progress regardless of whose it is. That matters for auras (a
// creature can be forced to save on the cleric's turn and again on its
// own) and it was quietly wrong for Cleave too, which can trigger on an
// opportunity attack during someone else's turn.
//
// Storage: an aura is an ActiveBuff on its origin carrying an `aura`
// payload, so it inherits buff removal, the caster-died sweep, and
// concentration cleanup for free rather than needing its own table.

import { resolveNonAttackDamage } from '../rules/deathSaves';
import { supabase } from './supabase';
import { checkedWrite } from './api/checked';
import { emitCombatEvent, newChainId } from './combatEvents';
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from './combatParticipantNormalize';
import type { ActiveBuff } from './buffs';

/** Buff-key prefix. An origin can carry more than one aura. */
export const AURA_KEY_PREFIX = 'aura:';

export type AuraTrigger = 'creature_entered' | 'emanation_entered' | 'turn_end';

export interface AuraSpec {
  /** Stable id, e.g. 'spirit_guardians'. Buff key is AURA_KEY_PREFIX + this. */
  key: string;
  name: string;
  radiusFt: number;
  saveAbility: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  saveDC: number;
  /** null = no damage (a pure speed/condition aura). */
  damageDice: string | null;
  damageType: string | null;
  /** RAW for Spirit Guardians: half damage on a successful save. */
  halfOnSave: boolean;
  /** Which triggers force the save. Spirit Guardians uses all three. */
  triggers: AuraTrigger[];
  /** "you can designate creatures to be unaffected by it" — participant ids. */
  exemptParticipantIds: string[];
  /** Speed effect for creatures inside. 'half' per Spirit Guardians. */
  speedInside: 'half' | null;
  /** Affect only creatures hostile to the origin, or everyone? Spirit
   *  Guardians affects every non-designated creature, so 'all'. */
  affects: 'all' | 'enemies';
}

/** Feet per grid square — matches battleMapGeometry. */
const FEET_PER_SQUARE = 5;

/** Once-per-turn marker for one aura instance. */
export function auraSaveMarkerKey(originParticipantId: string, auraKey: string): string {
  return `aura_save:${originParticipantId}:${auraKey}`;
}

// ─── Footprint math ──────────────────────────────────────────────
// Mirrors battleMapGeometry.tokenFootprintRange, but parameterised on
// an arbitrary (row, col) because movement triggers must evaluate the
// mover's PREVIOUS cell — by the time logMovement runs, the token has
// already been written to its new position.

export interface CellRect { rMin: number; rMax: number; cMin: number; cMax: number }

/** Footprint rect for a token of `size` cells anchored at (row, col).
 *  Odd sizes anchor on the centre cell; even sizes anchor on the
 *  top-left cell of the footprint. This parity convention is load-
 *  bearing across the map code — do not "simplify" it. */
export function footprintAt(row: number, col: number, size: number): CellRect {
  const s = Math.max(1, size);
  if (s % 2 === 1) {
    const half = Math.floor(s / 2);
    return { rMin: row - half, rMax: row + half, cMin: col - half, cMax: col + half };
  }
  return { rMin: row, rMax: row + s - 1, cMin: col, cMax: col + s - 1 };
}

/** Chebyshev gap in cells between two rects. 0 when they touch or overlap. */
export function gapCells(a: CellRect, b: CellRect): number {
  const rowGap = Math.max(0, Math.max(a.rMin - b.rMax, b.rMin - a.rMax));
  const colGap = Math.max(0, Math.max(a.cMin - b.cMax, b.cMin - a.cMax));
  return Math.max(rowGap, colGap);
}

/**
 * Is `subject` inside an Emanation of `radiusFt` originating from
 * `origin`? RAW excludes the origin's own space from the area, so a
 * zero gap between distinct footprints still counts as inside but the
 * origin itself never is (callers skip it).
 */
export function isInsideEmanation(
  origin: CellRect,
  subject: CellRect,
  radiusFt: number,
): boolean {
  return gapCells(origin, subject) * FEET_PER_SQUARE <= radiusFt;
}

// ─── Aura lifecycle ──────────────────────────────────────────────

/** Attach an aura to its origin. Idempotent by buff key. */
export async function startAura(input: {
  campaignId: string;
  encounterId: string | null;
  originParticipantId: string;
  spec: AuraSpec;
}): Promise<void> {
  const { applyBuff } = await import('./buffs');
  await applyBuff({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    participantId: input.originParticipantId,
    buff: {
      key: AURA_KEY_PREFIX + input.spec.key,
      name: input.spec.name,
      source: `aura:${input.spec.key}`,
      casterParticipantId: input.originParticipantId,
      aura: input.spec,
    } as unknown as ActiveBuff,
  });
}

export async function endAura(input: {
  campaignId: string;
  encounterId: string | null;
  originParticipantId: string;
  auraKey: string;
}): Promise<void> {
  const { removeBuff } = await import('./buffs');
  await removeBuff({
    participantId: input.originParticipantId,
    key: AURA_KEY_PREFIX + input.auraKey,
    reason: 'aura_ended',
    campaignId: input.campaignId,
    encounterId: input.encounterId,
  });
}

export interface ActiveAura {
  originParticipantId: string;
  originName: string;
  originSize: number;
  originRow: number;
  originCol: number;
  spec: AuraSpec;
}

/** Extract the AuraSpec carried by a buff, or null. */
export function auraFromBuff(buff: ActiveBuff): AuraSpec | null {
  if (!buff.key || !buff.key.startsWith(AURA_KEY_PREFIX)) return null;
  const spec = (buff as unknown as { aura?: AuraSpec }).aura;
  if (!spec || typeof spec.radiusFt !== 'number') return null;
  return spec;
}

/**
 * v2.869 — retain combatant identity in every aura lookup: creatures can
 * share both a definition and a name, but occupy different map positions.
 * Every aura currently active in the encounter, with its origin's map
 * position resolved. Auras whose origin has no token are skipped —
 * an Emanation without a position can't be evaluated geometrically.
 */
export async function listActiveAuras(
  campaignId: string,
  encounterId: string,
  strict=false,
  target?:{id:string;type:string;trigger:AuraTrigger},
): Promise<ActiveAura[]> {
  const { data: rowsRaw,error } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, combatant_id, ' + JOINED_COMBATANT_FIELDS)
    .eq('encounter_id', encounterId);
  if(strict&&(error||!rowsRaw))throw new Error('Active auras could not be checked. Retry before ending the turn.');
  const rows = ((rowsRaw ?? []) as any[]).map(normalizeParticipantRow);

  const relevant=(spec:AuraSpec|null,origin:Record<string,unknown>)=>!!spec&&(!target||(spec.triggers.includes(target.trigger)
    &&origin.id!==target.id&&!spec.exemptParticipantIds.includes(target.id)
    &&(spec.affects!=='enemies'||((origin.participant_type==='character')!==(target.type==='character')))));
  const withAuras = rows.filter((r: any) =>
    !r.is_dead&&((r.active_buffs ?? []) as ActiveBuff[]).some(b => relevant(auraFromBuff(b),r)),
  );
  if (withAuras.length === 0) return [];

  const { loadActiveBattleMap, findTokenForParticipant, participantLookup } = await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(campaignId,{throwOnError:strict});
  if (!bmap){if(strict)throw new Error('Place the active aura and target on a map before ending the turn.');return [];}

  const out: ActiveAura[] = [];
  for (const r of withAuras) {
    if (r.is_dead) continue;
    const tok = findTokenForParticipant(
      participantLookup(r),
      bmap.tokens,
    );
    if (!tok){if(strict)throw new Error('An active aura has no mapped origin. Review its placement before ending the turn.');continue;}
    for (const b of ((r.active_buffs ?? []) as ActiveBuff[])) {
      const spec = auraFromBuff(b);
      if (!spec||!relevant(spec,r)) continue;
      out.push({
        originParticipantId: r.id as string,
        originName: r.name as string,
        originSize: Math.max(1, (tok.size as number) ?? 1),
        originRow: tok.row,
        originCol: tok.col,
        spec,
      });
    }
  }
  return out;
}

// ─── Save + damage resolution ────────────────────────────────────

async function alreadySavedThisTurn(participantId: string, marker: string): Promise<boolean> {
  const {data,error}=await supabase.from('combat_participants').select('once_per_turn_used').eq('id',participantId).maybeSingle();
  if(error||!data)throw new Error('The aura’s previous use could not be checked. Retry before resolving.');
  const used=(data as unknown as {once_per_turn_used?:unknown}).once_per_turn_used??[];
  if(!Array.isArray(used)||!used.every(k=>typeof k==='string'))throw new Error('Review the aura’s turn markers.');
  return used.includes(marker);
}

/**
 * Resolve one aura save against one creature. Enforces the once-per-
 * turn gate, rolls the save, applies damage (half on success when the
 * aura says so), and logs. Returns true when a save was actually made.
 */
export interface AuraSaveInput {
  campaignId: string;
  encounterId: string;
  aura: ActiveAura;
  targetParticipantId: string;
  targetName: string;
  targetType: string;
  trigger: AuraTrigger;
}
export type AuraTurnResolver=(input:AuraSaveInput,scope:{userId:string;turnId:string;guard:()=>void})=>Promise<boolean>;
export async function resolveAuraSave(input:AuraSaveInput): Promise<boolean> {
  const { aura } = input;
  const marker = auraSaveMarkerKey(aura.originParticipantId, aura.spec.key);
  if (await alreadySavedThisTurn(input.targetParticipantId, marker)) return false;

  if(aura.spec.damageDice!==null&&!parseDiceGroups(aura.spec.damageDice))throw new Error('Review the aura damage expression before resolving.');
  const state=await readAuraSaveState(input.campaignId,input.encounterId,input.targetParticipantId,aura.spec.saveAbility);
  const {conditionsAutoFailSave,conditionsDisadvantageSave,conditionsResistAll}=await import('./conditions');
  const defenses=aura.spec.damageDice?await readAuraDamageDefenses(input.campaignId,input.encounterId,input.targetParticipantId,aura.spec.damageType):{immune:false,resistant:false,vulnerable:false};
  defenses.resistant ||= conditionsResistAll(state.conditions);
  const automaticFailure=conditionsAutoFailSave(state.conditions,aura.spec.saveAbility);
  const disadvantage=conditionsDisadvantageSave(state.conditions,aura.spec.saveAbility);
  const {getTargetSaveBonus}=await import('./pendingAttack');
  const base=automaticFailure?{bonus:0,breakdown:'Automatic failure from condition',naturalExtremes:false,confidence:'high'}:
    await getTargetSaveBonus(input.targetParticipantId,aura.spec.saveAbility);
  if(base.confidence!=='high')throw new Error('Review the aura target’s saving throw bonus before resolving.');
  const effects=automaticFailure?{bonus:0,rolls:[]}:rollSaveBonuses(state.buffs,0);
  const penalty=automaticFailure?0:exhaustionPenalty(state.exhaustion);
  const bonus=base.bonus+effects.bonus-penalty;
  const breakdown=[base.breakdown,...effects.rolls.map(r=>`${r.name} ${r.total>=0?'+':''}${r.total}`),...(penalty?[`Exhaustion -${penalty}`]:[])].join('; ');
  const save=rollSavingThrow(bonus,aura.spec.saveDC,{advantage:state.advantage,disadvantage,naturalExtremes:base.naturalExtremes,forceFailure:automaticFailure});
  const {d20,total,passed}=save;

  let damage=0,damageRolled=0,damageAfterSave=0,damageModifier='none';
  let damageRoll:ReturnType<typeof rollDiceGroups>=null;
  if(aura.spec.damageDice){
    damageRoll=rollDiceGroups(aura.spec.damageDice);
    if(!damageRoll)throw new Error('Review the aura damage expression before resolving.');
    damageRolled=damageRoll.total;
    damageAfterSave=Math.max(0,passed?(aura.spec.halfOnSave?Math.floor(damageRolled/2):0):damageRolled);
    const applied=applyDamageAffinities(damageAfterSave,defenses);damage=applied.final;damageModifier=applied.modifier;
  }

  // Prepare all reads/dice before reserving the marker. A read failure must not
  // spend the aura use. Cross-client reservation/HP atomicity is still pending.
  const {markUsedThisTurn}=await import('./cleave');
  await markUsedThisTurn(input.targetParticipantId,marker);

  const chainId = newChainId();
  const triggerLabel =
    input.trigger === 'turn_end' ? 'ended its turn in the area'
    : input.trigger === 'emanation_entered' ? 'was swept by the moving area'
    : 'entered the area';

  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId,
    sequence: 0,
    actorType: 'system',
    actorName: 'System',
    targetType: input.targetType as any,
    targetName: input.targetName,
    eventType: 'save_rolled',
    payload: {
      kind: 'aura_save',
      aura: aura.spec.key,
      aura_name: aura.spec.name,
      origin: aura.originName,
      trigger: input.trigger,
      ability: aura.spec.saveAbility,
      dc: aura.spec.saveDC,
      d20: automaticFailure ? null : d20,
      rolls:save.rolls,advantage:state.advantage??false,disadvantage,automatic_failure:automaticFailure,effect_rolls:effects.rolls,exhaustion:state.exhaustion,
      bonus,
      breakdown,
      total: automaticFailure ? null : total,
      success: passed,
      damage,damage_rolls:damageRoll?.dice??[],damage_flat_modifier:damageRoll?.modifier??0,damage_rolled:damageRolled,damage_after_save:damageAfterSave,damage_modifier:damageModifier,
      label: `${aura.spec.name} (${aura.originName}): ${input.targetName} ${triggerLabel} — ${aura.spec.saveAbility} ${automaticFailure?'save automatically failed':`save ${total} vs DC ${aura.spec.saveDC}, ${passed?'passed':'failed'}`}${damage > 0 ? `, ${damage} ${aura.spec.damageType ?? ''} damage`.trimEnd() : ''}`,
    },
  });

  if (damage > 0) {
    await applyAuraDamage({
      campaignId: input.campaignId,
      encounterId: input.encounterId,
      participantId: input.targetParticipantId,
      targetName: input.targetName,
      targetType: input.targetType,
      damage,
      damageType: aura.spec.damageType,
      auraName: aura.spec.name,
      chainId,
    });
  }
  return true;
}

/**
 * Apply aura damage: temp HP first, then HP. Mirrors the Graze applier
 * (v2.631) rather than routing through applyDamage, because there is
 * no pending_attacks row here. Concentration saves DO fire, since an
 * aura is a normal source of damage per RAW.
 */
async function applyAuraDamage(input: {
  campaignId: string;
  encounterId: string;
  participantId: string;
  targetName: string;
  targetType: string;
  damage: number;
  damageType: string | null;
  auraName: string;
  chainId: string;
}): Promise<void> {
  const { data: tgtRaw, error: readError } = await (supabase as any)
    .from('combat_participants')
    .select('id, combatant_id, participant_type, ' + JOINED_COMBATANT_FIELDS)
    .eq('id', input.participantId)
    .maybeSingle();
  if (readError || !tgtRaw) throw new Error('Aura damage target could not be read.');
  const tgt = normalizeParticipantRow(tgtRaw);
  if (tgt.is_dead) return;

  const isCharacter = tgt.participant_type === 'character';
  const resolved = resolveNonAttackDamage({current_hp:tgt.current_hp,max_hp:tgt.max_hp,temp_hp:tgt.temp_hp??0,
    death_save_failures:tgt.death_save_failures??0,death_save_successes:tgt.death_save_successes??0,
    is_stable:tgt.is_stable??false,is_dead:tgt.is_dead??false},isCharacter,input.damage);
  const {droppedTo0,damageAtZero,massiveDamage,updates}=resolved;
  const combatantId=tgt.combatant_id as string|null;
  if(!combatantId)throw new Error('Aura damage target is not linked to combat.');
  // v2.869: confirm the write before reporting damage or rolling concentration.
  // The aura-wide save/marker/damage transaction remains separate follow-up work.
  const write=await checkedWrite('combatants.update aura-damage',{combatantId},(supabase as any)
    .from('combatants').update({current_hp:updates.current_hp,temp_hp:updates.temp_hp,
      death_save_failures:updates.death_save_failures,is_stable:updates.is_stable,is_dead:updates.is_dead})
    .eq('id',combatantId).select('id').single());
  if(write.error)throw new Error('Aura damage could not be confirmed: '+write.error.message);

  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId: input.chainId,
    sequence: 1,
    actorType: 'system',
    actorName: 'System',
    targetType: input.targetType as any,
    targetName: input.targetName,
    eventType: 'damage_applied',
    payload: {
      kind: 'aura_damage',
      aura_name: input.auraName,
      damage: input.damage,
      damage_type: input.damageType,
    },
  });

  if(damageAtZero){
    await emitCombatEvent({campaignId:input.campaignId,encounterId:input.encounterId,chainId:input.chainId,sequence:2,
      actorType:'system',actorName:'System',targetType:input.targetType as any,targetName:input.targetName,
      eventType:'damage_at_0_hp_failure_added',payload:{via:'aura',aura_name:input.auraName,damage:input.damage,
        failures:updates.death_save_failures,became_dead:updates.is_dead,massive_damage_death:massiveDamage}});
  }
  if (droppedTo0 || updates.is_dead) {
    await emitCombatEvent({
      campaignId: input.campaignId,
      encounterId: input.encounterId,
      chainId: input.chainId,
      sequence: damageAtZero ? 3 : 2,
      actorType: 'system',
      actorName: 'System',
      targetType: input.targetType as any,
      targetName: input.targetName,
      eventType: updates.is_dead ? 'died' : 'dropped_to_0_hp',
      payload: { via: 'aura', aura_name: input.auraName, damage: input.damage, massive_damage_death:massiveDamage },
    });
  } else if (isCharacter && updates.current_hp > 0) {
    // RAW: damage from any source can break concentration.
    const { runConcentrationSave } = await import('./pendingAttack');
    await runConcentrationSave({
      campaignId: input.campaignId,
      encounterId: input.encounterId,
      chainId: input.chainId,
      participantId: input.participantId,
      targetName: input.targetName,
      damage: input.damage,
    });
  }
}

// v2.869: movement entries are journaled with the token transaction and
// adjudicated through MovementAuraReview. Do not restore a second damage path.

// ─── Trigger: end of turn ────────────────────────────────────────

/**
 * "…or ends its turn there." Called from advanceTurn for the OUTGOING
 * participant, before per-turn markers are cleared.
 */
export async function evaluateAurasOnTurnEnd(input: {
  campaignId: string;
  encounterId: string;
  participantId: string;
  resolve?: (save:AuraSaveInput)=>Promise<boolean>;
}): Promise<void> {
  const { data: rowRaw,error } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, combatant_id, ' + JOINED_COMBATANT_FIELDS)
    .eq('id', input.participantId)
    .maybeSingle();
  if(error||!rowRaw){if(input.resolve)throw new Error('The outgoing aura target could not be checked. Retry before advancing.');return;}
  const row = normalizeParticipantRow(rowRaw);
  if (row.is_dead) return;
  const auras = await listActiveAuras(input.campaignId,input.encounterId,!!input.resolve,{id:row.id as string,type:row.participant_type as string,trigger:'turn_end'});
  if(auras.length===0)return;

  const { loadActiveBattleMap, findTokenForParticipant, participantLookup } = await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(input.campaignId,{throwOnError:!!input.resolve});
  if (!bmap){if(input.resolve)throw new Error('The aura map is unavailable. Review placement before advancing.');return;}
  const tok = findTokenForParticipant(
    participantLookup(row),
    bmap.tokens,
  );
  if (!tok){if(input.resolve)throw new Error('Place the outgoing target on the map before resolving its auras.');return;}
  const rect = footprintAt(tok.row, tok.col, Math.max(1, (tok.size as number) ?? 1));

  for (const aura of auras) {
    if (!aura.spec.triggers.includes('turn_end')) continue;
    if (aura.originParticipantId === row.id) continue;          // origin excluded
    if (aura.spec.exemptParticipantIds.includes(row.id as string)) continue;
    const originRect = footprintAt(aura.originRow, aura.originCol, aura.originSize);
    if (!isInsideEmanation(originRect, rect, aura.spec.radiusFt)) continue;
    await (input.resolve??resolveAuraSave)({
      campaignId: input.campaignId,
      encounterId: input.encounterId,
      aura,
      targetParticipantId: row.id as string,
      targetName: row.name as string,
      targetType: row.participant_type as string,
      trigger: 'turn_end',
    });
  }
}

// ─── Speed effect ────────────────────────────────────────────────

/**
 * Multiplier applied to a participant's Speed from auras they are
 * standing in. Returns 1 (no effect) or 0.5. Halving does not stack —
 * standing in two halving auras is still half, matching how RAW treats
 * repeated Speed halving from the same kind of effect.
 */
export async function auraSpeedMultiplier(input: {
  campaignId: string;
  encounterId: string;
  participantId: string;
}): Promise<number> {
  const auras = await listActiveAuras(input.campaignId, input.encounterId);
  const halving = auras.filter(a => a.spec.speedInside === 'half');
  if (halving.length === 0) return 1;

  const { loadActiveBattleMap, findTokenForParticipant, participantLookup } = await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(input.campaignId);
  if (!bmap) return 1;

  const { data: rowRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, combatant_id')
    .eq('id', input.participantId)
    .maybeSingle();
  if (!rowRaw) return 1;
  const tok = findTokenForParticipant(participantLookup(rowRaw), bmap.tokens);
  if (!tok) return 1;
  const rect = footprintAt(tok.row, tok.col, Math.max(1, (tok.size as number) ?? 1));

  for (const aura of halving) {
    if (aura.originParticipantId === input.participantId) continue;
    if (aura.spec.exemptParticipantIds.includes(input.participantId)) continue;
    const originRect = footprintAt(aura.originRow, aura.originCol, aura.originSize);
    if (isInsideEmanation(originRect, rect, aura.spec.radiusFt)) return 0.5;
  }
  return 1;
}

// ─── Reference aura: Spirit Guardians ────────────────────────────


// ─── Cast-time registry ──────────────────────────────────────────
// v2.635.0 — maps a spell id to the aura it creates, so SpellCastButton
// can light one up the same way SUMMON_TOKEN_SPELLS drops a token and
// BUFF_SPELL_REGISTRY applies a buff. Keyed by spells.ts `id`.

export interface AuraSpellEntry {
  /** Display label for the cast modal. */
  label: string;
  /** RAW: "you can designate creatures to be unaffected by it." */
  allowsDesignation: boolean;
  /** Offered damage types, when the spell lets the caster choose.
   *  Spirit Guardians keys off the caster's alignment, which the app
   *  doesn't model — so the player picks. Empty = no choice. */
  damageTypeChoices: string[];
  build(input: {
    saveDC: number;
    slotLevel: number;
    damageType: string;
    exemptParticipantIds: string[];
  }): AuraSpec;
}

export const AURA_SPELLS: Record<string, AuraSpellEntry> = {
  'spirit-guardians': {
    label: 'Spirit Guardians',
    allowsDesignation: true,
    damageTypeChoices: ['radiant', 'necrotic'],
    build: ({ saveDC, slotLevel, damageType, exemptParticipantIds }) =>
      spiritGuardiansSpec({
        saveDC,
        slotLevel,
        damageType: damageType === 'necrotic' ? 'necrotic' : 'radiant',
        exemptParticipantIds,
      }),
  },
};

/**
 * Tear down the aura a character created with `spellId`. Called from
 * the single concentration-change funnel in CharacterSheet, alongside
 * the summon-token despawn — every concentration clear path (Drop
 * button, failed CON save, timer expiry, replacement cast) routes
 * through there. No-ops when the caster isn't in an active encounter.
 */
export async function endAuraForSpell(input: {
  campaignId: string;
  casterCharacterId: string;
  spellId: string;
}): Promise<boolean> {
  const entry = AURA_SPELLS[input.spellId];
  if (!entry) return false;

  const { data: enc } = await supabase
    .from('combat_encounters')
    .select('id')
    .eq('campaign_id', input.campaignId)
    .eq('status', 'active')
    .maybeSingle();
  if (!enc) return false;

  const { data: casterRow } = await supabase
    .from('combat_participants')
    .select('id')
    .eq('encounter_id', enc.id as string)
    .eq('participant_type', 'character')
    .eq('entity_id', input.casterCharacterId)
    .maybeSingle();
  if (!casterRow) return false;

  await endAura({
    campaignId: input.campaignId,
    encounterId: enc.id as string,
    originParticipantId: casterRow.id as string,
    auraKey: buildAuraKeyForSpell(input.spellId),
  });
  return true;
}

/** The AuraSpec.key a given spell id produces. Kept as a function so
 *  the teardown path never has to reconstruct a full spec just to
 *  learn the key. */
export function buildAuraKeyForSpell(spellId: string): string {
  return spellId.replace(/-/g, '_');
}

/**
 * Build the Spirit Guardians AuraSpec (2024). Damage scales 3d8 at
 * level 3, +1d8 per slot level above 3. Radiant for good/neutral
 * casters, Necrotic for evil — the caller passes the choice through
 * rather than the engine guessing alignment.
 */
export function spiritGuardiansSpec(input: {
  saveDC: number;
  slotLevel: number;
  damageType: 'radiant' | 'necrotic';
  exemptParticipantIds?: string[];
}): AuraSpec {
  const dice = Math.max(3, Math.min(9, Math.floor(input.slotLevel)));
  return {
    key: 'spirit_guardians',
    name: 'Spirit Guardians',
    radiusFt: 15,
    saveAbility: 'WIS',
    saveDC: input.saveDC,
    damageDice: `${dice}d8`,
    damageType: input.damageType,
    halfOnSave: true,
    triggers: ['creature_entered', 'emanation_entered', 'turn_end'],
    exemptParticipantIds: input.exemptParticipantIds ?? [],
    speedInside: 'half',
    affects: 'all',
  };
}
