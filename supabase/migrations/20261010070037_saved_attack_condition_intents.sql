-- v2.869: capture condition intent in the same transaction as its saving throw.
-- This records intent only. Application must later verify the final save and live defenses.
create table if not exists dndkeep_private.attack_condition_intents(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null,origin_id uuid not null,target_id uuid not null,target_combatant_id uuid not null,
 recipe jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.attack_condition_intents enable row level security;
revoke all on dndkeep_private.attack_condition_intents from public,anon,authenticated;
create index if not exists attack_condition_intents_encounter_idx on dndkeep_private.attack_condition_intents(encounter_id);
create or replace function dndkeep_private.validate_attack_condition_intent(p jsonb,p_condition text)
returns void language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'object' or p-array['conditionName','sourcePrefix','sourceKind','durationRounds','saveToEnd']<>'{}'::jsonb
  or not(p ?& array['conditionName','sourcePrefix','sourceKind','durationRounds','saveToEnd'])
  or coalesce(p->>'conditionName','') not in('Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious')
  or lower(p->>'conditionName') is distinct from lower(p_condition)
  or coalesce(p->>'sourcePrefix','') not in('monster_action','legendary_action')
  or jsonb_typeof(p->'sourceKind') is distinct from 'string'
  or coalesce(p->>'sourceKind','') !~ '^[a-z0-9_]{1,200}$' then raise exception 'Review the saved condition intent';end if;
 if p->'durationRounds'<>'null'::jsonb and (jsonb_typeof(p->'durationRounds')<>'number' or p->>'durationRounds' !~ '^[1-9][0-9]{0,8}$') then raise exception 'Review the condition duration';end if;
 if p->'saveToEnd'<>'null'::jsonb and (jsonb_typeof(p->'saveToEnd')<>'object'
  or (p->'saveToEnd')-array['ability','dc']<>'{}'::jsonb or not(p->'saveToEnd' ?& array['ability','dc'])
  or coalesce(p->'saveToEnd'->>'ability','') not in('STR','DEX','CON','INT','WIS','CHA')
  or jsonb_typeof(p->'saveToEnd'->'dc') is distinct from 'number'
  or coalesce(p->'saveToEnd'->>'dc','') !~ '^[1-9][0-9]{0,3}$') then raise exception 'Review the repeat saving throw';end if;
end;$$;
revoke all on function dndkeep_private.validate_attack_condition_intent(jsonb,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION dndkeep_private.declare_save_batch(p_campaign_id uuid, p_encounter_id uuid, p_chain_id uuid, p_attacker_id uuid, p_attacker_name text, p_attacker_type text, p_attack_name text, p_save_dc integer, p_save_ability text, p_save_success_effect text, p_damage_dice text, p_damage_type text, p_inferred_condition text, p_targets jsonb)
 RETURNS TABLE(pending_attack_id uuid, target_participant_id uuid, target_name text, immune_to_condition boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  t                 jsonb;
  v_target_id       uuid;
  v_target_name     text;
  v_target_type     text;
  v_entity_id       text;
  intent jsonb;
  actor public.combat_participants;
  target public.combat_participants;
  camp public.campaigns;
  enc public.combat_encounters;
  v_source_id       text;
  v_immunities      text[];
  v_immune          boolean;
  v_pa_id           uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to declare saves'; END IF;
  SELECT * INTO camp FROM public.campaigns WHERE id=p_campaign_id FOR SHARE;
  SELECT * INTO enc FROM public.combat_encounters WHERE id=p_encounter_id AND campaign_id=camp.id FOR SHARE;
  IF enc.id IS NULL OR enc.status<>'active' THEN RAISE EXCEPTION 'Save batch encounter is unavailable'; END IF;
  IF p_chain_id IS NULL OR jsonb_typeof(p_targets) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid save batch'; END IF;
  IF (SELECT count(*)<>count(DISTINCT requested.value->>'participant_id') FROM jsonb_array_elements(p_targets) requested(value)) THEN RAISE EXCEPTION 'Select each save target only once'; END IF;
  -- Lock the actual participant rows in a stable order before trusting identity.
  PERFORM cp.id FROM public.combat_participants cp WHERE cp.id=p_attacker_id
    OR cp.id IN (SELECT (requested.value->>'participant_id')::uuid FROM jsonb_array_elements(p_targets) requested(value)) ORDER BY cp.id FOR SHARE;
  SELECT * INTO actor FROM public.combat_participants WHERE id=p_attacker_id AND encounter_id=enc.id AND campaign_id=camp.id;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Save batch actor is unavailable'; END IF;
  IF camp.owner_id IS DISTINCT FROM auth.uid() AND NOT(actor.participant_type='character' AND EXISTS(
    SELECT 1 FROM public.characters c WHERE c.id::text=actor.entity_id AND c.campaign_id=camp.id AND c.user_id=auth.uid())) THEN
    RAISE EXCEPTION 'You cannot declare saves for this actor' USING ERRCODE='42501';
  END IF;
  IF actor.participant_type NOT IN('character','creature','monster','npc') THEN RAISE EXCEPTION 'Unsupported save actor'; END IF;

  FOR t IN SELECT * FROM jsonb_array_elements(p_targets) LOOP
    SELECT * INTO target FROM public.combat_participants WHERE id=(t->>'participant_id')::uuid AND encounter_id=enc.id AND campaign_id=camp.id;
    IF target.id IS NULL OR target.participant_type NOT IN('character','creature','monster','npc') THEN RAISE EXCEPTION 'Save target is no longer in this encounter'; END IF;
    v_target_id:=target.id;
    v_target_name:=target.name;
    v_target_type:=CASE WHEN target.participant_type IN('monster','npc') THEN 'creature' ELSE target.participant_type END;
    v_entity_id:=target.entity_id;

    v_immune := FALSE;
    IF p_inferred_condition IS NOT NULL
       AND v_target_type = 'creature'
       AND v_entity_id IS NOT NULL THEN
      SELECT hb.source_monster_id INTO v_source_id
      FROM public.homebrew_monsters hb
      WHERE hb.id::text = v_entity_id;
      IF v_source_id IS NOT NULL THEN
        SELECT m.condition_immunities INTO v_immunities
        FROM public.monsters m
        WHERE m.id = v_source_id;
        IF v_immunities IS NOT NULL THEN
          v_immune := EXISTS (
            SELECT 1 FROM unnest(v_immunities) AS imm
            WHERE lower(imm) = lower(p_inferred_condition)
          );
        END IF;
      END IF;
    END IF;

    INSERT INTO public.pending_attacks (
      campaign_id, encounter_id, chain_id,
      attacker_participant_id, attacker_name, attacker_type,
      target_participant_id, target_name, target_type,
      attack_source, attack_name, attack_kind,
      save_dc, save_ability, save_success_effect,
      damage_dice, damage_type,
      state
    ) VALUES (
      p_campaign_id, p_encounter_id, p_chain_id,
      actor.id, actor.name, CASE WHEN actor.participant_type IN('monster','npc') THEN 'creature' ELSE actor.participant_type END,
      v_target_id, v_target_name, v_target_type,
      'monster_action', p_attack_name, 'save',
      p_save_dc, p_save_ability, p_save_success_effect,
      p_damage_dice, p_damage_type,
      'declared'
    )
    RETURNING id INTO v_pa_id;

    intent:=t->'condition_intent';
    IF intent IS NOT NULL AND intent<>'null'::jsonb THEN
      PERFORM dndkeep_private.validate_attack_condition_intent(intent,p_inferred_condition);
      INSERT INTO dndkeep_private.attack_condition_intents(attack_id,campaign_id,encounter_id,turn_id,origin_id,target_id,target_combatant_id,recipe)
      VALUES(v_pa_id,camp.id,enc.id,enc.psionic_turn_id,actor.id,target.id,target.combatant_id,
        intent||jsonb_build_object('source',(intent->>'sourcePrefix')||':'||p_attack_name||':'||actor.id::text,
         'declaredRound',enc.round_number,'initiallyImmune',v_immune));
    END IF;

    pending_attack_id := v_pa_id;
    target_participant_id := v_target_id;
    target_name := v_target_name;
    immune_to_condition := v_immune;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

create or replace function dndkeep_private.read_attack_condition_intent(p_attack uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform 1 from public.pending_attacks a join public.campaigns c on c.id=a.campaign_id where a.id=p_attack and c.owner_id=auth.uid() for share of c;
 if not found then raise exception 'Only the campaign DM can review saved condition intent';end if;
 select to_jsonb(i)-'created_at' into result from dndkeep_private.attack_condition_intents i where i.attack_id=p_attack;
 return result;
end;$$;
revoke all on function dndkeep_private.read_attack_condition_intent(uuid) from public,anon;
grant execute on function dndkeep_private.read_attack_condition_intent(uuid) to authenticated;
create or replace function public.read_attack_condition_intent(p_attack uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.read_attack_condition_intent(p_attack);$$;
revoke all on function public.read_attack_condition_intent(uuid) from public,anon;
grant execute on function public.read_attack_condition_intent(uuid) to authenticated;
notify pgrst,'reload schema';
