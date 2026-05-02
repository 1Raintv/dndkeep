// =============================================================
// DNDKeep — Core TypeScript Types
// 2024 PHB ruleset: backgrounds grant ASI, species do not.
// =============================================================

// --- Primitives & Unions ---

export type SubscriptionTier = 'free' | 'pro';

export type AbilityKey =
  | 'strength' | 'dexterity' | 'constitution'
  | 'intelligence' | 'wisdom' | 'charisma';

export type Alignment =
  | 'Lawful Good' | 'Neutral Good' | 'Chaotic Good'
  | 'Lawful Neutral' | 'True Neutral' | 'Chaotic Neutral'
  | 'Lawful Evil' | 'Neutral Evil' | 'Chaotic Evil'
  | 'Unaligned';

export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export type SpellSchool =
  | 'Abjuration' | 'Conjuration' | 'Divination' | 'Enchantment'
  | 'Evocation' | 'Illusion' | 'Necromancy' | 'Transmutation';

export type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type MonsterType =
  | 'Aberration' | 'Beast' | 'Celestial' | 'Construct' | 'Dragon'
  | 'Elemental' | 'Fey' | 'Fiend' | 'Giant' | 'Humanoid'
  | 'Monstrosity' | 'Ooze' | 'Plant' | 'Undead';

export type CreatureSize = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';

export type AbilityScoreMethod = 'standard_array' | 'point_buy' | 'manual' | 'dice_roll';

export type CampaignRole = 'dm' | 'player';

export type ConditionName =
  | 'Blinded' | 'Charmed' | 'Deafened' | 'Exhaustion' | 'Frightened'
  | 'Grappled' | 'Incapacitated' | 'Invisible' | 'Paralyzed' | 'Petrified'
  | 'Poisoned' | 'Prone' | 'Restrained' | 'Stunned' | 'Unconscious';

/** Official classes. Homebrew/UA classes use plain string in CharacterData. */
export type OfficialClassName =
  | 'Fighter' | 'Wizard' | 'Rogue' | 'Cleric' | 'Barbarian'
  | 'Paladin' | 'Druid' | 'Ranger' | 'Warlock' | 'Monk'
  | 'Sorcerer' | 'Bard' | 'Psion';

/** Allows official + any homebrew class name */
export type ClassName = OfficialClassName | (string & {});

export type SpeciesName =
  | 'Human' | 'Elf' | 'Dwarf' | 'Halfling' | 'Gnome'
  | 'Half-Elf' | 'Tiefling' | 'Dragonborn' | 'Half-Orc' | 'Aasimar' | 'Orc'
  | 'Goliath' | 'Tabaxi' | 'Ardling';

// --- User & Auth ---

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  subscription_tier: SubscriptionTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  created_at: string;
  updated_at: string;
  /** v2.329.0 — T7: feature flag for UA / playtest content visibility.
   *  When true, this account sees the Psion class (and its 4
   *  subclasses) in the character creator, subclass pickers, and
   *  class compendium. When false, those entries are filtered out.
   *  Default false at the DB level, so existing accounts upgrade
   *  cleanly with UA hidden. */
  show_ua_content?: boolean;
}

// --- Character ---

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  description: string;
  equipped: boolean;
  magical: boolean;
  is_weapon?: boolean;  // marks item as a weapon for Actions tab
  // Armor properties (for AC auto-calc)
  category?: string;
  armorType?: 'light' | 'medium' | 'heavy' | 'shield';
  baseAC?: number;
  addDexMod?: boolean;
  maxDexBonus?: number;
  // Roll button
  rollExpression?: string;
  rollLabel?: string;
  cost?: string;
  // Stat table display
  damage?: string;
  range?: string;
  properties?: string;
  castingTime?: string;
  saveOrHit?: string;
  // v2.153.0 — Phase P pt 1: magic-item mechanical bonuses.
  // Populated by the catalogue (data/magicItems.ts or magic_items DB
  // table from v2.154). Summed through computeActiveBonuses at read
  // time when the item is equipped (and attuned, once v2.155 lands).
  // AC bonuses flow through lib/armorClass.ts recomputeAC instead so
  // the "cumulative write-on-equip" model keeps working naturally.
  acBonus?: number;
  attackBonus?: number;
  damageBonus?: number;
  saveBonus?: number;
  // v2.155.0 — Phase P pt 3: attunement.
  //   magic_item_id — links the inventory instance back to a catalogue
  //     row in public.magic_items. Lets computeActiveBonuses look up
  //     requires_attunement at bonus-aggregation time. Absent for
  //     legacy / homebrew items entered by hand — those fall back to
  //     the permissive "equipped && magical" gate.
  //   attuned — RAW 2024 attunement flag. Only meaningful when
  //     catalogue says the item requires attunement. Max 3 attuned
  //     items at a time per RAW. Surviving an unequip preserves
  //     attunement (you can still be attuned to a ring in your pack);
  //     bonuses only apply when BOTH attuned AND equipped.
  magic_item_id?: string;
  attuned?: boolean;
  // v2.157.0 — Phase P pt 5: charges.
  //   charges_current — charges the item has right now. Decremented
  //     when the player spends one (e.g., firing a wand). Initialized
  //     to charges_max when added to inventory from the catalogue.
  //   charges_max — charge capacity. Copied from the catalogue
  //     `max_charges` column at add time so it's trivially readable
  //     here without another DB lookup.
  //   recharge — when the item regains charges: 'dawn' / 'dusk' /
  //     'long_rest' / 'short_rest'. DNDKeep treats 'dawn' and
  //     'long_rest' as equivalent triggers on a long rest, matching
  //     how most tables play.
  //   recharge_dice — dice expression rolled to determine how many
  //     charges recover on the trigger. Formats: 'XdY' (e.g. '1d3'),
  //     'XdY+N' (e.g. '1d6+1'), or null/absent which means "full
  //     recharge" (set charges_current to charges_max).
  charges_current?: number;
  charges_max?: number;
  recharge?: 'dawn' | 'dusk' | 'long_rest' | 'short_rest';
  recharge_dice?: string;
}

export interface WeaponItem {
  id: string;
  name: string;
  attackBonus: number;      // total to-hit modifier
  damageDice: string;       // e.g. "1d8"
  damageBonus: number;      // flat bonus to damage
  damageType: string;       // "slashing" | "piercing" | "bludgeoning" | etc.
  range: string;            // "Melee" | "Ranged (80/320 ft.)" etc.
  properties: string;       // comma-separated: "Versatile, Finesse" etc.
  notes: string;
  // v2.87.0: Unarmed Strike 2024 PHB — shows Damage/Grapple/Shove mode picker
  // instead of a simple damage button. Only set on the synthesized Unarmed
  // Strike row; regular weapons leave this undefined. athleticsBonus supplies
  // the STR mod + proficiency/expertise for the contested checks used by
  // Grapple and Shove modes.
  unarmedModes?: boolean;
  athleticsBonus?: number;
}

/** Per-slot-level data: how many total, how many already used */
export interface SpellSlotLevel {
  total: number;
  used: number;
}

/** Key is the spell slot level (1–9) as a string */
export type SpellSlots = Record<string, SpellSlotLevel>;

export interface ASIRecord {
  ability: AbilityKey;
  amount: number;
  source: 'background' | 'feat' | 'level' | string;
}

export interface Character {
  id: string;
  user_id: string;
  campaign_id: string | null;

  // Identity
  name: string;
  species: string;
  /** v2.188.0 — per-species sub-choices (Tiefling legacy, Dragonborn
   *  ancestry, etc.). Shape: { tieflingLegacy?: 'abyssal'|'chthonic'|
   *  'infernal' }. Always present (default '{}' from DB), but may be
   *  empty if the species has no actionable choices or the player
   *  hasn't picked yet. */
  species_choices?: Record<string, string>;
  class_name: string;
  subclass: string | null;
  background: string;
  level: number;
  experience_points: number;
  alignment: Alignment | null;
  avatar_url: string | null;
  // v2.260.0 — fields below were originally typed as non-nullable T,
  // but the characters table allows NULL for each. Loosened to T | null
  // so casts from TableRow<'characters'> stop failing. Runtime code
  // should already be ?-defending; if it wasn't, this surfaces real
  // bugs at the call site (which is the point).
  inspiration: boolean | null;
  equipped_armor: string | null;
  class_resources: Record<string, number> | null;
  secondary_class: string | null;
  secondary_level: number | null;
  secondary_subclass: string | null;
  features_text: string | null;
  wildshape_active: boolean | null;
  wildshape_beast_name: string | null;
  wildshape_current_hp: number | null;
  wildshape_max_hp: number | null;
  concentration_spell: string | null;
 // v2.38.0: Rounds remaining on current concentration. NULL = no timer (instantaneous
 // / until dispelled / missing duration info). 0 = expired. One combat round = 6 seconds.
 concentration_rounds_remaining: number | null;
  // v2.260.0 — surfaced previously-missing fields. active_buffs is the
  // jsonb array consumed by the Active Buffs panel; push_subscription
  // is the WebPush subscription blob the notifications system stores
  // on the user's character row. Both nullable per DB schema.
  active_buffs?: any[] | null;
  push_subscription?: Record<string, unknown> | null;

  // Automation framework — see src/lib/automations.ts
  automation_overrides: Record<string, 'off' | 'prompt' | 'auto'>;
  advanced_automations_unlocked: boolean;
  // Unlocks click-to-edit on derived combat stats (Speed, AC) in vitals column
  advanced_edits_unlocked?: boolean;
  // Unlocks removing known spells / unprepping subclass-granted spells
  advanced_spell_edits_unlocked?: boolean;

  // v2.49.0: House rule — when true, NAT 1 on any saving throw = auto-fail,
  // NAT 20 = auto-success. RAW 5e only applies this to attacks + death saves;
  // many DMs extend it to all saves. Default false (RAW). User-editable behind
  // advanced_edits_unlocked.
  nat_1_20_saves?: boolean;

  // v2.66.0 House rule: when ON, a long rest also clears short-duration combat
  // conditions (Charmed, Frightened, Poisoned, Stunned, Paralyzed, Restrained,
  // Blinded, Deafened, Grappled, Prone, Incapacitated) that would naturally
  // have expired during 8 hours of rest. Petrified + Invisible stay since
  // they're typically spell-bound rather than duration-bound. Default false (RAW).
  long_rest_clears_combat_conditions?: boolean;

  // Raw ability scores (modifiers computed client-side via gameUtils)
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;

  // HP
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  hit_dice_spent: number;  // number spent since last long rest; max = level

  // Combat
  armor_class: number;
  speed: number;
  initiative_bonus: number;

  // Proficiencies (stored as arrays of canonical names)
  saving_throw_proficiencies: AbilityKey[];
  skill_proficiencies: string[];
  skill_expertises: string[];

  // Spellcasting
  spell_slots: SpellSlots;
  prepared_spells: string[];  // spell ids
  known_spells: string[];     // spell ids
  // v2.380.0 — Quick-cast favorites bar. Spell IDs pinned to the top
  // of the character sheet for one-click cast access. Max 6 enforced
  // client-side. Pre-v2.380 characters default to [] via DB column.
  pinned_spells: string[];

  // Inventory
  inventory: InventoryItem[];
  // v2.260.0 — DB-nullable. Most callers default to [] when reading.
  weapons: WeaponItem[] | null;
  share_token: string | null;
  share_enabled: boolean | null;
  currency: Currency;

  // Conditions
  active_conditions: ConditionName[];
  exhaustion_level?: number;  // 0-6 per 2024 rules; 0 = no exhaustion, 6 = death

  // v2.41.0: Damage modifiers — auto-populated from species, editable when
  // advanced_edits_unlocked. Vocabulary: 13 RAW damage types (lowercase).
  damage_resistances?: string[];
  damage_immunities?: string[];
  damage_vulnerabilities?: string[];

  // User-added languages and tool proficiencies on top of species/background/class grants.
  // The character sheet's Languages/Tools display merges these with derived ones.
  extra_languages?: string[];
  extra_tool_proficiencies?: string[];

  // v2.32 Phase 3: DM-granted level ups that bypass XP thresholds. When >0,
  // the LevelUpBanner shows them as pending and the wizard decrements on commit.
  // Set by DM tools in the campaign (stub field for now — UI comes in v2.33).
  pending_manual_level_grants?: number;

  // v2.33: Unlock for mid-campaign character edits — species swap, background swap,
  // subclass swap, re-pick class choices. Gated separately from advanced_edits_unlocked
  // because these edits cause larger retroactive changes to the character.
  advanced_deep_edits_unlocked?: boolean;

  // Death saves (only relevant when current_hp === 0)
  death_saves_successes: number;  // 0–3; three successes stabilizes the character
  death_saves_failures: number;   // 0–3; three failures = dead

  // Narrative
  notes: string;
  personality_traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  features_and_traits: string;
  // v2.260.0 — both DB-nullable, callers default to [] / {} on read.
  gained_feats: string[] | null;        // structured feat names e.g. ['Alert', 'Lucky']
  feature_uses: Record<string, number> | null; // e.g. { 'Rage': 2, 'Second Wind': 1 }

  // Creation meta
  ability_score_improvements: ASIRecord[];
  ability_score_method: AbilityScoreMethod;

  created_at: string;
  updated_at: string;
}

/** Computed/derived stats — not persisted, generated by gameUtils */
export interface ComputedStats {
  proficiency_bonus: number;
  /** v2.327.0 — T5: Effective ability scores AFTER attunement-gated
   *  overrides (Gauntlets of Ogre Power, Headband of Intellect, etc.).
   *  Use these for any roll/check/save calculation in preference to
   *  `character.strength` etc., which are the raw stored values.
   *  Modifiers below are derived from these effective scores. */
  ability_scores: Record<AbilityKey, number>;
  modifiers: Record<AbilityKey, number>;
  saving_throws: Record<AbilityKey, { total: number; proficient: boolean }>;
  skills: Record<string, { total: number; proficient: boolean; expert: boolean }>;
  passive_perception: number;
  passive_investigation: number;
  passive_insight: number;
  initiative: number;
  spell_save_dc: number | null;
  spell_attack_bonus: number | null;
}

// --- D&D Data Shapes ---

export interface SpeciesTrait {
  name: string;
  description: string;
  // v2.376.0 — Optional action metadata. When `actionType` is set the
  // trait surfaces as a clickable row in the Actions tab; when omitted
  // the trait stays passive (Features tab only). Range/damage/save
  // mirror the same fields on ClassAbility for consistent rendering.
  // All optional so pre-v2.376 trait entries remain valid.
  actionType?: 'action' | 'bonus' | 'reaction' | 'free' | 'special';
  range?: string;
  damage?: string;
  damageType?: string;
  save?: { ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'; dc: 'spell' | number; targetMode?: 'any' | 'enemies' };
  // Recovery for limited-use species traits (e.g. Aasimar's Healing
  // Hands — 1/long rest). Pairs with maxUsesFn-style logic when
  // surfaced; passive traits leave this undefined.
  rest?: 'short' | 'long';
  maxUses?: number;
}

export interface SpeciesData {
  name: SpeciesName;
  size: CreatureSize;
  speed: number;
  // 2024 PHB: no fixed ASIs — species are trait-only
  traits: SpeciesTrait[];
  languages: string[];
  darkvision: number;  // 0 if none, otherwise feet
}

export interface BackgroundData {
  name: string;
  // 2024 PHB: each background grants exactly +2 and +1 to specific abilities
  asi_primary: AbilityKey;    // +2
  asi_secondary: AbilityKey;  // +1
  skill_proficiencies: [string, string];
  tool_proficiency: string | null;
  languages: number;  // number of additional languages granted
  feature_name: string;
  feature_description: string;
  starting_equipment: string[];
}

export interface SubclassFeature {
  level: number;
  name: string;
  description: string;
  /** v2.259.0 — surfaced previously-untyped field. When true, this
   *  feature represents a player choice (e.g. pick a fighting style,
   *  pick a maneuver). The UI renders these with gold ⬡ accents to
   *  distinguish them from fixed grants. Optional because most
   *  subclass features are fixed; falsy/absent means "fixed grant". */
  isChoice?: boolean;
  /** v2.259.0 — categorizes what kind of choice this feature offers,
   *  for future guided-picker UIs. 'fighting_style' / 'spells' /
   *  'skill' / 'other'. Currently advisory only — no consumer reads
   *  it yet, but it travels alongside isChoice in the data so the
   *  type should reflect that. */
  choiceType?: 'fighting_style' | 'spells' | 'skill' | 'other';
  /** v2.259.0 — how many picks the choice offers (e.g. "choose 3
   *  skills" → 3). Defaults to 1 conceptually when isChoice is true.
   *  Like choiceType, advisory until a guided picker is built. */
  choiceCount?: number;
  /** Optional: mechanics this feature provides, used by dice roller / automation */
  mechanics?: {
    type: 'spell_list' | 'resource' | 'bonus' | 'reaction' | 'passive';
    details: string;          // human-readable, e.g. "1d6 per spell level absorbed"
    dice?: string;            // dice expression, e.g. "1d6"
    ability?: string;         // relevant ability, e.g. "intelligence"
  }[];
}

export interface SubclassData {
  name: string;
  description: string;
  unlock_level: number;
  source?: 'official' | 'ua' | 'homebrew';   // track where it came from
  features?: SubclassFeature[];               // optional rich features
  spell_list?: string[];                      // bonus spells always prepared
}

export interface ClassData {
  name: ClassName;
  description?: string;          // optional for official classes, required for homebrew
  source?: 'official' | 'ua' | 'homebrew';
  hit_die: number;
  primary_abilities: AbilityKey[];
  saving_throw_proficiencies: AbilityKey[];
  skill_choices: string[];
  skill_count: number;
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  tool_proficiencies: string[];
  is_spellcaster: boolean;
  spellcasting_ability: AbilityKey | null;
  spellcaster_type: 'full' | 'half' | 'warlock' | 'none';
  subclasses: SubclassData[];
}

export interface SpellData {
  id: string;
  name: string;
  level: SpellLevel;
  school: SpellSchool;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  description: string;
  higher_levels?: string;
  // ── Structured combat fields (from SRD API) ──────────────────────
  save_type?: string;            // 'DEX' | 'CON' | 'WIS' etc.
  attack_type?: 'ranged' | 'melee';
  damage_dice?: string;          // base damage e.g. '8d6'
  damage_type?: string;          // 'Fire' | 'Cold' etc.
  damage_at_slot_level?: Record<string, string>;  // { '3': '8d6', '4': '9d6' }
  damage_at_char_level?: Record<string, string>;  // cantrip scaling
  heal_dice?: string;
  heal_at_slot_level?: Record<string, string>;
  area_of_effect?: { type: 'sphere'|'cone'|'cube'|'cylinder'|'line'; size: number };
}

export interface MonsterAction {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_type?: string;
  bonus_damage_dice?: string;
  bonus_damage_type?: string;
  dc_type?: string;
  dc_value?: number;
  dc_success?: string;
  usage?: string;
}

export interface MonsterTrait {
  name: string;
  desc: string;
}

export interface MonsterLegendaryAction {
  name: string;
  desc: string;
  cost?: number;
}

export interface MonsterData {
  id: string;
  name: string;
  type: string;          // full string, not restricted enum
  subtype?: string;
  alignment?: string;
  cr: number | string;
  xp: number;
  size: CreatureSize;
  hp: number;
  hp_formula: string;
  ac: number;
  ac_note?: string;
  speed: number;
  fly_speed?: number;
  swim_speed?: number;
  climb_speed?: number;
  burrow_speed?: number;
  str: number; dex: number; con: number;
  int: number; wis: number; cha: number;
  saving_throws?: Record<string, number>;
  skills?: Record<string, number>;
  damage_immunities?: string[];
  damage_resistances?: string[];
  damage_vulnerabilities?: string[];
  condition_immunities?: string[];
  senses?: Record<string, string | number>;
  languages?: string;
  proficiency_bonus?: number;
  traits?: MonsterTrait[];
  actions?: MonsterAction[];
  reactions?: MonsterTrait[];
  legendary_actions?: MonsterLegendaryAction[];
  legendary_resistance_count?: number;
  // Backward compat — primary attack summary
  attack_name: string;
  attack_bonus: number;
  attack_damage: string;
  // v2.94.0 — Phase B: license metadata
  source?: string;              // 'srd' | 'homebrew'
  owner_id?: string | null;
  visibility?: string;          // 'public' | 'private'
  license_key?: 'ogl-1.0a' | 'cc-by-4.0' | 'homebrew' | 'none' | null;
  attribution_text?: string | null;
  ruleset_version?: '2014' | '2024' | null;
  is_editable?: boolean;
}

export interface ConditionData {
  name: ConditionName;
  description: string;
  effects: string[];
}

export interface SkillData {
  name: string;
  ability: AbilityKey;
  // v2.67.0: skills that typically require sight to perform. When the character
  // is Blinded, rolls of these skills auto-fail per 2024 PHB Blinded condition
  // ("automatically fails any ability check that requires sight"). The DM can
  // override on the rare occasion the check doesn't actually use sight (e.g.,
  // Investigation by touch on a small object).
  requiresSight?: boolean;
}

// --- Campaign ---

export interface AutomationSettings {
  auto_hit_dice: boolean;
  auto_damage_dice: boolean;
  auto_damage_done: boolean;
  auto_condition_tracker: boolean;
}

export interface Campaign {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  setting: string;
  is_active: boolean;
  join_code: string;
  created_at: string;
  updated_at: string;
  automation_settings?: AutomationSettings;

  // Automation framework — see src/lib/automations.ts
  automation_defaults: Record<string, 'off' | 'prompt' | 'auto'>;

  // v2.135.0 — Phase L pt 3: auto-apply Encumbered condition when a
  // character's carried weight exceeds their capacity.
  //   'off'     — no auto-application (DM manages manually)
  //   'base'    — 2024 PHB base rule: Encumbered at > STR × 15 lbs
  //   'variant' — optional 3-tier rule: > STR × 5 / > STR × 10 / > STR × 15
  encumbrance_variant?: 'off' | 'base' | 'variant';

  // v2.142.0 — Phase M pt 5: default ruleset filter for the bestiary.
  //   null    — show all monsters regardless of ruleset
  //   '2014'  — hide 2024 monsters
  //   '2024'  — hide 2014 monsters
  // Applied as the initial filter when the monster browser is opened
  // from this campaign's context. DMs can still toggle the filter in UI.
  default_ruleset_version?: '2014' | '2024' | null;

  // v2.96.0 — Phase D: combat state machine settings
  combat_automation_settings?: CombatAutomationSettings;

  // v2.173.0 — Phase Q.0 pt 14: per-campaign toggle for the Award XP
  // panel. When false, the "Award XP" tab is hidden from DM Controls
  // entirely. Milestone-leveling tables don't need the clutter.
  award_xp_enabled?: boolean;

  // v2.312.0 — Combat Phase 3: feature flag for the new BattleMap
  // path that reads/writes through scene_token_placements +
  // combatants instead of scene_tokens. v2.313 wired BattleMapV2 to
  // branch on this; v2.314 added the UI toggle. Defaults false. The
  // DM opts in via Campaign Settings → Rules tab. Reload required
  // for the change to take effect (BattleMap reads the flag at scene
  // load and the realtime channel rewires accordingly). When the
  // legacy path is dropped (v2.317), this field becomes vestigial
  // and can be removed in a cleanup ship.
  use_combatants_for_battlemap?: boolean;
}

export interface CombatAutomationSettings {
  initiative_mode: 'auto_all' | 'player_agency';
  reaction_timer_enabled: boolean;
  reaction_timer_seconds: number;
  auto_dm_attack_rolls: boolean;
  auto_dm_damage_rolls: boolean;
  auto_dm_save_rolls: boolean;
  auto_condition_effects: boolean;
  hard_block_movement: boolean;
  one_leveled_spell_per_turn: boolean;
  player_initiative_mode: 'auto' | 'prompt';
  hidden_monster_reveal_mode: 'roll_at_reveal' | 'roll_at_start';
}

export interface LairActionEntry {
  name: string;
  desc?: string;
}

export interface CombatEncounter {
  id: string;
  campaign_id: string;
  name: string | null;
  status: 'setup' | 'active' | 'ended';
  round_number: number;
  current_turn_index: number;
  initiative_mode: 'auto_all' | 'player_agency';
  hidden_monster_reveal_mode: 'roll_at_reveal' | 'roll_at_start';
  started_at: string | null;
  ended_at: string | null;
  /** v2.127.0 — Phase J: encounter takes place in a legendary creature's
   *  lair. When true + config non-empty, the DM gets a "🏛 Lair" button on
   *  the InitiativeStrip and a round-start event is emitted. */
  in_lair?: boolean;
  lair_actions_config?: LairActionEntry[];
  lair_action_used_this_round?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CombatParticipant {
  id: string;
  encounter_id: string;
  campaign_id: string;
  // v2.350.0 / v2.363.0 — DB CHECK constraint accepts 'character' |
  // 'creature'. Legacy 'monster'/'npc' still listed for backward
  // compat with any in-flight code reading older rows; new code
  // paths (v2.363+ MonsterActionPanel, etc.) compare against
  // 'creature'.
  participant_type: 'character' | 'creature' | 'monster' | 'npc';
  entity_id: string;
  name: string;
  initiative: number | null;
  initiative_tiebreaker: number;
  turn_order: number;
  action_used: boolean;
  bonus_used: boolean;
  reaction_used: boolean;
  movement_used_ft: number;
  leveled_spell_cast: boolean;
  hidden_from_players: boolean;
  /** Real column. AC currently lives on combat_participants; combatants has
   *  an `ac_override` column with different semantics. Outside the v2.321
   *  legacy-column drop scope. */
  ac: number | null;
  /** ─── Virtual fields (v2.317+) ──────────────────────────────────
   *  These 11 fields are NOT actual columns on combat_participants.
   *  Combat Phase 3 moved their source-of-truth to the combatants
   *  table. Reads come through normalizeParticipantRow() which
   *  flattens combatants.X onto the row; writes go directly to
   *  combatants via combatant_id. The fields stay on the type
   *  because every downstream consumer reads `row.current_hp` etc.
   *  See src/lib/combatParticipantNormalize.ts.
   *  Legacy columns drop in v2.321. */
  current_hp: number | null;
  max_hp: number | null;
  temp_hp: number;
  death_save_successes: number;
  death_save_failures: number;
  is_stable: boolean;
  is_dead: boolean;
  active_conditions: string[];
  /** v2.116.0 — Phase H pt 7: 2024 exhaustion level (0-6). Level 6 = death.
   *  Separate column because only Exhaustion has a level; the name stays in
   *  active_conditions for UI/cascade uniformity. */
  exhaustion_level?: number;
  /** v2.110.0 — Phase H: per-condition source metadata so concentration
   *  cleanup (v2.111) can remove only the conditions that came from the
   *  dropped spell. Shape: { [name]: { source, casterParticipantId? } }. */
  condition_sources?: Record<string, { source: string; casterParticipantId?: string }>;
  /** v2.113.0 — Phase H pt 4: active buffs (Bless, Hunter's Mark, Hex, etc.)
   *  consumed by rollAttackRoll/rollDamage/rollSave to modify rolls. */
  active_buffs?: Array<{
    key: string;
    name: string;
    source: string;                       // 'spell:bless' | 'reaction:absorb_elements' etc.
    casterParticipantId?: string;         // for concentration cleanup
    attackRollBonus?: string;             // dice expr, e.g. '1d4'
    saveBonus?: string;                   // dice expr, e.g. '1d4'
    damageRider?: { dice: string; damageType: string };
    onlyVsTargetParticipantId?: string;   // Hunter's Mark / Hex scoping
    onlyMelee?: boolean;
    onlyRanged?: boolean;
    singleUse?: boolean;                  // v2.114.0 — Absorb Elements rider
  }>;
  concentration_spell_id: string | null;
  /** v2.107.0 — Phase G: persisted max walking speed in feet, captured at
   *  encounter-start time from the underlying character/monster. */
  max_speed_ft?: number;
  /** v2.108.0 — Phase G: set when the actor takes the Dash action. Doubles
   *  effective movement this turn. Reset in advanceTurn. */
  dash_used_this_turn?: boolean;
  /** v2.108.0 — Phase G: set when the actor takes the Disengage action. Any
   *  subsequent movement this turn suppresses Opportunity Attack offers. */
  disengaged_this_turn?: boolean;
  /** v2.103.0 — Phase F cover tagging. Per-attacker cover state on this
   *  participant as the target. Shape: { [attackerParticipantId]: 'half' |
   *  'three_quarters' | 'total' }. Used as the auto-populated default in
   *  DeclareAttackModal. */
  persistent_cover?: Record<string, 'half' | 'three_quarters' | 'total'>;
  /** v2.126.0 — Phase J: legendary actions pool. Total is the refill cap,
   *  remaining is the live counter. Config is an array of `{name, cost, desc?}`
   *  describing the actions this creature can take (matches
   *  MonsterLegendaryAction). Refilled at start of this creature's own turn. */
  legendary_actions_total?: number;
  legendary_actions_remaining?: number;
  legendary_actions_config?: MonsterLegendaryAction[];
  created_at: string;
  updated_at: string;
}

// v2.97.0 — Phase E: attack resolution state machine
export type PendingAttackState =
  | 'declared'         // target chosen, nothing rolled yet
  | 'attack_rolled'    // attack roll done (hit/miss/crit determined)
  | 'damage_rolled'    // damage total known, waiting to apply
  | 'applied'          // damage written to target HP, terminal
  | 'canceled';        // aborted at any stage, terminal

export type AttackKind = 'attack_roll' | 'save' | 'auto_hit';
export type HitResult = 'hit' | 'miss' | 'crit' | 'fumble';
export type SaveResult = 'passed' | 'failed';

export interface PendingAttack {
  id: string;
  campaign_id: string;
  encounter_id: string | null;

  attacker_participant_id: string | null;
  attacker_name: string;
  attacker_type: 'character' | 'monster' | 'npc' | 'system';

  target_participant_id: string | null;
  target_name: string;
  target_type: 'character' | 'monster' | 'npc' | 'object' | 'area' | 'self' | null;

  attack_source: string | null;
  attack_name: string;
  attack_kind: AttackKind;

  attack_bonus: number | null;
  target_ac: number | null;
  attack_d20: number | null;
  attack_total: number | null;
  hit_result: HitResult | null;

  save_dc: number | null;
  save_ability: string | null;
  save_success_effect: string | null;
  save_d20: number | null;
  save_total: number | null;
  save_result: SaveResult | null;

  damage_dice: string | null;
  damage_type: string | null;
  damage_rolls: number[] | null;
  damage_raw: number | null;
  damage_final: number | null;
  damage_was_fudged: boolean;
  damage_fudge_reason: string | null;

  /** v2.103.0 — Phase F: cover level applied to this attack. */
  cover_level?: 'none' | 'half' | 'three_quarters' | 'total' | null;

  /** v2.104.0 — Phase F: sibling attacks in an AoE share this UUID so the
   *  damage is rolled once and reused across them. Null for single-target. */
  damage_group_id?: string | null;

  /** v2.139.0 — Phase M pt 2: set by rollSave when a monster with LR
   *  charges fails a save. While true, rollDamage is gated and the DM
   *  sees a prompt to either use LR (coerces save_result → 'passed') or
   *  decline (save stays 'failed'). Cleared after either decision. */
  pending_lr_decision?: boolean;

  state: PendingAttackState;
  chain_id: string;

  declared_at: string;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

// v2.98.0 — Phase E: reaction offers
export type ReactionState = 'offered' | 'accepted' | 'declined' | 'expired';
export type ReactionTriggerPoint = 'post_attack_roll' | 'post_damage_roll' | 'pre_damage_applied' | 'movement_out_of_reach' | 'spell_declared';

export interface PendingReaction {
  id: string;
  campaign_id: string;
  pending_attack_id: string | null;
  reactor_participant_id: string;
  reactor_name: string;
  reactor_type: 'character' | 'monster' | 'npc';
  reaction_key: string;           // 'shield' | 'uncanny_dodge' | ...
  reaction_name: string;          // 'Shield'
  trigger_point: ReactionTriggerPoint;
  offered_at: string;
  expires_at: string;
  decided_at: string | null;
  state: ReactionState;
  decision_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// v2.122.0 — Phase J: pre-cast Counterspell window. Rows in this table
// represent a spell that's been declared but not yet resolved — eligible
// counterspellers get an offer before the effect lands.
export type PendingSpellCastState =
  | 'declared'
  | 'counterspell_offered'
  | 'countered'
  | 'resolved'
  | 'canceled';

export type PendingSpellCastOutcome =
  | 'went_off'
  | 'countered'
  | 'saved_through'
  | 'canceled';

export interface PendingSpellCast {
  id: string;
  campaign_id: string;
  encounter_id: string | null;
  chain_id: string;

  caster_participant_id: string | null;
  caster_character_id: string | null;
  caster_name: string;

  spell_name: string;
  spell_level: number;
  is_cantrip: boolean;

  state: PendingSpellCastState;

  declared_at: string;
  expires_at: string;
  resolved_at: string | null;

  counterspell_attack_id: string | null;
  outcome: PendingSpellCastOutcome | null;

  created_at: string;
}

export interface CampaignMember {
  id: string;
  campaign_id: string;
  user_id: string;
  role: CampaignRole;
  joined_at: string;
}

// --- Combat ---

export interface OngoingDamage {
  id: string;
  label: string;          // "Poison", "Fire", "Burning"
  dice: string;           // "2d6", "1d4"
  damageType: string;     // "Poison", "Fire", etc.
  timing: 'start' | 'end'; // start or end of turn
}

export interface ActiveBuff {
  id: string;
  name: string;           // "Rage", "Bless", "Haste"
  duration: number;       // rounds remaining (-1 = indefinite)
  icon?: string;
  color?: string;
  effects: string[];      // human-readable effects
  // Mechanical modifiers
  acBonus?: number;
  attackBonus?: number;
  damageBonus?: number;
  saveBonus?: number;
  speedBonus?: number;
  advantages?: string[];  // attack, strength, dexterity, etc.
  disadvantages?: string[];
  resistances?: string[];
  immunities?: string[];
}

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  current_hp: number;
  max_hp: number;
  ac: number;
  is_monster: boolean;
  monster_id?: string;
  character_id?: string;
  // v2.248.0 — link back to the npcs row for roster-spawned NPCs. Lets
  // the NpcTokenQuickPanel find-or-create its initiative_order entry
  // by id rather than fragile name match. Optional because legacy
  // entries created via the InitiativeTracker's "Add Monster" form
  // never had a backing npcs row.
  npc_id?: string;
  conditions: ConditionName[];
  notes?: string;
  ongoing_damage?: OngoingDamage[];
  concentration_spell?: string;
  buffs?: ActiveBuff[];
  legendary_actions?: number;        // max legendary actions
  legendary_actions_used?: number;
  legendary_resistance?: number;     // uses per day
  legendary_resistance_used?: number;
  // NPC attack data (pulled from monsters.ts)
  attacks?: { name: string; bonus: number; damage: string; damageType: string; range: string }[];
}

// v2.296.0 — SessionState interface removed. The session_states
// table was dropped in this ship after the v2.286–v2.295 combat-
// system unification arc retired the four legacy combat columns
// (initiative_order / current_turn / round / combat_active) one by
// one and then dropped the now-shell table. Modern combat state
// lives on CombatEncounter + CombatParticipant (defined elsewhere
// in this file). The Combatant type below is preserved — it's
// still used by EncounterBuilder and CombatPage for their own
// internal staging shapes, unrelated to the legacy session schema.

// --- Dice ---

export interface DiceEntry {
  id: string;
  count: number;
  die: DiceType;
  label: string;
  modifier: number;
}

export interface RollResult {
  id: string;
  label: string;
  dice_expression: string;
  individual_results: number[];
  modifier: number;
  total: number;
  character_name?: string;
  rolled_at: string;
}

// --- Notes ---

export type NoteField =
  | 'notes'
  | 'personality_traits'
  | 'ideals'
  | 'bonds'
  | 'flaws'
  | 'features_and_traits';

// --- Spell Slot Table ---
// Indexed by class level (1–20), value is array of slots per level [1st...9th]
export type SpellSlotRow = number[];
export type SpellSlotTable = Record<number, SpellSlotRow>;
