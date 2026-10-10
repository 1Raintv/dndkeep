-- v2.869: campaign resolvers need current modifiers, never private roll/payment
-- receipts. Keep the read narrow and do not persist bonuses into base statistics.
create or replace function dndkeep_private.get_mutable_form_active(p_character uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.mutable_form_declarations; clock_seconds bigint; remaining bigint; armor boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to read Mutable Form';end if;
 select * into c from public.characters where id=p_character and (
  user_id=auth.uid()
  or exists(select 1 from public.campaigns ca where ca.id=characters.campaign_id and ca.owner_id=auth.uid())
  or exists(select 1 from public.campaign_members cm where cm.campaign_id=characters.campaign_id and cm.user_id=auth.uid()));
 if not found then raise exception 'Character effects are unavailable';end if;
 select * into d from dndkeep_private.mutable_form_declarations where character_id=c.id and ended_reason is null order by created_at desc,request_id desc limit 1;
 if not found then return null;end if;
 select elapsed_seconds into clock_seconds from dndkeep_private.psionic_duration_clocks where character_id=c.id;
 if clock_seconds is null or clock_seconds<d.start_seconds then raise exception 'Mutable Form game clock is unavailable';end if;
 remaining:=greatest(0,d.duration_seconds-(clock_seconds-d.start_seconds)-d.elapsed_adjustment);
 if remaining=0 then return null;end if;
 if c.inventory is not null and jsonb_typeof(c.inventory)<>'array' then raise exception 'Review current armor before using Mutable Form';end if;
 select exists(select 1 from jsonb_array_elements(coalesce(c.inventory,'[]'::jsonb)) item
  where item->'equipped'='true'::jsonb and item->>'armorType' in('light','medium','heavy')) into armor;
 return jsonb_build_object('declarationId',d.request_id,'remainingSeconds',remaining,'durationSeconds',d.duration_seconds,
  'fleshWeaver',d.request->'fleshWeaver','improvement',d.request->'improvement','wearingArmor',armor);
end;$$;
revoke all on function dndkeep_private.get_mutable_form_active(uuid) from public,anon;
grant execute on function dndkeep_private.get_mutable_form_active(uuid) to authenticated;
create or replace function public.get_mutable_form_active(p_character uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select dndkeep_private.get_mutable_form_active(p_character);
$$;
revoke all on function public.get_mutable_form_active(uuid) from public,anon;
grant execute on function public.get_mutable_form_active(uuid) to authenticated;
