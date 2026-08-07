-- v2.650 — schema convergence: drop objects that are dead in code but still
-- linger in one or both databases, so the two-tier CI's test↔prod column diff
-- comes back clean (expected residual: client_errors, which is test-first by design).
--
-- Discovered by the prod-vs-test column diff (owner queue / audit item #19). Two
-- clusters, same root cause — code moved on but the physical DROP never shipped
-- as a migration:
--
--   1. Legacy NPC subsystem — `npcs`, `dm_npc_roster`, and `scene_tokens.npc_id`
--      (an FK into `npcs`). Superseded by the unified combatants/creatures model
--      and dropped from PROD out-of-band around v2.350 — but never as a migration
--      file, so the repo chain re-creates them when replayed into an empty test DB.
--      Code carries only historical comments + defensive null-reads (see
--      src/lib/api/sceneTokens.ts: "npc_id ... always null on read" / "writing to
--      it would 500 the insert"). Zero rows, zero inbound FKs beyond the cluster
--      itself.
--
--   2. `combat_participants.concentration_spell_id` — abandoned in code at v2.471
--      (see src/lib/pendingAttack.ts: "the now-dropped concentration_spell_id
--      column"). Concentration is tracked via `characters.concentration_spell` +
--      `concentration_rounds_remaining`/`concentration_slot_level` and the
--      `pending_concentration_saves` table — all live. The column's DROP never ran,
--      so it survives in BOTH prod and test. This migration finally lands it.
--
-- Safety: every statement is IF EXISTS, so it no-ops wherever an object is already
-- gone (the NPC cluster on prod) and does the real work elsewhere (concentration
-- column on both; the cluster on test). Verified 0 dependent policies / views /
-- indexes / routines on both projects before authoring, so the bare DROPs won't
-- fail on a dependency. End state: prod == test (modulo client_errors).

alter table if exists public.scene_tokens        drop column if exists npc_id;
drop  table if exists public.npcs                 cascade;
drop  table if exists public.dm_npc_roster        cascade;
alter table if exists public.combat_participants  drop column if exists concentration_spell_id;
