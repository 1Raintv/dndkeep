-- v2.869 follow-up: reuse atomic campaign damage for a player's own sheet.
-- Authorize against the locked character before replay, cancellation or writes.
-- Campaign membership alone never permits damage to another player's character.
create or replace function dndkeep_private.get_party_damage_context(p_campaign_id uuid,p_character_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or not exists(
  select 1 from public.characters c join public.campaigns campaign on campaign.id=c.campaign_id
  where c.id=p_character_id and c.campaign_id=p_campaign_id
   and (c.user_id=auth.uid() or campaign.owner_id=auth.uid())
 ) then raise exception 'Party damage requires the character owner or current DM';end if;
 return dndkeep_private.party_damage_context(p_campaign_id,p_character_id);
end; $$;

create or replace function dndkeep_private.apply_party_damage(
 p_campaign_id uuid,p_character_id uuid,p_request_id uuid,p_save_id uuid,p_damage integer,p_damage_type text,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.party_damage_events; req jsonb; ctx jsonb; pools jsonb; outcome jsonb;
 cp_id uuid; encounter_id uuid; cb_id uuid; old_hp integer; old_temp integer; max_hp integer; next_hp integer; next_temp integer;
 mode text:='prompt'; proficient boolean; total_level integer; bonus integer; check_id uuid:=null; broken boolean:=false;
 conditions text[]; successes integer; failures integer; dead boolean; massive boolean; exhaustion integer;
begin
 if auth.uid() is null then raise exception 'Party damage requires the character owner or current DM';end if;
 select * into c from public.characters where id=p_character_id and campaign_id=p_campaign_id for update;
 if c.id is null or (c.user_id is distinct from auth.uid() and not exists(select 1 from public.campaigns where id=p_campaign_id and owner_id=auth.uid())) then raise exception 'Party damage requires the character owner or current DM';end if;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_save_id is null or p_request_id=p_save_id or p_damage is null or p_damage<0
  or p_modifier is null or p_modifier not between -105 and 120 or p_expected is null or jsonb_typeof(p_expected)<>'object'
  or (p_damage_type is not null and p_damage_type not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder')) then raise exception 'Invalid party damage request';end if;
 req:=jsonb_build_object('saveId',p_save_id,'damage',p_damage,'damageType',p_damage_type,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.party_damage_events where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.campaign_id is distinct from p_campaign_id or prior.request is distinct from req then raise exception 'Party damage request changed';end if;
  if prior.outcome->>'canceled'='true' then raise exception 'This party damage request was canceled';end if;
  return prior.outcome||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 if exists(select 1 from public.pending_concentration_saves where id=p_save_id) then raise exception 'The concentration identity is already in use';end if;
 ctx:=dndkeep_private.party_damage_context(p_campaign_id,c.id);
 cp_id:=(ctx->'participant'->>'id')::uuid;encounter_id:=(ctx->'participant'->>'encounter_id')::uuid;cb_id:=(ctx->'combatant'->>'id')::uuid;
 if cp_id is not null then
  perform 1 from public.combat_encounters where id=encounter_id for share;
  perform 1 from public.combat_participants where id=cp_id for share;
  perform 1 from public.combatants where id=cb_id for update;
  ctx:=dndkeep_private.party_damage_context(p_campaign_id,c.id);
 end if;
 if ctx is distinct from p_expected then raise exception 'Party state changed; review current damage before applying';end if;
 old_hp:=(ctx->'pools'->>'current_hp')::integer;old_temp:=(ctx->'pools'->>'temp_hp')::integer;max_hp:=(ctx->'pools'->>'max_hp')::integer;
 if max_hp is null or max_hp<0 or old_hp>max_hp then raise exception 'Review the character HP pools';end if;
 pools:=dndkeep_private.damage_hit_point_pools(old_hp,old_temp,p_damage);next_hp:=(pools->>'current_hp')::integer;next_temp:=(pools->>'temp_hp')::integer;
 mode:=coalesce(ctx->'campaign'->'automation_defaults'->>'concentration_on_damage','prompt');
 if mode not in('off','prompt','auto') then mode:='prompt';end if;
 if c.advanced_automations_unlocked and c.automation_overrides->>'concentration_on_damage' in('off','prompt','auto') then mode:=c.automation_overrides->>'concentration_on_damage';end if;
 conditions:=case when cb_id is null then coalesce(c.active_conditions,array[]::text[]) else array(select jsonb_array_elements_text(coalesce(nullif(ctx->'combatant'->'active_conditions','null'::jsonb),'[]'::jsonb))) end;
 successes:=case when cb_id is null then coalesce(c.death_saves_successes,0) else coalesce((ctx->'combatant'->>'death_save_successes')::integer,0) end;
 failures:=case when cb_id is null then coalesce(c.death_saves_failures,0) else coalesce((ctx->'combatant'->>'death_save_failures')::integer,0) end;
 dead:=coalesce((ctx->'combatant'->>'is_dead')::boolean,false) or failures>=3;
 if p_damage>0 then
  massive:=max_hp>0 and greatest(0,p_damage-old_temp)::bigint-old_hp>=max_hp;
  if next_hp=0 then
   if old_hp>0 then successes:=0;failures:=0;else failures:=least(3,failures+1);end if;
   if massive then failures:=3;end if;dead:=dead or failures>=3;
   select array_agg(distinct value order by value) into conditions from unnest(conditions||array['Unconscious','Prone','Incapacitated']) value;
  end if;
  broken:=coalesce(c.concentration_spell,'')<>'' and (next_hp=0 or conditions&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned']);
  -- One write carries the suppression marker; the sheet must not create a
  -- second local save from its HP-delta observer after this committed event.
  update public.characters set current_hp=next_hp,temp_hp=next_temp,last_campaign_damage_id=p_request_id,
   death_saves_successes=successes,death_saves_failures=failures,
   active_conditions=case when next_hp=0 then conditions else active_conditions end where id=c.id;
  if cb_id is not null then
   update public.combatants set current_hp=next_hp,temp_hp=next_temp,death_save_successes=successes,death_save_failures=failures,
    is_dead=dead,is_stable=case when next_hp=0 then false else is_stable end,active_conditions=conditions where id=cb_id;
  end if;
  if broken then
   update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id;
   perform dndkeep_private.clear_campaign_concentration_effects(p_campaign_id,c.id,c.concentration_spell,cp_id,encounter_id);
  elsif coalesce(c.concentration_spell,'')<>'' and mode<>'off' then
   total_level:=c.level+case when c.secondary_class is not null then coalesce(c.secondary_level,0) else 0 end;
   if c.level not between 1 and 20 or total_level not between 1 and 20 or (c.secondary_class is not null and coalesce(c.secondary_level,0)<0) then raise exception 'Invalid class levels';end if;
   proficient:=exists(select 1 from unnest(coalesce(c.saving_throw_proficiencies,array[]::text[])) prof where lower(prof) in('con','constitution'));
   -- Active combat state takes precedence over stale character-sheet effects.
   exhaustion:=coalesce((case when cb_id is null then ctx->'character' else ctx->'combatant' end->>'exhaustion_level')::integer,0);
   if exhaustion not between 0 and 6 then raise exception 'Invalid exhaustion level';end if;
   bonus:=p_modifier+case when proficient then 2+(total_level-1)/4 else 0 end-2*exhaustion;
   insert into public.pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,concentration_revision,damage,dc,con_bonus,has_con_prof,expires_at)
   values(p_save_id,p_campaign_id,encounter_id,p_request_id,cp_id,c.id,c.concentration_spell,c.concentration_revision,p_damage,least(30,greatest(10,p_damage/2)),bonus,proficient,now()+case when mode='auto' then interval '0 seconds' else interval '2 minutes' end);
   check_id:=p_save_id;
  end if;
 end if;
 outcome:=jsonb_build_object('requestId',p_request_id,'saveId',p_save_id,'damage',p_damage,'damageType',p_damage_type,
  'beforeHP',old_hp,'beforeTempHP',old_temp,'afterHP',next_hp,'afterTempHP',next_temp,'checkId',check_id,'concentrationBroken',broken,'automation',mode,'participantId',cp_id);
 insert into dndkeep_private.party_damage_events(request_id,character_id,campaign_id,request,outcome) values(p_request_id,c.id,p_campaign_id,req,outcome);
 insert into public.character_history(id,character_id,user_id,event_type,field,old_value,new_value,description)
 values(p_request_id,c.id,auth.uid(),'hp_change','current_hp',to_jsonb(old_hp),to_jsonb(next_hp),
  'Party damage ('||coalesce(p_damage_type,'untyped')||' '||p_damage||'): '||old_hp||' → '||next_hp||' HP; '||old_temp||' → '||next_temp||' temporary HP.');
 select * into c from public.characters where id=c.id;
 return outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end; $$;

create or replace function dndkeep_private.cancel_party_damage(
 p_campaign_id uuid,p_character_id uuid,p_request_id uuid,p_save_id uuid,p_damage integer,p_damage_type text,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.party_damage_events; req jsonb;
begin
 if auth.uid() is null then raise exception 'Party damage requires the character owner or current DM';end if;
 select * into c from public.characters where id=p_character_id and campaign_id=p_campaign_id for update;
 if c.id is null or (c.user_id is distinct from auth.uid() and not exists(select 1 from public.campaigns where id=p_campaign_id and owner_id=auth.uid())) then raise exception 'Party damage requires the character owner or current DM';end if;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_save_id is null or p_request_id=p_save_id or p_damage is null or p_damage<0
  or p_modifier is null or p_modifier not between -105 and 120 or p_expected is null or jsonb_typeof(p_expected)<>'object'
  or (p_damage_type is not null and p_damage_type not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder')) then raise exception 'Invalid party damage request';end if;
 req:=jsonb_build_object('saveId',p_save_id,'damage',p_damage,'damageType',p_damage_type,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.party_damage_events where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.campaign_id is distinct from p_campaign_id or prior.request is distinct from req then raise exception 'Party damage request changed';end if;
  return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',coalesce(prior.outcome->>'canceled'='true',false),'replayed',true);
 end if;
 if exists(select 1 from public.pending_concentration_saves where id=p_save_id) then raise exception 'The concentration identity is already in use';end if;
 insert into dndkeep_private.party_damage_events(request_id,character_id,campaign_id,request,outcome)
 values(p_request_id,c.id,p_campaign_id,req,jsonb_build_object('canceled',true));
 return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',true,'replayed',false);
end; $$;
