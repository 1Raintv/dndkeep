// v2.633.0 — Weapon Mastery: Cleave (SRD 5.2.1, CC-BY-4.0).
//
// RAW (Cleave property, verbatim in data/weaponMastery.ts):
//   "If you hit a creature with a melee attack roll using this weapon,
//    you can make a melee attack roll with the weapon against a second
//    creature within 5 feet of the first that is also within your
//    reach. On a hit, the second creature takes the weapon's damage,
//    but don't add your ability modifier to that damage unless that
//    modifier is negative. You can make this extra attack only once
//    per turn."
//
// Four RAW obligations, and how each is met:
//   1. "melee attack roll ... hit"  — offerCleave is called from the
//      on-hit rider hook in applyDamage and additionally gates on
//      attack_kind === 'attack_roll', hit_result hit/crit, and
//      isMeleeMasteryWeapon().
//   2. "second creature within 5 ft of the first that is also within
//      your reach" — footprint-aware Chebyshev geometry off the active
//      battle map (same helpers as opportunity attacks). Reach comes
//      from the SRD Reach property (Halberd 10 ft, Greataxe 5 ft).
//      NOTE: RAW says "a second creature" with no hostility clause, so
//      allies are legitimate (if unwise) targets and are NOT filtered.
//   3. "don't add your ability modifier ... unless negative" —
//      stripAbilityModFromDamage subtracts only a POSITIVE modifier
//      out of the flat term, so a magic weapon's +N survives.
//   4. "only once per turn" — combat_participants.once_per_turn_used,
//      a general text[] marker array cleared at the participant's turn
//      start in advanceTurn. Deliberately generic: Sneak Attack and
//      Nick land in the same array later.
//
// The offer itself rides on pending_reactions (reaction_key 'cleave').
// That table already carries offer state, a 120s timer, realtime, and
// RLS that lets the owning player see and decide their own offer — a
// dedicated table would duplicate all four. Cleave is NOT a reaction
// and costs no reaction; ReactionPromptModal filters reaction_key
// 'cleave' out so only CleaveOfferModal renders it.
//
// Deliberately NOT faked through attacks_remaining: that path would
// add the ability modifier to damage, which is exactly what Cleave
// forbids.

import { supabase } from './supabase';
import { checkedWrite } from './api/checked';
import { emitCombatEvent, newChainId } from './combatEvents';
import { weaponReachFt, isMeleeMasteryWeapon } from '../data/weaponMastery';
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from './combatParticipantNormalize';
import type { PendingAttack } from '../types';

/** Marker written into combat_participants.once_per_turn_used. */
export const CLEAVE_ONCE_KEY = 'weapon_mastery_cleave';

/** Offer lifetime, matching the other reaction-style offers. */
const CLEAVE_TIMER_SECONDS = 120;

/** RAW: the second creature must be within 5 feet of the first. */
const CLEAVE_SPREAD_FT = 5;

/** Fallback reach when the weapon name isn't in the SRD table. */
const DEFAULT_REACH_FT = 5;

export interface CleaveCandidate {
  participant_id: string;
  name: string;
  participant_type: string;
  ac: number | null;
  /** Distance from the FIRST target, in feet. null when unverified. */
  distance_from_first_ft: number | null;
}

export interface CleaveOfferPayload {
  source_attack_id: string;
  weapon: string;
  damage_dice: string;
  damage_type: string | null;
  attack_bonus: number | null;
  reach_ft: number;
  first_target_participant_id: string;
  first_target_name: string;
  candidates: CleaveCandidate[];
  /** false when no active battle map (or no token for the first
   *  target) — candidates are then every other living creature in the
   *  encounter and the picker warns that positions are unverified. */
  positions_known: boolean;
}

// ─── Damage math ─────────────────────────────────────────────────

/**
 * Remove the attacker's ability modifier from a weapon damage
 * expression, per Cleave. A NEGATIVE modifier is left in place ("...
 * unless that modifier is negative"), and only the modifier itself is
 * removed — any remaining flat bonus (a +1 weapon, Rage damage, a
 * Fighting Style rider) stays, because Cleave only excludes the
 * ability modifier.
 *
 *   "1d12+4", mod +4  → "1d12"      (Greataxe, Str +4)
 *   "1d10+5", mod +4  → "1d10+1"    (Halberd +1, Str +4 — magic survives)
 *   "1d12-1", mod -1  → "1d12-1"    (negative modifier IS added)
 *   "1d12+4", mod  0  → "1d12+4"    (nothing to remove)
 *
 * Unparseable expressions are returned untouched (fail open — the DM
 * can still fudge the number in AttackResolutionModal).
 */
export function stripAbilityModFromDamage(
  expr: string | null | undefined,
  abilityMod: number,
): string {
  const raw = (expr ?? '').trim();
  if (!raw) return raw;
  if (abilityMod <= 0) return raw;   // negative stays; zero is a no-op
  const m = /^\s*(\d+)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(raw);
  if (!m) return raw;
  const flat = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
  const next = flat - abilityMod;
  const tail = next === 0 ? '' : next > 0 ? `+${next}` : `${next}`;
  return `${m[1]}d${m[2]}${tail}`;
}

// ─── Once-per-turn marker ────────────────────────────────────────

async function hasUsedThisTurn(participantId: string, key: string): Promise<boolean> {
  // (supabase as any): generated types predate once_per_turn_used.
  const { data } = await (supabase as any)
    .from('combat_participants')
    .select('once_per_turn_used')
    .eq('id', participantId)
    .maybeSingle();
  const used = ((data?.once_per_turn_used ?? []) as string[]);
  return used.includes(key);
}

/** Append a once-per-turn marker. Idempotent. Exported so Sneak Attack
 *  and Nick can share the array when they land. */
export async function markUsedThisTurn(participantId: string, key: string): Promise<void> {
  const { data } = await (supabase as any)
    .from('combat_participants')
    .select('once_per_turn_used')
    .eq('id', participantId)
    .maybeSingle();
  const used = ((data?.once_per_turn_used ?? []) as string[]);
  if (used.includes(key)) return;
  await checkedWrite('combat_participants.update once-per-turn', { participantId }, (supabase as any)
    .from('combat_participants')
    .update({ once_per_turn_used: [...used, key] })
    .eq('id', participantId));
}

// ─── Candidate geometry ──────────────────────────────────────────

/**
 * Creatures eligible for the Cleave follow-up: within 5 ft of the
 * first target AND within the attacker's reach, excluding the attacker
 * and the first target, excluding the dead.
 *
 * Fails OPEN when there's no active battle map (or the first target
 * has no token): returns every other living creature with
 * positions_known=false, so theater-of-the-mind tables still get the
 * automation and the human adjudicates adjacency. Compare to
 * opportunity attacks, which fail CLOSED — there the whole trigger is
 * positional, whereas here the trigger (a hit) already happened and
 * only the target list is positional.
 */
export async function findCleaveCandidates(input: {
  campaignId: string;
  encounterId: string;
  attackerParticipantId: string;
  firstTargetParticipantId: string;
  reachFt: number;
}): Promise<{ candidates: CleaveCandidate[]; positionsKnown: boolean }> {
  const { data: rowsRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, ac, ' + JOINED_COMBATANT_FIELDS)
    .eq('encounter_id', input.encounterId);
  const rows = ((rowsRaw ?? []) as any[]).map(normalizeParticipantRow);

  const others = rows.filter(
    (r: any) =>
      r.id !== input.attackerParticipantId &&
      r.id !== input.firstTargetParticipantId &&
      !r.is_dead,
  );

  const toCandidate = (r: any, dist: number | null): CleaveCandidate => ({
    participant_id: r.id as string,
    name: r.name as string,
    participant_type: r.participant_type as string,
    ac: (r.ac as number | null) ?? null,
    distance_from_first_ft: dist,
  });

  const { loadActiveBattleMap, findTokenForParticipant, distanceBetweenTokensFt } =
    await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(input.campaignId);
  const lookup = (r: any) =>
    findTokenForParticipant(
      { id: r.id, name: r.name, participant_type: r.participant_type, entity_id: r.entity_id },
      bmap?.tokens ?? [],
    );

  const attackerRow = rows.find((r: any) => r.id === input.attackerParticipantId);
  const firstRow = rows.find((r: any) => r.id === input.firstTargetParticipantId);
  const firstToken = bmap && firstRow ? lookup(firstRow) : null;
  const attackerToken = bmap && attackerRow ? lookup(attackerRow) : null;

  if (!bmap || !firstToken || !attackerToken) {
    return { candidates: others.map((r: any) => toCandidate(r, null)), positionsKnown: false };
  }

  const candidates: CleaveCandidate[] = [];
  for (const r of others) {
    const tok = lookup(r);
    if (!tok) continue;   // on-map resolution: an untokened creature can't be placed
    const fromFirst = distanceBetweenTokensFt(firstToken, tok);
    if (fromFirst > CLEAVE_SPREAD_FT) continue;
    const fromAttacker = distanceBetweenTokensFt(attackerToken, tok);
    if (fromAttacker > input.reachFt) continue;
    candidates.push(toCandidate(r, fromFirst));
  }
  candidates.sort((a, b) => (a.distance_from_first_ft ?? 0) - (b.distance_from_first_ft ?? 0));
  return { candidates, positionsKnown: true };
}

// ─── Offer ───────────────────────────────────────────────────────

/**
 * Create the Cleave offer for a qualifying hit. Called from the on-hit
 * mastery rider hook. No-ops (silently) whenever any RAW precondition
 * fails, so callers don't need their own gates.
 */
export async function offerCleave(input: {
  atk: PendingAttack;
  abilityMod: number;
}): Promise<boolean> {
  const { atk, abilityMod } = input;
  if (!atk.encounter_id) return false;
  if (!atk.attacker_participant_id || !atk.target_participant_id) return false;
  if (atk.attack_kind !== 'attack_roll') return false;
  if (atk.hit_result !== 'hit' && atk.hit_result !== 'crit') return false;
  if (!isMeleeMasteryWeapon(atk.attack_name)) return false;

  // RAW: once per turn.
  if (await hasUsedThisTurn(atk.attacker_participant_id, CLEAVE_ONCE_KEY)) return false;

  // Don't stack a second offer on an outstanding one (e.g. two hits in
  // the same Attack action before the first offer is decided).
  const { data: openRows } = await supabase
    .from('pending_reactions')
    .select('id')
    .eq('reactor_participant_id', atk.attacker_participant_id)
    .eq('reaction_key', 'cleave')
    .eq('state', 'offered')
    .limit(1);
  if ((openRows ?? []).length > 0) return false;

  const reachFt = weaponReachFt(atk.attack_name) ?? DEFAULT_REACH_FT;
  const { candidates, positionsKnown } = await findCleaveCandidates({
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
    attackerParticipantId: atk.attacker_participant_id,
    firstTargetParticipantId: atk.target_participant_id,
    reachFt,
  });
  if (candidates.length === 0) return false;   // nothing to cleave into

  const payload: CleaveOfferPayload = {
    source_attack_id: atk.id,
    weapon: atk.attack_name,
    damage_dice: stripAbilityModFromDamage(atk.damage_dice, abilityMod),
    damage_type: atk.damage_type ?? null,
    attack_bonus: atk.attack_bonus ?? null,
    reach_ft: reachFt,
    first_target_participant_id: atk.target_participant_id,
    first_target_name: atk.target_name,
    candidates,
    positions_known: positionsKnown,
  };

  const offeredAt = new Date();
  const expiresAt = new Date(offeredAt.getTime() + CLEAVE_TIMER_SECONDS * 1000);
  // (supabase as any): pending_reactions' generated Insert type doesn't
  // model decision_payload's shape, and the existing offer writers in
  // pendingReaction.ts pass untyped literals for the same reason.
  const { error } = await (supabase as any).from('pending_reactions').insert({
    campaign_id: atk.campaign_id,
    pending_attack_id: null,       // the source attack is already applied
    reactor_participant_id: atk.attacker_participant_id,
    reactor_name: atk.attacker_name,
    reactor_type: 'character',
    reaction_key: 'cleave',
    reaction_name: 'Cleave',
    trigger_point: 'post_damage_applied',
    offered_at: offeredAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    decided_at: null,
    state: 'offered',
    decision_payload: payload as unknown as Record<string, unknown>,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[cleave] offer insert failed:', error.message);
    return false;
  }

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
      kind: 'mastery_cleave_offered',
      label: `Cleave (${atk.attack_name}): ${atk.attacker_name} may make one extra attack against a second creature within 5 ft of ${atk.target_name}.`,
      candidates: candidates.map(c => c.name),
      positions_known: positionsKnown,
    },
  });
  return true;
}

// ─── Decisions ───────────────────────────────────────────────────

/**
 * Take the Cleave attack against `targetParticipantId`. Marks the
 * once-per-turn flag FIRST so a double-click can't buy two extra
 * attacks, then declares + rolls a normal attack through the standard
 * pipeline (so cover, Sap/Vex markers, crits, and reactions all still
 * apply). Damage carries no ability modifier.
 */
export async function acceptCleave(
  offerId: string,
  targetParticipantId: string,
): Promise<void> {
  const { data: offerRow } = await supabase
    .from('pending_reactions')
    .select('*')
    .eq('id', offerId)
    .eq('state', 'offered')
    .maybeSingle();
  if (!offerRow) return;
  const offer = offerRow as any;
  const payload = (offer.decision_payload ?? {}) as CleaveOfferPayload;
  const candidate = (payload.candidates ?? []).find(
    c => c.participant_id === targetParticipantId,
  );
  if (!candidate) return;

  // Claim the offer before doing anything side-effectful.
  const { data: claimed } = await supabase
    .from('pending_reactions')
    .update({
      state: 'accepted',
      decided_at: new Date().toISOString(),
      decision_payload: {
        ...(payload as unknown as Record<string, unknown>),
        chosen_participant_id: targetParticipantId,
        chosen_name: candidate.name,
      },
    })
    .eq('id', offerId)
    .eq('state', 'offered')
    .select('id');
  if (!claimed || claimed.length === 0) return;   // lost the race

  await markUsedThisTurn(offer.reactor_participant_id as string, CLEAVE_ONCE_KEY);

  const { data: srcRow } = await supabase
    .from('pending_attacks')
    .select('campaign_id, encounter_id')
    .eq('id', payload.source_attack_id)
    .maybeSingle();

  const { declareAttack, rollAttackRoll } = await import('./pendingAttack');
  const attack = await declareAttack({
    campaignId: (srcRow?.campaign_id as string) ?? (offer.campaign_id as string),
    encounterId: (srcRow?.encounter_id as string | null) ?? null,
    attackerParticipantId: offer.reactor_participant_id as string,
    attackerName: offer.reactor_name as string,
    attackerType: 'character',
    targetParticipantId: candidate.participant_id,
    targetName: candidate.name,
    targetType: (candidate.participant_type === 'character' ? 'character' : 'creature') as any,
    attackSource: 'weapon',
    attackName: `${payload.weapon} (Cleave)`,
    attackKind: 'attack_roll',
    attackBonus: payload.attack_bonus ?? 0,
    targetAC: candidate.ac ?? null,
    damageDice: payload.damage_dice,
    damageType: payload.damage_type ?? undefined,
  });
  if (attack) await rollAttackRoll(attack.id);
}

/** Decline the Cleave offer. RAW makes the extra attack optional, and
 *  declining does NOT consume the once-per-turn allowance — no attack
 *  was made. */
export async function declineCleave(offerId: string): Promise<void> {
  await checkedWrite('pending_reactions.update decline-cleave', { offerId }, supabase
    .from('pending_reactions')
    .update({ state: 'declined', decided_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('state', 'offered'));
}
