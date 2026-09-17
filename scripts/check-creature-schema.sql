-- Integration regression: run ONLY on local or explicitly selected hosted TEST.
-- Uses transaction-scoped fixtures and rolls every inserted row back. No emails.
-- psql -v ON_ERROR_STOP=1 -f scripts/check-creature-schema.sql
begin;
set local statement_timeout = '30s';
do $$
declare
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  campaign_id uuid := gen_random_uuid();
  encounter_id uuid := gen_random_uuid();
  creature_id uuid := gen_random_uuid();
  folder_id uuid := gen_random_uuid();
begin
  perform set_config('test.owner', owner_id::text, true);
  perform set_config('test.member', member_id::text, true);
  perform set_config('test.outsider', outsider_id::text, true);
  perform set_config('test.campaign', campaign_id::text, true);
  perform set_config('test.encounter', encounter_id::text, true);
  perform set_config('test.creature', creature_id::text, true);
  perform set_config('test.folder', folder_id::text, true);
  insert into auth.users(id,email,raw_user_meta_data)
    select id, id::text || '@schema-test.invalid', '{}'::jsonb
    from unnest(array[owner_id,member_id,outsider_id]) id;
  update public.profiles set subscription_tier='pro', subscription_status='active'
    where id=owner_id;
  insert into public.campaigns(id,owner_id,name) values(campaign_id,owner_id,'Schema regression');
  insert into public.campaign_members(campaign_id,user_id,role) values(campaign_id,member_id,'player');
  insert into public.combat_encounters(id,campaign_id) values(encounter_id,campaign_id);
  insert into public.creature_folders(id,owner_id,campaign_id,name)
    values(folder_id,owner_id,campaign_id,'Shared regression folder');
  insert into public.homebrew_monsters(id,user_id,owner_id,campaign_id,folder_id,name,hp,max_hp)
    values(creature_id,owner_id,owner_id,campaign_id,folder_id,'Visible regression creature',17,23);
  insert into public.homebrew_monsters(user_id,owner_id,campaign_id,name,visible_to_players)
    values(owner_id,owner_id,campaign_id,'Hidden regression creature',false);
end $$;

-- Exercise actual RLS and the invoker combat trigger, not privileged SELECTs.
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
declare kind text; linked_id uuid; touched timestamptz;
begin
  foreach kind in array array['creature','npc','monster'] loop
    insert into public.combat_participants(encounter_id,campaign_id,participant_type,entity_id,name)
      values(current_setting('test.encounter')::uuid,current_setting('test.campaign')::uuid,
        kind,current_setting('test.creature'),'Regression ' || kind)
      returning combatant_id into linked_id;
    if not exists(select 1 from public.combatants where id=linked_id
        and definition_type='homebrew_monster' and current_hp=17 and max_hp=23) then
      raise exception 'Combat link/stat snapshot failed for %',kind;
    end if;
  end loop;
  if (select count(*) from public.combatants where campaign_id=current_setting('test.campaign')::uuid) <> 1 then
    raise exception 'Legacy aliases created duplicate combatants';
  end if;
  update public.homebrew_monsters set updated_at='2000-01-01' where id=current_setting('test.creature')::uuid
    returning updated_at into touched;
  if touched is distinct from now() then raise exception 'Creature timestamp trigger missing'; end if;
  update public.creature_folders set updated_at='2000-01-01' where id=current_setting('test.folder')::uuid
    returning updated_at into touched;
  if touched is distinct from now() then raise exception 'Folder timestamp trigger missing'; end if;
  begin
    update public.homebrew_monsters set source_monster_id='missing-schema-regression-source'
      where id=current_setting('test.creature')::uuid;
    raise exception 'Missing source FK accepted orphan';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('test.member'),true);
set local role authenticated;
do $$
declare changed integer;
begin
  if (select count(*) from public.homebrew_monsters where campaign_id=current_setting('test.campaign')::uuid) <> 1 then
    raise exception 'Member must see exactly the visible creature';
  end if;
  if (select count(*) from public.creature_folders where id=current_setting('test.folder')::uuid) <> 1 then
    raise exception 'Member cannot read campaign folder';
  end if;
  update public.homebrew_monsters set hp=1 where id=current_setting('test.creature')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Member modified another user creature'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('test.outsider'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.homebrew_monsters where campaign_id=current_setting('test.campaign')::uuid)
    or exists(select 1 from public.creature_folders where id=current_setting('test.folder')::uuid) then
    raise exception 'Unrelated account can read private campaign creatures/folders';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
  if exists(select 1 from public.homebrew_monsters where campaign_id=current_setting('test.campaign')::uuid)
    or exists(select 1 from public.creature_folders where id=current_setting('test.folder')::uuid) then
    raise exception 'Anonymous access to private campaign creatures/folders';
  end if;
end $$;
reset role;
rollback;
select 'Creature permissions, aliases, snapshots, timestamps and source FK passed; fixtures rolled back' as result;
