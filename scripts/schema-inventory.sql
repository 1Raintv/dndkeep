-- Read-only, data-free inventory for comparing public application schemas.
-- Definitions are fingerprints: differences require review, never automatic DDL.
with objects as (
  select 'column' as kind, table_name || '.' || column_name as name,
    jsonb_build_object('type', udt_name, 'nullable', is_nullable,
      'default', column_default, 'length', character_maximum_length,
      'identity', is_identity, 'generated', is_generated) as definition
  from information_schema.columns where table_schema = 'public'
  union all
  select 'constraint', c.relname || '.' || k.conname,
    jsonb_build_object('definition', pg_get_constraintdef(k.oid), 'validated', k.convalidated)
  from pg_constraint k join pg_class c on c.oid = k.conrelid
  where c.relnamespace = 'public'::regnamespace
  union all
  select 'policy', tablename || '.' || policyname,
    jsonb_build_object('roles', roles, 'command', cmd, 'permissive', permissive,
      'using', qual, 'check', with_check)
  from pg_policies where schemaname = 'public'
  union all
  select 'relation', relname,
    jsonb_build_object('kind', relkind, 'rls', relrowsecurity,
      'force_rls', relforcerowsecurity, 'options', reloptions)
  from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p','v','m')
  union all
  select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    jsonb_build_object('definition', pg_get_functiondef(p.oid), 'owner', r.rolname)
  from pg_proc p join pg_roles r on r.oid = p.proowner
  where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass
      and d.objid=p.oid and d.deptype='e')
  union all
  select 'trigger', c.relname || '.' || t.tgname,
    jsonb_build_object('definition', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where c.relnamespace='public'::regnamespace and not t.tgisinternal
  union all
  select 'grant', table_name || '.' || grantee || '.' || privilege_type,
    jsonb_build_object('grantable', is_grantable, 'grantor', grantor)
  from information_schema.table_privileges where table_schema='public'
  union all
  select 'function_acl', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    jsonb_build_object('acl', (select jsonb_agg(a::text order by a::text)
      from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a))
  from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass
      and d.objid=p.oid and d.deptype='e')
  union all
  select 'index', indexname, jsonb_build_object('definition', indexdef)
  from pg_indexes where schemaname='public'
)
select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name,
  'fingerprint',md5(definition::text)) order by kind,name), '[]'::jsonb) as inventory
from objects;
