# DNDKeep Combat Backbone — Architectural Spec

**Status:** Draft v3 — monster licensing resolved (SRD-only path, per R6). Ready for Phase A kickoff.
**Drafted:** v2.92.0 conversation
**Target start:** v2.93.0

This document is the shared contract between Jared and Claude for the live-play combat system. Every design decision here affects the next 10–15 versions of development. Disagreements are surfaced here, not discovered during Phase D.

**Canon:** D&D 5e 2024 PHB (5.5e). Every mechanic defaults to 2024 RAW. No 2014 carryover anywhere.

---

## 1. Product Intent (one paragraph)

DNDKeep becomes the backbone for running live D&D sessions — not just a character sheet. Every action any participant takes (player, DM, NPC, monster) is captured in a unified, filterable log that renders in real time to everyone in the campaign. Combat is a guided, rules-enforced state machine: players and monsters take turns, attacks resolve with animated dice rolls visible to everyone, damage is pending until reactions are decided, HP applies automatically, conditions enforce RAW mechanical effects, and the shared battle map stays in lockstep across every screen. The DM can override any individual automation through a settings panel, but the defaults are full RAW 2024 PHB enforcement.

---

## 2. The Eleven Pillars (what this system must do)

1. **Unified event stream.** Every mechanically-relevant action emits a structured event. Attacks, saves, damage, healing, spells, concentration, conditions, movement, equipment changes, potions — all flow through one event taxonomy. The log is the source of truth.
2. **Chained events.** A Fireball is one logical action but produces 10+ events (cast → placement → per-target save → per-target damage → HP application → concentration start). Events chain via a `chain_id` so the log can render them as nested sub-steps.
3. **Two views, one data model.** Campaign-wide Log tab shows the full campaign action log, filterable by actor type. Each character sheet shows only that character's own events. Both read from the same table.
4. **Shared battle map, realtime.** One canvas. Every player, the DM, and all NPCs/monsters render simultaneously. Local optimistic snap, background broadcast via Supabase realtime. Target end-to-end sync: ≤1s.
5. **Player-side battle map access.** Battle Map button lives on the character sheet header, top-right, immediately left of Settings.
6. **Turn-based combat state machine.** Campaign has `in_combat` flag. Active encounter tracks initiative order, current turn, round number, and per-participant action budget (Action / Bonus Action / Reaction / Movement). Player screens get a yellow ambient border glow while in combat; damage flashes red.
7. **Monster sheets.** Every monster has a playable sheet with AC, HP, CR, attacks, spells, reactions, skills, traits, and (for bosses) legendary + lair actions. The DM drives monsters exactly like players drive characters.
8. **Pending-damage state machine with reaction timer.** DM attack → hit → damage → `damage_pending` event. Target player sees "You've been hit" modal with a configurable countdown (default 120s) and a list of eligible reactions. On accept or timeout, damage applies.
9. **Structured reaction registry.** Every reaction the app knows about has a mitigation handler (Shield → +5 AC retroactive, Uncanny Dodge → half damage, Hellish Rebuke → counter-damage, etc.). The "Use a reaction?" modal shows only reactions this character actually has and can use this round.
10. **RAW-enforced conditions.** Blinded → disadvantage on attacks + attackers get advantage. Prone → speed cost to stand, disadvantage on attacks, adjacent attackers have advantage. Etc. Each condition automatically modifies dice rolls at resolution time.
11. **Hard-bounded movement.** Dragging a token shows a live range circle of remaining movement. The token physically cannot be dragged past it. Dash doubles the circle for the turn. Difficult terrain halves it.

---

## 3. Decisions Locked-In from Q&A

| # | Decision | Locked value |
|---|---|---|
| Q1 | Monster data shape | Full 2024 Monster Manual structure. Schema captures: initiative mod + static value, AC, HP formula, Speed, 6 ability scores with separate save modifiers, skills with modifiers, senses (darkvision/telepathy ranges + passive Perception), languages, CR/XP/PB, Actions (Multiattack, Spellcasting with ability + DC + per-tier spell lists, named attacks with to-hit/reach/damage broken by type + rider conditions, save-based abilities with DC + failure/success clauses), Reactions with usage limits, Traits, Legendary Actions (for boss monsters), Lair Actions (for bosses). Flavor: habitat, treasure tags, lore description. See Section 5.2 schema. **Source locked to SRD-only + homebrew per R6.** |
| Q2 | Pending-damage timer | Default 120s. DM toggle: enabled, custom duration, or off. Timeout = auto-apply without reaction. |
| Q3 | Reaction UI | Structured. App lists ONLY reactions the target has and can use this round. Each has a registered handler. |
| Q4 | AoE targeting | Movable template at correct RAW size (fireball = 20-ft sphere, no smaller). Placed on map by caster, persists until end of caster's turn (instantaneous) or concentration ends (lasting). Clearly labeled with spell name, visible to everyone. |
| Q5 | Initiative visibility | Bottom-of-screen initiative strip. Hidden monsters don't appear in player view at all. DM reveal unhides them; DM setting chooses "roll all at start" vs "roll each as revealed". |
| Q6 | Log storage | Unified event table. Campaign Log view shows all actors. Per-character view on sheet filters by actor_id. |
| Q7 | Realtime | Optimistic local snap + Supabase realtime broadcast. ≤1s sync acceptable. No subscription upgrade needed yet — current tier handles this. **Applies to all layers: token positions, drawings, damage events, initiative changes, HP updates.** |
| Q8 | Movement | Hard block. Live range circle during drag. No manual override — DM can toggle the rule off globally if needed. |
| Q9 | Roll agency | DMs roll NPC/monster actions manually when auto is off. Players ALWAYS roll their own dice, even when full-auto is on. |
| Q10 | One-spell-per-turn rule | Applies to monsters too. Cantrips exempt. Legendary/lair actions are separate and later. |
| R1 | Ruleset | 2024 PHB (5.5e) only. Exhaustion uses 2024 formula (-2 per level to d20 tests). Cover uses 2024 rules (half = +2 AC + DEX saves, three-quarters = +5, total = can't be targeted). |
| R2 | Downed character initiative | KO'd characters STAY in their original initiative slot. On their turn while at 0 HP and not stable, auto-prompt death save. Details in Section 4.3. |
| R3 | DM fudge override | DM can silently edit any pending damage value before it applies. The public event log shows only the adjusted number as if it was the original. A private `dm_fudge` event is logged with `visibility: 'dm_only'` so the DM can audit their own fudges later. |
| R4 | Friendly-fire confirmation | When a caster places an AoE that catches own party members, a confirmation modal appears: "Your ally [Name] is in the area. Continue?" Yes/No. |
| R5 | Cover detection | **Phase 1 (ships with F):** DM tags cover manually via token right-click (quarter/half/three-quarters/total). Auto-applies the AC/save modifier. **Phase 2 (ships later as enhancement):** auto line-of-sight check against terrain objects on the drawing layer, prompts player when they move into cover. |
| R6 | Monster content source | **Tier 1 SRD only + homebrew.** Canonical monsters come from SRD 5.1 (OGL 1.0a) and SRD 5.2 (CC-BY-4.0) — both free, legally redistributable. Attribution footer rendered on every monster sheet. Homebrew layer for DM-created content (fully editable, tagged `license_key='homebrew'`, `is_editable=true`). **No aidedd.org, no 5e.tools, no D&D Beyond scraping — ever.** Existing 334 rows audited and found to be SRD 5.1 compliant (verified by absence of Displacer Beast, Beholder, Mind Flayer, Slaad, Neogi, Umber Hulk — the classic non-SRD exclusions). Keep existing rows; backfill license metadata in Phase B. |

---

## 4. Event Taxonomy

Every event conforms to a base shape:

```ts
interface CombatEvent {
  id: string;              // uuid, client-generated for idempotency
  campaign_id: string;
  encounter_id: string | null;  // null = outside combat
  chain_id: string;        // groups related events (one Fireball cast = one chain)
  sequence: number;        // monotonic within encounter for deterministic ordering
  parent_event_id: string | null;  // for nested chains
  actor: {
    type: 'player' | 'dm' | 'npc' | 'monster';
    id: string;            // character_id, npc_id, monster_instance_id
    name: string;          // cached for log rendering
  };
  target: {
    type: 'player' | 'monster' | 'npc' | 'object' | 'area';
    id: string | null;     // null for area
    name: string;
  } | null;
  event_type: EventType;
  payload: any;            // event-type-specific
  visibility: 'public' | 'hidden_from_players';  // DM-only events
  created_at: timestamp;
}
```

### 4.1 Core Event Types

**Initiative**
- `initiative_rolled` — `{ d20: 14, modifier: 2, total: 16, advantage_reason?: string }`
- `turn_started` — `{ round: number, action_budget: {action: 1, bonus: 1, reaction: 1, movement_ft: 30} }`
- `turn_ended` — `{ unused_budget: {…} }`

**Movement**
- `movement` — `{ from: {x, y}, to: {x, y}, feet_used: number, difficult_terrain: boolean }`

**Attack chain**
- `attack_declared` — `{ weapon_or_spell: string, target_id: string }`
- `attack_roll` — `{ d20_natural: 17, modifier: 7, total: 24, advantage: 'none'|'advantage'|'disadvantage', conditions_applied: string[], target_ac: 15, result: 'hit'|'miss'|'crit_hit'|'crit_miss' }`
- `save_requested` — `{ ability: 'DEX', dc: 15, reason: string }`
- `save_rolled` — `{ ability: 'DEX', d20_natural: 8, modifier: 3, total: 11, dc: 15, result: 'fail'|'success' }`
- `damage_rolled` — `{ dice: '8d6', rolled: [3,6,5,1,4,6,2,5], modifier: 0, damage_type: 'Fire', total: 32 }`
- `damage_pending` — `{ amount: 32, damage_type: 'Fire', source_event_id: string, reaction_timer_expires_at: timestamp }`
- `reaction_used` — `{ reaction_key: 'shield', trigger_event_id: string, effect_summary: string }`
- `damage_applied` — `{ initial: 32, mitigated: 0, final: 32, resistances_applied: [], hp_before: 45, hp_after: 13 }`

**Spells**
- `spell_cast` — `{ spell_id: string, slot_level: number|null, is_cantrip: boolean, is_ritual: boolean, concentration: boolean }`
- `spell_effect_placed` — `{ spell_id: string, shape: 'sphere'|'cube'|'cone'|'line', size_ft: number, origin: {x,y}, label: string }`
- `spell_effect_removed` — `{ reason: 'duration_ended'|'concentration_broken'|'dismissed' }`
- `concentration_started` — `{ spell_id: string }`
- `concentration_broken` — `{ reason: 'save_failed'|'damage_save_unforced'|'dismissed'|'death'|'incapacitated', save_details?: {} }`

**Healing & HP**
- `healing_applied` — `{ dice: string, amount: number, hp_before: number, hp_after: number, revived_from_0: boolean }`
- `temp_hp_gained` — `{ amount: number }`
- `dropped_to_0_hp` — `{ damage_excess: number, instant_death: boolean }`
- `death_save_turn_prompt` — `{ participant_id: string }` (fired when unconscious participant's turn begins)
- `death_save_rolled` — `{ d20: number, result: 'success'|'failure'|'crit_success'|'crit_failure', successes_after: 0|1|2|3, failures_after: 0|1|2|3 }`
- `damage_at_0_hp_failure_added` — `{ damage_source_event_id: string, was_crit: boolean, failures_added: 1|2 }`
- `stabilized` — `{ method: 'three_successes'|'spare_the_dying'|'medicine_check'|'healing' }`
- `revived` — `{ from_method: 'nat_20'|'healing', hp: number }` (unconscious → conscious)
- `died` — `{ cause: 'three_failures'|'instant_death', source_event_id: string|null }`

**Conditions**
- `condition_applied` — `{ condition: 'blinded', source: string, duration: string }`
- `condition_removed` — `{ condition: string, reason: string }`

**Inventory**
- `item_equipped` — `{ item_id: string, slot: string }`
- `item_unequipped` — `{ item_id: string }`
- `item_used` — `{ item_id: string, effect_summary: string }`
- `potion_consumed` — `{ potion_id: string, heal_amount?: number }`

**Meta**
- `combat_started` — `{}`
- `combat_ended` — `{ rounds: number, duration_seconds: number }`
- `monster_revealed` — `{ monster_instance_id: string }`

**DM-only (visibility='hidden_from_players')**
- `dm_fudge` — `{ original_value: number, new_value: number, affected_event_id: string, reason?: string }` — logged when DM silently edits a damage/save/roll before it finalizes. Players never see this entry; only the DM can review in a private audit view.
- `dm_override` — `{ action: 'force_apply_damage'|'skip_reaction'|'set_hp'|..., target_event_id: string, reason?: string }`
- `friendly_fire_acknowledged` — `{ spell_id: string, ally_names: string[] }` — records that caster confirmed catching own party in AoE

### 4.2 Chain Example (Fireball)

```
chain_id: f1b3...
seq 1: spell_cast        (Alice cast Fireball, slot 3)
seq 2: spell_effect_placed (Sphere 20ft @ (340,220), "Alice's Fireball")
seq 3: damage_rolled     (8d6 fire = 28)
seq 4: save_requested    (Goblin#1, DEX DC 15)   parent=seq1
seq 5: save_rolled       (Goblin#1, DEX 8 vs 15 FAIL)  parent=seq4
seq 6: damage_applied    (Goblin#1 took 28 fire, 45→17 HP) parent=seq5
seq 7: save_requested    (Goblin#2, DEX DC 15)   parent=seq1
seq 8: save_rolled       (Goblin#2, DEX 17 vs 15 SUCCESS)  parent=seq7
seq 9: damage_applied    (Goblin#2 took 14 fire, half)     parent=seq8
seq 10: spell_effect_removed  (end of Alice's turn)
```

Log UI renders this as a collapsible tree, chain_id as the outer card.

### 4.3 Downed Character Turn Flow (2024 Death Saves)

Per 2024 PHB, a character at 0 HP is **Unconscious + Prone**, drops held items, and stays at their original initiative slot. The following state machine runs when an unconscious participant's turn begins:

```
Turn starts
  │
  ├─ If stable → skip turn, no prompt, auto end_turn
  │
  └─ If unconscious & not stable:
       emit `death_save_turn_prompt` event
       Player clicks "Roll Death Save" button → d20 via dice roller
       │
       ├─ 1 (nat 1)         → 2 failures added
       ├─ 2-9               → 1 failure added
       ├─ 10-19             → 1 success added
       └─ 20 (nat 20)       → regain 1 HP + revived event, turn continues normally
       
       emit `death_save_rolled` event (includes running successes/failures counts)
       
       ├─ If successes reach 3 → emit `stabilized` event
       ├─ If failures reach 3  → emit `died` event
       └─ Otherwise             → end_turn
```

**Taking damage while at 0 HP:**
- Incoming damage adds 1 failure automatically via `damage_at_0_hp_failure_added` event
- If the damage came from a melee hit within 5 ft → 2 failures (crit rule)
- If damage ≥ remaining max HP → `died` event with `cause: 'instant_death'`

**Healing while at 0 HP:**
- Any healing for 1+ HP → `revived` event, death save counters reset to 0/0
- Character wakes up (unconscious + prone conditions removed from unconscious; prone remains)
- Turn not granted mid-other-turn — they act on their next initiative tick

**Settings the DM can toggle (per R3):**
- Auto-roll death saves on turn start (off by default — player keeps agency)
- Hide death save counts from other players until someone uses a Medicine check to "see the DM secret count" (classic DM preference)


---

## 5. Database Schema (New + Modified)

### 5.1 New Tables

#### `combat_encounters`
```sql
CREATE TABLE combat_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT,                          -- "Goblin ambush"
  status TEXT NOT NULL CHECK (status IN ('setup','active','ended')),
  round_number INT NOT NULL DEFAULT 0,
  current_turn_index INT NOT NULL DEFAULT 0,
  initiative_order JSONB NOT NULL DEFAULT '[]',  -- ordered list of participant refs
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `combat_participants`
```sql
CREATE TABLE combat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES combat_encounters(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('character','monster','npc')),
  entity_id UUID NOT NULL,            -- character_id / monster_instance_id / npc_id
  name TEXT NOT NULL,                 -- cached
  initiative INT,                     -- null until rolled
  initiative_tiebreaker INT,          -- dex mod for ties
  action_used BOOLEAN DEFAULT FALSE,
  bonus_used BOOLEAN DEFAULT FALSE,
  reaction_used BOOLEAN DEFAULT FALSE,
  movement_used_ft INT DEFAULT 0,
  leveled_spell_cast BOOLEAN DEFAULT FALSE,  -- enforces one-leveled-spell-per-turn
  hidden BOOLEAN DEFAULT FALSE,       -- DM-hidden monsters
  temp_hp INT DEFAULT 0,
  death_saves JSONB DEFAULT '{"successes":0,"failures":0}',
  active_conditions TEXT[] DEFAULT ARRAY[]::TEXT[],
  concentration_spell_id TEXT,
  concentration_event_id UUID,
  UNIQUE(encounter_id, entity_id)
);
```

#### `combat_events` (replaces action_logs + character_history)
```sql
CREATE TABLE combat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES combat_encounters(id) ON DELETE SET NULL,
  chain_id UUID NOT NULL,
  sequence INT NOT NULL,
  parent_event_id UUID REFERENCES combat_events(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('player','dm','npc','monster','system')),
  actor_id UUID,                      -- null for 'system'/'dm' unattributed
  actor_name TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  target_name TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','hidden_from_players')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_combat_events_campaign_time ON combat_events(campaign_id, created_at DESC);
CREATE INDEX idx_combat_events_chain ON combat_events(chain_id, sequence);
CREATE INDEX idx_combat_events_actor ON combat_events(campaign_id, actor_id, created_at DESC);
```

#### `pending_damage`
```sql
CREATE TABLE pending_damage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES combat_encounters(id) ON DELETE CASCADE,
  target_participant_id UUID NOT NULL REFERENCES combat_participants(id) ON DELETE CASCADE,
  source_event_id UUID NOT NULL REFERENCES combat_events(id),
  amount INT NOT NULL,
  damage_type TEXT NOT NULL,
  attacker_name TEXT NOT NULL,
  attack_summary TEXT NOT NULL,       -- "Goblin Scimitar: 18 vs AC 14 → HIT"
  eligible_reactions JSONB NOT NULL DEFAULT '[]',  -- [{key, label, description}]
  expires_at TIMESTAMPTZ NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,                    -- 'reaction:shield' | 'reaction:none' | 'timeout' | 'dm_override'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `spell_effects_on_map`
```sql
CREATE TABLE spell_effects_on_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES combat_encounters(id) ON DELETE CASCADE,
  caster_participant_id UUID NOT NULL REFERENCES combat_participants(id),
  spell_id TEXT NOT NULL,
  label TEXT NOT NULL,                -- "Alice's Hunger of Hadar"
  shape TEXT NOT NULL CHECK (shape IN ('sphere','cube','cone','line','cylinder')),
  size_ft INT NOT NULL,
  origin_x INT NOT NULL,
  origin_y INT NOT NULL,
  rotation_deg INT DEFAULT 0,
  color TEXT DEFAULT '#a855f7',
  expires_at TIMESTAMPTZ,             -- null = concentration-bound
  requires_concentration BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 Modified Tables

#### `campaigns`
Add `combat_automation_settings JSONB DEFAULT '{…}'` column. Default value:
```json
{
  "initiative_mode": "auto_all",
  "reaction_timer_enabled": true,
  "reaction_timer_seconds": 120,
  "auto_dm_attack_rolls": true,
  "auto_dm_damage_rolls": true,
  "auto_dm_save_rolls": true,
  "auto_condition_effects": true,
  "hard_block_movement": true,
  "one_leveled_spell_per_turn": true,
  "player_initiative_mode": "auto",
  "hidden_monster_reveal_mode": "roll_at_reveal"
}
```

#### `monsters`
Add columns:
```
spells JSONB DEFAULT '[]',
attacks JSONB DEFAULT '[]',
reactions JSONB DEFAULT '[]',
traits JSONB DEFAULT '[]',
legendary_actions JSONB DEFAULT '[]',
lair_actions JSONB DEFAULT '[]',
skill_modifiers JSONB DEFAULT '{}',
damage_resistances TEXT[] DEFAULT '{}',
damage_immunities TEXT[] DEFAULT '{}',
condition_immunities TEXT[] DEFAULT '{}',
saving_throw_profs TEXT[] DEFAULT '{}'
```

#### `characters`
Already has `automation_overrides` planned. Add `reactions_used_this_round INT DEFAULT 0` for reaction consumption tracking (resets at turn start).

#### `battle_maps`
Add columns for realtime:
```
last_update_at TIMESTAMPTZ,
version INT DEFAULT 0     -- increment on change for conflict detection
```

Token position updates go through a Supabase realtime channel keyed by encounter_id.

### 5.3 Migration Plan for Existing Data

- `action_logs` (59 rows) → migrate into `combat_events` with `actor_type='player'` or `'dm'`, `chain_id` = self-id (singleton chain), best-effort event_type mapping.
- `character_history` (91 rows) → same unified table, same mapping.
- Both old tables remain read-only in-app until v2.95 (verify migration), then dropped.

---

## 6. Reaction Registry (Phase E detail)

Each reaction is an entry in `src/data/reactions.ts` with a handler:

```ts
interface Reaction {
  key: string;                        // 'shield'
  source_type: 'spell' | 'feature' | 'invocation';
  source_id: string;                  // spell id or feature id
  name: string;
  requires_slot: boolean;
  slot_level: number | null;
  cost_description: string;           // "1st-level spell slot"
  trigger: ReactionTrigger;
  effect: ReactionEffect;
  mitigation: (ctx: DamageContext) => DamageMitigation;
}

type ReactionTrigger =
  | { type: 'on_hit_by_attack' }
  | { type: 'on_damaged_by_attacker_within_range', range_ft: number }
  | { type: 'on_save_failure' }
  | ...

type DamageMitigation = {
  ac_bonus_retroactive?: number;      // Shield: +5 AC for the triggering attack
  damage_multiplier?: number;         // Uncanny Dodge: 0.5
  damage_after?: number;              // flat override
  counter_damage?: { dice: string, type: string, target: 'attacker' };
};
```

Initial registry in Phase E covers the common reactions:
- Shield (spell)
- Absorb Elements (spell)
- Uncanny Dodge (Rogue feature)
- Hellish Rebuke (Warlock spell as reaction)
- Counterspell (spell — Phase F)
- Opportunity Attack (universal, auto-offered when enemy leaves reach)

The registry is extensible — Psion disciplines, subclass features, feats, magic items all plug in the same way.

---

## 6.5 Cover Detection (per R5)

### 2024 RAW rules the system enforces

| Cover | AC bonus | DEX save bonus | Targetability |
|---|---|---|---|
| None | — | — | Targetable |
| Quarter | +2 | +2 | Targetable |
| Half | +2 | +2 | Targetable |
| Three-quarters | +5 | +5 | Targetable |
| Total | — | — | **Cannot be targeted directly** (spell/attack fails) |

AoE saves with "you can see a point of origin" rule: target in total cover from origin → unaffected.

### Two-phase implementation

**Phase 1 — DM tagging (ships with Phase F, v2.100-v2.102):**
- Right-click any token → "Set cover from [attacker name]" → pick Quarter/Half/Three-quarters/Total
- The cover tag is directional: cover from east ≠ cover from west
- Stored on the participant row as `cover_overrides: { "attacker_id": "half" }`
- When an attack roll or save resolves, the resolver checks the cover_overrides map and auto-applies the AC/DEX modifier
- A small shield icon next to the token indicates "this token has cover tagged"
- DM can clear the tags at the end of turn or they auto-clear when the attacker moves or the target moves

**Phase 2 — Auto-detection (Phase K enhancement, no target version yet):**
- Drawing layer gains a new primitive: "terrain object" with `cover_type` property
- Terrain objects are drawn by DM (rectangles for walls, circles for boulders, etc.)
- When a token moves, the server computes line-of-sight from that token to every visible token on the map
- Any LoS that intersects a terrain object triggers a `cover_detected` event
- Prompt: "You've moved into half cover relative to the Goblin. Apply?"
- Player confirms → sets cover_overrides like Phase 1
- For ranged attacks at cast time: auto-LoS check between attacker and target, auto-apply without prompt
- For AoE: LoS from origin point to each candidate target; total cover excludes them from save

**Complexity notes:**
- Phase 2 needs an efficient LoS algorithm (ray-casting against bounding rectangles is fine for hundreds of tokens at tabletop scale — ~60fps on a 1080p map)
- Reasonable precision: snap to grid corners for LoS endpoints; 5-ft grid tolerance
- Known limitation: dynamic cover (a token creating cover for another token) is not RAW simple, and we'll follow the 2024 "creatures can provide cover" rule as an opt-in tag rather than auto-calculate

---

## 7. UI Surface Additions

### 7.1 Character Sheet Header
- New **Battle Map** button, top-right, left of **Settings** (per Q mapping)
- **In-Combat indicator** (yellow dot + "Combat") appears next to the character name when the campaign has an active encounter
- **My Turn chime + border flash** when it becomes your turn

### 7.2 Bottom Initiative Strip (global when in combat)
- Shows next 5–7 participants in turn order
- Current actor highlighted in gold
- Tokens colored: gold-bordered for the current turn, dim for past, normal for future
- Hidden monsters render as blank placeholders only for the DM (invisible to players)
- Click a participant → DM-only: focuses that token on map, opens sheet

### 7.3 Turn Action Menu (player)
Pops up when your turn starts:
- **Action** → list: Attack / Cast Spell / Dash / Disengage / Dodge / Help / Hide / Ready / Search / Use an Object / [Class-specific bonus options]
- **Bonus Action** → list filtered to BA options on your sheet
- **Reaction** → grayed out until a trigger fires; shows eligible reactions
- **Move** → cancels menu, drag-to-move becomes active
- **End Turn** → finalizes, advances initiative

### 7.4 Reaction Modal (target)
Triggered by `damage_pending`:
```
⚡ You've been hit!
Goblin Scimitar attacked you for 7 slashing damage
(Attack roll: 18 vs your AC 14 — HIT)

Available reactions:
  ⚡ Shield (1st-level slot) — +5 AC, might make it a miss
  ⚡ Absorb Elements (1st-level slot) — halve elemental damage
  
[Use Reaction]  [Take the Hit]

Time remaining: 01:47
```

### 7.5 AoE Template Placement
- Player clicks an AoE spell → ghost template appears at cursor
- Drag to position; click to lock
- Auto-detection of tokens inside template
- Cast button becomes "Cast on N targets"
- After cast: template persists as a semi-transparent overlay labeled "Alice's Fireball" until end of turn (instantaneous) or concentration ends (lasting)

### 7.6 Movement Drag
- On my turn, clicking my token shows a live radius circle (30 ft default)
- Dragging the token within the circle: the token follows the cursor
- Dragging outside: token stops at circle edge
- Counter above the token: "17 / 30 ft used"
- Release to commit
- Dash extends circle to 60 ft mid-turn

### 7.7 Downed Turn Dialog (per R2)
When an unconscious (not stable) participant's initiative tick comes up, the app auto-focuses their token and opens a modal:
```
💀 You're unconscious.
Successes: ● ● ○     Failures: ● ○ ○

Roll a death save to stay alive.
[Roll Death Save]          [DM Override]
```
- The "Roll Death Save" button triggers the dice roller (player retains roll agency per Q9)
- Running successes/failures are visible to the target player and the DM
- Whether they're visible to other players is a DM toggle (classic DM secret mode)
- On success 3/3 → `stabilized` event, modal closes, turn ends
- On failure 3/3 → `died` event
- On nat 20 → `revived` event, 1 HP, unconscious removed, turn continues with Action menu
- If the DM has "auto-skip dead/stable" enabled, a stable character's turn passes with a one-line log entry and no modal

### 7.8 Friendly-Fire Confirmation (per R4)
When a caster places an AoE template and the app detects any ally tokens inside:
```
⚠ Friendly fire warning
Your Fireball will affect:
  • Marcus (ally)
  • Elira (ally)
  • Goblin Captain (enemy)
  • Goblin Archer (enemy)

Continue casting?           [Continue]  [Reposition]
```
"Reposition" returns to template placement. "Continue" emits `friendly_fire_acknowledged` and proceeds with save resolution.

### 7.9 Cover Proximity Prompt (per R5, Phase 2)
After a player commits a move, if the auto-LoS check finds the token now has cover from one or more enemies:
```
🛡️ You moved behind cover.
Relative to: Goblin Archer
Cover level: Half cover (+2 AC, +2 DEX saves)

Apply this cover?           [Apply]  [Dismiss]
```
Applies as a tagged `cover_overrides` entry on the participant row. Cover tags auto-clear when either combatant moves or at end of round (conservative).

### 7.10 DM Fudge UI (per R3)
On the `damage_pending` flow, the DM sees two extra controls next to the pending damage number:
- **Edit (pencil icon)** — DM-only, lets them change the number silently. The public log and the target's modal show only the new number. Internally, a `dm_fudge` event with `visibility: 'hidden_from_players'` records the original→new delta.
- **Force Apply** — skips the reaction window, applies damage immediately (visible action, emits `dm_override`).

A private **"DM Fudge Log"** tab lives inside the DM Settings area so the DM can review their own edits later. Players never see this tab or the events in it.

### 7.11 DM Settings Panel
New tab on campaign Settings: **Combat Automation**. Each toggle from `combat_automation_settings` is a row with description + on/off (or slider for the reaction timer).

---

## 8. Phased Rollout

Each phase ships independently. Every ship passes the TS gate and runs live before moving to the next.

| Phase | Versions | Scope | Blocker for |
|---|---|---|---|
| **A** | v2.93.0 | Unified `combat_events` table + migration from `action_logs`/`character_history`. Campaign Log view with actor filters (Player/DM/NPC). Per-character log view on sheet. Existing writes (attack, spell cast, potion, equip, HP change) emit structured events with chain IDs. | All subsequent phases |
| **B** | v2.94.0 | **Add source-tracking columns** to `monsters` (license_key, attribution_text, ruleset_version, is_editable). Backfill existing 334 SRD 5.1 rows with proper license metadata + attribution. Build read-only Monster Sheet UI for DM (AC/HP/CR/Actions/Reactions/Traits/Legendary with attribution footer). Build Homebrew Monster Creator for DMs (full edit UI, saves with `license_key='homebrew'`). Migration scaffolding for future SRD 5.2 ingestion. | Phase D |
| **C** | v2.95.0 | Battle Map button on character sheet (top-right, left of Settings). Player permissions on map: view-all + drag-own-token-only. Realtime sync for **both token positions AND drawings layer** via Supabase realtime channels. Optimistic local snap. Target: ≤1s end-to-end. | Phase D |
| **D** | v2.96.0 | `combat_encounters` + `combat_participants` tables. Start Combat flow. Initiative rolling (auto-all vs player-agency modes). In-combat yellow glow on player screens. Bottom initiative strip. Turn advancement + End Turn button. Hidden monster reveal. **Downed-turn auto death save flow** (per R2). | Phase E |
| **E** | v2.97.0 → v2.99.0 | Full attack resolution state machine: declare → roll → compare AC → damage roll → `pending_damage` row → reaction modal with timer → apply. Red damage flash. Reaction registry v1 (Shield, Absorb Elements, Uncanny Dodge, Hellish Rebuke, Counterspell, Opportunity Attack). Structured single-target save prompts. **DM fudge/override UI** (per R3). | Phase F |
| **F** | v2.100.0 → v2.102.0 | Player turn action menu (Action / Bonus / Reaction / Move). Standard Actions list. Spell picker with range-based greyout on map. AoE template placement (sphere, cube, cone, line). **Friendly-fire confirmation** (per R4). Multi-target save resolution. Concentration markers + persistent AoE overlays. One-leveled-spell-per-turn enforcement (players + monsters). **Cover Phase 1 — manual DM tagging** (per R5). | Phase G |
| **G** | v2.103.0 | Movement hard-block: live range circle during drag, physical snap. Dash integration (doubles radius). Opportunity attack trigger when leaving reach. | Phase H |
| **H** | v2.104.0 → v2.105.0 | Condition automation cluster (all 2024 PHB conditions): Blinded, Prone, Restrained, Paralyzed, Stunned, Grappled, Frightened, Poisoned, Charmed, Incapacitated, Unconscious, Deafened, Petrified, Invisible, Exhaustion (2024 -2-per-level formula per R1). Each auto-modifies relevant dice resolution. | Phase I |
| **I** | v2.106.0 | DM Combat Automation settings panel. All toggles wired to actual feature gating. Per-encounter overrides. | — |
| **J** | v2.107.0+ | Legendary actions, lair actions, boss-specific mechanics, multi-monster group initiative, summoning resolution. | — |
| **K** | later | **Cover Phase 2 — auto line-of-sight detection** (per R5). Terrain objects on drawing layer with cover_type. Ray-cast LoS. Proximity prompt when player moves into cover. | — |

Total estimated surface: **15–20 version ships**. Realistically **2–4 months** of focused work if shipping one phase per 1–2 sessions.

---

## 9. Open Questions / Risks

Previous open items Q1-Q7 from Draft v1 are **RESOLVED** in Section 3 decisions (R1-R5). What remains:

### 9.1 ✅ Monster content licensing — RESOLVED (R6)
Resolved in Draft v3. Path: **SRD-only + homebrew**.

**Findings from Supabase audit:**
- 334 existing monsters, all tagged `source='srd'`
- Classic non-SRD exclusions verified absent: Displacer Beast, Beholder, Mind Flayer, Slaad, Neogi, Umber Hulk — all missing as expected from legal SRD 5.1 content
- Data structure matches Open5e's SRD 5.1 export format: attack_bonus, damage_dice, dc_type/dc_value/dc_success fields cleanly separated
- Population health: 330/334 have actions, 279 have traits, 32 have legendary actions
- **Conclusion:** Existing rows are SRD 5.1 compliant. Keep them. Phase B backfills license metadata (OGL 1.0a, ruleset_version='2014') + attribution.

**Launch strategy:** Ship with SRD 5.1 canonical monsters (existing 334) + homebrew for everything else. Future versions can ingest SRD 5.2 for 2024-updated versions of these same monsters when WotC expands the SRD.

**Attribution requirements:**
- Every monster sheet renders a footer with the appropriate attribution string
- Credits page on DNDKeep lists all sources + full license text
- No non-SRD WotC content ever gets imported

### 9.2 Map drawing persistence (Phase C detail)
The existing `battle_maps` table holds per-campaign drawings. Current RLS allows only the campaign owner to write. Phase C needs to relax this — allow any campaign member to write drawings while still scoping reads to campaign members. This is a migration + RLS update in Phase C, not a blocker, but worth noting.

### 9.3 Turn-order ties
Two participants roll the same initiative. 2024 PHB says the DM decides tie order. Decision: initiative_tiebreaker column is DEX mod (automatic tiebreaker); if still tied, DM drags to reorder in the initiative strip.

### 9.4 Disconnect/reconnect during pending damage
Player disconnects with a `damage_pending` row active. Timer keeps counting down server-side. On timeout → auto-apply without reaction. On reconnect before timeout → modal reappears. Decision: build this into Phase E from day 1, not bolted on later.

### 9.5 Concentration save UX
Damage to a concentrating caster triggers an auto-save (DC = max(10, floor(damage/2))). Does the target player always get a prompt, or does the app auto-roll (since it's a forced save with a standard formula)? Decision: in R1 2024 rules, autoroll by default to keep pace; DM toggle to require manual prompt.

---

## 10. Sign-Off

Jared to review this document in full. Mark up anything wrong or missing:
- [ ] Pillars 1–11 are correct
- [ ] Q&A decisions Q1–Q10 are captured accurately
- [ ] Rulings R1–R6 (2024 canon, downed initiative, DM fudge, friendly-fire, cover, SRD-only monsters) are captured accurately
- [ ] Event taxonomy covers the actions I care about (including death saves + DM fudge)
- [ ] Schema passes the sniff test (I'm OK with the table shapes)
- [ ] Phasing order matches my priority (most impactful first)
- [ ] I understand this is 15–20 ships and 2–4 months of work

Once approved, Claude starts Phase A (v2.93.0) the next session.
