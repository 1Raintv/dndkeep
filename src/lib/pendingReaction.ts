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
import { emitCombatEvent, newChainId } from './combatEvents';
import type { PendingAttack, PendingReaction, Character } from '../types';

// v2.316: HP/conditions/buffs/death-save reads come from combatants
// via JOIN. See src/lib/combatParticipantNormalize.ts.
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from './combatParticipantNormalize';

const DEFAULT_TIMER_SECONDS = 120;

// ─── Registry ────────────────────────────────────────────────────

export interface ReactionRegistryEntry {
  key: string;
  name: string;
  /** When in the attack flow this reaction can trigger. */
  triggerPoint: 'post_attack_roll' | 'post_damage_roll' | 'pre_damage_applied' | 'movement_out_of_reach' | 'spell_declared';
  /** Returns true if this reaction should be offered for the given state. */
  isEligible(ctx: ReactionEligibilityContext): boolean;
  /** Runs when a player/DM accepts the offer. Mutates pending_attack + emits log events. */
  onAccept(ctx: ReactionAcceptContext): Promise<void>;
}

export interface ReactionEligibilityContext {
  /** null for spell_declared triggers (Counterspell) — the "attack" hasn't happened. */
  attack: PendingAttack | null;
  reactorCharacter?: Character | null;   // populated for character reactors
  /** v2.128.0 — Phase K: distance from reactor's token to the attacker's
   *  token on the active battle map, in feet. `null` if either token is
   *  missing or no map is active (caller should treat as "fail open" —
   *  distance-gated reactions return true when this is null). */
  reactorToAttackerFt?: number | null;
}

export interface ReactionAcceptContext {
  /** null for spell_declared triggers — handler reads decision_payload instead. */
  attack: PendingAttack | null;
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
    if (!attack) return false;
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
    if (!attack) return;
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
    if (!attack) return false;
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
    if (!attack) return;
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
    if (!attack) return false;
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
    if (!attack) return;
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

// ─── Hellish Rebuke ──────────────────────────────────────────────
// v2.121.0 — Phase J pt 1.
// 1st-level evocation spell. Reaction when the caster takes damage from a
// creature within 60 ft that they can see.
// Target makes a DEX save against caster's spell DC:
//   fail → 2d10 fire, half on success
//   upcast: +1d10 per slot above 1st
//
// Implementation notes:
//   - Uses the existing pending_reactions table (trigger=post_damage_roll,
//     same as Absorb Elements + Uncanny Dodge — damage_final is known).
//   - On accept, burns a slot and declareAttack()'s a NEW save-based
//     counter-attack targeting the original attacker. That attack then
//     flows through the DM's AttackResolutionModal like any other save
//     spell. We don't auto-resolve here because the DM owns the monster's
//     DEX save anyway.

REACTION_REGISTRY.push({
  key: 'hellish_rebuke',
  name: 'Hellish Rebuke',
  triggerPoint: 'post_damage_roll',
  isEligible(ctx) {
    const { attack, reactorCharacter, reactorToAttackerFt } = ctx;
    if (!attack) return false;   // HR only fires post-damage, attack must exist
    if (!reactorCharacter) return false;
    // Must actually take damage
    if ((attack.damage_final ?? 0) <= 0) return false;
    // Need a defined attacker to retaliate against
    if (!attack.attacker_participant_id) return false;
    // Must know or prepare Hellish Rebuke
    const known: string[] = (reactorCharacter as any).known_spells ?? [];
    const prepared: string[] = (reactorCharacter as any).prepared_spells ?? [];
    const hasIt =
      known.some(s => s.toLowerCase() === 'hellish rebuke') ||
      prepared.some(s => s.toLowerCase() === 'hellish rebuke');
    if (!hasIt) return false;
    // Need a spell slot
    if (lowestAvailableSlot(reactorCharacter) == null) return false;
    // v2.128.0 — Phase K: 60-ft range gate. Fails OPEN when tokens/map
    // are missing (reactorToAttackerFt === null) — see module docstring
    // on battleMapGeometry.ts.
    if (reactorToAttackerFt !== null && reactorToAttackerFt !== undefined) {
      if (reactorToAttackerFt > 60) return false;
    }
    return true;
  },
  async onAccept(ctx) {
    const { attack, offer, reactorCharacter } = ctx;
    if (!attack) return;
    const levelUsed = (ctx.decisionPayload?.spell_level_used as number)
      ?? (reactorCharacter ? lowestAvailableSlot(reactorCharacter) : 1)
      ?? 1;

    // Burn slot
    if (reactorCharacter) {
      const slots = { ...(reactorCharacter as any).spell_slots } as Record<string, { total: number; used: number }>;
      const slot = slots[String(levelUsed)];
      if (slot && slot.used < slot.total) {
        slots[String(levelUsed)] = { total: slot.total, used: slot.used + 1 };
        await supabase.from('characters').update({ spell_slots: slots }).eq('id', reactorCharacter.id);
      }
    }

    // Mark reaction used on the reactor participant
    await supabase
      .from('combat_participants')
      .update({ reaction_used: true })
      .eq('id', offer.reactor_participant_id);

    // Damage: 2d10 base + 1d10 per slot above 1st
    const extraDice = Math.max(0, levelUsed - 1);
    const damageDice = `${2 + extraDice}d10`;

    // Spell save DC: 8 + PB + highest of INT/WIS/CHA (picks the right one
    // for Warlock/Wizard without needing to know the class specifically;
    // future polish can read character.spellcasting_ability).
    let saveDC = 13;   // sane default for L3
    if (reactorCharacter) {
      const cha = (reactorCharacter as any).charisma ?? 10;
      const intl = (reactorCharacter as any).intelligence ?? 10;
      const wis = (reactorCharacter as any).wisdom ?? 10;
      const spellAbil = Math.max(cha, intl, wis);
      const { abilityModifier, proficiencyBonus } = await import('./gameUtils');
      const spellMod = abilityModifier(spellAbil);
      const pb = proficiencyBonus((reactorCharacter as any).level ?? 1);
      saveDC = 8 + pb + spellMod;
    }

    // Look up the attacker participant's name/type/AC for the counter-attack
    const { data: targetPart } = await supabase
      .from('combat_participants')
      .select('name, participant_type, ac')
      .eq('id', attack.attacker_participant_id)
      .maybeSingle();

    // Declare the counter-attack. Flows through the DM's AttackResolutionModal
    // at 'declared' state so DM rolls the target's DEX save and resolves damage.
    const { declareAttack } = await import('./pendingAttack');
    const counterAttack = await declareAttack({
      campaignId: attack.campaign_id,
      encounterId: attack.encounter_id,
      attackerParticipantId: offer.reactor_participant_id,
      attackerName: offer.reactor_name,
      attackerType: 'character',
      targetParticipantId: attack.attacker_participant_id!,
      targetName: (targetPart?.name as string | null) ?? attack.attacker_name,
      targetType: ((targetPart?.participant_type as any) ?? attack.attacker_type) as any,
      attackSource: 'spell',
      attackName: `Hellish Rebuke${levelUsed > 1 ? ` (L${levelUsed})` : ''}`,
      attackKind: 'save',
      saveDC,
      saveAbility: 'DEX',
      saveSuccessEffect: 'half',
      damageDice,
      damageType: 'fire',
      targetAC: (targetPart?.ac as number | null) ?? null,
    });

    await emitCombatEvent({
      campaignId: attack.campaign_id,
      encounterId: attack.encounter_id,
      chainId: attack.chain_id,
      sequence: 53,
      actorType: 'player',
      actorName: offer.reactor_name,
      targetType: ((targetPart?.participant_type as any) ?? 'monster'),
      targetName: (targetPart?.name as string | null) ?? attack.attacker_name,
      eventType: 'reaction_used',
      payload: {
        reaction: 'Hellish Rebuke',
        spell_level_used: levelUsed,
        save_dc: saveDC,
        save_ability: 'DEX',
        damage_dice: damageDice,
        damage_type: 'fire',
        counter_attack_id: counterAttack?.id ?? null,
      },
    });
  },
});

// ─── Counterspell ────────────────────────────────────────────────
// v2.122.0 — Phase J pt 2: pre-cast Counterspell window.
//
// Triggered by declareSpellCast() — fundamentally different from other
// reactions because the "attack" hasn't happened yet. We parallel the
// pattern by using pending_reactions rows with pending_attack_id=NULL and
// decision_payload carrying the spell_cast_id.
//
// 2024 PHB p.250: when another creature you see within 60 ft casts a spell,
// you can cast Counterspell (3rd-level slot or higher). The target caster
// must succeed on a CON save, DC = 10 + level of the spell being counter-
// spelled. On fail, the spell fails. Upcast: +1 DC per slot above 3rd?
// Actually RAW 2024 doesn't add DC for upcasting — it stays 10 + target
// spell's level regardless of Counterspell's slot level. Keeping to RAW.
//
// This file owns the REGISTRY ENTRY + OFFER-CREATION helper. The onAccept
// creates a save-type pending_attack (target = original caster, CON save,
// DC = 10 + spell_level, no damage). That attack flows through the DM's
// AttackResolutionModal as usual; on resolution, a separate handler (in
// pendingAttack.ts) reads the save outcome and updates the pending_spell_
// casts row to 'countered' or 'resolved'. For this ship we wire the
// acceptance but leave save-outcome → pending_spell_cast propagation as a
// v2.123 follow-up (the declareSpellCast UI needs to subscribe anyway).

REACTION_REGISTRY.push({
  key: 'counterspell',
  name: 'Counterspell',
  triggerPoint: 'spell_declared',
  isEligible(ctx) {
    const { reactorCharacter } = ctx;
    if (!reactorCharacter) return false;
    // Must know or prepare Counterspell
    const known: string[] = (reactorCharacter as any).known_spells ?? [];
    const prepared: string[] = (reactorCharacter as any).prepared_spells ?? [];
    const hasIt =
      known.some(s => s.toLowerCase() === 'counterspell') ||
      prepared.some(s => s.toLowerCase() === 'counterspell');
    if (!hasIt) return false;
    // Need a level-3+ slot
    const slots = ((reactorCharacter as any).spell_slots ?? {}) as Record<string, { total: number; used: number }>;
    for (let lvl = 3; lvl <= 9; lvl++) {
      const slot = slots[String(lvl)];
      if (slot && slot.used < slot.total) return true;
    }
    return false;
  },
  async onAccept(ctx) {
    const { offer, reactorCharacter } = ctx;
    const decisionPayload = (ctx.decisionPayload ?? {}) as Record<string, unknown>;
    const spellCastId = decisionPayload.spell_cast_id as string | undefined;
    const levelUsed = (decisionPayload.spell_level_used as number)
      ?? lowestCounterspellSlot(reactorCharacter)
      ?? 3;

    if (!spellCastId) {
      console.warn('[counterspell] missing spell_cast_id on decision_payload');
      return;
    }

    // Burn the L3+ slot
    if (reactorCharacter) {
      const slots = { ...(reactorCharacter as any).spell_slots } as Record<string, { total: number; used: number }>;
      const slot = slots[String(levelUsed)];
      if (slot && slot.used < slot.total) {
        slots[String(levelUsed)] = { total: slot.total, used: slot.used + 1 };
        await supabase.from('characters').update({ spell_slots: slots }).eq('id', reactorCharacter.id);
      }
    }

    // Mark reactor's reaction used
    await supabase
      .from('combat_participants')
      .update({ reaction_used: true })
      .eq('id', offer.reactor_participant_id);

    // Load the pending_spell_cast to compute save DC and build the attack
    const { data: pscRow } = await supabase
      .from('pending_spell_casts')
      .select('*')
      .eq('id', spellCastId)
      .maybeSingle();
    if (!pscRow) return;

    const targetSpellLevel = pscRow.spell_level as number;
    const saveDC = 10 + targetSpellLevel;

    // Target participant for the save
    let targetName = pscRow.caster_name as string;
    let targetType: 'character' | 'monster' | 'npc' = 'character';
    if (pscRow.caster_participant_id) {
      const { data: cp } = await supabase
        .from('combat_participants')
        .select('name, participant_type')
        .eq('id', pscRow.caster_participant_id)
        .maybeSingle();
      if (cp) {
        targetName = cp.name as string;
        targetType = (cp.participant_type as any) ?? 'character';
      }
    }

    // Create a save-type counter-attack (no damage, effect = spell-fate)
    const { declareAttack } = await import('./pendingAttack');
    const counterAttack = await declareAttack({
      campaignId: pscRow.campaign_id as string,
      encounterId: pscRow.encounter_id as string | null,
      attackerParticipantId: offer.reactor_participant_id,
      attackerName: offer.reactor_name,
      attackerType: 'character',
      targetParticipantId: pscRow.caster_participant_id as string | null,
      targetName,
      targetType,
      attackSource: 'spell',
      attackName: `Counterspell vs ${pscRow.spell_name}${levelUsed > 3 ? ` (L${levelUsed})` : ''}`,
      attackKind: 'save',
      saveDC,
      saveAbility: 'CON',
      saveSuccessEffect: 'none',       // no damage either way — outcome is spell-fate only
      damageDice: '',
      damageType: '',
    });

    // Link the counterspell attack back to the pending_spell_cast so the
    // resolver (future v2.123 code) can flip state to 'countered' vs
    // 'resolved' based on the save outcome.
    await supabase
      .from('pending_spell_casts')
      .update({
        state: 'counterspell_offered',
        counterspell_attack_id: counterAttack?.id ?? null,
      })
      .eq('id', spellCastId);

    await emitCombatEvent({
      campaignId: pscRow.campaign_id as string,
      encounterId: pscRow.encounter_id as string | null,
      chainId: pscRow.chain_id as string,
      sequence: 70,
      actorType: 'player',
      actorName: offer.reactor_name,
      targetType,
      targetName,
      eventType: 'reaction_used',
      payload: {
        reaction: 'Counterspell',
        spell_level_used: levelUsed,
        target_spell: pscRow.spell_name,
        target_spell_level: targetSpellLevel,
        save_dc: saveDC,
        save_ability: 'CON',
        counter_attack_id: counterAttack?.id ?? null,
        spell_cast_id: spellCastId,
      },
    });
  },
});

function lowestCounterspellSlot(c: Character | null | undefined): number | null {
  if (!c) return null;
  const slots = ((c as any).spell_slots ?? {}) as Record<string, { total: number; used: number }>;
  for (let lvl = 3; lvl <= 9; lvl++) {
    const slot = slots[String(lvl)];
    if (slot && slot.used < slot.total) return lvl;
  }
  return null;
}

// ─── Spell cast declaration + counterspell offers ────────────────
// v2.122.0 — Phase J pt 2: declareSpellCast() creates a pending_spell_casts
// row with a 30s reaction window, then offerCounterspell() iterates the
// encounter for eligible counterspellers and creates pending_reactions
// rows. The v2.123 UI will add a DeclareSpellCastModal + timer resolution.

export interface DeclareSpellCastInput {
  campaignId: string;
  encounterId: string | null;
  chainId?: string;                 // optional — new one generated if omitted
  casterParticipantId: string | null;
  casterCharacterId: string | null;
  casterName: string;
  spellName: string;
  spellLevel: number;               // slot level (0 = cantrip)
  isCantrip?: boolean;
  reactionWindowSeconds?: number;   // default 30
}

export async function declareSpellCast(
  input: DeclareSpellCastInput,
): Promise<{ pendingSpellCastId: string; chainId: string; offersCreated: number } | null> {
  const chainId = input.chainId ?? newChainId();
  const windowSecs = input.reactionWindowSeconds ?? 30;
  const declaredAt = new Date();
  const expiresAt = new Date(declaredAt.getTime() + windowSecs * 1000);

  const { data: inserted, error } = await supabase
    .from('pending_spell_casts')
    .insert({
      campaign_id: input.campaignId,
      encounter_id: input.encounterId,
      chain_id: chainId,
      caster_participant_id: input.casterParticipantId,
      caster_character_id: input.casterCharacterId,
      caster_name: input.casterName,
      spell_name: input.spellName,
      spell_level: input.spellLevel,
      is_cantrip: input.isCantrip ?? (input.spellLevel === 0),
      state: 'declared',
      declared_at: declaredAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();
  if (error || !inserted) {
    console.warn('[declareSpellCast] insert failed', error);
    return null;
  }

  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId,
    sequence: 0,
    actorType: 'player',
    actorName: input.casterName,
    targetType: 'self',
    targetName: input.casterName,
    eventType: 'spell_declared',
    payload: {
      spell_name: input.spellName,
      spell_level: input.spellLevel,
      is_cantrip: input.isCantrip ?? (input.spellLevel === 0),
      reaction_window_seconds: windowSecs,
    },
  });

  const offersCreated = await offerCounterspell({
    pendingSpellCastId: inserted.id as string,
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    casterParticipantId: input.casterParticipantId,
    casterName: input.casterName,
    spellName: input.spellName,
    spellLevel: input.spellLevel,
    reactionWindowSeconds: windowSecs,
  });

  return {
    pendingSpellCastId: inserted.id as string,
    chainId,
    offersCreated,
  };
}

export interface OfferCounterspellInput {
  pendingSpellCastId: string;
  campaignId: string;
  encounterId: string | null;
  casterParticipantId: string | null;
  casterName: string;
  spellName: string;
  spellLevel: number;
  reactionWindowSeconds?: number;
}

export async function offerCounterspell(
  input: OfferCounterspellInput,
): Promise<number> {
  if (!input.encounterId) return 0;

  // Load all character participants in the encounter — only characters can
  // counterspell (monsters with innate counterspell are a future edge case).
  const { data: rowsRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, reaction_used, ' + JOINED_COMBATANT_FIELDS)
    .eq('encounter_id', input.encounterId)
    .eq('participant_type', 'character');
  const rows = ((rowsRaw ?? []) as any[]).map(normalizeParticipantRow);
  if (!rows) return 0;

  const windowSecs = input.reactionWindowSeconds ?? 30;
  const offeredAt = new Date();
  const expiresAt = new Date(offeredAt.getTime() + windowSecs * 1000);

  // v2.128.0 — Phase K: 60-ft distance gate. Load the active battle map
  // once + look up the caster's token. For each candidate counterspeller
  // we then compute Chebyshev distance using the pre-loaded map. Fails
  // OPEN — if no map is active or the caster's token isn't placed, we
  // skip the distance check (same for any candidate whose token is
  // missing). See battleMapGeometry.ts module docstring.
  const {
    loadActiveBattleMap,
    findTokenForParticipant,
    distanceBetweenTokensFt,
  } = await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(input.campaignId);
  let casterToken: ReturnType<typeof findTokenForParticipant> = null;
  if (bmap && input.casterParticipantId) {
    // We need the caster participant's full row to look up their token.
    const { data: casterRow } = await supabase
      .from('combat_participants')
      .select('id, name, participant_type, entity_id')
      .eq('id', input.casterParticipantId)
      .maybeSingle();
    if (casterRow) casterToken = findTokenForParticipant(casterRow as any, bmap.tokens);
  }
  const COUNTERSPELL_RANGE_FT = 60;

  const offers: any[] = [];
  for (const p of rows) {
    if (p.id === input.casterParticipantId) continue;   // can't counterspell yourself
    if (p.is_dead) continue;
    if (p.reaction_used) continue;
    if (!p.entity_id) continue;

    // v2.128.0 — distance gate. Only applied when BOTH caster and reactor
    // tokens are on the map. Missing tokens = fail open (offer anyway).
    if (bmap && casterToken) {
      const reactorToken = findTokenForParticipant(p as any, bmap.tokens);
      if (reactorToken) {
        const distFt = distanceBetweenTokensFt(casterToken, reactorToken);
        if (distFt > COUNTERSPELL_RANGE_FT) continue;
      }
    }

    // Load the character's spell list + slots to gate eligibility inline
    // (we could defer to the registry's isEligible but that would require
    // a separate helper call; inline is simpler here).
    const { data: ch } = await supabase
      .from('characters')
      .select('known_spells, prepared_spells, spell_slots')
      .eq('id', p.entity_id as string)
      .maybeSingle();
    if (!ch) continue;
    const known: string[] = (ch.known_spells as string[] | null) ?? [];
    const prepared: string[] = (ch.prepared_spells as string[] | null) ?? [];
    const hasIt =
      known.some(s => s.toLowerCase() === 'counterspell') ||
      prepared.some(s => s.toLowerCase() === 'counterspell');
    if (!hasIt) continue;
    const slots = ((ch.spell_slots ?? {}) as Record<string, { total: number; used: number }>);
    let hasSlot = false;
    for (let lvl = 3; lvl <= 9; lvl++) {
      const slot = slots[String(lvl)];
      if (slot && slot.used < slot.total) { hasSlot = true; break; }
    }
    if (!hasSlot) continue;

    offers.push({
      campaign_id: input.campaignId,
      pending_attack_id: null,
      reactor_participant_id: p.id,
      reactor_name: p.name,
      reactor_type: 'character',
      reaction_key: 'counterspell',
      reaction_name: 'Counterspell',
      trigger_point: 'spell_declared',
      offered_at: offeredAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      decided_at: null,
      state: 'offered',
      decision_payload: {
        spell_cast_id: input.pendingSpellCastId,
        caster_name: input.casterName,
        spell_name: input.spellName,
        spell_level: input.spellLevel,
        save_dc: 10 + input.spellLevel,
      },
    });
  }

  if (offers.length > 0) {
    await supabase.from('pending_reactions').insert(offers);
  }

  return offers.length;
}

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

  // v2.128.0 — Phase K: compute reactor↔attacker Chebyshev distance from
  // the active battle map so distance-gated reactions (Hellish Rebuke 60ft)
  // can enforce range. Null when either token is missing or no map is
  // active — isEligible handlers fail OPEN on null.
  let reactorToAttackerFt: number | null = null;
  if (attack.attacker_participant_id) {
    const { loadActiveBattleMap, findTokenForParticipant, distanceBetweenTokensFt } =
      await import('./battleMapGeometry');
    const bmap = await loadActiveBattleMap(attack.campaign_id);
    if (bmap) {
      // Target participant = reactor; already have tgt. Attacker needs a lookup.
      const { data: atkPart } = await supabase
        .from('combat_participants')
        .select('id, name, participant_type, entity_id')
        .eq('id', attack.attacker_participant_id)
        .maybeSingle();
      if (atkPart) {
        const reactorToken = findTokenForParticipant(tgt as any, bmap.tokens);
        const attackerToken = findTokenForParticipant(atkPart as any, bmap.tokens);
        if (reactorToken && attackerToken) {
          reactorToAttackerFt = distanceBetweenTokensFt(reactorToken, attackerToken);
        }
      }
    }
  }

  const candidates = REACTION_REGISTRY.filter(r => r.triggerPoint === triggerPoint);
  const offers: Omit<PendingReaction, 'id' | 'created_at' | 'updated_at'>[] = [];

  for (const entry of candidates) {
    if (entry.isEligible({ attack, reactorCharacter: reactorChar, reactorToAttackerFt })) {
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

  // v2.124.0 — Phase J: reactions triggered by spell_declared (Counterspell)
  // don't have a pending_attack_id. Only fetch the attack row when present;
  // the registry entry's onAccept checks for it when needed.
  let atk: PendingAttack | null = null;
  if (offer.pending_attack_id) {
    const { data: atkRow } = await supabase
      .from('pending_attacks')
      .select('*')
      .eq('id', offer.pending_attack_id)
      .single();
    if (!atkRow) return;
    atk = atkRow as PendingAttack;
  }

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
    attack: (atk ?? null) as PendingAttack,
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
  // v2.363.0 — widened with 'creature' (v2.350-unified).
  moverType: 'character' | 'creature' | 'monster' | 'npc';
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

  // v2.129.0 — Phase K pt 2: load via battleMapGeometry so token-matching
  // rules live in one place. Fails CLOSED here (OA without a battle map
  // produces no offers) — this is the correct behavior for OA specifically
  // because movement without grid positions doesn't model reach at all;
  // compare to Counterspell/HR which fail OPEN for theater-of-the-mind play.
  const { loadActiveBattleMap, findTokenForParticipant } =
    await import('./battleMapGeometry');
  const bmap = await loadActiveBattleMap(input.campaignId);
  if (!bmap || bmap.tokens.length === 0) return 0;

  // All combat participants in this encounter (we only OA between combatants)
  if (!input.encounterId) return 0;
  const { data: pdataRaw } = await (supabase as any)
    .from('combat_participants')
    .select('id, name, participant_type, entity_id, reaction_used, ' + JOINED_COMBATANT_FIELDS)
    .eq('encounter_id', input.encounterId);
  const pdata = ((pdataRaw ?? []) as any[]).map(normalizeParticipantRow);
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

    // v2.129.0 — delegates token lookup to the library
    const token = findTokenForParticipant(
      {
        id: reactor.id,
        name: reactor.name,
        participant_type: reactor.participant_type,
        entity_id: reactor.entity_id,
      },
      bmap.tokens,
    );
    if (!token) continue;

    // Distance to mover's FROM + TO positions, in cells. We pass fake tokens
    // wrapping the mover's from/to coords so the library computes Chebyshev
    // uniformly. Both reach thresholds are still cell-based (STANDARD_REACH_
    // CELLS = 1 → 5 ft) so no conversion needed.
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
