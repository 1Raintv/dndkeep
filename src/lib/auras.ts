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
// Three trigger points, all funnelling into resolveAuraSave():
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

import { supabase } from './supabase';
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
 * Every aura currently active in the encounter, with its origin's map
 * position resolved. Auras whose origin has no token are skipped —
 * an Emanation without a position can't be evaluated geometrically.
 */
export async function listActiveAuras(
  campaignId: string,
  encounterId: string,
): Promise<ActiveAura[]> {
  const { data: rowsRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, ' + JOINED_COMBATANT_FIELDS)
    .eq('encounter_id', encounterId);
  const rows = ((rowsRaw ?? []) as any[]).map(normalizeParticipantRow);

  const withAuras = rows.filter((r: any) =>
    ((r.active_buffs ?? []) as ActiveBuff[]).some(b => auraFromBuff(b) !== null),
  );
  if (withAuras.length === 0) return [];

  const { loadActiveBattleMap, findTokenForParticipant } = await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(campaignId);
  if (!bmap) return [];

  const out: ActiveAura[] = [];
  for (const r of withAuras) {
    if (r.is_dead) continue;
    const tok = findTokenForParticipant(
      { id: r.id, name: r.name, participant_type: r.participant_type, entity_id: r.entity_id },
      bmap.tokens,
    );
    if (!tok) continue;
    for (const b of ((r.active_buffs ?? []) as ActiveBuff[])) {
      const spec = auraFromBuff(b);
      if (!spec) continue;
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
  const { data } = await (supabase as any)
    .from('combat_participants')
    .select('once_per_turn_used')
    .eq('id', participantId)
    .maybeSingle();
  return (((data?.once_per_turn_used ?? []) as string[])).includes(marker);
}

/**
 * Resolve one aura save against one creature. Enforces the once-per-
 * turn gate, rolls the save, applies damage (half on success when the
 * aura says so), and logs. Returns true when a save was actually made.
 */
export async function resolveAuraSave(input: {
  campaignId: string;
  encounterId: string;
  aura: ActiveAura;
  targetParticipantId: string;
  targetName: string;
  targetType: string;
  trigger: AuraTrigger;
}): Promise<boolean> {
  const { aura } = input;
  const marker = auraSaveMarkerKey(aura.originParticipantId, aura.spec.key);
  if (await alreadySavedThisTurn(input.targetParticipantId, marker)) return false;

  const { markUsedThisTurn } = await import('./cleave');
  await markUsedThisTurn(input.targetParticipantId, marker);

  const { getTargetSaveBonus, rollDiceExpr } = await import('./pendingAttack');
  const { bonus, breakdown } = await getTargetSaveBonus(
    input.targetParticipantId,
    aura.spec.saveAbility,
  );
  const d20 = Math.floor(Math.random() * 20) + 1;
  const total = d20 + bonus;
  const passed = total >= aura.spec.saveDC;

  let damage = 0;
  if (aura.spec.damageDice) {
    const rolled = rollDiceExpr(aura.spec.damageDice).total;
    damage = passed ? (aura.spec.halfOnSave ? Math.floor(rolled / 2) : 0) : rolled;
  }

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
      d20,
      bonus,
      breakdown,
      total,
      success: passed,
      damage,
      label: `${aura.spec.name} (${aura.originName}): ${input.targetName} ${triggerLabel} — ${aura.spec.saveAbility} save ${total} vs DC ${aura.spec.saveDC}, ${passed ? 'passed' : 'failed'}${damage > 0 ? `, ${damage} ${aura.spec.damageType ?? ''} damage`.trimEnd() : ''}`,
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
  const { data: tgtRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, combatant_id, participant_type, ' + JOINED_COMBATANT_FIELDS)
    .eq('id', input.participantId)
    .maybeSingle();
  if (!tgtRaw) return;
  const tgt = normalizeParticipantRow(tgtRaw);
  if (tgt.is_dead) return;

  const tempBefore = (tgt.temp_hp as number | null) ?? 0;
  const hpBefore = (tgt.current_hp as number | null) ?? 0;
  const tempAfter = Math.max(0, tempBefore - input.damage);
  const toHp = Math.max(0, input.damage - tempBefore);
  const hpAfter = Math.max(0, hpBefore - toHp);
  const droppedTo0 = hpAfter === 0 && hpBefore > 0;
  const isCharacter = tgt.participant_type === 'character';
  const monsterDied = droppedTo0 && !isCharacter;

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

  if (droppedTo0) {
    await emitCombatEvent({
      campaignId: input.campaignId,
      encounterId: input.encounterId,
      chainId: input.chainId,
      sequence: 2,
      actorType: 'system',
      actorName: 'System',
      targetType: input.targetType as any,
      targetName: input.targetName,
      eventType: monsterDied ? 'died' : 'dropped_to_0_hp',
      payload: { via: 'aura', aura_name: input.auraName, damage: input.damage },
    });
  } else if (isCharacter) {
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

// ─── Trigger: movement ───────────────────────────────────────────

/**
 * Called after a token move is logged. Handles both movement triggers:
 *
 *   A) the mover walked into someone else's Emanation
 *      ("a creature enters the Emanation")
 *   B) the mover IS an origin, so its Emanation swept over creatures
 *      that were previously outside it
 *      ("the Emanation enters a creature's space")
 *
 * Both compare BEFORE vs AFTER: a creature already inside that merely
 * shuffles within the area does not save again, per RAW.
 */
export async function evaluateAurasOnMovement(input: {
  campaignId: string;
  encounterId: string;
  moverParticipantId: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}): Promise<void> {
  const auras = await listActiveAuras(input.campaignId, input.encounterId);
  if (auras.length === 0) return;

  const { data: rowsRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, ' + JOINED_COMBATANT_FIELDS)
    .eq('encounter_id', input.encounterId);
  const rows = ((rowsRaw ?? []) as any[]).map(normalizeParticipantRow);
  const byId = new Map<string, any>(rows.map((r: any) => [r.id, r]));

  const { loadActiveBattleMap, findTokenForParticipant } = await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(input.campaignId);
  if (!bmap) return;

  const mover = byId.get(input.moverParticipantId);
  if (!mover || mover.is_dead) return;
  const moverToken = findTokenForParticipant(
    { id: mover.id, name: mover.name, participant_type: mover.participant_type, entity_id: mover.entity_id },
    bmap.tokens,
  );
  const moverSize = Math.max(1, (moverToken?.size as number) ?? 1);
  const moverBefore = footprintAt(input.fromRow, input.fromCol, moverSize);
  const moverAfter = footprintAt(input.toRow, input.toCol, moverSize);

  for (const aura of auras) {
    const eligible = (participantId: string) =>
      participantId !== aura.originParticipantId &&
      !aura.spec.exemptParticipantIds.includes(participantId);

    // ── Case B: the origin itself moved; the area swept.
    if (aura.originParticipantId === input.moverParticipantId) {
      if (!aura.spec.triggers.includes('emanation_entered')) continue;
      const originBefore = footprintAt(input.fromRow, input.fromCol, aura.originSize);
      const originAfter = footprintAt(input.toRow, input.toCol, aura.originSize);
      for (const r of rows) {
        if (!eligible(r.id) || r.is_dead) continue;
        if (aura.spec.affects === 'enemies' &&
            (mover.participant_type === 'character') === (r.participant_type === 'character')) continue;
        const tok = findTokenForParticipant(
          { id: r.id, name: r.name, participant_type: r.participant_type, entity_id: r.entity_id },
          bmap.tokens,
        );
        if (!tok) continue;
        const rect = footprintAt(tok.row, tok.col, Math.max(1, (tok.size as number) ?? 1));
        const was = isInsideEmanation(originBefore, rect, aura.spec.radiusFt);
        const now = isInsideEmanation(originAfter, rect, aura.spec.radiusFt);
        if (!was && now) {
          await resolveAuraSave({
            campaignId: input.campaignId,
            encounterId: input.encounterId,
            aura,
            targetParticipantId: r.id as string,
            targetName: r.name as string,
            targetType: r.participant_type as string,
            trigger: 'emanation_entered',
          });
        }
      }
      continue;
    }

    // ── Case A: someone walked into a stationary origin's area.
    if (!aura.spec.triggers.includes('creature_entered')) continue;
    if (!eligible(input.moverParticipantId)) continue;
    if (aura.spec.affects === 'enemies') {
      const origin = byId.get(aura.originParticipantId);
      if (origin && (origin.participant_type === 'character') === (mover.participant_type === 'character')) continue;
    }
    const originRect = footprintAt(aura.originRow, aura.originCol, aura.originSize);
    const was = isInsideEmanation(originRect, moverBefore, aura.spec.radiusFt);
    const now = isInsideEmanation(originRect, moverAfter, aura.spec.radiusFt);
    if (!was && now) {
      await resolveAuraSave({
        campaignId: input.campaignId,
        encounterId: input.encounterId,
        aura,
        targetParticipantId: mover.id as string,
        targetName: mover.name as string,
        targetType: mover.participant_type as string,
        trigger: 'creature_entered',
      });
    }
  }
}

// ─── Trigger: end of turn ────────────────────────────────────────

/**
 * "…or ends its turn there." Called from advanceTurn for the OUTGOING
 * participant, before per-turn markers are cleared.
 */
export async function evaluateAurasOnTurnEnd(input: {
  campaignId: string;
  encounterId: string;
  participantId: string;
}): Promise<void> {
  const auras = await listActiveAuras(input.campaignId, input.encounterId);
  if (auras.length === 0) return;

  const { data: rowRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, ' + JOINED_COMBATANT_FIELDS)
    .eq('id', input.participantId)
    .maybeSingle();
  if (!rowRaw) return;
  const row = normalizeParticipantRow(rowRaw);
  if (row.is_dead) return;

  const { loadActiveBattleMap, findTokenForParticipant } = await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(input.campaignId);
  if (!bmap) return;
  const tok = findTokenForParticipant(
    { id: row.id, name: row.name, participant_type: row.participant_type, entity_id: row.entity_id },
    bmap.tokens,
  );
  if (!tok) return;
  const rect = footprintAt(tok.row, tok.col, Math.max(1, (tok.size as number) ?? 1));

  for (const aura of auras) {
    if (!aura.spec.triggers.includes('turn_end')) continue;
    if (aura.originParticipantId === row.id) continue;          // origin excluded
    if (aura.spec.exemptParticipantIds.includes(row.id as string)) continue;
    const originRect = footprintAt(aura.originRow, aura.originCol, aura.originSize);
    if (!isInsideEmanation(originRect, rect, aura.spec.radiusFt)) continue;
    await resolveAuraSave({
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

  const { loadActiveBattleMap, findTokenForParticipant } = await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(input.campaignId);
  if (!bmap) return 1;

  const { data: rowRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id')
    .eq('id', input.participantId)
    .maybeSingle();
  if (!rowRaw) return 1;
  const tok = findTokenForParticipant(rowRaw, bmap.tokens);
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
