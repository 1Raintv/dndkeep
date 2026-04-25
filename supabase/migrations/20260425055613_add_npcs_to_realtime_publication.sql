-- v2.243.1 — add `npcs` table to supabase_realtime publication.
-- v2.243's NpcTokenQuickPanel subscribes to npc:{id} channels expecting
-- UPDATE events on the npcs table. Writes succeed but the panel never sees
-- the echoes because Postgres wasn't publishing changes for the npcs table.
-- Already applied to the live DB (version 20260425055613); persisting here
-- so a future Supabase rebuild from migration files won't lose the fix.

ALTER PUBLICATION supabase_realtime ADD TABLE public.npcs;
