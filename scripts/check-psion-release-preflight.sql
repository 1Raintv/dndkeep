-- v2.869: read-only data checks for the release after ledger 20261008211300.
-- Run before deployment; results are a point-in-time snapshot, not a lock.
-- Blocking count must be zero. Review nonzero affected-row counts before apply.
-- This does not replace exact ledger comparison, schema rehearsal, or UI tests.
begin transaction read only;
with checks as (
select 'blocking_legendary_pool_rows' as check_name, count(*) as row_count
from public.combat_participants
where legendary_actions_remaining > legendary_actions_total
  + case when legendary_actions_total > 0 then 1 else 0 end
union all
select 'affected_stable_state_backfill', count(*)
from public.characters
where current_hp = 0 and death_saves_successes = 3 and death_saves_failures < 3
union all
select 'review_pending_death_saves', count(*)
from public.pending_death_saves where state = 'pending'
union all
select 'review_active_encounters', count(*)
from public.combat_encounters where status = 'active'
union all
select 'review_unresolved_attacks', count(*)
from public.pending_attacks where state in ('declared','attack_rolled','damage_rolled')
union all
select 'review_open_reaction_offers', count(*)
from public.pending_reactions where state = 'offered'
union all
select 'review_open_concentration_saves', count(*)
from public.pending_concentration_saves where state = 'offered'
), ledger as (
  select count(*) as applied_migrations, max(version) as latest_version
  from supabase_migrations.schema_migrations
)
select jsonb_build_object(
  'checks', (select jsonb_object_agg(check_name, row_count) from checks),
  'ledger', (select to_jsonb(ledger) from ledger)
) as preflight;
-- New death-save identity columns start NULL for legacy rows. The unique index
-- ignores NULL turn IDs, and the migration expires legacy pending offers.
-- Already-migrated databases can have current offers: review, never auto-expire.
-- Concentration uses offered, while death saves use pending. Keep these distinct.
-- Activity counts guide release timing; zero is not proof of all compatibility.
commit;
