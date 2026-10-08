-- v2.798: order HP receipts and atomically settle one chosen-pool healing roll.
-- Additive backend; older clients retain their existing save paths.
alter table public.characters add column if not exists hit_point_revision bigint not null default 0;
create or replace function public.refresh_hit_point_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.hit_point_revision:=0;
 elsif (new.current_hp,new.max_hp,new.temp_hp) is distinct from (old.current_hp,old.max_hp,old.temp_hp) then
  new.hit_point_revision:=old.hit_point_revision+1;
 else new.hit_point_revision:=old.hit_point_revision; end if;
 return new;
end;
$$;
revoke all on function public.refresh_hit_point_revision() from public,anon,authenticated;
drop trigger if exists refresh_hit_point_revision on public.characters;
create trigger refresh_hit_point_revision before insert or update on public.characters
 for each row execute function public.refresh_hit_point_revision();

-- The ledger cannot be edited through the Data API. Only the transaction below
-- creates receipts, and it explicitly authorizes the locked character first.
create table if not exists dndkeep_private.hit_dice_healing_uses(
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 request jsonb not null,
 outcome jsonb not null,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.hit_dice_healing_uses enable row level security;
revoke all on table dndkeep_private.hit_dice_healing_uses from public,anon,authenticated;
create index if not exists hit_dice_healing_character_idx on dndkeep_private.hit_dice_healing_uses(character_id);

create or replace function public.spend_rest_hit_dice(
 p_character_id uuid,p_request_id uuid,p_hit_die integer,p_rolls integer[],
 p_constitution_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.hit_dice_healing_uses;
 request jsonb; expected jsonb; counts jsonb; capacity jsonb; outcome jsonb;
 count_dice integer; healing integer; gained integer; before_hp integer; description text;
begin
 if auth.uid() is null then raise exception 'Sign in to spend Hit Dice'; end if;
 select * into c from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Character is unavailable'; end if;
 if p_request_id is null then raise exception 'A healing request identifier is required'; end if;
 request:=jsonb_build_object('hitDie',p_hit_die,'rolls',p_rolls,'constitutionModifier',p_constitution_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.hit_dice_healing_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from p_character_id or prior.request is distinct from request then
   raise exception 'Healing request does not match its saved use'; end if;
  -- Current counters and revision accompany the immutable result, so recovering
  -- an old paid roll does not restore the HP that existed at payment time.
  return prior.outcome||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 count_dice:=cardinality(p_rolls);
 if p_hit_die is null or p_hit_die not in(6,8,10,12) or count_dice is null or count_dice not between 1 and 20
  or coalesce(array_ndims(p_rolls),0)<>1 or exists(select 1 from unnest(p_rolls) d where d is null or d not between 1 and p_hit_die)
  or p_constitution_modifier is null or p_constitution_modifier not between -5 and 10 then
  raise exception 'Invalid Hit Dice healing roll';
 end if;
 -- Effective CON is calculated by the same client equipment pipeline as other
 -- rolls. Capture its stat/inventory inputs; never substitute a server-only
 -- base-CON calculation which would silently discard an equipped item effect.
 expected:=jsonb_build_object('current_hp',c.current_hp,'max_hp',c.max_hp,'hit_point_revision',c.hit_point_revision,
  'psionic_hit_dice_revision',c.psionic_hit_dice_revision,'constitution',c.constitution,'inventory',c.inventory);
 if p_expected is distinct from expected then raise exception 'Character changed. Review the sheet before rolling Hit Dice'; end if;
 if coalesce(c.current_hp,0)<1 then raise exception 'You need at least 1 HP to begin a Short Rest'; end if;
 if c.max_hp is null or c.current_hp>=c.max_hp then raise exception 'No healing is needed at maximum HP'; end if;
 counts:=public.hit_dice_counts_internal(c,c.hit_dice_spent_by_type);
 capacity:=public.hit_dice_capacity_internal(c);
 if not(capacity ? p_hit_die::text) or coalesce((counts->>p_hit_die::text)::integer,0)+count_dice>(capacity->>p_hit_die::text)::integer then
  raise exception 'Not enough Hit Dice in the selected pool'; end if;
 counts:=jsonb_set(counts,array[p_hit_die::text],to_jsonb(coalesce((counts->>p_hit_die::text)::integer,0)+count_dice));
 select sum(greatest(1,d+p_constitution_modifier)) into healing from unnest(p_rolls) d;
 before_hp:=c.current_hp;gained:=least(c.max_hp-c.current_hp,healing);
 update public.characters set current_hp=before_hp+gained,hit_dice_spent=coalesce(c.hit_dice_spent,0)+count_dice,
  hit_dice_spent_by_type=counts where id=c.id returning * into c;
 outcome:=jsonb_build_object('requestId',p_request_id,'hitDie',p_hit_die,'rolls',p_rolls,
  'constitutionModifier',p_constitution_modifier,'healing',healing,'gained',gained);
 insert into dndkeep_private.hit_dice_healing_uses(request_id,character_id,request,outcome)
 values(p_request_id,c.id,request,outcome);
 description:='Short Rest: spent '||count_dice||'d'||p_hit_die||', recovered '||gained||' HP ('||healing||' rolled).';
 -- Both existing read surfaces receive one event in this same transaction.
 -- The dice animation must omit its old separate history write for this RPC.
 insert into public.character_history(id,character_id,user_id,event_type,field,old_value,new_value,description)
 values(p_request_id,c.id,auth.uid(),'roll','current_hp',to_jsonb(before_hp),to_jsonb(c.current_hp),description);
 insert into public.combat_events(chain_id,actor_type,actor_id,actor_name,target_type,target_id,target_name,event_type,campaign_id,payload)
 values(p_request_id,'player',c.id,c.name,'self',c.id,c.name,'healing_applied',c.campaign_id,
  outcome||jsonb_build_object('description',description,'old_hp',before_hp,'new_hp',c.current_hp,'source','Hit Dice'));
 return outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end;
$$;
revoke all on function public.spend_rest_hit_dice(uuid,uuid,integer,integer[],integer,jsonb) from public,anon;
grant execute on function public.spend_rest_hit_dice(uuid,uuid,integer,integer[],integer,jsonb) to authenticated;
