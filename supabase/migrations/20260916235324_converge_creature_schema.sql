-- v2.696 follow-up: dashboard-era creature schema was absent from replay.
-- Preserve existing rows; fail atomically on orphaned relationships rather than delete them.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.homebrew_monsters
  alter column conditions set default '[]'::jsonb,
  alter column save_proficiencies set default '[]'::jsonb,
  alter column visible_to_players set default true;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.homebrew_monsters'::regclass and conname='homebrew_monsters_campaign_id_fkey') then
    alter table public.homebrew_monsters add constraint homebrew_monsters_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.homebrew_monsters'::regclass and conname='homebrew_monsters_owner_id_fkey') then
    alter table public.homebrew_monsters add constraint homebrew_monsters_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.homebrew_monsters'::regclass and conname='homebrew_monsters_source_monster_id_fkey') then
    alter table public.homebrew_monsters add constraint homebrew_monsters_source_monster_id_fkey FOREIGN KEY (source_monster_id) REFERENCES monsters(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.scene_tokens'::regclass and conname='scene_tokens_creature_id_fkey') then
    alter table public.scene_tokens add constraint scene_tokens_creature_id_fkey FOREIGN KEY (creature_id) REFERENCES homebrew_monsters(id) ON DELETE SET NULL;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS idx_creature_folders_campaign ON public.creature_folders USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_creature_folders_owner ON public.creature_folders USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_creature_folders_parent ON public.creature_folders USING btree (parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_homebrew_monsters_campaign ON public.homebrew_monsters USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_homebrew_monsters_folder ON public.homebrew_monsters USING btree (folder_id);
CREATE INDEX IF NOT EXISTS idx_homebrew_monsters_owner ON public.homebrew_monsters USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_scene_tokens_creature ON public.scene_tokens USING btree (creature_id);

-- Same membership/visibility behavior as production; owners retain write access.
alter table public.creature_folders enable row level security;
alter table public.homebrew_monsters enable row level security;
drop policy if exists "creature_folders: owner manages" on public.creature_folders;
drop policy if exists creature_folders_owner_all on public.creature_folders;
create policy creature_folders_owner_all on public.creature_folders for ALL using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
drop policy if exists creature_folders_member_read on public.creature_folders;
create policy creature_folders_member_read on public.creature_folders for SELECT using ((campaign_id IN ( SELECT cm.campaign_id
   FROM campaign_members cm
  WHERE (cm.user_id = auth.uid()))));
drop policy if exists homebrew_monsters_member_read on public.homebrew_monsters;
create policy homebrew_monsters_member_read on public.homebrew_monsters for SELECT using (((visible_to_players = true) AND (campaign_id IN ( SELECT cm.campaign_id
   FROM campaign_members cm
  WHERE (cm.user_id = auth.uid())))));

-- Invoker-only timestamp trigger: no elevated privileges or table access.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_creature_folders_touch on public.creature_folders;
create trigger trg_creature_folders_touch before update on public.creature_folders
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_homebrew_monsters_touch on public.homebrew_monsters;
create trigger trg_homebrew_monsters_touch before update on public.homebrew_monsters
  for each row execute function public.touch_updated_at();

-- Accept legacy type aliases too; all now resolve through the unified creature catalog.
CREATE OR REPLACE FUNCTION public.cp_ensure_combatant_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_combatant_id  uuid;
  v_owner_id      uuid;
  v_def_type      text := 'custom';
  v_def_id        text := NULL;
  v_snapshot      jsonb := '{}'::jsonb;
  v_current_hp    integer := 0;
  v_max_hp        integer := 0;
  v_ac            integer := NULL;
BEGIN
  IF NEW.combatant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.participant_type = 'character' THEN
    SELECT id INTO v_combatant_id
      FROM public.combatants
      WHERE definition_type = 'character'
        AND definition_id = NEW.entity_id
        AND campaign_id = NEW.campaign_id
      LIMIT 1;
  ELSIF NEW.participant_type IN ('creature', 'monster', 'npc') THEN
    SELECT id INTO v_combatant_id
      FROM public.combatants
      WHERE definition_type IN ('homebrew_monster','srd_monster','narrative_npc','roster_npc','custom')
        AND definition_id = NEW.entity_id
        AND campaign_id = NEW.campaign_id
      LIMIT 1;
  END IF;

  IF v_combatant_id IS NOT NULL THEN
    NEW.combatant_id := v_combatant_id;
    RETURN NEW;
  END IF;

  SELECT owner_id INTO v_owner_id FROM public.campaigns WHERE id = NEW.campaign_id;

  IF NEW.participant_type = 'character' THEN
    BEGIN
      SELECT to_jsonb(ch.*),
             COALESCE(ch.current_hp, 0),
             COALESCE(ch.max_hp, ch.current_hp, 0)
        INTO v_snapshot, v_current_hp, v_max_hp
        FROM public.characters ch
        WHERE ch.id = NEW.entity_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
    v_def_type := 'character';
    v_def_id   := NEW.entity_id;

  ELSIF NEW.participant_type IN ('creature', 'monster', 'npc') THEN
    BEGIN
      SELECT to_jsonb(hm.*),
             COALESCE(hm.hp, 0),
             COALESCE(hm.max_hp, hm.hp, 0),
             hm.ac
        INTO v_snapshot, v_current_hp, v_max_hp, v_ac
        FROM public.homebrew_monsters hm
        WHERE hm.id = NEW.entity_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;

    IF v_snapshot IS NOT NULL AND v_snapshot != '{}'::jsonb THEN
      v_def_type := 'homebrew_monster';
      v_def_id   := NEW.entity_id;
    ELSE
      SELECT m.id, to_jsonb(m.*), COALESCE(m.hp, 0), m.ac
        INTO v_def_id, v_snapshot, v_current_hp, v_ac
        FROM public.monsters m
        WHERE m.id = NEW.entity_id AND m.owner_id IS NULL
        LIMIT 1;

      IF v_def_id IS NULL THEN
        SELECT m.id, to_jsonb(m.*), COALESCE(m.hp, 0), m.ac
          INTO v_def_id, v_snapshot, v_current_hp, v_ac
          FROM public.monsters m
          WHERE LOWER(m.name) = LOWER(NEW.name) AND m.owner_id IS NULL
          LIMIT 1;
      END IF;

      v_max_hp := v_current_hp;
      v_def_type := CASE WHEN v_def_id IS NOT NULL THEN 'srd_monster' ELSE 'custom' END;
    END IF;
  END IF;

  v_snapshot   := COALESCE(v_snapshot, '{}'::jsonb);
  v_current_hp := COALESCE(v_current_hp, 0);
  v_max_hp     := COALESCE(v_max_hp, 0);

  INSERT INTO public.combatants (
    id, campaign_id, owner_id, name, portrait_storage_path,
    definition_type, definition_id, stat_block_snapshot,
    current_hp, max_hp, temp_hp, ac_override,
    active_conditions, condition_sources, active_buffs,
    exhaustion_level, death_save_successes, death_save_failures,
    is_stable, is_dead,
    created_at, updated_at, last_used_at
  ) VALUES (
    NEW.id, NEW.campaign_id, v_owner_id, NEW.name, NULL,
    v_def_type, v_def_id, v_snapshot,
    v_current_hp, v_max_hp, 0, v_ac,
    ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb,
    0, 0, 0, false, false,
    COALESCE(NEW.created_at, now()), now(), now()
  );

  NEW.combatant_id := NEW.id;
  RETURN NEW;
END;
$function$

commit;
