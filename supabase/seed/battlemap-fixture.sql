-- =============================================================
-- v2.647 — LOCAL battle-map fixture.
--
-- `supabase/seed.sql` (replayed by `supabase db reset`) gives a local
-- machine a login, one campaign and one character — enough for the
-- sheet flows, nothing for the map. This file fills that gap: it
-- furnishes EVERY local campaign with a dungeon scene that exercises
-- the whole battle-map surface (walls, doors, fog/vision, drawings,
-- text, token sizes, hidden tokens, a creature library, a second
-- player account for player-view testing).
--
-- LOCAL ONLY. It is never referenced by a migration and never runs
-- against production — the only runner is `node scripts/seed-battlemap.mjs`,
-- which pipes it into the local Docker Postgres container.
--
-- Idempotent: every row it writes has a deterministic id derived from
-- md5(campaign_id || ':' || key), so a re-run deletes exactly what the
-- previous run created and rebuilds it. Anything YOU create locally is
-- untouched.
--
-- Coordinate conventions (src/lib/battleMapGeometry.ts, v2.619):
--   world pixels = cell * grid_size_px (70 here)
--   odd  cell-count tokens (1x1 medium, 3x3 huge) anchor at CELL CENTER
--   even cell-count tokens (2x2 large, 4x4 gargantuan) anchor at a GRID
--   INTERSECTION (the top-left corner of the footprint)
-- Violating that is what scripts/anchor-check.mjs exists to catch, so
-- the anchors below are written as `cell*70 [+ 35]` on purpose.
--
-- Tokens are inserted into scene_tokens ONLY. The v2.389 sync trigger
-- mirrors each row into combatants + scene_token_placements, so the
-- fixture is correct on both engines (use_combatants_for_battlemap
-- on or off) without duplicating writes.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. Second local account: a PLAYER, so the map can be tested from
--    the non-DM side (fog per player, published-scene gating, token
--    drag permissions). Same password as the seeded DM.
--      email:    test-player@dndkeep.local
--      password: dndkeep-local-test
-- -------------------------------------------------------------
do $$
declare
  v_player uuid := '12121212-1212-1212-1212-121212121212';
begin
  if not exists (select 1 from auth.users where id = v_player) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_player,
      'authenticated', 'authenticated',
      'test-player@dndkeep.local',
      extensions.crypt('dndkeep-local-test', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Local Test Player"}',
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_player::text, v_player,
      format('{"sub":"%s","email":"test-player@dndkeep.local"}', v_player)::jsonb,
      'email', now(), now(), now()
    );
  end if;

  -- The profile row comes from the on_auth_user_created trigger at
  -- tier 'free', and free accounts are capped at ONE character BY THE
  -- DATABASE (enforce_character_limit). This account owns a PC in every
  -- local campaign, so it needs Pro — same reasoning as seed.sql's DM.
  update profiles
     set subscription_tier = 'pro', subscription_status = 'active'
   where id = v_player;
end $$;

-- -------------------------------------------------------------
-- 2. SRD catalog sample (public `monsters` table). Empty locally,
--    which leaves the bestiary and the "import from catalog" flow
--    with nothing to show. Six creatures spanning Small..Huge is
--    enough to exercise both.
--    source='srd' requires owner_id IS NULL (canonical_no_owner).
-- -------------------------------------------------------------
insert into monsters (
  id, name, source, visibility, type, alignment, cr, xp, size,
  hp, hp_formula, ac, speed, str, dex, con, "int", wis, cha,
  proficiency_bonus, languages, attack_name, attack_bonus, attack_damage
) values
  ('srd-goblin',       'Goblin',            'srd', 'public', 'humanoid', 'neutral evil',   '1/4',   50, 'Small',   7, '2d6',      15, 30,  8, 14, 10, 10,  8,  8, 2, 'Common, Goblin',  'Scimitar',   4, '1d6+2'),
  ('srd-orc',          'Orc',               'srd', 'public', 'humanoid', 'chaotic evil',   '1/2',  100, 'Medium', 15, '2d8+6',    13, 30, 16, 12, 16,  7, 11, 10, 2, 'Common, Orc',     'Greataxe',   5, '1d12+3'),
  ('srd-wolf',         'Wolf',              'srd', 'public', 'beast',    'unaligned',      '1/4',   50, 'Medium', 11, '2d8+2',    13, 40, 12, 15, 12,  3, 12,  6, 2, null,              'Bite',       4, '2d4+2'),
  ('srd-bugbear',      'Bugbear',           'srd', 'public', 'humanoid', 'chaotic evil',     '1',  200, 'Medium', 27, '5d8+5',    16, 30, 15, 14, 13,  8, 11,  9, 2, 'Common, Goblin',  'Morningstar',4, '2d8+2'),
  ('srd-owlbear',      'Owlbear',           'srd', 'public', 'monstrosity','unaligned',      '3',  700, 'Large',  59, '7d10+21',  13, 40, 20, 12, 17,  3, 12,  7, 2, null,              'Claws',      7, '2d8+5'),
  ('srd-young-green-dragon', 'Young Green Dragon', 'srd', 'public', 'dragon', 'lawful evil', '8', 3900, 'Large', 136, '16d10+48', 18, 40, 19, 12, 17, 16, 13, 15, 3, 'Common, Draconic','Bite',       7, '2d10+4')
on conflict (id) do update set
  name = excluded.name, hp = excluded.hp, ac = excluded.ac,
  cr = excluded.cr, xp = excluded.xp, size = excluded.size,
  visibility = excluded.visibility, updated_at = now();

-- -------------------------------------------------------------
-- 3. Per-campaign furniture. Runs for every local campaign except
--    the throwaway ones the E2E combat spec creates and drops.
-- -------------------------------------------------------------
do $$
declare
  c            record;   -- current campaign
  ch           record;   -- current character (party token loop)
  k            text;     -- id namespace for this campaign
  v_player     uuid := '12121212-1212-1212-1212-121212121212';
  v_owner      uuid;     -- campaign owner == the DM
  g            int  := 70;   -- grid_size_px for the fixture scenes
  sc           uuid;    -- dungeon scene id
  sc2          uuid;    -- overworld (hex) scene id
  f_root       uuid; f_mooks uuid; f_boss uuid;         -- creature folders
  cr_goblin    uuid; cr_ogre uuid; cr_assassin uuid;    -- creature ids
  cr_dragon    uuid; cr_colossus uuid; cr_skeleton uuid; cr_pseudo uuid;
  i            int;
  -- palette (hex → int, same encoding scene_tokens.color uses)
  col_pc       int := x'60a5fa'::int;   -- blue
  col_mob      int := x'ef4444'::int;   -- red
  col_boss     int := x'f59e0b'::int;   -- amber
  col_hidden   int := x'8b5cf6'::int;   -- violet
  col_ally     int := x'22c55e'::int;   -- green
begin
for c in
  select id, owner_id from campaigns
  where name not like 'E2E %'   -- E2E fixtures manage their own state
  order by created_at
loop
  v_owner := c.owner_id;
  k       := c.id::text || ':';

  sc          := md5(k || 'scene:dungeon')::uuid;
  sc2         := md5(k || 'scene:overworld')::uuid;
  f_root      := md5(k || 'folder:root')::uuid;
  f_mooks     := md5(k || 'folder:mooks')::uuid;
  f_boss      := md5(k || 'folder:boss')::uuid;
  cr_goblin   := md5(k || 'creature:goblin')::uuid;
  cr_ogre     := md5(k || 'creature:ogre')::uuid;
  cr_assassin := md5(k || 'creature:assassin')::uuid;
  cr_dragon   := md5(k || 'creature:dragon')::uuid;
  cr_colossus := md5(k || 'creature:colossus')::uuid;
  cr_skeleton := md5(k || 'creature:skeleton')::uuid;
  cr_pseudo   := md5(k || 'creature:pseudodragon')::uuid;

  -- ---- wipe the previous run (deterministic ids = surgical delete).
  -- Scene delete cascades to tokens/walls/drawings/texts, and the
  -- v2.389 delete trigger drops each token's mirrored combatant +
  -- placement (keeping any that a real combat encounter referenced).
  delete from scenes where id in (sc, sc2);
  delete from characters where id in (
    md5(k || 'pc:rogue')::uuid, md5(k || 'pc:cleric')::uuid, md5(k || 'pc:wizard')::uuid);
  delete from homebrew_monsters where id in (
    cr_goblin, cr_ogre, cr_assassin, cr_dragon, cr_colossus, cr_skeleton, cr_pseudo);
  delete from creature_folders where id in (f_root, f_mooks, f_boss);

  -- ---- the player account joins every campaign, so the same map can
  -- be opened side-by-side as DM and as player.
  insert into campaign_members (campaign_id, user_id, role)
  values (c.id, v_player, 'player')
  on conflict (campaign_id, user_id) do nothing;

  -- ---- party. Three level-5 PCs; the wizard belongs to the PLAYER
  -- account (its token gets player_id set below, so the player can
  -- drag exactly one token). The cleric is pre-damaged so HP bars,
  -- the party vitals strip and healing flows have something to show.
  insert into characters (
    id, user_id, campaign_id, name, species, class_name, background, level,
    strength, dexterity, constitution, intelligence, wisdom, charisma,
    max_hp, current_hp, armor_class, speed, initiative_bonus, skill_proficiencies
  ) values
    (md5(k || 'pc:rogue')::uuid,  v_owner,  c.id, 'Nyx Quickfingers', 'Halfling', 'Rogue',  'Criminal', 5,
      10, 18, 12, 13, 12,  9, 33, 33, 15, 30, 4, '{"stealth","perception","acrobatics"}'),
    (md5(k || 'pc:cleric')::uuid, v_owner,  c.id, 'Brannor Stoneheart', 'Dwarf', 'Cleric', 'Acolyte', 5,
      14, 10, 16,  9, 17, 12, 38, 21, 18, 25, 0, '{"religion","insight","medicine"}'),
    (md5(k || 'pc:wizard')::uuid, v_player, c.id, 'Ilyana Vell', 'Elf', 'Wizard', 'Sage', 5,
       8, 15, 12, 18, 13, 11, 27, 27, 12, 30, 2, '{"arcana","history","investigation"}');

  -- ---- creature library: a folder tree plus the seven creatures the
  -- dungeon places. homebrew_monsters is the canonical creature home
  -- post-v2.350 (src/lib/api/creatures.ts) and RLS keys on user_id.
  insert into creature_folders (id, owner_id, campaign_id, parent_folder_id, name, sort_index) values
    (f_root,  v_owner, c.id, null,   'Ruined Keep', 0),
    (f_mooks, v_owner, c.id, f_root, 'Mooks',       0),
    (f_boss,  v_owner, c.id, f_root, 'Bosses',      1);

  insert into homebrew_monsters (
    id, user_id, owner_id, campaign_id, folder_id, name, type, race, cr, size,
    hp, max_hp, ac, speed, str, dex, con, "int", wis, cha,
    attack_name, attack_bonus, attack_damage, xp, visible_to_players, description
  ) values
    (cr_goblin,   v_owner, v_owner, c.id, f_mooks, 'Goblin Scout',      'humanoid',   'goblinoid', '1/4', 'small',
       7,   7, 15, 30,  8, 14, 10, 10,  8,  8, 'Scimitar',     4, '1d6+2',    50, true,  'Fixture mook — three of these are placed in the barracks.'),
    (cr_skeleton, v_owner, v_owner, c.id, f_mooks, 'Crypt Skeleton',    'undead',     null,         '1/4', 'medium',
      13,  13, 13, 30, 10, 14, 15,  6,  8,  5, 'Shortsword',   4, '1d6+2',    50, true,  'Fixture mook — crypt guard.'),
    (cr_pseudo,   v_owner, v_owner, c.id, f_mooks, 'Pseudodragon',      'dragon',     null,         '1/4', 'tiny',
       7,   7, 13, 15,  6, 15, 13, 10, 12, 10, 'Bite',         4, '1d4+2',    50, true,  'Fixture ALLY — tiny token, sits with the party.'),
    (cr_ogre,     v_owner, v_owner, c.id, f_mooks, 'Ogre Bruiser',      'giant',      null,         '2',   'large',
      59,  59, 11, 40, 19,  8, 16,  5,  7,  7, 'Greatclub',    6, '2d8+4',   450, true,  'Fixture LARGE token (2x2 footprint).'),
    (cr_assassin, v_owner, v_owner, c.id, f_boss,  'Shadow Assassin',   'humanoid',   null,         '8',   'medium',
      78,  78, 15, 30, 11, 16, 14, 13, 11, 10, 'Poisoned Blade', 7, '1d6+3', 3900, false, 'Fixture HIDDEN token — visible_to_all=false on the map.'),
    (cr_dragon,   v_owner, v_owner, c.id, f_boss,  'Young Red Dragon',  'dragon',     null,        '10',   'huge',
     178, 178, 18, 40, 23, 10, 21, 14, 11, 19, 'Bite',        10, '2d10+6', 5900, true,  'Fixture HUGE token (3x3 footprint).'),
    (cr_colossus, v_owner, v_owner, c.id, f_boss,  'Bone Colossus',     'undead',     null,        '17',   'gargantuan',
     300, 300, 19, 40, 25,  9, 22,  6, 12, 10, 'Slam',        12, '4d10+7',18000, true,  'Fixture GARGANTUAN token (4x4 footprint).');

  -- =========================================================
  -- Scene 1 — "Ruined Keep" dungeon. 30x20 cells @ 70px, dark
  -- ambient light so the vision/fog pipeline is exercised on load.
  --
  --   cols 1-9   rows 1-8   Guard Room   (party starts here)
  --   cols 16-27 rows 1-8   Barracks     (goblins, ogre, assassin)
  --   cols 10-15 rows 4     corridor between them, doors at each end
  --   col  12-13 rows 5-11  branch corridor south
  --   cols 6-20  rows 12-18 Crypt        (dragon, colossus, skeletons)
  -- =========================================================
  insert into scenes (
    id, campaign_id, owner_id, name, grid_type, grid_size_px,
    width_cells, height_cells, ambient_light, is_published, dm_notes
  ) values (
    sc, c.id, v_owner, 'Ruined Keep (fixture)', 'square', g,
    30, 20, 'dark', true,
    'Local fixture scene. Doors: guard-room east = closed, barracks west = open, crypt = locked.'
  );

  -- ---- walls. All coordinates are cell corners * 70.
  -- blocks_sight / blocks_movement are deliberately mixed so the
  -- vision polygon and the movement-collision trigger can be tested
  -- independently (a curtain that blocks sight only, iron bars that
  -- block movement only).
  insert into scene_walls (scene_id, x1, y1, x2, y2, blocks_sight, blocks_movement, door_state) values
    -- Guard Room perimeter (cols 1-9, rows 1-8)
    (sc,  1*g,  1*g, 10*g,  1*g, true,  true,  null),
    (sc,  1*g,  1*g,  1*g,  9*g, true,  true,  null),
    (sc,  1*g,  9*g, 10*g,  9*g, true,  true,  null),
    (sc, 10*g,  1*g, 10*g,  4*g, true,  true,  null),
    (sc, 10*g,  4*g, 10*g,  5*g, true,  true,  'closed'),   -- door → open it to cut a vision corridor
    (sc, 10*g,  5*g, 10*g,  9*g, true,  true,  null),
    -- Corridor east-west (row 4), with the south branch gap at cols 12-13
    (sc, 10*g,  4*g, 16*g,  4*g, true,  true,  null),
    (sc, 10*g,  5*g, 12*g,  5*g, true,  true,  null),
    (sc, 13*g,  5*g, 16*g,  5*g, true,  true,  null),
    -- South branch corridor down to the crypt
    (sc, 12*g,  5*g, 12*g, 12*g, true,  true,  null),
    (sc, 13*g,  5*g, 13*g, 12*g, true,  true,  null),
    -- Barracks perimeter (cols 16-27, rows 1-8)
    (sc, 16*g,  1*g, 28*g,  1*g, true,  true,  null),
    (sc, 28*g,  1*g, 28*g,  9*g, true,  true,  null),
    (sc, 16*g,  9*g, 28*g,  9*g, true,  true,  null),
    (sc, 16*g,  1*g, 16*g,  4*g, true,  true,  null),
    (sc, 16*g,  4*g, 16*g,  5*g, true,  true,  'open'),     -- door already open
    (sc, 16*g,  5*g, 16*g,  9*g, true,  true,  null),
    (sc, 22*g,  1*g, 22*g,  6*g, true,  true,  null),       -- interior partition
    (sc, 18*g,  6*g, 22*g,  6*g, false, true,  null),       -- iron bars: see through, can't cross
    (sc, 25*g,  4*g, 25*g,  9*g, true,  false, null),       -- curtain: blocks sight only
    -- Crypt perimeter (cols 6-20, rows 12-18)
    (sc,  6*g, 12*g, 12*g, 12*g, true,  true,  null),
    (sc, 12*g, 12*g, 13*g, 12*g, true,  true,  'locked'),   -- locked door
    (sc, 13*g, 12*g, 21*g, 12*g, true,  true,  null),
    (sc,  6*g, 12*g,  6*g, 19*g, true,  true,  null),
    (sc, 21*g, 12*g, 21*g, 19*g, true,  true,  null),
    (sc,  6*g, 19*g, 21*g, 19*g, true,  true,  null),
    (sc, 16*g, 14*g, 16*g, 18*g, true,  true,  null);       -- sarcophagus row

  -- ---- DM annotations: one of each drawing kind + room labels.
  insert into scene_drawings (scene_id, kind, points, color, line_width) values
    (sc, 'rect',   '[[420,840],[1470,1330]]'::jsonb, '#f59e0b', 4),                       -- crypt outline
    (sc, 'circle', '[[735,1085],[945,1085]]'::jsonb, '#ef4444', 3),                       -- dragon's reach
    (sc, 'line',   '[[735,315],[1085,315]]'::jsonb,  '#38bdf8', 3),                       -- corridor march route
    (sc, 'pencil', '[[140,560],[210,600],[280,560],[350,610],[420,560],[490,600]]'::jsonb, '#a78bfa', 3);

  insert into scene_texts (scene_id, x, y, text, color, font_size) values
    (sc,  175,  105, 'Guard Room', '#e2e8f0', 22),
    (sc, 1190,  105, 'Barracks',   '#e2e8f0', 22),
    (sc,  455,  875, 'Crypt',      '#e2e8f0', 22),
    (sc,  875,  840, 'LOCKED',     '#f59e0b', 16);

  -- ---- party tokens. Every character in the campaign (the three
  -- fixture PCs plus whatever else you already had) gets a token in
  -- the guard room, laid out 3-across. Medium = odd cell count, so
  -- the anchor is a cell CENTRE (cell*70 + 35).
  i := 0;
  for ch in
    select id, name, user_id from characters where campaign_id = c.id order by created_at, id
  loop
    exit when i >= 9;
    insert into scene_tokens (
      id, scene_id, x, y, size, name, character_id, color, visible_to_all, player_id
    ) values (
      md5(k || 'token:pc:' || ch.id::text)::uuid, sc,
      (2 + (i % 3)) * g + g / 2,
      (2 + (i / 3)) * g + g / 2,
      'medium', ch.name, ch.id, col_pc, true,
      -- the player's own PC token is drag-enabled for that account
      case when ch.user_id = v_player then v_player else null end
    );
    i := i + 1;
  end loop;

  -- ---- allied tiny token next to the party.
  insert into scene_tokens (id, scene_id, x, y, size, name, creature_id, color, visible_to_all) values
    (md5(k || 'token:pseudo')::uuid, sc, 5*g + g/2, 2*g + g/2, 'tiny', 'Pseudodragon', cr_pseudo, col_ally, true);

  -- ---- barracks: three goblin instances off ONE creature row (each
  -- token gets its own combatant + HP pool via the sync trigger), a
  -- 2x2 ogre, and a hidden assassin players can't see.
  insert into scene_tokens (id, scene_id, x, y, size, name, creature_id, color, visible_to_all) values
    (md5(k || 'token:goblin:1')::uuid, sc, 18*g + g/2,  2*g + g/2, 'small',  'Goblin Scout', cr_goblin,   col_mob,    true),
    (md5(k || 'token:goblin:2')::uuid, sc, 19*g + g/2,  2*g + g/2, 'small',  'Goblin Scout', cr_goblin,   col_mob,    true),
    (md5(k || 'token:goblin:3')::uuid, sc, 18*g + g/2,  3*g + g/2, 'small',  'Goblin Scout', cr_goblin,   col_mob,    true),
    -- large (2x2): anchor is the grid intersection at the footprint's top-left
    (md5(k || 'token:ogre')::uuid,     sc, 19*g,        4*g,       'large',  'Ogre Bruiser', cr_ogre,     col_mob,    true),
    (md5(k || 'token:assassin')::uuid, sc, 26*g + g/2,  7*g + g/2, 'medium', 'Shadow Assassin', cr_assassin, col_hidden, false);

  -- ---- crypt: huge (3x3, centre anchor) + gargantuan (4x4, corner
  -- anchor) + two skeletons, for footprint / reach / distance math.
  insert into scene_tokens (id, scene_id, x, y, size, name, creature_id, color, visible_to_all) values
    (md5(k || 'token:dragon')::uuid,   sc, 10*g + g/2, 15*g + g/2, 'huge',       'Young Red Dragon', cr_dragon,   col_boss, true),
    (md5(k || 'token:colossus')::uuid, sc, 17*g,       14*g,       'gargantuan', 'Bone Colossus',    cr_colossus, col_boss, true),
    (md5(k || 'token:skel:1')::uuid,   sc,  8*g + g/2, 17*g + g/2, 'medium',     'Crypt Skeleton',   cr_skeleton, col_mob,  true),
    (md5(k || 'token:skel:2')::uuid,   sc, 14*g + g/2, 17*g + g/2, 'medium',     'Crypt Skeleton',   cr_skeleton, col_mob,  true);

  -- =========================================================
  -- Scene 2 — hex grid, bright light, UNPUBLISHED. Covers the scene
  -- switcher, the hex renderer, and the publish/unpublish gate
  -- (players must not see this one until it is published).
  -- =========================================================
  insert into scenes (
    id, campaign_id, owner_id, name, grid_type, grid_size_px,
    width_cells, height_cells, ambient_light, is_published, dm_notes
  ) values (
    sc2, c.id, v_owner, 'Overland Trail (fixture, hex)', 'hex_pointy', g,
    24, 16, 'bright', false,
    'Unpublished on purpose — use it to test the publish gate and the hex grid.'
  );

  insert into scene_texts (scene_id, x, y, text, color, font_size) values
    (sc2, 210, 140, 'Hex grid / bright light / unpublished', '#e2e8f0', 20);

  insert into scene_tokens (id, scene_id, x, y, size, name, creature_id, color, visible_to_all) values
    (md5(k || 'token:hex:ogre')::uuid, sc2, 8*g,       5*g,       'large',  'Ogre Bruiser', cr_ogre,   col_mob, true),
    (md5(k || 'token:hex:wolf')::uuid, sc2, 6*g + g/2, 7*g + g/2, 'medium', 'Goblin Scout', cr_goblin, col_mob, true);

end loop;
end $$;

commit;
