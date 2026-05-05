# Combat Phase 3 — Token Library Refactor

**Status:** Design. v2.308 ships this doc only — no migrations, no code.
v2.309+ will land the implementation in stages.

## Status update — as of v2.390

**v2.390 landed pt 15: cold-path fallbacks honor the flag.** Two
hardcoded `scene_tokens` reads from earlier ships (v2.385's
`startCombatFromMap` cold fallback, v2.387's `NPCManager`
placement-count cold fetch) now check `use_combatants_for_battlemap`
and route to `listPlacements` or `listTokens` accordingly. Both also
inherited the v2.389 scene-pick alignment (`listScenes()[0]`,
matching BattleMapV2's mount).

This was the audit ship before flag flip — both spots could have
silently miscounted or seeded the wrong tokens once the flag went
on. Now they're flag-aware.

| Stage from plan | Status | Notes |
|---|---|---|
| v2.309 — tables created | ✅ Shipped | `combatants`, `scene_token_placements` exist |
| v2.310 — initial backfill | ✅ Shipped | Drift cleared at v2.389 |
| v2.311 — `combatant_id` on CP, dual-write | ✅ Shipped | 100% of CP rows have combatant_id |
| v2.312 — battlemap dual-path | 🟡 Code shipped, flag never flipped | `tokensApiRouter` XOR-routes; flag still off |
| v2.313 — combat reads HP from combatants | ✅ Shipped (via v2.315–v2.319) | `cp_ensure_combatant_link` trigger seeds combatants on CP insert |
| v2.314 — drop legacy CP columns | ✅ Shipped (v2.321) | `combat_participants` no longer carries HP/conditions |
| pt 14 — scene_tokens → placements sync | ✅ Shipped (v2.389) | One-way trigger; placements is read-model |
| **pt 15 — cold-path fallbacks honor the flag** | **✅ Shipped (v2.390)** | startCombatFromMap + NPCManager cold-fetch now flag-aware |
| v2.315 — drop `scene_tokens`, etc. | ❌ Not shipped | Still 2 ships away |

**Phase 3 cutover remaining ships (post-v2.390):**

| Ship | Goal | Risk |
|---|---|---|
| Next | Flip `use_combatants_for_battlemap` for one campaign and dogfood for a session. Trigger keeps tables in sync; if the new path breaks, flip back. | Low — flag flip is reversible |
| Then | Drop `scene_tokens`, drop sync trigger, inline `tokensApiRouter`, remove dual-path code in BattleMapV2. | Medium — irreversible drop, but at this point the new path has been the read path through the trigger period |

## Status update — as of v2.389

**v2.389 landed pt 14: scene_tokens → placements sync trigger.** The first
of 4 ships needed to finish the visual-side cutover. Placements is now
a continuously-rebuilt read-model of scene_tokens; both tables are in
sync after every write.

| Stage from plan | Status | Notes |
|---|---|---|
| v2.309 — tables created | ✅ Shipped | `combatants`, `scene_token_placements` exist |
| v2.310 — initial backfill | ✅ Shipped | Apr 19–26 data; subsequent rows went to `scene_tokens` only — drift cleared at v2.389 |
| v2.311 — `combatant_id` on CP, dual-write | ✅ Shipped | 100% of CP rows have combatant_id |
| v2.312 — battlemap dual-path | 🟡 Code shipped, flag never flipped | `tokensApiRouter` XOR-routes; `use_combatants_for_battlemap = false` everywhere |
| v2.313 — combat reads HP from combatants | ✅ Shipped (via v2.315–v2.319) | `cp_ensure_combatant_link` trigger seeds combatants on CP insert |
| v2.314 — drop legacy CP columns | ✅ Shipped (v2.321) | `combat_participants` no longer carries HP/conditions |
| **pt 14 — scene_tokens → placements sync** | **✅ Shipped (v2.389)** | One-way trigger; placements is read-model. Stale v2.310 rows cleared, current scene_tokens replayed. |
| v2.315 — drop `scene_tokens`, etc. | ❌ Not shipped | Still 3 ships away |

**Phase 3 cutover remaining ships (post-v2.389):**

| Ship | Goal | Risk |
|---|---|---|
| Next | Audit pass + fix v2.385 fallback in startCombatFromMap (currently hardcodes scene_tokens; needs to route through tokensApiRouter or read placements when flag is on) | Low |
| Then | Flip `use_combatants_for_battlemap` for one campaign and dogfood for a session. Trigger keeps tables in sync; if the new path breaks, flip back. | Low — flag flip is reversible |
| Then | Drop `scene_tokens`, drop sync trigger, inline `tokensApiRouter`, remove dual-path code in BattleMapV2. | Medium — irreversible drop, but at this point the new path has been the read path through the trigger period |

## Status update — as of v2.388

The arc landed for the **combat side** but stalled mid-flight on the
**visual side**. Reality vs the original plan below:

| Stage from plan | Status | Notes |
|---|---|---|
| v2.309 — tables created | ✅ Shipped | `combatants`, `scene_token_placements` exist |
| v2.310 — initial backfill | ✅ Shipped | Apr 19–26 data; subsequent rows went to `scene_tokens` only |
| v2.311 — `combatant_id` on CP, dual-write | ✅ Shipped | 100% of CP rows have combatant_id |
| v2.312 — battlemap dual-path | 🟡 Code shipped, flag never flipped | `tokensApiRouter` XOR-routes; `use_combatants_for_battlemap = false` everywhere |
| v2.313 — combat reads HP from combatants | ✅ Shipped (via v2.315–v2.319) | `cp_ensure_combatant_link` trigger seeds combatants on CP insert |
| v2.314 — drop legacy CP columns | ✅ Shipped (v2.321) | `combat_participants` no longer carries HP/conditions |
| v2.315 — drop `scene_tokens`, etc. | ❌ Not shipped | `scene_tokens` is still the active visual layer |

**What this means today:**

- Combatants is canonical for HP / conditions / death saves / buffs.
- CP is a thin link table holding initiative + action economy +
  combatant_id FK.
- But the **visual layer has not flipped over**. `scene_token_placements`
  has stale rows from the v2.310 backfill; `scene_tokens` is being
  written by every placement flow. Flipping the flag now would show
  the user old data.

**Why the visual side stalled:** the router is XOR (legacy OR new), not
dual-write. There's no automatic sync between `scene_tokens` and
`scene_token_placements`, so once the flag stayed off, placements drifted.
Cutover now requires either (a) a sync trigger to dual-write going
forward, then a re-backfill, then flag flip; or (b) a one-shot heavy
backfill that creates combatants for tokens not in combat (e.g., the
ARDs placed but never fought).

**Known bugs introduced during the pause:**

- `startCombatFromMap.ts` (v2.385) added a DB fallback that hardcodes
  `scene_tokens`. Will silently miss placements when the flag flips.
  Fix: route through `tokensApiRouter` or use the new path explicitly.
- The legacy `homebrew_monsters.visible_to_players` column is **not**
  dead — `DMScreen` uses it to bucket NPCs into "Hidden / Revealed"
  for the DM's narrative roster. Distinct from
  `scene_tokens.visible_to_all` (per-token map visibility, what v2.386
  wired the per-token Quick Panel toggle to). After Phase 3 cutover,
  `scene_tokens.visible_to_all` lives on as `scene_token_placements.visible_to_all`.

## Recommended path to finish

| Ship | Goal | Risk |
|---|---|---|
| Next | Sync trigger: on `scene_tokens` INSERT/UPDATE/DELETE, mirror to `scene_token_placements`. Trigger handles creating combatants for tokens that have no matching CP. Tokens stay 1:1 with combatants (one combatant per instance) to preserve "same creature placed twice = two HP pools" semantics that DMs use today. | Medium — trigger logic touches campaign-scoped reads + identity heuristics for unlinked tokens |
| Then | Re-backfill placements from current `scene_tokens` snapshot. Audit row counts and visual fidelity per scene. | Low once sync trigger is proven |
| Then | Flip `use_combatants_for_battlemap` per-campaign. Dogfood for a session or two. Trigger keeps both tables in sync; router reads from new path. | Low — flag flip is reversible |
| Then | Drop `scene_tokens`, drop sync trigger, inline `tokensApiRouter`, fix v2.385 fallback. | Medium — irreversible drop, but at this point the new path has been the read path through the trigger period |

## Original design follows

(everything below is the v2.308 design as written; preserved for
historical context)

---



## TL;DR

Today three concerns are tangled across `scene_tokens`, `combat_participants`,
`npcs`, and `dm_npc_roster`: **definition** (what is a goblin), **instance**
(this specific goblin in this campaign), and **placement** (where this
instance appears on this scene). This refactor untangles them into a clean
3-layer model:

1. **Definitions** (existing) — `monsters`, `characters`, `dm_npc_roster`
2. **Combatants** (new) — campaign-scoped persistent instances of definitions
3. **Placements** (new) — visual layer; lightweight rows mapping combatants
   to scenes

`combat_participants` becomes a thin link table referencing `combatants`
for HP/conditions and holding only per-encounter state (initiative, turn
budgets). `scene_tokens` and `npcs` become redundant and are dropped at
the end of the arc.

## Problem statement — three conflated concerns

The current model entangles concerns that should be separable:

| Concern | Today's home | Issue |
|---|---|---|
| **Definition** — stat block of "a goblin" | `monsters` (canonical/homebrew), `characters` (PCs), `dm_npc_roster` (DM-curated, currently 0 rows) | Three half-redundant tables. `dm_npc_roster` was built but never adopted. |
| **Instance** — "Goblin Bob in this campaign with 7 HP and the Frightened condition" | Scattered across `combat_participants` (encounter-bound, lost when combat ends), `npcs` (narrative-focused, has HP but no full stat block), `scene_tokens` (visual only, no stat block when no FK is set) | No persistent campaign-scoped instance row. Combat ends → state is gone. Place a creature without combat → no stat block at all. |
| **Placement** — "Goblin Bob is at (5, 7) on this scene" | `scene_tokens` rows (one per scene per appearance) | Same monster on two scenes = two unrelated rows. Identity is by name match, not FK. |

Concrete pain points this creates:

- **Identity drift.** A combat participant and its scene token are linked
  by FK on character_id (PC case) but by case-insensitive name match for
  monsters/NPCs (`battleMapGeometry.ts:134`). Rename the token, lose the
  combat link.
- **State loss across encounters.** End an encounter — the
  `combat_participants` row drops with the cascade. Re-add the same NPC
  to a new encounter — start fresh. HP and conditions don't persist
  outside combat.
- **Reuse friction.** Place a goblin on a second scene = build it from
  scratch. There's no "this is the same goblin I built earlier" linkage.
- **`dm_npc_roster` is orphaned.** Full stat-block schema, owner-scoped,
  zero rows in production. The library concept exists but isn't wired to
  anything.

## Proposed model

### Layer 1: Definitions (unchanged)

`monsters` (canonical SRD + homebrew), `characters` (PCs), `dm_npc_roster`
(curated definitions). Definitions are immutable from the combatant's
perspective — when a combatant is created, the relevant stats are
**snapshotted** into a jsonb cache so canonical changes don't retroactively
alter existing combatants.

### Layer 2: Combatants (new)

```sql
CREATE TABLE combatants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Display identity (override-able from the definition)
  name                  text NOT NULL,
  portrait_storage_path text,

  -- Definition link
  definition_type       text NOT NULL CHECK (definition_type IN
                          ('character', 'srd_monster', 'homebrew_monster',
                           'roster_npc', 'custom')),
  definition_id         text,  -- characters.id (uuid as text), monsters.id,
                                -- dm_npc_roster.id, or NULL for custom
  stat_block_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,
                                -- frozen copy of relevant definition fields

  -- Persistent runtime state (survives encounter end)
  current_hp            integer NOT NULL DEFAULT 0,
  max_hp                integer NOT NULL DEFAULT 0,
  temp_hp               integer NOT NULL DEFAULT 0,
  ac_override           integer,    -- NULL = use snapshot.ac
  speed_override        integer,    -- NULL = use snapshot.speed
  active_conditions     text[] NOT NULL DEFAULT ARRAY[]::text[],
  condition_sources     jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_buffs          jsonb NOT NULL DEFAULT '[]'::jsonb,
  exhaustion_level      integer NOT NULL DEFAULT 0,
  death_save_successes  integer NOT NULL DEFAULT 0,
  death_save_failures   integer NOT NULL DEFAULT 0,
  is_stable             boolean NOT NULL DEFAULT false,
  is_dead               boolean NOT NULL DEFAULT false,

  -- Provenance
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  last_used_at          timestamptz
);
```

A combatant is the canonical "this creature instance in this campaign."
Placed on a scene? Goes through a placement row. In a combat encounter?
Goes through a combat_participants link. Outside combat and not on a
scene? Still exists, still has HP — the DM can edit conditions and
prepare for the next encounter.

This subsumes:
- `npcs` runtime state (HP, AC, conditions, ability_scores)
- `combat_participants` HP/conditions (stays per-encounter only for
  initiative and action economy)

### Layer 3: Placements (new)

```sql
CREATE TABLE scene_token_placements (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id                    uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  combatant_id                uuid NOT NULL REFERENCES combatants(id) ON DELETE CASCADE,

  -- Visual placement on this specific scene
  x                           real NOT NULL DEFAULT 0,
  y                           real NOT NULL DEFAULT 0,
  rotation                    real NOT NULL DEFAULT 0,
  z_index                     integer NOT NULL DEFAULT 0,

  -- Per-scene overrides; NULL = inherit from combatant
  size_override               text,
  color_override              integer,
  image_storage_path_override text,

  -- Visibility (DM hide-from-players, RLS-enforced)
  visible_to_all              boolean NOT NULL DEFAULT true,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scene_token_placements_scene_idx
  ON scene_token_placements(scene_id);
CREATE INDEX scene_token_placements_combatant_idx
  ON scene_token_placements(combatant_id);
```

A placement is "combatant X appears at (x, y) on scene Y." Placing the
same combatant on two scenes = two placement rows pointing at the same
combatant — meaning HP, conditions, and stat block are shared. Move the
goblin between scenes by deleting one placement and creating another, or
by updating `scene_id`. Override columns let a single combatant render
differently per scene if the DM wants (e.g., a smaller token in a
crowded room).

This replaces `scene_tokens` for any creature-bearing token. Decorative
or label tokens (if any exist — none currently) would need a separate
treatment, but in v2.286 the only non-creature tokens are
`scene_texts` / `scene_drawings`, which already have their own tables.

### Combat participants — thin link table

```sql
ALTER TABLE combat_participants
  ADD COLUMN combatant_id uuid REFERENCES combatants(id) ON DELETE CASCADE;

-- After backfill + client refactor:
ALTER TABLE combat_participants
  DROP COLUMN entity_id,
  DROP COLUMN participant_type,
  DROP COLUMN current_hp,
  DROP COLUMN max_hp,
  DROP COLUMN temp_hp,
  DROP COLUMN ac,
  DROP COLUMN active_conditions,
  DROP COLUMN condition_sources,
  DROP COLUMN active_buffs,
  DROP COLUMN exhaustion_level,
  DROP COLUMN death_save_successes,
  DROP COLUMN death_save_failures,
  DROP COLUMN is_stable,
  DROP COLUMN is_dead,
  DROP COLUMN concentration_spell_id;
-- Keep: id, encounter_id, campaign_id, combatant_id, name (cached for sort),
--       initiative, initiative_tiebreaker, turn_order,
--       action_used, bonus_used, reaction_used, movement_used_ft,
--       leveled_spell_cast, dash_used_this_turn, disengaged_this_turn,
--       hidden_from_players, persistent_cover, max_speed_ft,
--       legendary_actions_total/remaining/config, legendary_resistance/used
```

Per-encounter state (initiative, action economy, dash/disengage) stays
on `combat_participants` because it resets between encounters. HP /
conditions / death saves move to `combatants` because they persist.

## Migration roadmap

This is multi-ship. Each stage is a separate ship to keep the blast
radius small and easy to roll back.

| Ship | What lands | Risk |
|------|-----------|------|
| **v2.309** | Create `combatants` and `scene_token_placements` tables with full RLS. No client changes. New tables sit empty. | Low — additive only. |
| **v2.310** | Backfill: one combatant per existing PC (linking `definition_type='character'`, `definition_id=character.id`); one combatant per `npcs` row (`definition_type='roster_npc'` if source_monster matches roster, else `'custom'`); one combatant per `scene_token` lacking character/npc FKs (typed as `'srd_monster'` if name matches a canonical monster, else `'custom'`). One placement per `scene_token`. | Medium — backfill correctness matters. With 5 scene_tokens and 3 npcs in live, audit is tractable. |
| **v2.311** | Add `combatant_id` FK column on `combat_participants` alongside existing `entity_id`/`participant_type`. Backfill from existing rows. Client still reads/writes the old columns. | Low — dual-shape transitional. |
| **v2.312** | Refactor `sceneTokens.ts` API → new `scenePlacements.ts`. Refactor `BattleMapV2.tsx` token render path to read placements joined with combatants. Both APIs available; battleMapStore Token shape grows a `combatantId` field. | **High** — 7800-line component. Land behind a feature flag (`useCombatants`); DM toggles in campaign settings during dogfooding. |
| **v2.313** | Refactor `combatEncounter.ts` and `buffs.ts` to source HP/conditions from `combatants` rather than `combat_participants`. Dual-write during transition (write to both). | Medium-high — combat code is the most-tested surface. Triggers can keep the dual-write consistent. |
| **v2.314** | Cut over: drop `participant_type`/`entity_id` from `combat_participants` and the per-encounter HP/condition columns. Drop the dual-write code. | Medium — irreversible drop. Run after v2.313 has soaked. |
| **v2.315** | Drop `scene_tokens`. Drop or repurpose `npcs` (keep narrative-only fields if useful, drop the duplicated combat fields). Drop `dm_npc_roster` if combatants subsume the use case, or keep it as a "saved templates" library. | Low (the cleanup) — but read carefully for any code paths still referencing these tables. |

Total: 7 ships across the arc. Possible to compress v2.313+v2.314 into a
single ship if the dual-write phase soaks cleanly.

## Open questions

These should be resolved before v2.309 lands:

1. **HP authority during dual-write.** During v2.311–v2.313, both
   `combatants.current_hp` and `combat_participants.current_hp` exist.
   What's the source of truth? Options:
   - **(a)** Trigger keeps them in sync bidirectionally
   - **(b)** App code dual-writes; Postgres doesn't enforce
   - **(c)** Combatants is canonical; combat_participants.current_hp is
     a generated column that reads from combatants
   Recommendation: **(a)** trigger from `combat_participants` writes →
   `combatants`, app reads from combatants. Trigger is one-way (writes
   only mirror upward), keeping the legacy write path working without
   creating a circular dependency.

2. **`dm_npc_roster` future.** Once combatants exist, the roster's role
   is unclear. Two paths:
   - **(a)** Drop it. Combatants subsume the "saved monster" concept;
     definitions live in `monsters` (canonical/homebrew).
   - **(b)** Keep it as a "templates" concept. A roster row is a saved
     stat-block template the DM can use to spawn a fresh combatant.
     Different from a monster (which is canonical content) or a
     combatant (which is a specific instance).
   Recommendation: **(b)**. The roster is well-positioned as a templates
   table — DM-authored quick-start stat blocks distinct from the SRD
   monster catalogue.

3. **Stat-block snapshot scope.** What gets cached in
   `combatants.stat_block_snapshot`? Full monster row, or just the
   fields combat reads (HP formula, AC, attacks, abilities)?
   Recommendation: cache the full snapshot. JSON in jsonb is cheap;
   schema-narrow snapshots create future migration pain when combat
   wants a previously-uncached field.

4. **Pending attacks/reactions chain.** `pending_attacks` and
   `pending_reactions` reference `combat_participants.id`. Does the
   refactor break this? `combat_participants.id` is preserved (it's
   the same row, just with fewer columns). The chain stays intact.
   Confirmed safe.

5. **NPCManager.tsx behavior.** The narrative NPC manager currently uses
   the `npcs` table for faction/relationship/status fields. Combatants
   carry HP/AC/combat state but no narrative fields. Either:
   - **(a)** Keep `npcs` as a narrative-only sidecar; combatants have a
     nullable `npc_id` linking back
   - **(b)** Move narrative fields to combatants (faction, relationship,
     status, last_seen, location, role, race)
   Recommendation: **(b)**. A combatant is "this creature in the
   campaign" and narrative metadata fits there. Keeps everything about
   one creature in one row.

## Risks

- **BattleMapV2.tsx is 7829 lines.** Token shape changes ripple. The
  feature-flag approach in v2.312 is essential — if the new render path
  has a regression, the DM can flip back without losing data.
- **Realtime channel impact.** Subscriptions on `scene_tokens` and
  `combat_participants` exist throughout the client. Each refactored
  table needs realtime publication membership and updated subscription
  handlers.
- **RLS policy migration.** Each new table needs full SELECT/INSERT/
  UPDATE/DELETE policies. The patterns from `scene_tokens` and
  `combat_participants` apply directly but must be re-derived for
  `combatants` (campaign-scoped, owner-edits-only-for-DM, players-see-
  their-own-PC-combatant).
- **Identity backfill ambiguity.** A `scene_token` with `name='Goblin'`
  and no FKs could be one of: a canonical SRD goblin, a renamed token
  for a different monster, or a custom DM-named entity. The backfill
  needs a heuristic (try canonical name match, fall back to `'custom'`)
  and an audit log so the DM can fix mis-classifications.

## Why this matters

The current model works for the simple case (one PC, one combat, one
scene) but starts breaking down for the patterns DnD campaigns actually
use:

- Recurring NPCs (a faction lieutenant who appears across multiple
  sessions and encounters)
- Multi-scene encounters (chase scenes, large dungeons)
- Off-combat creature state (a kidnapped NPC bleeding out between
  combats — currently has no place to track HP)

It also unblocks features that are sketched but blocked on identity
clarity:

- Token library UI (drag a saved combatant from a sidebar onto a scene)
- Cross-campaign creature import
- "What's this creature's history" — view all past encounters for a
  combatant, since combatants persist where combat_participants don't.

Phase 3 is the structural change that lets these work cleanly.
