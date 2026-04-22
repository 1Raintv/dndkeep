// v2.98.0 — Phase E of the Combat Backbone
//
// Reaction offer lifecycle + Shield (the reference implementation).
//
// Flow:
//  1. During attack resolution (e.g., after rollAttackRoll hits), the engine
//     calls offerReactionsFor(attack) which runs each entry in the REACTION
//     REGISTRY against the current state and creates pending_reactions rows
//     for any that match.
//  2. The DM's AttackResolutionModal and the reactor's ReactionPromptModal
//     both subscribe to pending_reactions. The DM sees "Waiting for reactions"
//     and the reactor sees a countdown modal with Accept/Decline.
//  3. accept() / decline() / expire() terminate the offer. When all offers
//     for a given attack are terminal, resolution resumes.
//  4. On accept, the reaction's handler runs (e.g., Shield adds +5 AC and
//     re-evaluates the hit_result).
//
// Design note: the registry pattern keeps each reaction self-contained so
// v2.99+ can add Absorb Elements / Uncanny Dodge / etc. without touching the
// central engine.

import { supabase } from './supabase';
import { emitCombatEvent } from './combatEvents';
import type { PendingAttack, PendingReaction, Character } from '../types';

const DEFAULT_TIMER_SECONDS = 120;

// ─── Registry ────────────────────────────────────────────────────

export interface ReactionRegistryEntry {
  key: string;
  name: string;
  /** When in the attack flow this reaction can trigger. */
  triggerPoint: 'post_attack_roll' | 'post_damage_roll' | 'pre_damage_applied' | 'movement_out_of_reach';
  /** Returns true if this reaction should be offered for the given state. */
  isEligible(ctx: ReactionEligibilityContext): boolean;
  /** Runs when a player/DM accepts the offer. Mutates pending_attack + emits log events. */
  onAccept(ctx: ReactionAcceptContext): Promise<void>;
}

export interface ReactionEligibilityContext {
  attack: PendingAttack;
  reactorCharacter?: Character | null;   // populated for character reactors
}

export interface ReactionAcceptContext {
  attack: PendingAttack;
  offer: PendingReaction;
  reactorCharacter?: Character | null;
  decisionPayload: Record<string, unknown> | null;
}

const REACTION_REGISTRY: ReactionRegistryEntry[] = [];

// ─── Shield ──────────────────────────────────────────────────────
// 2024 PHB — Reaction, 1st-level abjuration. Cast when a creature you can see
// hits you with an attack roll OR when you are targeted by Magic Missile.
// Effect: +5 bonus to AC until the start of your next turn, including against
// the triggering attack (potentially turning hit → miss).
//
// Conditions:
//   - Eligible only on 'hit' (not crit — 2024 RAW: crit auto-hits regardless).
//   - Reactor must be a character.
//   - Reactor must have at least one level-1+ spell slot remaining AND Shield
//     in known or prepared spells.
//   - Reactor must not have already used their reaction this turn.

REACTION_REGISTRY.push({
  key: 'shield',
  name: 'Shield',
  triggerPoint: 'post_attack_roll',
  isEligible(ctx) {
    const { attack, reactorCharacter } = ctx;
    if (!reactorCharacter) return false;
    if (attack.attack_kind !== 'attack_roll') return false;
    if (attack.hit_result !== 'hit') return false;  // can't help crit
    // Must be a spellcaster with Shield in known/prepared
    const known: string[] = (reactorCharacter as any).known_spells ?? [];
    const prepared: string[] = (reactorCharacter as any).prepared_spells ?? [];
    const hasShield =
      known.some(s => s.toLowerCase() === 'shield') ||
      prepared.some(s => s.toLowerCase() === 'shield');
    if (!hasShield) return false;
    // Must have an available level 1+ slot
    return lowestAvailableSlot(reactorCharacter) != null;
  },
  async onAccept(ctx) {
    const { attack, offer, reactorCharacter } = ctx;
    const levelUsed = (ctx.decisionPayload?.spell_level_used as number)
      ?? (reactorCharacter ? lowestAvailableSlot(reactorCharacter) : 1)
      ?? 1;

    // Consume the slot on the character
    if (reactorCharacter) {
      const slots = { ...(reactorCharacter as any).spell_slots } as Record<string, { total: number; used: number }>;
      const slot = slots[String(levelUsed)];
      if (slot && slot.used < slot.total) {
        slots[String(levelUsed)] = { total: slot.total, used: slot.used + 1 };
        await supabase.from('characters').update({ spell_slots: slots }).eq('id', reactorCharacter.id);
      }
    }

    // Mark reaction as used on participant
    await supabase
      .from('combat_participants')
      .update({ reaction_used: true })
      .eq('id', offer.reactor_participant_id);

    // Re-evaluate hit: +5 AC
    const newAc = (attack.target_ac ?? 10) + 5;
    const total = attack.attack_total ?? 0;
    const newHit = total >= newAc ? 'hit' : 'miss';

    await supabase
      .from('pending_attacks')
      .update({
        target_ac: newAc,
        hit_result: newHit,
      })
      .eq('id', attack.id);

    // Emit the reaction_used + updated attack_roll events on the same chain
    await emitCombatEvent({
      campaignId: attack.campaign_id,
      encounterId: attack.encounter_id,
      chainId: attack.chain_id,
      sequence: 50,
      actorType: 'player',
      actorName: offer.reactor_name,
      targetType: 'self',
      targetName: offer.reactor_name,
      eventType: 'reaction_used',
      payload: {
        reaction: 'Shield',
        spell_level_used: levelUsed,
        original_ac: attack.target_ac,
        new_ac: newAc,
        original_hit: attack.hit_result,
        new_hit: newHit,
      },
    });
  },
});

/** Lowest-level available spell slot on a character, or null. */
function lowestAvailableSlot(c: Character): number | null {
  const slots = (c as any).spell_slots as Record<string, { total: number; used: number }> | undefined;
  if (!slots) return null;
  for (let lvl = 1; lvl <= 9; lvl++) {
    const slot = slots[String(lvl)];
    if (slot && slot.used < slot.total) return lvl;
  }
  return null;
}

// ─── Uncanny Dodge ───────────────────────────────────────────────
// 2024 PHB — Rogue class feature, level 5+. When an attacker you can see hits
// you with an attack roll, you can use your reaction to halve the attack's
// damage against you. No spell slot required.
//
// Hook: post_damage_roll — fires after damage is known, before apply.

REACTION_REGISTRY.push({
  key: 'uncanny_dodge',
  name: 'Uncanny Dodge',
  triggerPoint: 'post_damage_roll',
  isEligible(ctx) {
    const { attack, reactorCharacter } = ctx;
    if (!reactorCharacter) return false;
    if (attack.attack_kind !== 'attack_roll') return false;
    if (attack.hit_result !== 'hit' && attack.hit_result !== 'crit') return false;
    // Must be a Rogue level 5+ (exact match or multiclass mention)
    const cls: string = (reactorCharacter.class_name ?? '').toLowerCase();
    const lvl: number = reactorCharacter.level ?? 0;
    if (!cls.includes('rogue')) return false;
    if (lvl < 5) return false;
    // Damage must actually exist to halve
    if ((attack.damage_final ?? 0) <= 0) return false;
    return true;
  },
  async onAccept(ctx) {
    const { attack, offer } = ctx;
    const original = attack.damage_final ?? 0;
    const halved = Math.floor(original / 2);

    await supabase
      .from('pending_attacks')
      .update({ damage_final: halved })
      .eq('id', attack.id);

    await supabase
      .from('combat_participants')
      .update({ reaction_used: true })
      .eq('id', offer.reactor_participant_id);

    await emitCombatEvent({
      campaignId: attack.campaign_id,
      encounterId: attack.encounter_id,
      chainId: attack.chain_id,
      sequence: 51,
      actorType: 'player',
      actorName: offer.reactor_name,
      targetType: 'self',
      targetName: offer.reactor_name,
      eventType: 'reaction_used',
      payload: {
        reaction: 'Uncanny Dodge',
        original_damage: original,
        halved_damage: halved,
      },
    });
  },
});

// ─── Absorb Elements ─────────────────────────────────────────────
// 2024 PHB — 1st-level abjuration. Reaction when you take acid, cold, fire,
// lightning, or thunder damage. Gain resistance (half damage) to the trigger's
// damage type for the triggering attack. Next melee attack you make on your
// next turn deals +1d6 extra damage of the triggering type.
//
// Hook: post_damage_roll — similar to Uncanny Dodge but type-gated.
// Rider effect (+1d6 on next melee) is recorded in the event payload for now;
// full buff plumbing arrives in Phase H.

const ABSORB_ELEMENTS_TYPES = ['acid', 'cold', 'fire', 'lightning', 'thunder'];

REACTION_REGISTRY.push({
  key: 'absorb_elements',
  name: 'Absorb Elements',
  triggerPoint: 'post_damage_roll',
  isEligible(ctx) {
    const { attack, reactorCharacter } = ctx;
    if (!reactorCharacter) return false;
    const dmgType = (attack.damage_type ?? '').toLowerCase();
    if (!ABSORB_ELEMENTS_TYPES.includes(dmgType)) return false;
    if ((attack.damage_final ?? 0) <= 0) return false;
    // Must know or prepare Absorb Elements
    const known: string[] = (reactorCharacter as any).known_spells ?? [];
    const prepared: string[] = (reactorCharacter as any).prepared_spells ?? [];
    const hasIt =
      known.some(s => s.toLowerCase() === 'absorb elements') ||
      prepared.some(s => s.toLowerCase() === 'absorb elements');
    if (!hasIt) return false;
    return lowestAvailableSlot(reactorCharacter) != null;
  },
  async onAccept(ctx) {
    const { attack, offer, reactorCharacter } = ctx;
    const levelUsed = (ctx.decisionPayload?.spell_level_used as number)
      ?? (reactorCharacter ? lowestAvailableSlot(reactorCharacter) : 1)
      ?? 1;

    if (reactorCharacter) {
      const slots = { ...(reactorCharacter as any).spell_slots } as Record<string, { total: number; used: number }>;
      const slot = slots[String(levelUsed)];
      if (slot && slot.used < slot.total) {
        slots[String(levelUsed)] = { total: slot.total, used: slot.used + 1 };
        await supabase.from('characters').update({ spell_slots: slots }).eq('id', reactorCharacter.id);
      }
    }

    await supabase
      .from('combat_participants')
      .update({ reaction_used: true })
      .eq('id', offer.reactor_participant_id);

    const original = attack.damage_final ?? 0;
    const halved = Math.floor(original / 2);

    await supabase
      .from('pending_attacks')
      .update({ damage_final: halved })
      .eq('id', attack.id);

    // v2.114.0 — Phase H pt 5: apply the rider buff. "Until the end of your
    // next turn, the first time you hit with a melee attack on your next
    // turn, the weapon deals an extra 1d6 damage of the triggering type."
    // Modeled as a single-use melee damage rider. We don't track "next turn
    // only" timing yet (Phase I work), so the rider simply persists until
    // consumed by the first qualifying attack.
    const damageType = (attack.damage_type ?? '').toLowerCase();

    // v2.119.0 — Phase I: respect the 'absorb_elements_rider_auto' automation.
    // When off, the damage halving still happens but the rider isn't auto-
    // applied — the player tracks it manually. Uses reactor's character for
    // per-character override + campaign default.
    const { data: campRow } = await supabase
      .from('campaigns')
      .select('automation_defaults')
      .eq('id', attack.campaign_id)
      .maybeSingle();
    const { resolveAutomation } = await import('./automations');
    const riderSetting = resolveAutomation(
      'absorb_elements_rider_auto',
      reactorCharacter as any,
      campRow as any,
    );
    let riderApplied = false;
    if (riderSetting !== 'off') {
      const { applyBuff } = await import('./buffs');
      await applyBuff({
        participantId: offer.reactor_participant_id,
        buff: {
          key: 'absorb_elements_rider',
          name: 'Absorb Elements rider',
          source: 'reaction:absorb_elements',
          damageRider: { dice: '1d6', damageType },
          onlyMelee: true,
          singleUse: true,
        },
        campaignId: attack.campaign_id,
        encounterId: attack.encounter_id,
      });
      riderApplied = true;
    }

    await emitCombatEvent({
      campaignId: attack.campaign_id,
      encounterId: attack.encounter_id,
      chainId: attack.chain_id,
      sequence: 52,
      actorType: 'player',
      actorName: offer.reactor_name,
      targetType: 'self',
      targetName: offer.reactor_name,
      eventType: 'reaction_used',
      payload: {
        reaction: 'Absorb Elements',
        spell_level_used: levelUsed,
        damage_type: attack.damage_type,
        original_damage: original,
        halved_damage: halved,
        rider: {
          description: '+1d6 of triggering damage type on your next melee attack',
          damage_type: attack.damage_type,
          applied: riderApplied,
          automation_setting: riderSetting,
        },
      },
    });
  },
});

// ─── Public helpers ──────────────────────────────────────────────

/**
 * Evaluate the registry against the current state and create pending_reactions
 * offers for every eligible reactor. Called at each trigger point in
 * pendingAttack.ts (currently: right after rollAttackRoll when hit/crit).
 * Returns the number of offers created.
 */
export async function offerReactionsFor(
  attack: PendingAttack,
  triggerPoint: 'post_attack_roll' | 'post_damage_roll' | 'pre_damage_applied',
): Promise<number> {
  // Load the target participant and — if character — its character row
  if (!attack.target_participant_id) return 0;
  const { data: tgt } = await supabase
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, reaction_used')
    .eq('id', attack.target_participant_id)
    .single();
  if (!tgt) return 0;
  if (tgt.reaction_used) return 0;              // already used reaction this round

  let reactorChar: Character | null = null;
  if (tgt.participant_type === 'character') {
    const { data: c } = await supabase
      .from('characters')
      .select('*')
      .eq('id', tgt.entity_id)
      .single();
    reactorChar = (c as Character) ?? null;
  }

  const candidates = REACTION_REGISTRY.filter(r => r.triggerPoint === triggerPoint);
  const offers: Omit<PendingReaction, 'id' | 'created_at' | 'updated_at'>[] = [];

  for (const entry of candidates) {
    if (entry.isEligible({ attack, reactorCharacter: reactorChar })) {
      const offeredAt = new Date();
      const expiresAt = new Date(offeredAt.getTime() + DEFAULT_TIMER_SECONDS * 1000);
      offers.push({
        campaign_id: attack.campaign_id,
        pending_attack_id: attack.id,
        reactor_participant_id: tgt.id,
        reactor_name: tgt.name,
        reactor_type: tgt.participant_type as 'character' | 'monster' | 'npc',
        reaction_key: entry.key,
        reaction_name: entry.name,
        trigger_point: triggerPoint,
        offered_at: offeredAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        decided_at: null,
        state: 'offered',
        decision_payload: null,
      });
    }
  }

  if (offers.length > 0) {
    await supabase.from('pending_reactions').insert(offers);
  }

  return offers.length;
}

/**
 * Player/DM accepts an offered reaction. Runs the registry entry's onAccept
 * hook, which mutates the pending_attack and emits the reaction_used event.
 */
export async function acceptReaction(
  offerId: string,
  decisionPayload?: Record<string, unknown>,
): Promise<void> {
  const { data: offerRow } = await supabase
    .from('pending_reactions')
    .select('*')
    .eq('id', offerId)
    .single();
  if (!offerRow) return;
  const offer = offerRow as PendingReaction;
  if (offer.state !== 'offered') return;

  const { data: atk } = await supabase
    .from('pending_attacks')
    .select('*')
    .eq('id', offer.pending_attack_id)
    .single();
  if (!atk) return;

  let reactorChar: Character | null = null;
  if (offer.reactor_type === 'character') {
    const { data: part } = await supabase
      .from('combat_participants')
      .select('entity_id')
      .eq('id', offer.reactor_participant_id)
      .single();
    if (part) {
      const { data: c } = await supabase
        .from('characters')
        .select('*')
        .eq('id', part.entity_id)
        .single();
      reactorChar = (c as Character) ?? null;
    }
  }

  const entry = REACTION_REGISTRY.find(e => e.key === offer.reaction_key);
  if (!entry) return;

  await entry.onAccept({
    attack: atk as PendingAttack,
    offer,
    reactorCharacter: reactorChar,
    decisionPayload: decisionPayload ?? null,
  });

  await supabase
    .from('pending_reactions')
    .update({
      state: 'accepted',
      decided_at: new Date().toISOString(),
      decision_payload: decisionPayload ?? null,
    })
    .eq('id', offerId);
}

/** Decline an offer (terminal state). */
export async function declineReaction(offerId: string): Promise<void> {
  await supabase
    .from('pending_reactions')
    .update({
      state: 'declined',
      decided_at: new Date().toISOString(),
    })
    .eq('id', offerId)
    .eq('state', 'offered');
}

/** Mark offer expired (terminal). Called by client-side timer or janitor. */
export async function expireReaction(offerId: string): Promise<void> {
  await supabase
    .from('pending_reactions')
    .update({
      state: 'expired',
      decided_at: new Date().toISOString(),
    })
    .eq('id', offerId)
    .eq('state', 'offered');
}

/** Are there any outstanding offers blocking this attack from advancing? */
export async function hasPendingOffers(attackId: string): Promise<boolean> {
  const { count } = await supabase
    .from('pending_reactions')
    .select('*', { count: 'exact', head: true })
    .eq('pending_attack_id', attackId)
    .eq('state', 'offered');
  return (count ?? 0) > 0;
}

// ─── Opportunity Attacks ─────────────────────────────────────────
// v2.109.0 — Phase G pt 3: when a creature moves, find hostiles whose reach
// they just left and create OA offers for each. 2024 PHB defines OA as a
// reaction with standard 5-ft reach (weapons with Reach property extend to
// 10 ft — not modeled here yet; future polish).
//
// Architectural note: OA is different from Shield/UD/AE because:
//   - It's triggered by a movement event, not an attack
//   - It creates a NEW attack (the reactor's swing), not modifying one
//   - pending_attack_id on the offer row stays NULL
// So this lives as its own helper rather than a registry entry.

export interface OfferOpportunityAttacksInput {
  campaignId: string;
  encounterId: string | null;
  moverParticipantId: string;
  moverName: string;
  moverType: 'character' | 'monster' | 'npc';
  moverDisengaged: boolean;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

/** How many grid cells a standard melee weapon reaches (5 ft). */
const STANDARD_REACH_CELLS = 1;
/** Max turn timer for reaction offers, matching other reactions. */
const OA_TIMER_SECONDS = 120;

export async function offerOpportunityAttacks(
  input: OfferOpportunityAttacksInput,
): Promise<number> {
  // Disengaged suppresses all OAs per 2024 PHB
  if (input.moverDisengaged) return 0;

  // v2.119.0 — Phase I: respect the 'opportunity_attack_offers' automation.
  // When campaign default is 'off', no offers are created (gritty manual
  // call-out). Per-character override isn't meaningful here since OA offers
  // are cross-creature — we only check the campaign default.
  const { data: campRow } = await supabase
    .from('campaigns')
    .select('automation_defaults')
    .eq('id', input.campaignId)
    .maybeSingle();
  const { resolveAutomation } = await import('./automations');
  const oaSetting = resolveAutomation('opportunity_attack_offers', null, campRow as any);
  if (oaSetting === 'off') return 0;

  // Load the campaign's active battle map tokens so we can find who's where
  const { data: bm } = await supabase
    .from('battle_maps')
    .select('tokens')
    .eq('campaign_id', input.campaignId)
    .eq('active', true)
    .maybeSingle();
  const tokens = ((bm?.tokens as any[]) ?? null);
  if (!tokens || tokens.length === 0) return 0;

  // All combat participants in this encounter (we only OA between combatants)
  if (!input.encounterId) return 0;
  const { data: pdata } = await supabase
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, is_dead, reaction_used')
    .eq('encounter_id', input.encounterId);
  const participants = (pdata ?? []) as Array<{
    id: string; name: string; participant_type: 'character' | 'monster' | 'npc';
    entity_id: string; is_dead: boolean; reaction_used: boolean;
  }>;

  // Eligibility checks per candidate reactor:
  //   - Not the mover
  //   - Not dead
  //   - Hasn't used their reaction this turn
  //   - Token present on the map
  //   - Hostile to the mover (participant_type differs — characters vs
  //     monsters/npcs — same-type pairs don't provoke)
  //   - Distance to mover's FROM position ≤ reach
  //   - Distance to mover's TO position > reach
  const offers: any[] = [];
  for (const reactor of participants) {
    if (reactor.id === input.moverParticipantId) continue;
    if (reactor.is_dead) continue;
    if (reactor.reaction_used) continue;

    // Hostility: characters are hostile to monsters/npcs and vice versa.
    // Future Phase H can expand with per-campaign factions if needed.
    const hostile =
      (input.moverType === 'character') !== (reactor.participant_type === 'character');
    if (!hostile) continue;

    // Find reactor's token on the battle map
    const token = tokens.find((t: any) => {
      if (!t || typeof t.row !== 'number' || typeof t.col !== 'number') return false;
      if (reactor.participant_type === 'character') return t.character_id === reactor.entity_id;
      return (t.name ?? '').toLowerCase() === reactor.name.toLowerCase();
    });
    if (!token) continue;

    const cellsFromStart = Math.max(
      Math.abs(token.row - input.fromRow),
      Math.abs(token.col - input.fromCol),
    );
    const cellsFromEnd = Math.max(
      Math.abs(token.row - input.toRow),
      Math.abs(token.col - input.toCol),
    );

    const hadInReach = cellsFromStart <= STANDARD_REACH_CELLS;
    const stillInReach = cellsFromEnd <= STANDARD_REACH_CELLS;
    if (!hadInReach || stillInReach) continue;

    const offeredAt = new Date();
    const expiresAt = new Date(offeredAt.getTime() + OA_TIMER_SECONDS * 1000);
    offers.push({
      campaign_id: input.campaignId,
      pending_attack_id: null,
      reactor_participant_id: reactor.id,
      reactor_name: reactor.name,
      reactor_type: reactor.participant_type,
      reaction_key: 'opportunity_attack',
      reaction_name: 'Opportunity Attack',
      trigger_point: 'movement_out_of_reach',
      offered_at: offeredAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      decided_at: null,
      state: 'offered',
      decision_payload: {
        mover_participant_id: input.moverParticipantId,
        mover_name: input.moverName,
        mover_type: input.moverType,
        from: { row: input.fromRow, col: input.fromCol },
        to: { row: input.toRow, col: input.toCol },
      },
    });
  }

  if (offers.length > 0) {
    await supabase.from('pending_reactions').insert(offers);
  }

  return offers.length;
}
