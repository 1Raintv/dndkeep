-- v2.838: raw typed dice history, not a replacement for final applied damage.
-- NULL means legacy/unknown; old riders cannot be recovered from a combined total.
alter table public.pending_attacks add column if not exists damage_components jsonb;
comment on column public.pending_attacks.damage_components is 'Versioned raw base/rider damage components before saves, reactions, defenses and DM overrides. NULL is legacy/unknown.';
