-- v2.869: new clients commit all attack-roll history with the roll and Sap/Vex.
-- Legacy recorded rolls are replayed as-is; missing historical dice are not invented.
create or replace function dndkeep_private.record_pending_attack_roll_with_history(
 p_attack_id uuid,p_expected_updated_at timestamptz,p_snapshot jsonb,p_expected_buffs jsonb,p_history jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.pending_attacks; a public.pending_attacks; saved jsonb; h jsonb:=p_history;
 b jsonb; n jsonb; contribution integer; buff_total bigint:=0; exhaustion integer; alternate integer;
 faces jsonb; die_sides text[]; actor_kind text; target_kind text; cover_bonus integer; die_results jsonb; contributions jsonb:='[]'::jsonb;
begin
 -- The existing function owns authorization, shared-actor lock order, optimistic
 -- revision validation, original-roll evidence, and one-use marker consumption.
 select * into original from public.pending_attacks where id=p_attack_id;
 saved:=dndkeep_private.record_pending_attack_roll(p_attack_id,p_expected_updated_at,p_snapshot,p_expected_buffs);
 if (saved->>'replayed')::boolean then return saved;end if;
 select * into a from public.pending_attacks where id=p_attack_id;
 if jsonb_typeof(h) is distinct from 'object' or coalesce(h->>'advantageState','') not in('normal','advantage','disadvantage')
  or jsonb_typeof(h->'exhaustionLevel') is distinct from 'number'
  or (h->>'exhaustionLevel') !~ '^[0-6]$'
  or jsonb_typeof(h->'buffContributions') is distinct from 'array' then raise exception 'Invalid attack history';end if;
 exhaustion:=(h->>'exhaustionLevel')::integer;
 if h->>'advantageState'='normal' then
  if h->'d20Alt' is distinct from 'null'::jsonb then raise exception 'Unexpected alternate attack die';end if;
  die_results:=jsonb_build_array(a.attack_d20);
 else
  if jsonb_typeof(h->'d20Alt') is distinct from 'number' or (h->>'d20Alt') !~ '^([1-9]|1[0-9]|20)$' then raise exception 'Invalid alternate attack die';end if;
  alternate:=(h->>'d20Alt')::integer;
  if (h->>'advantageState'='advantage' and alternate>a.attack_d20) or (h->>'advantageState'='disadvantage' and alternate<a.attack_d20) then raise exception 'Attack dice disagree with advantage';end if;
  die_results:=jsonb_build_array(a.attack_d20,alternate);
 end if;
 for b in select value from jsonb_array_elements(h->'buffContributions') loop
  if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'key') is distinct from 'string'
   or jsonb_typeof(b->'name') is distinct from 'string' or jsonb_typeof(b->'source') is distinct from 'string'
   or jsonb_typeof(b->'dice') is distinct from 'string' or jsonb_typeof(b->'rolls') is distinct from 'array'
   or jsonb_typeof(b->'total') is distinct from 'number' or (b->>'total') !~ '^-?[0-9]+$'
   then raise exception 'Invalid buff roll history';end if;
  contribution:=0;
  for n in select value from jsonb_array_elements(b->'rolls') loop
   if jsonb_typeof(n) is distinct from 'number' or n::text !~ '^[0-9]+$' or n::numeric<1 or n::numeric>2147483647 then raise exception 'Invalid buff die history';end if;
   contribution:=contribution+n::text::integer;
  end loop;
  -- Reuse the canonical SQL dice-evidence checker, including flat modifiers.
  -- The live buff roller currently produces a single dice group or flat total.
  die_sides:=regexp_match(b->>'dice','^\s*\d+d(\d+)','i');
  select coalesce(jsonb_agg(jsonb_build_object('die',die_sides[1]::integer,'value',value)),'[]'::jsonb)
   into faces from jsonb_array_elements(b->'rolls');
  buff_total:=buff_total+dndkeep_private.dice_evidence_total(b->>'dice',jsonb_build_object(
   'dice',faces,'modifier',(b->>'total')::integer-contribution,'total',b->'total'));
  contributions:=contributions||jsonb_build_array(b-'source');
 end loop;
 if a.attack_total::bigint<>a.attack_d20::bigint+coalesce(a.attack_bonus,0)+buff_total-2*exhaustion then raise exception 'Attack history total disagrees with the roll';end if;
 actor_kind:=case when a.attacker_type in('character','player') then 'player' when a.attacker_type in('monster','npc','creature') then 'creature' else 'system' end;
 target_kind:=case when a.target_type in('character','player') then 'player' when a.target_type in('monster','npc','creature') then 'creature' when a.target_type in('object','area','self') then a.target_type else null end;
 cover_bonus:=case a.cover_level when 'half' then 2 when 'three_quarters' then 5 else 0 end;
 if coalesce(a.cover_level,'none')<>'none' then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,0,'system','System',target_kind,a.target_name,'cover_applied',
   jsonb_build_object('level',a.cover_level,'ac_bonus',cover_bonus,'auto_miss',a.cover_level='total','base_ac',original.target_ac,'effective_ac',a.target_ac));
 end if;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
 values(a.campaign_id,a.encounter_id,a.chain_id,1,actor_kind,a.attacker_name,target_kind,a.target_name,'attack_roll',
  jsonb_build_object('action_name',a.attack_name,'dice_expression','1d20'||case when coalesce(a.attack_bonus,0)>=0 then '+' else '' end||coalesce(a.attack_bonus,0)::text,
   'individual_results',die_results,'total',a.attack_total,'hit_result',a.hit_result,'target_ac',original.target_ac,
   'advantage_state',h->>'advantageState','auto_crit',(a.attack_roll_snapshot->>'criticalOnHit')::boolean and a.hit_result in('hit','crit'),
   'buff_contributions',contributions,'buff_total',buff_total,'exhaustion_level',exhaustion,'exhaustion_penalty',-2*exhaustion));
 for b in select value from jsonb_array_elements(h->'buffContributions') loop
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,2,'system',b->>'name',case when actor_kind='system' then null else actor_kind end,a.attacker_name,'buff_contributed',
   jsonb_build_object('key',b->>'key','source',b->>'source','applies_to','attack_roll','dice',b->>'dice','rolls',b->'rolls','total',b->'total'));
 end loop;
 return saved;
end;$$;
revoke all on function dndkeep_private.record_pending_attack_roll_with_history(uuid,timestamptz,jsonb,jsonb,jsonb) from public,anon;
grant execute on function dndkeep_private.record_pending_attack_roll_with_history(uuid,timestamptz,jsonb,jsonb,jsonb) to authenticated;
create or replace function public.record_pending_attack_roll_with_history(p_attack_id uuid,p_expected_updated_at timestamptz,p_snapshot jsonb,p_expected_buffs jsonb,p_history jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.record_pending_attack_roll_with_history(p_attack_id,p_expected_updated_at,p_snapshot,p_expected_buffs,p_history);
$$;
revoke all on function public.record_pending_attack_roll_with_history(uuid,timestamptz,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.record_pending_attack_roll_with_history(uuid,timestamptz,jsonb,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
