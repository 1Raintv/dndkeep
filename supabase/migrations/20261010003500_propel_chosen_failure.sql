-- 2024 voluntary failure is a recorded save, not a resource-payment shortcut.
-- The campaign DM attests the target's choice; a caster cannot force an enemy to consent.
create or replace function dndkeep_private.choose_propel_failure(p_character uuid,p_declaration uuid,p_expected jsonb,p_dc integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; cp public.combat_participants;
 live jsonb; penalty jsonb; evidence jsonb; request jsonb; pending boolean;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found or not exists(select 1 from public.campaigns where id=(d.caster_snapshot->>'campaign_id')::uuid and owner_id=auth.uid())
 then raise exception 'Only this campaign DM can confirm the target chooses failure';end if;
 -- A previously recorded roll wins, including a request from another tab.
 if exists(select 1 from dndkeep_private.propel_save_receipts where declaration_id=d.request_id) then
  return dndkeep_private.propel_save_result(c.id,d.request_id)||jsonb_build_object('replayed',true);
 end if;
 if p_dc is null or p_dc not between 0 and 1000 then raise exception 'Invalid save DC';end if;
 select * into cp from public.combat_participants where id=(d.target->>'participantId')::uuid;
 if cp.participant_type='character' then perform 1 from public.characters where id::text=cp.entity_id for update;end if;
 live:=dndkeep_private.get_propel_save_context(c.id,d.request_id);
 perform 1 from public.combat_participants where id=cp.id for update;
 perform 1 from public.combatants where id=(select combatant_id from public.combat_participants where id=cp.id) for update;
 live:=dndkeep_private.get_propel_save_context(c.id,d.request_id);
 if p_expected is distinct from live then raise exception 'Saving throw settings changed. Review the saved choice before retrying';end if;
 -- This save happens without a roll. Consume its next-save trigger, with no invented d4.
 penalty:=dndkeep_private.consume_next_save_penalty('feature',d.request_id,(live->>'encounterId')::uuid,cp.id,null,true);
 evidence:=jsonb_build_object('participantId',cp.id,'outcome','auto-failed','dc',p_dc);
 pending:=(live->>'legendaryResistanceRemaining')::integer>0;
 request:=jsonb_build_object('expected',live,'dc',p_dc,'dice','[]'::jsonb,'baseBonus',0,'buffTotal',0,
  'buffContributions','[]'::jsonb,'penaltyD4',null,'willing',true,'confirmedBy',auth.uid());
 insert into dndkeep_private.propel_save_receipts(declaration_id,request,context,save,penalty,final_outcome)
 values(d.request_id,request,live,evidence,penalty,case when pending then null else 'failed' end);
 if not pending then perform dndkeep_private.resolve_propel(c.id,d.request_id,'failed',evidence);end if;
 return dndkeep_private.propel_save_result(c.id,d.request_id)||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.choose_propel_failure(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function dndkeep_private.choose_propel_failure(uuid,uuid,jsonb,integer) to authenticated;
create or replace function public.choose_propel_failure(p_character uuid,p_declaration uuid,p_expected jsonb,p_dc integer)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.choose_propel_failure(p_character,p_declaration,p_expected,p_dc);$$;
revoke all on function public.choose_propel_failure(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.choose_propel_failure(uuid,uuid,jsonb,integer) to authenticated;
