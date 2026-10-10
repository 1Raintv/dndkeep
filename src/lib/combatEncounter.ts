import type {MovementTurnReviewer} from './api/movementAuraReviews';
import type {AuraTurnResolver} from './auras';
import { attacksPerAction } from '../rules/extraAttack';
import { recoverInitiativeResources } from './initiativeResources';
// v2.96.0 — Phase D of the Combat Backbone
//
// Encounter lifecycle helpers:
//  - startEncounter: create encounter, seed participants from map tokens, auto or prompt initiative
//  - rollInitiative: roll for a specific participant
//  - advanceTurn: end current turn, move to next non-dead participant, increment round if wrapped
//  - endEncounter: mark ended
//  - revealMonster: unhide a monster, roll initiative if configured
//
// All helpers emit structured combat_events via emitCombatEvent for the log.

import { rollDie } from '../rules/dice';
import { supabase } from './supabase';
import { checkedWrite } from './api/checked';
import { emitCombatEvent, emitCombatEventChain, newChainId } from './combatEvents';
import type {
  CombatEncounter,
  CombatParticipant,
  Character,
  MonsterData,
} from '../types';
import { abilityModifier } from './gameUtils';
import { asJsonb } from './jsonbCast';
// v2.315: HP/conditions/death-save reads come from combatants via JOIN.
// See src/lib/combatParticipantNormalize.ts.
import {
  JOINED_COMBATANT_FIELDS,
  normalizeParticipantRow,
} from './combatParticipantNormalize';

// ─── d20 ─────────────────────────────────────────────────────────
export function rollD20(): number {
  return rollDie(20);
}

// ─── Initiative computation ──────────────────────────────────────

/** 2024 initiative: d20 + DEX mod (+ proficiency if rogue/etc, covered later). */
export function rollInitiativeFor(dexMod: number, bonus = 0): {
  d20: number; total: number;
} {
  const d20 = rollD20();
  return { d20, total: d20 + dexMod + bonus };
}

// ─── Seed participants from campaign sources ─────────────────────

export interface SeedSource {
  // v2.352.0 — collapsed to align with combat_participants.participant_type
  // CHECK constraint ('character' | 'creature' since v2.350). Legacy
  // 'monster'/'npc' values are accepted in the type union for any in-flight
  // callers that haven't been updated, but seeds should write 'creature'
  // for everything that isn't a character — the DB CHECK rejects the others.
  type: 'character' | 'creature' | 'monster' | 'npc';
  entityId: string;
  name: string;
  ac: number | null;
  hp: number | null;
  maxHp: number | null;
  dexMod: number;
  initiativeBonus: number;
  hiddenFromPlayers?: boolean;
  /** v2.107.0 — Phase G: max walking speed in feet. */
  maxSpeedFt?: number;
  /** v2.138.0 — Phase M pt 1: legendary resistance uses per day. Only
   *  populated for monster seeds whose stat block has LR (e.g. dragons,
   *  Lich, Tarrasque). Character/NPC seeds leave this undefined. */
  legendaryResistance?: number;
  /** v2.285.0 — legendary actions per round. SRD standard is 3 for
   *  every creature whose stat block carries an LA list (dragons,
   *  liches, vampires, etc.); variants like Tiamat (5) the DM can
   *  override after start via the existing LegendaryActionConfigModal.
   *  Undefined for creatures with no LA at all. */
  legendaryActionsTotal?: number;
  /** v2.285.0 — the LA option list itself (Detect, Tail Attack, Wing
   *  Attack, etc.) carried into combat_participants.legendary_actions_config
   *  so the DM popover can render them without re-querying the
   *  bestiary. Mirrors the MonsterData.legendary_actions shape. */
  legendaryActionsConfig?: import('../types').MonsterLegendaryAction[];
  /** v2.399.0 — Extra Attack / Multiattack counter (characterToSeed,
   *  monsterToSeed). Undefined → 1. */
  attacksPerAction?: number;
  /** v2.746.0 — the exact `combatants` row this participant IS. Combat
   *  participants are per INSTANCE (one per battle-map token), so three
   *  Goblin Scout tokens sharing one homebrew_monsters definition become
   *  three participants, each bound to its own token's combatant. When
   *  set, the BEFORE INSERT trigger cp_ensure_combatant_link leaves it
   *  alone; when null/undefined the trigger keeps guessing with its
   *  unordered LIMIT 1 over combatants by definition_id (which could bind
   *  a participant to a token on ANOTHER scene). entity_id stays the
   *  definition id — every stat lookup keys on it unchanged. */
  combatantId?: string | null;
}

/** Everything a combat_participants INSERT row needs besides the seed. */
export interface SeedRowContext {
  encounterId: string;
  campaignId: string;
  initiativeMode: 'auto_all' | 'player_agency';
  /** Hidden monsters: roll_at_reveal (default) leaves initiative null
   *  until the DM reveals them; roll_at_start rolls immediately. */
  hiddenMonsterRevealMode?: 'roll_at_reveal' | 'roll_at_start';
  /** Placeholder turn_order — always recomputed by recomputeTurnOrder
   *  after the insert (startEncounter uses 0, late adds 999 so the new
   *  row never displaces the active turn before the recompute lands). */
  turnOrder: number;
}

/** v2.746.0 — the ONE seed → combat_participants row builder. Before
 *  this, startEncounter and addParticipantToEncounter each carried their
 *  own copy of this 25-line object; they had already drifted
 *  (attacks_per_action was only written by one of them) and neither
 *  wrote combatant_id. Exported so the unit test can assert the row
 *  shape without a database. */
export function seedToRow(s: SeedSource, ctx: SeedRowContext) {
  const shouldAutoRoll =
    ctx.initiativeMode === 'auto_all' ||
    s.type !== 'character'; // NPCs and monsters always auto-roll

  // Hidden monsters: in roll_at_reveal mode, stay null; in roll_at_start, roll.
  const shouldRollHidden = s.hiddenFromPlayers
    ? (ctx.hiddenMonsterRevealMode ?? 'roll_at_reveal') === 'roll_at_start'
    : true;

  let initiative: number | null = null;
  if (shouldAutoRoll && shouldRollHidden) {
    initiative = rollInitiativeFor(s.dexMod, s.initiativeBonus).total;
  }

  return {
    encounter_id: ctx.encounterId,
    campaign_id: ctx.campaignId,
    // v2.352.0 — normalize legacy 'monster'/'npc' to 'creature' to
    // match the v2.350 CHECK constraint. Without this, any caller
    // still passing legacy seed types would 500 the insert.
    participant_type: s.type === 'character' ? 'character' : 'creature',
    entity_id: s.entityId,
    // v2.746.0 — explicit instance link; null keeps the trigger's guess
    // (legacy callers / scene_tokens campaigns). See SeedSource.combatantId.
    combatant_id: s.combatantId ?? null,
    name: s.name,
    initiative,
    initiative_tiebreaker: s.dexMod,
    turn_order: ctx.turnOrder,
    ac: s.ac,
    // v2.320: current_hp/max_hp removed from insert payload. The v2.319
    // BEFORE INSERT trigger (cp_ensure_combatant_link) seeds the linked
    // combatant's HP from authoritative tables (characters/monsters/npcs).
    // Legacy current_hp/max_hp columns dropped in v2.321.
    hidden_from_players: s.hiddenFromPlayers ?? false,
    max_speed_ft: s.maxSpeedFt ?? 30,
    // v2.138.0 — Phase M pt 1: seed LR from the monster stat block so
    // v2.139's failed-save prompt and v2.140's initiative-strip badge
    // have data to render. Characters/NPCs leave `legendaryResistance`
    // undefined → both fields stay null.
    legendary_resistance: s.legendaryResistance ?? null,
    legendary_resistance_used:
      (s.legendaryResistance ?? 0) > 0 ? 0 : null,
    // v2.285.0 — auto-seed LA from the bestiary. monsterToSeed sets
    // legendaryActionsTotal=3 + legendaryActionsConfig=<list> when
    // the stat block has any legendary actions; non-LA seeds leave
    // both undefined and we fall back to the DB defaults' shape
    // (0, 0, []). Writing the defaults explicitly rather than
    // conditional-spreading because TS narrows the union shape
    // poorly across the insert overloads. The columns are NOT
    // NULL with defaults, so explicit writes are safe.
    legendary_actions_total: s.legendaryActionsTotal ?? 0,
    legendary_actions_remaining: s.legendaryActionsTotal ?? 0,
    // Cast required because MonsterLegendaryAction is a structural
    // interface without an index signature, but Supabase's generated
    // Json type insists on `{ [key: string]: Json | undefined }`. The
    // runtime payload is plain JSON-serializable data (string fields
    // + optional numeric `cost`), so the cast is sound.
    legendary_actions_config: (s.legendaryActionsConfig ?? []) as unknown as import('../types/supabase').Json,
    // v2.399.0 — Multiattack counter. v2.746: now written by late adds
    // too (a reinforcement with Multiattack used to arrive with 1/1).
    attacks_per_action: s.attacksPerAction ?? 1,
    attacks_remaining: s.attacksPerAction ?? 1,
  };
}

/** v2.746.0 — collapse per-instance seeds back to one per
 *  (type, entityId), keeping the FIRST seed's combatantId. Used only
 *  when the participants insert rejects with 23505 because the target
 *  database still carries the pre-v2.746 UNIQUE(encounter_id,
 *  participant_type, entity_id) — i.e. migration
 *  20260922120000_combat_participants_per_instance_v2_746 has not been
 *  applied there yet. Exported for the unit test. */
export function firstPerDefinition(seeds: SeedSource[]): SeedSource[] {
  const seen = new Set<string>();
  return seeds.filter(s => {
    const key = `${s.type === 'character' ? 'character' : 'creature'}:${s.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function characterToSeed(c: Character): SeedSource {
  return {
    type: 'character',
    entityId: c.id,
    name: c.name,
    ac: c.armor_class ?? null,
    hp: c.current_hp ?? null,
    maxHp: c.max_hp ?? null,
    dexMod: abilityModifier(c.dexterity ?? 10),
    initiativeBonus: (c as any).initiative_bonus ?? 0,
    hiddenFromPlayers: false,
    maxSpeedFt: (c as any).speed ?? 30,
    attacksPerAction: attacksPerAction(c),
  };
}

// v2.175.0 — Phase Q.0 pt 16: seed an NPC row as a combat participant.
// The dm_npc_roster (called `npcs` in the DB) already carries HP, AC,
// ability scores, speed, etc. — everything startEncounter needs. This
// helper lets DMs add named recurring allies/enemies directly from
// the NPC manager into ongoing combat without re-entering stats.
export function npcToSeed(n: {
  id: string; name: string; ac?: number; hp?: number; max_hp?: number;
  dex?: number; speed?: number;
}, hiddenFromPlayers = false): SeedSource {
  return {
    type: 'creature',
    entityId: n.id,
    name: n.name,
    ac: n.ac ?? null,
    hp: n.hp ?? n.max_hp ?? null,
    maxHp: n.max_hp ?? null,
    dexMod: abilityModifier(n.dex ?? 10),
    initiativeBonus: 0,
    hiddenFromPlayers,
    maxSpeedFt: n.speed ?? 30,
  };
}

// v2.175.0 — Phase Q.0 pt 16: add a single seed to an already-running
// encounter. Used for late arrivals — e.g. DM sends in reinforcements
// three rounds into combat — where startEncounter is the wrong tool
// (it creates a new encounter row). Rolls initiative only if the
// encounter is in auto_all mode; otherwise the participant sits with
// null initiative until the DM rolls manually. Turn order is
// recomputed after insert so the new participant slots in correctly.
export async function addParticipantToEncounter(
  encounterId: string,
  campaignId: string,
  seed: SeedSource,
  initiativeMode: 'auto_all' | 'player_agency' = 'auto_all',
): Promise<CombatParticipant | null> {
  // v2.746.0 — shared row builder (see seedToRow). Late adds keep the
  // pre-v2.746 hidden-monster behaviour: a hidden reinforcement never
  // rolls until revealed (= 'roll_at_reveal').
  const row = seedToRow(seed, {
    encounterId, campaignId, initiativeMode,
    hiddenMonsterRevealMode: 'roll_at_reveal',
    turnOrder: 999, // placeholder — recomputed below
  });

  const { data, error } = await supabase
    .from('combat_participants')
    .insert([row])
    .select()
    .single();

  if (error || !data) {
    // v2.746.0 — surface the SQLSTATE: 23505 means this combatant (or,
    // pre-migration, this definition) is already in the encounter, which
    // callers turn into a visible "already in combat?" message.
    // eslint-disable-next-line no-console
    console.error('[addParticipantToEncounter] insert failed:', error?.code, error?.message);
    return null;
  }

  // Recompute turn_order so the new participant sorts into the correct
  // position by initiative. Without this, the placeholder 999 would
  // push them to the end of the strip regardless of their roll.
  await recomputeTurnOrder(encounterId);

  // v2.491.0 — Re-seed combatants.active_buffs for the new participant
  // from authoritative tables. Same rationale as startEncounter's call
  // (see comment there). One participant → at most one UPDATE.
  await seedBuffsFromAuthoritativeTables([
    {
      participant_type: (data as { participant_type?: string }).participant_type ?? '',
      entity_id: (data as { entity_id?: string | null }).entity_id ?? null,
      combatant_id: (data as { combatant_id?: string | null }).combatant_id ?? null,
    },
  ]);

  if (data.initiative !== null) await recoverInitiativeResources(data);
  return data as CombatParticipant;
}

export function monsterToSeed(m: MonsterData, hiddenFromPlayers = false): SeedSource {
  // v2.285.0 — auto-import legendary actions. The bestiary stores the
  // LA option list (Detect, Tail Attack, Wing Attack, ...) but no
  // per-round count field — it's flavor text in 5e SRD. The 2014
  // standard for every LA-bearing creature with a published count is
  // 3, with rare exceptions (Tiamat 5, some homebrew bosses 1-2). We
  // default to 3 when the option list is non-empty; the DM overrides
  // via the existing LegendaryActionConfigModal if the creature uses
  // a different budget. Pre-2.285 the participant row was created
  // with legendary_actions_total = null, so the LA chip never
  // appeared and the v2.126 ⚙ Configure popover required manual
  // bootstrap on every dragon — bad UX.
  const laList = m.legendary_actions ?? [];
  const hasLa = laList.length > 0;
  return {
    type: 'creature',
    entityId: m.id,
    name: m.name,
    ac: m.ac ?? null,
    hp: m.hp ?? null,
    maxHp: m.hp ?? null,
    dexMod: abilityModifier(m.dex ?? 10),
    initiativeBonus: 0,
    hiddenFromPlayers,
    maxSpeedFt: (m as any).speed ?? 30,
    // v2.138.0 — Phase M pt 1: carry LR from the bestiary into combat.
    // Backfilled for all SRD 2014 LR-bearing creatures via
    // phase_m_lr_backfill migration. Null/0 for creatures without LR.
    legendaryResistance: m.legendary_resistance_count ?? undefined,
    legendaryActionsTotal: hasLa ? 3 : undefined,
    legendaryActionsConfig: hasLa ? laList : undefined,
    // v2.399.0 — Multiattack heuristic. If any of the monster's
    // actions has "multiattack" in its name (case-insensitive),
    // grant 3 attacks per turn as a placeholder. RAW counts vary
    // (ARD = 3: 1 bite + 2 claws; some bosses = 4-5), but 3 is the
    // common case and the DM can adjust live. Future ship will
    // parse the multiattack action's `desc` for the exact count.
    attacksPerAction: ((m.actions ?? []) as Array<{ name?: string }>).some(
      a => (a.name ?? '').toLowerCase().includes('multiattack')
    ) ? 3 : 1,
  };
}

// ─── startEncounter ──────────────────────────────────────────────

// v2.491.0 — Re-seed combatants.active_buffs from authoritative tables.
//
// The cp_ensure_combatant_link BEFORE INSERT trigger (v2.319) creates
// a fresh `combatants` row when a combat_participants row is inserted,
// and hard-codes active_buffs to '[]'::jsonb. That's the right default
// for monster spawns (each Goblin instance starts unbuffed), but it
// drops any buffs that the end-of-encounter carry-over wrote back to
// characters.active_buffs (v2.477) or homebrew_monsters.active_buffs
// (v2.491). Without this re-seed, a wizard who pre-buffs an ally
// with Stoneskin between encounters finds the buff disappears the
// moment combat starts.
//
// This helper runs AFTER the participant insert returns. The trigger
// has already linked combatant_id; we look up authoritative buffs by
// participant_type and UPDATE combatants.active_buffs in place. Fires
// one UPDATE per participant that has any buffs; participants with
// empty buff lists are skipped (no-op write avoidance).
//
// Why not extend the trigger: the trigger is shared with monster
// spawns where the right default is empty, and it would need to
// conditionally read from two different authoritative tables. The
// app already runs follow-up UPDATEs after the insert (encumbrance
// sync since v2.143, immunity reads since v2.477), so this fits the
// established pattern and is observable in network logs.
//
// Failure mode: best-effort. If the SELECT or UPDATE fails for a
// participant, we log and continue — combat is already initiated and
// the buff being absent in this encounter is degraded but not broken.
async function seedBuffsFromAuthoritativeTables(
  participants: Array<{ participant_type: string; entity_id: string | null; combatant_id: string | null }>,
): Promise<void> {
  // Group by table source. Filter out anything without combatant_id —
  // shouldn't happen post-v2.319 trigger but defensive.
  const charLinks: Array<{ characterId: string; combatantId: string }> = [];
  const creatureLinks: Array<{ creatureId: string; combatantId: string }> = [];
  for (const p of participants) {
    if (!p.combatant_id || !p.entity_id) continue;
    if (p.participant_type === 'character') {
      charLinks.push({ characterId: p.entity_id, combatantId: p.combatant_id });
    } else if (p.participant_type === 'creature' || p.participant_type === 'monster') {
      creatureLinks.push({ creatureId: p.entity_id, combatantId: p.combatant_id });
    }
    // participant_type === 'monster' here means an SRD-monster spawn
    // (rare — most go through 'creature'), and SRD monsters don't
    // have an active_buffs column. The else-if above keeps them out.
    // 'npc' is dead since v2.350 (see campaignImmunities.ts header).
  }

  try {
    // Characters: batched read, then per-row update only for non-empty buffs.
    if (charLinks.length) {
      const ids = charLinks.map(l => l.characterId);
      const { data: rows, error } = await (supabase as any)
        .from('characters')
        .select('id, active_buffs')
        .in('id', ids);
      if (error) {
        console.warn('[seedBuffs] character read failed', error);
      } else if (rows) {
        const byId = new Map<string, any>(
          (rows as Array<{ id: string; active_buffs: unknown }>).map(r => [r.id, r.active_buffs]),
        );
        // v2.637 perf (audit 6.4): updates run concurrently — each row
        // carries a different buff array so they can't be one query, but
        // they don't need to be serial either.
        await Promise.all(charLinks.map(async link => {
          const buffs = byId.get(link.characterId);
          if (!Array.isArray(buffs) || buffs.length === 0) return;
          const { error: uErr } = await supabase
            .from('combatants')
            .update({ active_buffs: asJsonb(buffs) })
            .eq('id', link.combatantId)
            .select('id');
          if (uErr) {
            console.warn('[seedBuffs] character combatant update failed', { combatantId: link.combatantId, error: uErr });
          }
        }));
      }
    }

    // Creatures: same pattern, against homebrew_monsters.
    if (creatureLinks.length) {
      const ids = creatureLinks.map(l => l.creatureId);
      const { data: rows, error } = await (supabase as any)
        .from('homebrew_monsters')
        .select('id, active_buffs')
        .in('id', ids);
      if (error) {
        // Column may not exist yet on a stale schema (migration pending).
        // Degraded mode is "no buff seed for creatures" which matches
        // pre-v2.491 behavior. Don't block.
        console.warn('[seedBuffs] homebrew_monsters read failed (migration may be pending)', error);
      } else if (rows) {
        const byId = new Map<string, any>(
          (rows as Array<{ id: string; active_buffs: unknown }>).map(r => [r.id, r.active_buffs]),
        );
        // v2.637 perf (audit 6.4): concurrent, same as the character branch.
        await Promise.all(creatureLinks.map(async link => {
          const buffs = byId.get(link.creatureId);
          if (!Array.isArray(buffs) || buffs.length === 0) return;
          const { error: uErr } = await supabase
            .from('combatants')
            .update({ active_buffs: asJsonb(buffs) })
            .eq('id', link.combatantId)
            .select('id');
          if (uErr) {
            console.warn('[seedBuffs] creature combatant update failed', { combatantId: link.combatantId, error: uErr });
          }
        }));
      }
    }
  } catch (err) {
    // Outer try/catch so a thrown error in either branch never breaks
    // combat start. The buff seed is a nice-to-have, not a blocker.
    console.warn('[seedBuffs] threw', err);
  }
}

export interface StartEncounterOptions {
  campaignId: string;
  name?: string;
  initiativeMode: 'auto_all' | 'player_agency';
  hiddenMonsterRevealMode?: 'roll_at_reveal' | 'roll_at_start';
  seeds: SeedSource[];
  dmUserName?: string;      // for event actor_name
}

export interface StartEncounterResult {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
}

export async function startEncounter(opts: StartEncounterOptions): Promise<StartEncounterResult | null> {
  // 1. Create encounter row
  const { data: encData, error: encErr } = await supabase
    .from('combat_encounters')
    .insert({
      campaign_id: opts.campaignId,
      name: opts.name ?? 'Encounter',
      status: 'active',
      round_number: 1,
      current_turn_index: 0,
      initiative_mode: opts.initiativeMode,
      hidden_monster_reveal_mode: opts.hiddenMonsterRevealMode ?? 'roll_at_reveal',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (encErr || !encData) {
    // eslint-disable-next-line no-console
    console.error('[startEncounter] insert failed:', encErr?.message);
    return null;
  }
  const encounter = encData as CombatEncounter;

  // 2. Seed participants. Auto-roll initiative for all if auto_all; otherwise only
  //    NPCs/monsters get auto-rolled and player characters stay null until they
  //    explicitly roll (player_agency mode).
  const rowCtx: SeedRowContext = {
    encounterId: encounter.id,
    campaignId: opts.campaignId,
    initiativeMode: opts.initiativeMode,
    hiddenMonsterRevealMode: opts.hiddenMonsterRevealMode,
    turnOrder: 0,  // computed after all rolls settle
  };
  const rows = opts.seeds.map(s => seedToRow(s, rowCtx));

  let { data: partData, error: partErr } = await supabase
    .from('combat_participants')
    .insert(rows)
    .select();

  // v2.746.0 — graceful degradation while a database still carries the
  // pre-v2.746 UNIQUE(encounter_id, participant_type, entity_id): the
  // per-instance rows (three Goblin Scouts = three rows, one definition)
  // reject with 23505 and, the batch insert being atomic, nothing was
  // written. Retry ONCE with the old one-per-definition shape so combat
  // still starts; the initiative strip then shows a single goblin, as
  // before. Apply migration 20260922120000_combat_participants_per_
  // instance_v2_746 to get per-token participants.
  if (partErr?.code === '23505') {
    // eslint-disable-next-line no-console
    console.warn('[startEncounter] per-instance participants rejected by the legacy UNIQUE (23505) — retrying one-per-definition; apply migration 20260922120000_combat_participants_per_instance_v2_746');
    const deduped = firstPerDefinition(opts.seeds).map(s => seedToRow(s, rowCtx));
    ({ data: partData, error: partErr } = await supabase
      .from('combat_participants')
      .insert(deduped)
      .select());
  }

  if (partErr || !partData) {
    // eslint-disable-next-line no-console
    console.error('[startEncounter] participants insert failed:', partErr?.message);
    return { encounter, participants: [] };
  }
  const participants = partData as CombatParticipant[];

  // 3. Compute turn_order for any that have initiative set
  await recomputeTurnOrder(encounter.id);

  // v2.491.0 — Re-seed combatants.active_buffs from
  // characters.active_buffs and homebrew_monsters.active_buffs. The
  // v2.319 trigger that just ran hard-coded the buffs to [], which
  // drops any carried-over buffs from v2.477 / v2.491 endEncounter
  // writes. Awaited so the buffs are present by the time the UI
  // re-fetches the participant list, but errors don't propagate
  // (the helper logs and swallows internally).
  await seedBuffsFromAuthoritativeTables(
    participants.map(p => ({
      participant_type: p.participant_type,
      entity_id: (p as { entity_id?: string | null }).entity_id ?? null,
      combatant_id: (p as { combatant_id?: string | null }).combatant_id ?? null,
    })),
  );

  // v2.143.0 — Phase N pt 1: fire encumbrance sync for every character
  // participant. Without this, a character that was over-capacity when
  // combat started wouldn't pick up Encumbered until they next touched
  // inventory/currency/strength. Fire-and-forget so it never blocks
  // combat initiation. The sync itself no-ops when campaign
  // encumbrance_variant is 'off' (default), so this is a 0-cost call
  // for campaigns that haven't opted in.
  const characterSeeds = participants.filter(p => p.participant_type === 'character' && !!p.entity_id);
  if (characterSeeds.length > 0) {
    import('./encumbrance').then(async ({ syncEncumbranceCondition }) => {
      // v2.637 perf (audit 6.4): was a select('*') per character in a
      // serial loop against one of the widest tables in the schema.
      // One batched .in() read, then the syncs run concurrently (each
      // writes only its own character's rows).
      try {
        const ids = characterSeeds.map(p => p.entity_id as string);
        const { data: charRows } = await supabase
          .from('characters')
          .select('*')
          .in('id', ids);
        await Promise.all((charRows ?? []).map(async (charRow: any) => {
          try {
            await syncEncumbranceCondition({
              characterId: charRow.id as string,
              character: charRow,
              campaignId: opts.campaignId,
              encounterId: encounter.id,
            });
          } catch {
            /* swallow — encumbrance sync must never break combat start */
          }
        }));
      } catch {
        /* swallow — encumbrance sync must never break combat start */
      }
    }).catch(() => { /* dynamic import failure is non-fatal */ });
  }

  // 4. Emit combat_started + initiative_rolled events
  const events: Parameters<typeof emitCombatEventChain>[0] = [];
  events.push({
    campaignId: opts.campaignId,
    encounterId: encounter.id,
    actorType: 'system',
    actorName: 'System',
    eventType: 'combat_started',
    payload: { encounter_id: encounter.id, participants: participants.length },
  });
  for (const p of participants) {
    if (p.initiative !== null) {
      await recoverInitiativeResources(p);
      events.push({
        campaignId: opts.campaignId,
        encounterId: encounter.id,
        actorType: p.participant_type === 'character' ? 'player' : 'monster',
        actorId: null, // entity_id is text, not uuid
        actorName: p.name,
        eventType: 'initiative_rolled',
        payload: { total: p.initiative, dex_mod: p.initiative_tiebreaker },
        visibility: p.hidden_from_players ? 'hidden_from_players' : 'public',
      });
    }
  }
  await emitCombatEventChain(events);
  // chainId intentionally unused — emitCombatEventChain assigns its own

  return { encounter, participants };
}

// ─── recomputeTurnOrder ──────────────────────────────────────────
// Sorts participants by (initiative DESC, tiebreaker DESC) and writes turn_order.
// Rows with null initiative go to the bottom (order > any rolled participant).
export async function recomputeTurnOrder(encounterId: string): Promise<void> {
  const { data } = await supabase
    .from('combat_participants')
    .select('id, initiative, initiative_tiebreaker')
    .eq('encounter_id', encounterId);
  if (!data) return;

  const sorted = [...data].sort((a, b) => {
    const aInit = a.initiative ?? -Infinity;
    const bInit = b.initiative ?? -Infinity;
    if (aInit !== bInit) return bInit - aInit;
    return (b.initiative_tiebreaker ?? 0) - (a.initiative_tiebreaker ?? 0);
  });

  await Promise.all(
    sorted.map((p, i) =>
      supabase.from('combat_participants').update({ turn_order: i }).eq('id', p.id)
    )
  );
}

// ─── Roll initiative for one participant ─────────────────────────
export async function rollInitiativeForParticipant(
  participantId: string,
  dexMod: number,
  bonus = 0
): Promise<number | null> {
  const { d20, total } = rollInitiativeFor(dexMod, bonus);

  const { data: partData } = await supabase
    .from('combat_participants')
    .update({ initiative: total })
    .eq('id', participantId)
    .select('encounter_id, campaign_id, name, participant_type, entity_id, hidden_from_players')
    .single();

  if (!partData) return null;

  await recomputeTurnOrder(partData.encounter_id);
  await recoverInitiativeResources(partData);

  await emitCombatEvent({
    campaignId: partData.campaign_id,
    encounterId: partData.encounter_id,
    actorType: partData.participant_type === 'character' ? 'player' : 'monster',
    actorName: partData.name,
    eventType: 'initiative_rolled',
    payload: { d20, total, dex_mod: dexMod, bonus },
    visibility: partData.hidden_from_players ? 'hidden_from_players' : 'public',
  });

  return total;
}

// ─── advanceTurn ─────────────────────────────────────────────────
// Advance to the next non-dead, visible-in-initiative participant.
// Wraps back to turn_order=0 and increments round_number on wrap.
// v2.278.0 — Returns a discriminated result so the UI can surface a
// toast on failure instead of silently swallowing the error. Pre-2.278
// the function returned void and any RLS / network / constraint
// failure was invisible to the user — a "button doesn't work" report
// would have no signal trail. The non-void return is non-breaking:
// existing callers `await advanceTurn(id)` just discard the value.
export type CombatActionResult =
  | { ok: true }
  | { ok: false; reason: string };

// v2.869: three controls share this handler. A component-local busy flag
// cannot stop another control from starting the same effects/advance in parallel.
// This guard covers one tab only; durable cross-client recovery remains separate.
const pendingTurnAdvances = new Map<string, Promise<CombatActionResult>>();
export function advanceTurn(encounterId: string,resolveAura?:AuraTurnResolver,reviewMovement?:MovementTurnReviewer): Promise<CombatActionResult> {
  const pending = pendingTurnAdvances.get(encounterId);
  if (pending) return pending;
  const work = Promise.resolve().then(async () => {
    const {withCurrentTurnUser}=await import('./api/liveTurnTransitions');
    return withCurrentTurnUser((user,guard)=>advanceTurnOnce(encounterId,user,guard,resolveAura,reviewMovement));
  })
    .catch((error: unknown): CombatActionResult => ({
      ok: false,
      reason: error instanceof Error ? error.message : 'Turn advancement could not be confirmed. Check combat before trying again.',
    }))
    .finally(() => {
      if (pendingTurnAdvances.get(encounterId) === work) pendingTurnAdvances.delete(encounterId);
    });
  pendingTurnAdvances.set(encounterId, work);
  return work;
}

async function advanceTurnOnce(encounterId: string,userId:string,guard:()=>void,resolveAura?:AuraTurnResolver,reviewMovement?:MovementTurnReviewer): Promise<CombatActionResult> {
  const {recoverLiveTurnTransition,advanceLiveTurnTransition}=await import('./api/liveTurnTransitions');
  const reviewMoves=async()=>{
    if(reviewMovement){await reviewMovement(encounterId,userId,guard);return;}
    const {pendingMovementAuraReviews}=await import('./api/movementAuraReviews');
    if((await pendingMovementAuraReviews(encounterId,1)).length)throw new Error('Review pending movement effects with the DM turn controls before advancing.');
  };
  if(await recoverLiveTurnTransition(userId,encounterId,guard,reviewMoves))return {ok:true};
  await reviewMoves();
  guard();
  const { data: enc, error: encErr } = await supabase
    .from('combat_encounters')
    .select('*')
    .eq('id', encounterId)
    .single();
  if (encErr) {
    console.error('[advanceTurn] encounter fetch failed:', encErr);
    return { ok: false, reason: encErr.message ?? 'Failed to load encounter' };
  }
  if (!enc) return { ok: false, reason: 'Encounter not found' };
  const encounter = enc as CombatEncounter;

  const { data: rowsRaw, error: rowsErr } = await (supabase as any)
    .from('combat_participants')
    .select(
      'id, combatant_id, turn_order, name, participant_type, hidden_from_players, campaign_id, entity_id, movement_used_ft, legendary_actions_total, legendary_actions_remaining, ' +
        JOINED_COMBATANT_FIELDS
    )
    .eq('encounter_id', encounterId)
    .order('turn_order', { ascending: true });
  if (rowsErr) {
    console.error('[advanceTurn] participants fetch failed:', rowsErr);
    return { ok: false, reason: rowsErr.message ?? 'Failed to load participants' };
  }
  if (!rowsRaw || rowsRaw.length === 0) return { ok: false, reason: 'No participants in this encounter' };
  // v2.315: flatten the JOINed combatants object onto each row so
  // downstream code (r.is_dead, r.current_hp, r.death_save_*) reads
  // through to the combatant. Same shape, combatants is the source.
  const rows = rowsRaw.map(normalizeParticipantRow);

  // Filter out dead and rows without an initiative slot (shouldn't be many)
  // v2.315: rows came through (supabase as any) for the JOIN; type
  // the filter callback explicitly to avoid implicit any.
  const active = rows.filter((r: { is_dead?: boolean | null }) => !r.is_dead);
  if (active.length === 0) return { ok: false, reason: 'All participants are dead' };

  // v2.869: an end-effect receipt anchors the outgoing actor even if its
  // damage killed them. The compressed living roster cannot identify that turn.
  // Reserve before separate condition/aura calls; retries keep the same actor.
  const {prepareCombatTurnEnd}=await import('./api/combatClock');
  const initialClock=await prepareCombatTurnEnd(userId,encounterId,enc.psionic_turn_id);
  guard();

  // v2.445.0 — End-of-turn condition processing for the OUTGOING
  // participant. Re-rolls saves for any condition with a save_to_end
  // spec (Frightful Presence-style 1-minute auras), removes
  // duration-expired conditions, and grants source-keyed immunity
  // on success/expiry. Runs BEFORE we write the encounter row so
  // any condition_resave events appear in the log right before
  // turn_ended (matches the natural narrative order).
  const outgoingForConditions = rows.find((r:{id:string})=>r.id===initialClock.outgoingId) ?? null;
  if(!outgoingForConditions)return {ok:false,reason:'The outgoing actor changed. Refresh combat before advancing.'};
  if (outgoingForConditions) {
    try {
      if(!outgoingForConditions.is_dead){
        const { processEndOfTurnConditions } = await import('./endOfTurnConditions');
        await processEndOfTurnConditions({
          participantId: outgoingForConditions.id,
          turnId: enc.psionic_turn_id,
          campaignId: outgoingForConditions.campaign_id as string,
          encounterId,
          currentRound: encounter.round_number,
          participantName: outgoingForConditions.name as string,
          participantType: outgoingForConditions.participant_type as 'character' | 'creature' | 'monster' | 'npc',
          hiddenFromPlayers: !!outgoingForConditions.hidden_from_players,
        });
        guard();
      }
    } catch (err) {
      // Keep the outgoing turn active until its saved condition outcomes are
      // confirmed. Retrying uses their receipts instead of rolling again.
      return {ok:false,reason:err instanceof Error?err.message:'Condition save could not be confirmed'};
    }

    // v2.869: persist end-of-turn ticks before allowing the clock to move.
    // A lost reply is recovered by the same turn identity, never a second roll.
    try {
      const { processSavedTurnEffects } = await import('./api/turnEffects');
      await processSavedTurnEffects(userId,{
        participantId: outgoingForConditions.id,
        encounterId,
        turnId: enc.psionic_turn_id,
        timing: 'turn_end',
      },guard);
    } catch (err) {
      return {ok:false,reason:err instanceof Error?err.message:'End-of-turn effects could not be confirmed. Retry before advancing.'};
    }

    // v2.634.0 — Aura/Emanation "ends its turn there" trigger (2024
    // Spirit Guardians). Must run BEFORE the once-per-turn marker
    // clock transaction, which clears its once-per-turn marker. A postponed
    // or failed review keeps the outgoing turn open.
    try {
      const { evaluateAurasOnTurnEnd } = await import('./auras');
      await evaluateAurasOnTurnEnd({
        campaignId: outgoingForConditions.campaign_id as string,
        encounterId,
        participantId: outgoingForConditions.id as string,
        resolve:async input=>{
          guard();if(!resolveAura)throw new Error('Review the aura from the initiative controls before advancing.');
          return resolveAura(input,{userId,turnId:enc.psionic_turn_id,guard});
        },
      });
    } catch (err) {
      return {ok:false,reason:err instanceof Error?err.message:'Aura resolution could not be confirmed. Retry before advancing.'};
    }
  }

  // v2.869: movement recovery is turn-keyed; a retry cannot replenish later uses.
  if(outgoingForConditions.participant_type==='character'){
    const {recoverTurnMovementFeatures}=await import('./api/turnMovementRecovery');
    guard();await recoverTurnMovementFeatures({participantId:outgoingForConditions.id,encounterId,turnId:enc.psionic_turn_id});guard();
  }
  // Clock, budgets, legendary refill and mastery expiry are one transaction.
  // Its durable journal owns recharge, death checks, incoming ticks and logs.
  await advanceLiveTurnTransition(userId,encounterId,enc.psionic_turn_id,guard);
  return {ok:true};
}

// ─── endEncounter ────────────────────────────────────────────────
// v2.869: state carry-over, the log, and ending combat share one transaction.
export async function endEncounter(encounterId: string): Promise<CombatActionResult> {
  try {
    const {completeCombat}=await import('./api/endCombat');
    await completeCombat(encounterId);
    return {ok:true};
  } catch(error) {
    return {ok:false,reason:error instanceof Error?error.message:'Combat completion could not be confirmed. Retry End Combat.'};
  }
}

// ─── revealMonster ───────────────────────────────────────────────
export async function revealMonster(participantId: string, dexMod: number): Promise<void> {
  const { data: part } = await supabase
    .from('combat_participants')
    .select('encounter_id, campaign_id, initiative, name, participant_type')
    .eq('id', participantId)
    .single();
  if (!part) return;

  // Unhide
  await checkedWrite('combat_participants.update unhide', { participantId }, supabase
    .from('combat_participants')
    .update({ hidden_from_players: false })
    .eq('id', participantId));

  // Roll initiative if not already rolled
  if (part.initiative === null) {
    await rollInitiativeForParticipant(participantId, dexMod);
  }

  await emitCombatEvent({
    campaignId: part.campaign_id,
    encounterId: part.encounter_id,
    actorType: 'system',
    actorName: 'DM',
    eventType: 'monster_revealed',
    payload: { participant_id: participantId, name: part.name },
  });
}

// ─── Active encounter lookup ─────────────────────────────────────
export async function getActiveEncounter(campaignId: string): Promise<CombatEncounter | null> {
  const { data } = await supabase
    .from('combat_encounters')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CombatEncounter) ?? null;
}
