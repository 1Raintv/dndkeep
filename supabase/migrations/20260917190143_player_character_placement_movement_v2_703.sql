-- v2.703 — DM-created PC combatants keep their DM owner. Authorize only
-- placement movement through the linked character, not combatant ownership.
begin;
create schema if not exists dndkeep_private;
revoke all on schema dndkeep_private from public, anon;
grant usage on schema dndkeep_private to authenticated;

-- This private lookup needs definer rights because combatants SELECT re-enters
-- placements RLS (the v2.654 recursion). It returns only caller authorization,
-- uses a pinned path, and is not exposed as a public RPC.
create or replace function dndkeep_private.can_move_character(cb_id uuid, target_scene uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.combatants cb
    join public.characters ch on ch.id::text = cb.definition_id
    join public.scenes s on s.id = target_scene and s.campaign_id = cb.campaign_id
    join public.campaign_members cm on cm.campaign_id = s.campaign_id
    where cb.id = cb_id and cb.definition_type = 'character'
      and ch.user_id = auth.uid() and ch.campaign_id = s.campaign_id
      and cm.user_id = auth.uid() and s.is_published
  );
$$;
revoke all on function dndkeep_private.can_move_character(uuid,uuid) from public, anon;
grant execute on function dndkeep_private.can_move_character(uuid,uuid) to authenticated;

-- RLS chooses rows, not columns. Guard the newly authorized path against
-- changing identity, visibility, artwork, lighting, or any future columns.
-- Preserve existing scene-DM/combatant-owner privileges and internal sync jobs.
create or replace function dndkeep_private.guard_character_placement_move()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'authenticated'
     or public.owns_combatant(old.combatant_id)
     or exists (select 1 from public.scenes s where s.id=old.scene_id and s.owner_id=auth.uid()) then
    return new;
  end if;
  if not dndkeep_private.can_move_character(old.combatant_id,old.scene_id)
     or not old.visible_to_all
     or (to_jsonb(new) - array['x','y','updated_at']) is distinct from
        (to_jsonb(old) - array['x','y','updated_at']) then
    raise exception 'Players may only move their own character token' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function dndkeep_private.guard_character_placement_move() from public, anon, authenticated;
drop trigger if exists guard_character_placement_move on public.scene_token_placements;
create trigger guard_character_placement_move before update on public.scene_token_placements
for each row execute function dndkeep_private.guard_character_placement_move();

drop policy if exists stp_player_move_linked_character on public.scene_token_placements;
create policy stp_player_move_linked_character on public.scene_token_placements
for update to authenticated
using (visible_to_all and dndkeep_private.can_move_character(combatant_id,scene_id))
with check (visible_to_all and dndkeep_private.can_move_character(combatant_id,scene_id));
commit;
