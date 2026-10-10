-- v2.869: pending next-save expiry reads acquire FOR SHARE locks. PostgREST
-- runs STABLE RPCs in a read-only transaction, which forbids those locks.
-- Keep the read-only application behavior and existing DM authorization;
-- declare lock-taking functions VOLATILE so POST RPCs may acquire row locks.
-- https://docs.postgrest.org/en/stable/references/transactions.html#access-mode
alter function public.get_aura_resolution_context(uuid,uuid,uuid,uuid,text,text) volatile;
alter function dndkeep_private.get_aura_resolution_context(uuid,uuid,uuid,uuid,text,text) volatile;
alter function dndkeep_private.aura_resolution_context(uuid,uuid,uuid,uuid,text,text) volatile;
notify pgrst, 'reload schema';
