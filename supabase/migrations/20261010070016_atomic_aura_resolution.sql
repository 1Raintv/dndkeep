-- v2.869: authoritative aura context shared by preparation and atomic settlement.
-- Read-only: this does not reserve a save, consume a marker, or prove map geometry.
-- The committing transaction must lock/re-read and compare this context.
create or replace function dndkeep_private.aura_resolution_context(
 p_encounter uuid,p_turn uuid,p_origin uuid,p_target uuid,p_aura text,p_trigger text
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.combat_encounters; origin public.combat_participants; target public.combat_participants;
 ob public.combatants; tb public.combatants; stored jsonb; spec jsonb; n integer;
 party jsonb:='null'; marker text; clock jsonb; target_state jsonb; creature_source jsonb;
begin
 if p_turn is null or p_origin is null or p_target is null or p_origin=p_target
  or p_aura is null or btrim(p_aura)='' or p_trigger is null
  or p_trigger not in('creature_entered','emanation_entered','turn_end') then raise exception 'Invalid aura identity';end if;
 select * into e from public.combat_encounters where id=p_encounter;
 if not found or e.status is distinct from 'active' or e.psionic_turn_id is distinct from p_turn then raise exception 'Aura turn changed';end if;
 select * into origin from public.combat_participants where id=p_origin and encounter_id=e.id and campaign_id=e.campaign_id;
 if not found then raise exception 'Aura origin changed';end if;
 select * into target from public.combat_participants where id=p_target and encounter_id=e.id and campaign_id=e.campaign_id;
 if not found or origin.combatant_id=target.combatant_id then raise exception 'Aura target changed';end if;
 select * into ob from public.combatants where id=origin.combatant_id and campaign_id=e.campaign_id;
 if not found or coalesce(ob.is_dead,false) then raise exception 'Aura origin is unavailable';end if;
 select * into tb from public.combatants where id=target.combatant_id and campaign_id=e.campaign_id;
 if not found or coalesce(tb.is_dead,false) then raise exception 'Aura target is unavailable';end if;
 if jsonb_typeof(ob.active_buffs) is distinct from 'array' then raise exception 'Review origin aura effects';end if;
 select count(*),(jsonb_agg(b))->0 into n,stored from jsonb_array_elements(ob.active_buffs) b where b->>'key'='aura:'||p_aura;
 if n<>1 then raise exception 'Aura is missing or ambiguous';end if;
 spec:=stored->'aura';
 if (jsonb_typeof(spec)='object' and spec->>'key'=p_aura and jsonb_typeof(spec->'name')='string'
  and btrim(spec->>'name')<>'' and stored->>'casterParticipantId'=origin.id::text
  and spec->>'saveAbility' in('STR','DEX','CON','INT','WIS','CHA')
  and jsonb_typeof(spec->'saveDC')='number' and spec->>'saveDC' ~ '^[0-9]+$'
  and jsonb_typeof(spec->'radiusFt')='number' and jsonb_typeof(spec->'halfOnSave')='boolean'
  and jsonb_typeof(spec->'triggers')='array' and jsonb_typeof(spec->'exemptParticipantIds')='array'
  and spec->>'affects' in('all','enemies')
  and spec ? 'damageDice' and (spec->'damageDice'='null'::jsonb or (jsonb_typeof(spec->'damageDice')='string' and btrim(spec->>'damageDice')<>''))
  and spec ? 'damageType' and (spec->'damageType'='null'::jsonb or spec->>'damageType' in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'))
  and spec ? 'speedInside' and (spec->'speedInside'='null'::jsonb or spec->>'speedInside'='half')) is not true then
  raise exception 'Review stored aura configuration';
 end if;
 if (spec->>'saveDC')::numeric>1000 or (spec->>'radiusFt')::numeric<0 then raise exception 'Review stored aura numbers';end if;
 if exists(select 1 from jsonb_array_elements(spec->'triggers') t where jsonb_typeof(t)<>'string' or t#>>'{}' not in('creature_entered','emanation_entered','turn_end'))
  or exists(select 1 from jsonb_array_elements(spec->'exemptParticipantIds') t where jsonb_typeof(t)<>'string' or t#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Review stored aura eligibility';end if;
 if not (spec->'triggers' ? p_trigger) then raise exception 'Aura does not use this trigger';end if;
 if exists(select 1 from jsonb_array_elements_text(spec->'exemptParticipantIds') t where t::uuid=target.id) then raise exception 'Target is exempt from this aura';end if;
 -- Preserve the current engine's character/non-character grouping. This is
 -- not a general hostility model; a future faction model must replace both.
 if spec->>'affects'='enemies' and (origin.participant_type='character')=(target.participant_type='character') then raise exception 'Target is outside this aura group';end if;
 if p_trigger='turn_end' then
  clock:=dndkeep_private.combat_clock_context(e.id,p_turn);
  if clock->>'outgoingId' is distinct from target.id::text then raise exception 'Aura target is not ending its turn';end if;
 end if;
 marker:='aura_save:'||origin.id::text||':'||p_aura;
 if target.once_per_turn_used is null then raise exception 'Review target per-turn markers';end if;
 if marker=any(target.once_per_turn_used) then raise exception 'Aura save already used this turn';end if;
 -- The legacy save helper reads homebrew stats. Include every other source
 -- revision too; custom/catalog stat changes must invalidate a prepared save.
 target_state:=dndkeep_private.pending_damage_participant_context(target.id,e.campaign_id,e.id);
 if target_state->>'definitionType' in('homebrew_monster','narrative_npc','roster_npc') then
  select to_jsonb(m) into creature_source from public.homebrew_monsters m where m.id::text=target.entity_id;
 elsif target_state->>'definitionType'='srd_monster' then
  select to_jsonb(m) into creature_source from public.monsters m where m.id=target.entity_id;
 elsif target_state->>'definitionType'='custom' then creature_source:=tb.stat_block_snapshot;
 end if;
 if target.participant_type='character' then
  party:=dndkeep_private.party_damage_context(e.campaign_id,target.entity_id::uuid);
  if party#>>'{participant,id}' is distinct from target.id::text then raise exception 'Aura damage target changed';end if;
 end if;
 return jsonb_build_object('encounterId',e.id,'campaignId',e.campaign_id,'turnId',p_turn,'trigger',p_trigger,
  'nextSaveEffects',coalesce((select jsonb_agg(jsonb_build_object('id',m.cast_id,'casterId',m.caster_id,'castTurn',m.cast_turn,'ordinal',m.cast_turn_ordinal) order by m.cast_id) from dndkeep_private.mind_sliver_effects m where m.encounter_id=e.id and m.target_id=target.id and m.status='active' and m.consumed_by is null),'[]'::jsonb),
  'legendaryResistance',jsonb_build_object('capacity',coalesce(target.legendary_resistance,0),'used',coalesce(target.legendary_resistance_used,0)),
  'aura',stored,'marker',marker,'markers',to_jsonb(target.once_per_turn_used),
  'origin',dndkeep_private.pending_damage_participant_context(origin.id,e.campaign_id,e.id),
  'target',target_state,'creatureRevision',pg_catalog.md5(coalesce(creature_source,'null'::jsonb)::text),
  'save',dndkeep_private.saving_target_context(e.campaign_id,e.id,target.id,spec->>'saveAbility'),
  'partyDamage',party,'geometryVerified',false);
end;$$;
revoke all on function dndkeep_private.aura_resolution_context(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;


-- v2.869: one receipt per actual aura/target/turn, independent of request UUID.
create table if not exists dndkeep_private.aura_resolutions(
 request_id uuid primary key,encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null,origin_id uuid not null,target_id uuid not null,aura_key text not null,
 request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 unique(encounter_id,turn_id,origin_id,target_id,aura_key)
);
alter table dndkeep_private.aura_resolutions enable row level security;
revoke all on dndkeep_private.aura_resolutions from public,anon,authenticated;

create or replace function dndkeep_private.commit_aura_resolution(p_encounter uuid,p_request uuid,p_expected jsonb,p_proposal jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
<<aura_commit>>
declare camp uuid; prior dndkeep_private.aura_resolutions; req jsonb; live jsonb; save jsonb; penalty jsonb; damage_result jsonb:='null';
 origin_id uuid; target_id uuid; turn_id uuid; aura_key text; trigger_name text; cp public.combat_participants; cb public.combatants;
 spec jsonb; damage_n numeric; raw_n numeric:=0; after_save numeric:=0; affinity text; immune boolean; resistant boolean; vulnerable boolean;
 accepted boolean; final_passed boolean; cap integer; used integer; con_id uuid; con_modifier integer; penalty_die integer;
 result jsonb; old_hp integer; old_temp integer; dead boolean; pools jsonb; visibility text; sequence_n integer:=0;
begin
 select c.id into camp from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id where e.id=p_encounter and c.owner_id=auth.uid();
 if not found then raise exception 'Aura resolution is available only to its DM';end if;
 if p_request is null or jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_proposal) is distinct from 'object' then raise exception 'Invalid aura resolution request';end if;
 req:=jsonb_build_object('expected',p_expected,'proposal',p_proposal);
 select * into prior from dndkeep_private.aura_resolutions where request_id=p_request;
 if found then
  if prior.encounter_id<>p_encounter or prior.request<>req then raise exception 'Saved aura request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 origin_id:=(p_expected#>>'{origin,participant,id}')::uuid;target_id:=(p_expected#>>'{target,participant,id}')::uuid;
 turn_id:=(p_expected->>'turnId')::uuid;aura_key:=p_expected#>>'{aura,aura,key}';trigger_name:=p_expected->>'trigger';
 if p_expected->>'encounterId' is distinct from p_encounter::text or origin_id is null or target_id is null then raise exception 'Aura identity changed';end if;
 -- Same character-first lock order as the shared damage transaction. Both
 -- participants are then serialized, including concurrent area movement.
 perform 1 from public.characters c where c.id::text in(select entity_id from public.combat_participants where id in(origin_id,target_id) and participant_type='character') order by c.id for update;
 perform 1 from public.campaigns where id=camp and owner_id=auth.uid() for share;
 if not found then raise exception 'Aura campaign ownership changed';end if;
 perform 1 from public.combat_encounters where id=p_encounter and campaign_id=camp for share;
 perform 1 from public.combat_participants where id in(origin_id,target_id) order by id for update;
 perform 1 from public.combatants where id in(select combatant_id from public.combat_participants where id in(origin_id,target_id)) order by id for update;
 perform 1 from public.homebrew_monsters where id::text in(select entity_id from public.combat_participants where id in(origin_id,target_id)) order by id for share;
 perform 1 from public.monsters where id in(select entity_id from public.combat_participants where id in(origin_id,target_id)) order by id for share;
 select * into prior from dndkeep_private.aura_resolutions where request_id=p_request;
 if found then
  if prior.encounter_id<>p_encounter or prior.request<>req then raise exception 'Saved aura request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.aura_resolutions r where r.encounter_id=p_encounter and r.turn_id=aura_commit.turn_id and r.origin_id=aura_commit.origin_id and r.target_id=aura_commit.target_id and r.aura_key=aura_commit.aura_key) then
  raise exception 'Aura already resolved this turn; read its saved receipt';
 end if;
 live:=dndkeep_private.aura_resolution_context(p_encounter,turn_id,origin_id,target_id,aura_key,trigger_name);
 if live is distinct from p_expected then raise exception 'Aura state changed; review the saved proposal';end if;
 if p_proposal-array['save','penaltyD4','damageRoll','affinity','useResistance','concentrationId','conModifier','geometryConfirmed','defensesReviewed']<>'{}'::jsonb
  or p_proposal->'geometryConfirmed' is distinct from 'true'::jsonb or p_proposal->'defensesReviewed' is distinct from 'true'::jsonb
  or jsonb_typeof(p_proposal->'useResistance') is distinct from 'boolean'
  or jsonb_typeof(p_proposal->'conModifier') is distinct from 'number' then raise exception 'Review aura geometry, defenses and resolution choices';end if;
 if (p_proposal->>'conModifier')::numeric<>trunc((p_proposal->>'conModifier')::numeric) or (p_proposal->>'conModifier')::numeric not between -105 and 120 then raise exception 'Invalid aura concentration modifier';end if;
 con_modifier:=(p_proposal->>'conModifier')::integer;con_id:=(p_proposal->>'concentrationId')::uuid;
 if con_id is null or con_id=p_request then raise exception 'Invalid aura concentration identity';end if;
 if p_proposal->'penaltyD4' is distinct from 'null'::jsonb then
  if jsonb_typeof(p_proposal->'penaltyD4') is distinct from 'number' or (p_proposal->>'penaltyD4')::numeric<>trunc((p_proposal->>'penaltyD4')::numeric) or (p_proposal->>'penaltyD4')::numeric not between 1 and 4 then raise exception 'Invalid next-save die';end if;
  penalty_die:=(p_proposal->>'penaltyD4')::integer;
 end if;
 if exists(select 1 from dndkeep_private.next_save_penalty_receipts where save_kind='feature' and save_id=p_request) then raise exception 'Aura save identity is already in use';end if;
 penalty:=dndkeep_private.consume_next_save_penalty('feature',p_request,p_encounter,target_id,penalty_die,(live#>>'{save,autoFail}')::boolean);
 save:=dndkeep_private.aura_save_evidence(live,p_proposal->'save',(penalty->>'penalty')::integer);
 select * into cp from public.combat_participants where id=target_id;
 select * into cb from public.combatants where id=cp.combatant_id;
 cap:=coalesce(cp.legendary_resistance,0);used:=coalesce(cp.legendary_resistance_used,0);
 if cap<0 or used<0 then raise exception 'Review Legendary Resistance charges';end if;
 accepted:=(p_proposal->>'useResistance')::boolean;
 if accepted then
  if (save->>'passed')::boolean or cp.participant_type not in('creature','monster','npc') or used>=cap then raise exception 'Legendary Resistance cannot be used for this save';end if;
  update public.combat_participants set legendary_resistance_used=used+1 where id=cp.id;
 end if;
 final_passed:=(save->>'passed')::boolean or accepted;spec:=live#>'{aura,aura}';
 if spec->'damageDice'='null'::jsonb then
  if p_proposal->'damageRoll' is distinct from 'null'::jsonb then raise exception 'This aura has no damage roll';end if;
 else raw_n:=dndkeep_private.dice_evidence_total(spec->>'damageDice',p_proposal->'damageRoll');end if;
 after_save:=greatest(0,case when final_passed then case when (spec->>'halfOnSave')::boolean then floor(raw_n/2) else 0 end else raw_n end);
 affinity:=p_proposal->>'affinity';
 if affinity is null or affinity not in('normal','immune','resistant','vulnerable','resistant-vulnerable') then raise exception 'Review aura damage defenses';end if;
 immune:=affinity='immune';resistant:=affinity in('resistant','resistant-vulnerable') or coalesce(cb.active_conditions,'{}')&&array['Petrified'];vulnerable:=affinity in('vulnerable','resistant-vulnerable');
 damage_n:=case when immune then 0 else (case when resistant then floor(after_save/2) else after_save end)*case when vulnerable then 2 else 1 end end;
 if damage_n>2147483647 then raise exception 'Aura damage exceeds supported pools';end if;
 old_hp:=cb.current_hp;old_temp:=cb.temp_hp;
 if old_hp is null or old_temp is null or cb.max_hp is null or old_hp<0 or old_temp<0 or cb.max_hp<1 or old_hp>cb.max_hp then raise exception 'Review aura target HP';end if;
 if damage_n>0 then
  if cp.participant_type='character' then
   damage_result:=dndkeep_private.apply_party_damage(camp,cp.entity_id::uuid,p_request,con_id,damage_n::integer,spec->>'damageType',con_modifier,live->'partyDamage');
   -- Receipts retain the historical outcome, never a full character snapshot.
   damage_result:=damage_result-'character';
  else
   pools:=dndkeep_private.damage_hit_point_pools(old_hp,old_temp,damage_n::integer);
   dead:=(pools->>'current_hp')::integer=0;
   update public.combatants set current_hp=(pools->>'current_hp')::integer,temp_hp=(pools->>'temp_hp')::integer,
    is_dead=dead,is_stable=case when dead then false else is_stable end where id=cb.id;
   damage_result:=jsonb_build_object('beforeHP',old_hp,'beforeTempHP',old_temp,'afterHP',pools->'current_hp','afterTempHP',pools->'temp_hp','checkId',null,'concentrationBroken',false);
  end if;
 end if;
 select * into cb from public.combatants where id=cp.combatant_id;
 visibility:=case when coalesce(cp.hidden_from_players,false) or exists(select 1 from public.combat_participants where id=origin_id and hidden_from_players) then 'hidden_from_players' else 'public' end;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_id,target_name,event_type,payload,visibility)
 values(camp,p_encounter,p_request,sequence_n,'system','System',case when cp.participant_type='character' then 'player' else 'creature' end,cp.id,cp.name,'save_rolled',
  save||jsonb_build_object('kind','aura_save','aura',aura_key,'aura_name',spec->>'name','origin',live#>>'{origin,combatant,name}','trigger',trigger_name,'next_save_penalty',penalty,'success',final_passed,'rolls',save->'dice','automatic_failure',save->'automaticFailure','effect_rolls',save->'effectRolls','damage',damage_n,'damage_rolled',raw_n,'damage_after_save',after_save,'damage_evidence',p_proposal->'damageRoll','damage_rolls',coalesce(p_proposal#>'{damageRoll,dice}','[]'::jsonb),'damage_flat_modifier',coalesce(p_proposal#>'{damageRoll,modifier}','0'::jsonb),'damage_modifier',case when after_save=0 then 'none' when immune then 'immune' when resistant and vulnerable then 'resistant-vulnerable' when resistant then 'resistant' when vulnerable then 'vulnerable' else 'none' end,'affinity',affinity,'legendaryResistance',accepted),visibility);
 sequence_n:=sequence_n+1;
 if accepted then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,event_type,payload,visibility)
  values(camp,p_encounter,p_request,sequence_n,'creature',cp.name,'legendary_resistance_used',jsonb_build_object('feature',spec->>'name','uses_after',used+1,'original_save',save),visibility);sequence_n:=sequence_n+1;
 end if;
 if damage_n>0 then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_id,target_name,event_type,payload,visibility)
  values(camp,p_encounter,p_request,sequence_n,'system','System',case when cp.participant_type='character' then 'player' else 'creature' end,cp.id,cp.name,'damage_applied',jsonb_build_object('kind','aura_damage','aura_name',spec->>'name','damage',damage_n,'damage_type',spec->>'damageType'),visibility);sequence_n:=sequence_n+1;
  if cp.participant_type='character' and old_hp=0 then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_id,target_name,event_type,payload,visibility)
   values(camp,p_encounter,p_request,sequence_n,'system','System',case when cp.participant_type='character' then 'player' else 'creature' end,cp.id,cp.name,'damage_at_0_hp_failure_added',jsonb_build_object('via','aura','failures',cb.death_save_failures,'became_dead',cb.is_dead),visibility);sequence_n:=sequence_n+1;
  end if;
  if cb.is_dead or old_hp>0 and cb.current_hp=0 then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_id,target_name,event_type,payload,visibility)
   values(camp,p_encounter,p_request,sequence_n,'system','System',case when cp.participant_type='character' then 'player' else 'creature' end,cp.id,cp.name,case when cb.is_dead then 'died' else 'dropped_to_0_hp' end,jsonb_build_object('via','aura','aura_name',spec->>'name','damage',damage_n),visibility);
  end if;
 end if;
 update public.combat_participants set once_per_turn_used=array_append(once_per_turn_used,live->>'marker') where id=cp.id;
 result:=jsonb_build_object('requestId',p_request,'encounterId',p_encounter,'turnId',turn_id,'originId',origin_id,'targetId',target_id,'auraKey',aura_key,
  'save',save,'penalty',penalty,'acceptedResistance',accepted,'passed',final_passed,'damage',damage_n,'damageResult',damage_result,'marker',live->>'marker','replayed',false);
 insert into dndkeep_private.aura_resolutions(request_id,encounter_id,turn_id,origin_id,target_id,aura_key,request,result)
 values(p_request,p_encounter,turn_id,origin_id,target_id,aura_key,req,result);
 return result;
end;$$;
revoke all on function dndkeep_private.commit_aura_resolution(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function dndkeep_private.commit_aura_resolution(uuid,uuid,jsonb,jsonb) to authenticated;
create or replace function public.commit_aura_resolution(p_encounter uuid,p_request uuid,p_expected jsonb,p_proposal jsonb)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.commit_aura_resolution(p_encounter,p_request,p_expected,p_proposal);$$;
revoke all on function public.commit_aura_resolution(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.commit_aura_resolution(uuid,uuid,jsonb,jsonb) to authenticated;

create or replace function dndkeep_private.read_aura_resolution(p_encounter uuid,p_turn uuid,p_origin uuid,p_target uuid,p_aura text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare prior dndkeep_private.aura_resolutions;
begin
 if not exists(select 1 from public.combat_encounters e join public.campaigns c on c.id=e.campaign_id where e.id=p_encounter and c.owner_id=auth.uid()) then raise exception 'Aura receipts are available only to its DM';end if;
 select * into prior from dndkeep_private.aura_resolutions where encounter_id=p_encounter and turn_id=p_turn and origin_id=p_origin and target_id=p_target and aura_key=p_aura;
 if not found then return null;end if;
 return jsonb_build_object('requestId',prior.request_id,'request',prior.request,'result',prior.result||jsonb_build_object('replayed',true));
end;$$;
revoke all on function dndkeep_private.read_aura_resolution(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function dndkeep_private.read_aura_resolution(uuid,uuid,uuid,uuid,text) to authenticated;
create or replace function public.read_aura_resolution(p_encounter uuid,p_turn uuid,p_origin uuid,p_target uuid,p_aura text)
returns jsonb language sql stable security invoker set search_path='' as $$select dndkeep_private.read_aura_resolution(p_encounter,p_turn,p_origin,p_target,p_aura);$$;
revoke all on function public.read_aura_resolution(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.read_aura_resolution(uuid,uuid,uuid,uuid,text) to authenticated;
