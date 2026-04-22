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
  class_name: string;
  subclass: string | null;
  background: string;
  level: number;
  experience_points: number;
  alignment: Alignment | null;
  avatar_url: string | null;
  inspiration: boolean;
  equipped_armor: string;
  class_resources: Record<string, number>;
  secondary_class: string;
  secondary_level: number;
  secondary_subclass: string;
  features_text: string;
  wildshape_active: boolean;
  wildshape_beast_name: string;
  wildshape_current_hp: number;
  wildshape_max_hp: number;
  concentration_spell: string;
 // v2.38.0: Rounds remaining on current concentration. NULL = no timer (instantaneous
 // / until dispelled / missing duration info). 0 = expired. One combat round = 6 seconds.
 concentration_rounds_remaining: number | null;

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

  // Inventory
  inventory: InventoryItem[];
  weapons: WeaponItem[];
  share_token: string | null;
  share_enabled: boolean;
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
  gained_feats: string[];        // structured feat names e.g. ['Alert', 'Lucky']
  feature_uses: Record<string, number>; // e.g. { 'Rage': 2, 'Second Wind': 1 }

  // Creation meta
  ability_score_improvements: ASIRecord[];
  ability_score_method: AbilityScoreMethod;

  created_at: string;
  updated_at: string;
}

/** Computed/derived stats — not persisted, generated by gameUtils */
export interface ComputedStats {
  proficiency_bonus: number;
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

  // v2.96.0 — Phase D: combat state machine settings
  combat_automation_settings?: CombatAutomationSettings;
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
  created_at: string;
  updated_at: string;
}

export interface CombatParticipant {
  id: string;
  encounter_id: string;
  campaign_id: string;
  participant_type: 'character' | 'monster' | 'npc';
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
  current_hp: number | null;
  max_hp: number | null;
  temp_hp: number;
  ac: number | null;
  death_save_successes: number;
  death_save_failures: number;
  is_stable: boolean;
  is_dead: boolean;
  active_conditions: string[];
  concentration_spell_id: string | null;
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

  state: PendingAttackState;
  chain_id: string;

  declared_at: string;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

// v2.98.0 — Phase E: reaction offers
export type ReactionState = 'offered' | 'accepted' | 'declined' | 'expired';
export type ReactionTriggerPoint = 'post_attack_roll' | 'post_damage_roll' | 'pre_damage_applied';

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

export interface SessionState {
  id: string;
  campaign_id: string;
  initiative_order: Combatant[];
  current_turn: number;
  round: number;
  combat_active: boolean;
  updated_at: string;
}

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
