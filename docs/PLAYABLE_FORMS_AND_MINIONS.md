# Playable Wild Shape Forms & Player-Controlled Minions
_v2.611.0 design doc — approved direction from Jared (chat 18). Build order below._

## Goal
When a player shapeshifts (Wild Shape) or summons a creature (familiar,
steed, Summon Beast, Beast Master companion, ...), that PLAYER — not the
DM — plays the form or minion: sees its statblock, rolls its attacks,
moves its token, tracks its HP.

## Rules baseline (2024, verified)
- **Wild Shape HP model:** you keep your own HP/Hit Dice; the form
  grants Temp HP (level, ×3 Moon) as a buffer. Running out of Temp HP
  does NOT end the form (D&D Beyond article 1755, PHB p.81). Form ends
  only on: duration, using Wild Shape again, Incapacitated, death, or
  BA revert. Already implemented (v2.598/v2.610).
- **Wild Shape statblock rules:** game stats replaced by the beast's,
  EXCEPT you retain: creature type, HP/HD, INT/WIS/CHA, class
  features, languages, feats, and skill/save proficiencies (use the
  higher of your modifier vs the beast's). No spellcasting (Moon:
  subclass list allowed). Moon AC = max(13 + WIS, beast AC).
- **Summon turn timing:** 2024 summons/companions share the caster's
  initiative and take their turn immediately after the caster's. No
  separate initiative roll.
- **Scope note:** 2024 Conjure Animals is an emanation, NOT creatures —
  no minion needed. Effect-tokens (Flaming Sphere, Spiritual Weapon,
  Arcane Sword...) are spell objects, not creatures — they keep the
  v2.597 prompt-row model and are OUT of minion scope.

## What already exists (recon 2026-07-20)
- `monsters` table: full statblocks incl. `actions` jsonb, speeds,
  abilities, AC — 2024 MM beasts present (wolf, brown-bear, ... with
  parsed action counts). Text slug ids.
- `combatants` table: **`owner_id`**, `definition_type`,
  `definition_id`, `stat_block_snapshot`, full HP/condition state.
  The Token Library Refactor (v2.308–321) already built the minion
  data model — we only need to USE ownership.
- Summon tokens (v2.599): new path creates `combatants` rows
  (definition_type 'custom') + placements. Auto-despawn on conc drop
  (v2.600).
- `characters.wildshape_active` / `wildshape_beast_name` columns exist
  (2014-era; `wildshape_current_hp/max_hp` obsolete under 2024 model).
- MonsterActionPanel: full action resolution machinery (attack rolls,
  save batches, movement) — currently DM-gated.

## Build order

### Phase A — Playable Wild Shape form (sheet side)
- **A1. Known Forms + form picker.** Replace WildShapePanel's free-text
  name with a picker backed by `monsters` (type='Beast'), enforcing
  2024 gates: CR cap by level/circle (Moon: level÷3; others ¼→½→1 at
  2/4/8), no Fly speed until L8, known-forms list (4→6→8) stored on
  the character (new jsonb column `wildshape_known_forms`), swap one
  per long rest. Persist active form id in `wildshape_beast_name`
  (rename usage to hold the monster id).
- **A2. Shaped Actions.** While shaped, the sheet's Actions area gains
  a "Beast Form" section rendering the form's `actions` with rollable
  to-hit/damage (reuse MonsterActionPanel's action-parse helpers,
  extracted into a shared lib). Retained-rules banner (AC, speeds,
  senses; Moon AC max rule; save/skill higher-of note).
- **A3. Automation hooks.** Primal Strike rider (L7+, 1d8→2d8 at 15)
  and Moon Lunar Form 2d10 radiant as optional damage chips on beast
  attacks.

### Phase B — Player-controlled minions (map + combat side)
- **B1. Ownership threading.** Summon-created combatants get
  `owner_id` = casting player's user id (placeSummonToken +
  createPlacement pass-through). New "real creature" summon specs
  (familiar via Find Familiar/Wild Companion, Find Steed steed,
  Summon Beast/Fey/... spirits, Beast Master companion, Steel
  Defender) with definition_id → monsters/homebrew rows so the
  combatant carries a real statblock snapshot.
- **B2. Minion control panel.** Player-scoped panel (reusing the
  extracted action machinery from A2) for combatants where
  `owner_id = auth.uid()`: movement on the map, action rolls, HP/
  condition chips. DM retains full control of everything.
- **B3. Turn timing.** Minions act immediately after their owner's
  turn: initiative strip renders owned minions as sub-entries under
  the caster; End Turn on the caster opens the minion's mini-turn
  (skippable).
- **B4. RLS audit (merges open item #10).** `combatants` UPDATE
  policy must allow owner_id = auth.uid() (verify; add policy
  migration if DM-only today). Player-scoping of NPC data stays
  UI-only for non-owned rows unless Jared rules otherwise.

### Phase C — Polish
- Sheet minion tray (see your familiar's HP from the sheet), map
  affordances (owned-minion glow), despawn rules per source (familiar
  until long rest; steed until dismissed/0 HP; summon spells on conc —
  already wired).

## First ship after this doc: A1 (form picker + known forms).
