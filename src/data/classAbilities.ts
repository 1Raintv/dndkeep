import type { Character } from '../types';
import { proficiencyBonus } from '../lib/gameUtils';

export type ActionType = 'action' | 'bonus' | 'reaction' | 'special' | 'free';

// v2.246.0 — Save-bearing class abilities. Optional structured save
// metadata so the Actions tab can render a "DC X · YYY Save" chip on
// abilities that force a saving throw, mirroring the spell save shape
// in src/types/index.ts (`SpellData.save_type`). Today (v2.246) the
// data is rendering-only — the chip surfaces the DC/ability so a player
// or DM can read it off the row without expanding. v2.247 will wire a
// target-picker modal that consumes this shape, with per-target [Roll
// Save] / [Auto-Fail (willing)] buttons gated on the new
// `willing_ally_auto_fail` automation.
export type SaveAbility = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
export type SaveTargetMode = 'enemies' | 'allies' | 'any';
export interface SaveSpec {
  /** Ability the target rolls. Stored uppercase to match how the chip renders. */
  ability: SaveAbility;
  /** Numeric DC, or `'spell'` to resolve from the caster's spell save DC. */
  dc: number | 'spell';
  /** Default target gating for the v2.247 picker. Optional — defaults to 'any'
   *  if absent. Read by the picker UX, not by the chip itself. */
  targetMode?: SaveTargetMode;
  /** Optional one-line consequence on a failed save. Surfaced in the chip
   *  tooltip so the reader can hover to recall the effect. */
  onFailure?: string;
  /** Optional one-line consequence on a successful save. */
  onSuccess?: string;
}

export interface ClassAbility {
  name: string;
  actionType: ActionType;
  description: string | ((character: any) => string);
  /** v2.80.0: Optional extended description shown in the expanded card view.
   * Use for abilities where the basic description is kept short and the
   * detailed mechanics (scaling tables, recovery edge-cases, etc.) belong
   * in a progressive-disclosure panel. Falls back to `description` if absent. */
  descriptionLong?: string | ((character: any) => string);
  minLevel: number;
  maxUsesFn?: (c: Character) => number;
  rest?: 'short' | 'long';
  /** If true, it's a resource pool (uses cost, not limited total uses) */
  isPool?: boolean;
  psionicDie?: boolean;  // rolls correct die size on spend
  /** v2.189.0 — Phase Q.0 pt 30: explicit Psionic Energy Die cost for
   *  abilities that consume PEDs. When set, the Use button deducts this
   *  many dice from the PED pool (and refuses if insufficient). When
   *  unset, the ability either:
   *    - has `isPool: true` AND `psionicDie: true` → user is rolling a
   *      die from the pool itself (the existing PED-roll flow, costs 1)
   *    - has `isPool: true` only → ambient resource indicator, no auto-
   *      deduct (e.g. the PED row itself, which has its own Spend button)
   *    - has neither → free to use, just logs the action
   *  Examples: Warp Space pedCost: 1, Mass Teleportation pedCost: 4. */
  pedCost?: number;
  /** v2.190.0 — Phase Q.0 pt 31: PED-restore cost for once-per-rest
   *  features that can be refreshed mid-rest by spending Psionic Energy
   *  Dice. When set, a "Restore (N PED)" sibling button appears next to
   *  the Use button — but only when the feature is depleted (used ≥ max)
   *  AND the player has enough PEDs. Clicking it deducts N dice from
   *  the pool and decrements feature_uses by 1.
   *  Today: Free Misty Step (1 PED). Future: any subclass feature with
   *  RAW text "spend N [resource] to regain a use of this feature." */
  pedRestoreCost?: number;
  /** v2.246.0 — Saving-throw metadata. Present when the ability forces
   *  a save on its target(s). The Actions tab renders a chip from this;
   *  v2.247 will route through a target picker that consumes targetMode
   *  and exposes Auto-Fail (willing) for `targetMode: 'allies'` or 'any'. */
  save?: SaveSpec;
}

function cha(c: Character) { return Math.floor((c.charisma - 10) / 2); }
function wis(c: Character) { return Math.floor((c.wisdom - 10) / 2); }
// v2.260.0 — was reading c.proficiency_bonus (?? 2), which doesn't
// exist on Character. Same bug as FeaturesAndTraitsPanel — every
// CLASS_COMBAT_ABILITIES description used PB=2. Compute from level.
function prof(c: Character) { return proficiencyBonus(c.level); }

export const CLASS_COMBAT_ABILITIES: Record<string, ClassAbility[]> = {
  Barbarian: [
    {
      name: 'Rage',
      actionType: 'bonus',
      description: 'Enter a rage for 1 minute. Gain bonus damage on STR attacks, advantage on STR checks and saves, and resistance to Bludgeoning, Piercing, and Slashing damage.',
      minLevel: 1,
      rest: 'long',
      maxUsesFn: c => c.level >= 20 ? 999 : c.level >= 17 ? 6 : c.level >= 12 ? 5 : c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2,
    },
    {
      name: 'Reckless Attack',
      actionType: 'free',
      description: 'Before attacking, gain Advantage on all melee attack rolls this turn. Attacks against you also have Advantage until your next turn.',
      minLevel: 2,
    },
    {
      name: 'Instinctive Pounce',
      actionType: 'free',
      description: 'As part of entering Rage, move up to half your Speed.',
      minLevel: 7,
    },
    {
      name: 'Brutal Strike',
      actionType: 'free',
      description: 'When you use Reckless Attack and hit, you can forgo Advantage on one attack to deal +1d10 damage and apply a brutal effect (trip, stagger, etc.).',
      minLevel: 9,
    },
  ],

  Bard: [
    {
      name: 'Bardic Inspiration',
      actionType: 'bonus',
      description: 'Give a creature you can see within 60 ft a Bardic Inspiration die to add to one ability check, attack roll, or saving throw within 10 minutes.',
      minLevel: 1,
      rest: 'short',
      maxUsesFn: c => Math.max(1, cha(c)),
    },
    {
      name: 'Countercharm',
      actionType: 'action',
      description: 'Start a performance lasting until the end of your next turn. Each friendly creature within 30 ft has Advantage on saving throws against Frightened and Charmed.',
      minLevel: 6,
    },
  ],

  Cleric: [
    {
      name: 'Channel Divinity',
      actionType: 'action',
      description: 'Use divine energy to fuel a subclass-specific effect (Turn Undead, Radiance of the Dawn, etc.).',
      minLevel: 2,
      rest: 'short',
      maxUsesFn: c => c.level >= 18 ? 3 : c.level >= 6 ? 2 : 1,
    },
    {
      name: 'Turn Undead',
      actionType: 'action',
      description: 'Present your holy symbol. Each undead within 30 ft must make a WIS save. On failure: Frightened and must move away. Duration 1 minute or until it takes damage.',
      minLevel: 2,
    },
    {
      name: 'Sear Undead',
      actionType: 'free',
      description: 'When you use Turn Undead, deal Radiant damage equal to your Wisdom modifier (min 1) to undead that succeed their save.',
      minLevel: 5,
    },
    {
      name: 'Divine Intervention',
      actionType: 'action',
      description: 'Implore your deity to intervene. The DM chooses the form of intervention. Once per Long Rest.',
      minLevel: 10,
      rest: 'long',
      maxUsesFn: () => 1,
    },
  ],

  Druid: [
    {
      name: 'Wild Shape',
      actionType: 'bonus',
      description: 'Transform into a beast you have seen. CR limit scales with level. Revert as a Bonus Action or when reduced to 0 HP.',
      minLevel: 2,
      rest: 'short',
      maxUsesFn: () => 2,
    },
    {
      name: 'Wild Resurgence',
      actionType: 'special',
      description: 'If you have no Wild Shape uses, spend a spell slot to regain one use. Also, expend a Wild Shape use to regain a level 1 spell slot.',
      minLevel: 5,
    },
    {
      name: 'Elemental Form',
      actionType: 'bonus',
      description: 'Expend two Wild Shape uses to transform into an Air, Earth, Fire, or Water Elemental.',
      minLevel: 10,
    },
  ],

  Fighter: [
    {
      name: 'Second Wind',
      actionType: 'bonus',
      description: 'Regain HP equal to 1d10 + your Fighter level.',
      minLevel: 1,
      rest: 'short',
      maxUsesFn: () => 1,
    },
    {
      name: 'Action Surge',
      actionType: 'special',
      description: 'Take one additional action on your turn. Does not trigger additional Bonus Action.',
      minLevel: 2,
      rest: 'short',
      maxUsesFn: c => c.level >= 17 ? 2 : 1,
    },
    {
      name: 'Indomitable',
      actionType: 'free',
      description: 'Reroll a failed saving throw (must use new result). Uses scale with level.',
      minLevel: 9,
      rest: 'long',
      maxUsesFn: c => c.level >= 17 ? 3 : c.level >= 13 ? 2 : 1,
    },
  ],

  Monk: [
    {
      name: 'Flurry of Blows',
      actionType: 'bonus',
      description: 'Spend 1 Discipline Point after the Attack action. Make two Unarmed Strikes as a Bonus Action.',
      minLevel: 1,
      isPool: true,
    },
    {
      name: 'Patient Defense',
      actionType: 'bonus',
      description: 'Spend 1 Discipline Point to take the Dodge action as a Bonus Action.',
      minLevel: 1,
      isPool: true,
    },
    {
      name: 'Step of the Wind',
      actionType: 'bonus',
      description: 'Spend 1 Discipline Point to take the Dash or Disengage action as a Bonus Action. Your jump distance doubles.',
      minLevel: 1,
      isPool: true,
    },
    {
      name: 'Stunning Strike',
      actionType: 'free',
      description: 'Spend 1 Discipline Point when you hit a creature. They make a CON save or are Stunned until start of your next turn.',
      minLevel: 5,
      isPool: true,
    },
    {
      name: "Monk's Focus (Ki Points)",
      actionType: 'special',
      description: 'Pool of discipline points. Spend to fuel monk features. Regain all on Short or Long Rest.',
      minLevel: 1,
      rest: 'short',
      maxUsesFn: c => c.level,
    },
  ],

  Paladin: [
    {
      name: 'Lay on Hands',
      actionType: 'action',
      description: 'Restore HP from your healing pool. Pool = Paladin level × 5 HP. Can also cure 1 disease or poison (5 HP cost).',
      minLevel: 1,
      rest: 'long',
      maxUsesFn: c => c.level * 5,
      isPool: true,
    },
    {
      name: 'Divine Smite',
      actionType: 'free',
      description: 'When you hit with a melee weapon attack, expend a spell slot to deal extra Radiant damage: 2d8 per slot level (3d8 vs undead/fiends). Max 5d8.',
      minLevel: 1,
    },
    {
      name: 'Channel Divinity',
      actionType: 'action',
      description: 'Use divine energy to fuel a subclass effect or Sacred Weapon.',
      minLevel: 3,
      rest: 'short',
      maxUsesFn: c => c.level >= 11 ? 3 : c.level >= 7 ? 2 : 1,
    },
  ],

  Ranger: [
    {
      name: "Hunter's Mark",
      actionType: 'bonus',
      description: 'Always prepared. Bonus Action: curse one target. Deal +1d6 damage to it on each hit. Concentration, 1 hour.',
      minLevel: 1,
    },
    {
      name: 'Roving',
      actionType: 'free',
      description: 'Your Speed increases by 10 ft. You gain Climb Speed and Swim Speed equal to your Speed.',
      minLevel: 6,
    },
  ],

  Rogue: [
    {
      name: 'Sneak Attack',
      actionType: 'free',
      description: 'Once per turn, deal extra damage when you have Advantage on the attack roll OR an ally is adjacent to your target. Current: ' +
        '{{sneak_dice}}d6.',
      minLevel: 1,
    },
    {
      name: 'Cunning Action',
      actionType: 'bonus',
      description: 'Take the Dash, Disengage, or Hide action as a Bonus Action.',
      minLevel: 2,
    },
    {
      name: 'Uncanny Dodge',
      actionType: 'reaction',
      description: 'When an attacker you can see hits you with an attack, halve the damage.',
      minLevel: 5,
    },
    {
      name: 'Evasion',
      actionType: 'free',
      description: 'When you succeed on a DEX save that deals half damage, you take no damage instead. On failure, take half.',
      minLevel: 7,
    },
    {
      name: 'Reliable Talent',
      actionType: 'free',
      description: 'When making an ability check with proficiency, treat any d20 roll of 9 or lower as a 10.',
      minLevel: 11,
    },
    {
      name: 'Blindsense',
      actionType: 'free',
      description: 'If you are able to hear, you are aware of the location of any hidden or invisible creature within 10 ft.',
      minLevel: 14,
    },
    {
      name: 'Slippery Mind',
      actionType: 'free',
      description: 'You have proficiency in WIS saves. If already proficient, gain proficiency in INT or CHA saves.',
      minLevel: 15,
    },
    {
      name: 'Elusive',
      actionType: 'free',
      description: 'No attack roll has Advantage against you while you aren\'t incapacitated.',
      minLevel: 18,
    },
    {
      name: 'Stroke of Luck',
      actionType: 'free',
      description: 'Turn a missed attack into a hit, or a failed ability check into a success. Once per Short/Long Rest.',
      minLevel: 20,
      rest: 'short',
      maxUsesFn: () => 1,
    },
  ],

  Sorcerer: [
    {
      name: 'Sorcery Points',
      actionType: 'special',
      description: 'Resource pool. Spend to fuel Metamagic and subclass features. Regain all on Long Rest.',
      minLevel: 2,
      rest: 'long',
      maxUsesFn: c => c.level,
      isPool: true,
    },
    {
      name: 'Innate Sorcery',
      actionType: 'bonus',
      description: 'Activate for 1 minute: your spell save DC increases by 1, and you have Advantage on attack rolls for your Sorcerer spells.',
      minLevel: 1,
      rest: 'long',
      maxUsesFn: () => 2,
    },
    {
      name: 'Metamagic',
      actionType: 'free',
      description: 'Apply Metamagic options (chosen at level 2) to spells you cast by spending Sorcery Points.',
      minLevel: 2,
      isPool: true,
    },
  ],

  Warlock: [
    {
      name: 'Eldritch Invocations',
      actionType: 'special',
      description: 'Passive and active benefits granted by your chosen invocations.',
      minLevel: 1,
    },
    {
      name: 'Magical Cunning',
      actionType: 'action',
      description: 'Spend 1 minute in meditation to regain half your expended Pact Magic slots (rounded up). Once per Long Rest.',
      minLevel: 2,
      rest: 'long',
      maxUsesFn: () => 1,
    },
    {
      name: 'Contact Patron',
      actionType: 'action',
      description: 'Cast Commune without a spell slot. Your patron answers. Once per Long Rest.',
      minLevel: 9,
      rest: 'long',
      maxUsesFn: () => 1,
    },
    {
      name: 'Mystic Arcanum',
      actionType: 'action',
      description: 'Cast your chosen arcanum spell once per Long Rest without expending a spell slot.',
      minLevel: 11,
      rest: 'long',
      maxUsesFn: c => c.level >= 17 ? 4 : c.level >= 15 ? 3 : c.level >= 13 ? 2 : 1,
    },
    {
      name: 'Eldritch Master',
      actionType: 'action',
      description: 'Spend 1 minute entreating your patron to regain all expended Pact Magic spell slots. Once per Long Rest.',
      minLevel: 18,
      rest: 'long',
      maxUsesFn: () => 1,
    },
  ],

  Wizard: [
    {
      name: 'Arcane Recovery',
      actionType: 'special',
      description: 'Once per Long Rest, during a Short Rest, recover expended spell slots with combined level ≤ half your Wizard level (round up, max 5th level).',
      minLevel: 1,
      rest: 'long',
      maxUsesFn: () => 1,
    },
    {
      name: 'Spell Mastery',
      actionType: 'free',
      description: 'Choose a 1st-level and a 2nd-level spell. Cast them at their lowest level without expending a spell slot.',
      minLevel: 18,
    },
    {
      name: 'Signature Spells',
      actionType: 'free',
      description: 'Choose two 3rd-level spells as signature spells. They are always prepared, and you can cast each once per Short Rest without a slot.',
      minLevel: 20,
      rest: 'short',
      maxUsesFn: () => 2,
    },
  ],

  Artificer: [
    {
      name: 'Magical Tinkering',
      actionType: 'action',
      description: 'Use your Tinker\'s Tools to imbue a tiny nonmagical object with a magical effect (light, recorded message, odor, visual effect, etc.).',
      minLevel: 1,
    },
    {
      name: 'The Right Tool for the Job',
      actionType: 'action',
      description: 'Spend 1 hour with Thieves\' Tools to create a set of Artisan\'s Tools in an empty space.',
      minLevel: 3,
    },
    {
      name: 'Flash of Genius',
      actionType: 'reaction',
      description: 'When you or a creature you can see makes an ability check or saving throw, add your INT modifier to the roll. Uses = INT modifier per Long Rest.',
      minLevel: 7,
      rest: 'long',
      maxUsesFn: c => Math.max(1, Math.floor((c.intelligence - 10) / 2)),
    },
    {
      name: 'Spell-Storing Item',
      actionType: 'action',
      description: 'Touch a simple or martial weapon or Spellcasting Focus. Store a 1st or 2nd-level spell in it. Wielder can use your spellcasting ability to cast it, 2 × INT mod times per Long Rest.',
      minLevel: 11,
    },
    {
      name: 'Soul of Artifice',
      actionType: 'reaction',
      description: 'When you are reduced to 0 HP but not killed, you can use your Reaction to end one of your infusions and drop to 1 HP instead.',
      minLevel: 20,
      rest: 'long',
      maxUsesFn: () => 1,
    },
  ],

  Psion: [
    {
      name: 'Psionic Energy Dice',
      actionType: 'special',
      // v2.80.0: basic description is now a one-liner per user request. The
      // detailed die-scaling table lives in the expanded view of the ability
      // card (click the chevron on the right to open).
      description: (c: any) => {
        const level = c?.level ?? 1;
        const count = level >= 17 ? 12 : level >= 13 ? 10 : level >= 9 ? 8 : level >= 5 ? 6 : 4;
        return `You have ${count} Psionic Energy Dice that regenerate 1 die on a Short Rest, all on a Long Rest.`;
      },
      // Detailed text shown when the card is expanded. Contains the full
      // die-size scaling progression + recovery mechanics in one place.
      descriptionLong: (c: any) => {
        const level = c?.level ?? 1;
        const die = level >= 17 ? 'd12' : level >= 11 ? 'd10' : level >= 5 ? 'd8' : 'd6';
        const count = level >= 17 ? 12 : level >= 13 ? 10 : level >= 9 ? 8 : level >= 5 ? 6 : 4;
        return `You have ${count} Psionic Energy Dice. At your current level (${level}), each die is a ${die}.\n\nDie size scales by level: d6 at levels 1–4, d8 at levels 5–10, d10 at levels 11–16, d12 at levels 17+.\nPool size scales by level: 4 dice at levels 1–4, 6 at 5–8, 8 at 9–12, 10 at 13–16, 12 at 17+.\n\nRecovery: regain 1 die on a Short Rest. Regain all ${count} on a Long Rest.\n\nSpend dice to power Psion class features (Telekinetic Propel, Telepathic Connection) and Psychic Disciplines.`;
      },
      minLevel: 1,
      rest: 'short',
      maxUsesFn: (c: any) => c?.level >= 17 ? 12 : c?.level >= 13 ? 10 : c?.level >= 9 ? 8 : c?.level >= 5 ? 6 : 4,
      isPool: true,
      psionicDie: true,
    },
    {
      name: 'Telekinesis',
      actionType: 'action',
      description: 'Spend 1 Psionic Energy Die: move a creature or object up to 30 ft. Or attack with a telepathic force (INT-based).',
      minLevel: 1,
      isPool: true,
      // v2.246.0 — first user-visible save chip. Telekinesis forces a STR
      // save vs the caster's spell save DC when used to move a creature
      // (objects don't save). targetMode 'any' so the v2.247 picker
      // exposes Auto-Fail (willing) — useful for Psi Warper combos with
      // Warp Propel where the caster wants a friendly target's "fail"
      // to trigger the teleport-instead-of-push rider.
      save: { ability: 'STR', dc: 'spell', targetMode: 'any' },
    },
    // v2.187.0 — Phase Q.0 pt 28: Subtle Telekinesis is a base Psion class
    // feature (not subclass). Cast Mage Hand at-will but invisible. No PED
    // cost. Surfaces here so the player can see + click "Use" to log it.
    {
      name: 'Subtle Telekinesis',
      actionType: 'action',
      description: 'Cast Mage Hand at will. The hand is invisible.',
      descriptionLong: 'You can cast Mage Hand without expending a spell slot or material components, and the spectral hand is invisible. The hand can interact with objects, push or pull, and carry items as normal — but onlookers see only the items moving on their own. Useful for stealth, infiltration, or unsettling NPCs.',
      minLevel: 1,
    },
    // ─── Psi Warper subclass features (v2.187.0) ───────────────────────
    // All 5 active/usable Psi Warper features inserted here so they render
    // under PSION ABILITIES on the Actions tab. We do NOT subclass-gate
    // these because (a) Psion currently has only one subclass in published
    // material (Psi Warper, UA), and (b) ClassAbilitiesSection has no
    // subclass filter — adding one would touch the renderer for one class.
    // If/when other subclasses ship (Metamorph, Psykinetic, Telepath),
    // we'll need to add a `subclass?: string` field to ClassAbility and
    // gate at filter time. For now: the user's character ghj is Psi
    // Warper, so this is correct in practice.
    //
    // Free Misty Step + PED-restoration mechanic isn't auto-tracked yet
    // (no schema for "feature uses remaining"). That's v2.188 work.
    // Today the player tracks it manually via Use button → action log.
    {
      name: 'Free Misty Step (Teleportation)',
      actionType: 'bonus',
      description: 'Cast Misty Step without a spell slot. Once per Long Rest. Restore by spending 1 Psionic Energy Die.',
      descriptionLong: 'Cast Misty Step without expending a spell slot. Once you use this feature, you can\'t do so again until you finish a Long Rest, OR until you spend 1 Psionic Energy Die (no action required) to restore the use.\n\nAt level 6+ this combines with Teleporter Combat: after the Misty Step bonus action, you may immediately cast a Psion cantrip with an Action casting time as part of the same Bonus Action.',
      minLevel: 3,
      // v2.189.0 — once per Long Rest. Tracked via feature_uses; reset
      // by doLongRest.
      maxUsesFn: () => 1,
      rest: 'long',
      // v2.190.0 — Phase Q.0 pt 31: spend 1 PED to refresh mid-rest.
      // Triggers the "Restore (1 PED)" button when feature is depleted.
      pedRestoreCost: 1,
    },
    {
      name: 'Warp Propel',
      actionType: 'special',
      description: 'When a target fails the save vs Telekinetic Propel, teleport it to an unoccupied space within 30 ft instead of pushing.',
      descriptionLong: 'Modifies your Telekinetic Propel feature. When a target fails the saving throw against Telekinetic Propel, you can choose to teleport the target to an unoccupied space you can see within 30 ft of where it was, instead of pushing it. The teleported target lands prone.\n\nCombines with Mass Teleportation at level 14.',
      minLevel: 3,
    },
    {
      name: 'Warp Space',
      actionType: 'action',
      description: 'Cast Shatter, spend 1 PED to expand radius to 20 ft and pull failing creatures toward the center.',
      descriptionLong: 'When you cast Shatter, you can spend 1 Psionic Energy Die. The spell\'s radius expands from 10 ft to 20 ft, and creatures that fail the Constitution saving throw are pulled up to 10 ft toward the spell\'s point of origin in addition to taking damage.\n\nThis is an alternate cast of Shatter (which remains separately available in your spell list); Warp Space costs both a 2nd-level spell slot AND 1 Psionic Energy Die.',
      minLevel: 6,
      // v2.189.0 — explicit pedCost replaces the old isPool/psionicDie
      // flags which only deducted 1 die generically. New flow: Use
      // button checks pool ≥ pedCost, deducts, broadcasts.
      pedCost: 1,
    },
    {
      name: 'Teleporter Combat',
      actionType: 'bonus',
      description: 'After casting Misty Step, immediately cast a Psion cantrip (action casting time) as part of the same Bonus Action.',
      descriptionLong: 'When you cast Misty Step (whether via spell slot or via your Free Misty Step feature), you may immediately cast one Psion cantrip with an Action casting time as part of the same Bonus Action — without taking a separate Action.\n\nThis effectively lets you teleport and attack in the same turn while keeping your Action free for Dash, Dodge, or another use.',
      minLevel: 6,
    },
    {
      name: 'Duplicitous Target',
      actionType: 'reaction',
      description: 'Reaction: when attacked, spend 1 PED to swap places with a willing ally within 30 ft. Attack hits them instead.',
      descriptionLong: 'When a creature you can see attacks you, you can use your Reaction and spend 1 Psionic Energy Die to swap places with a willing ally within 30 ft. The ally takes the attack instead of you.\n\nThe ally must be willing — you can\'t involuntarily swap with an unwilling target. Both you and the ally must have line of sight to each other and there must be no full cover between you.',
      minLevel: 10,
      pedCost: 1,
    },
    {
      name: 'Mass Teleportation',
      actionType: 'action',
      description: 'Magic action: spend 4 PED. Teleport up to INT mod creatures within 30 ft to spaces within 150 ft. Unwilling targets WIS save.',
      descriptionLong: 'Take a Magic action and spend 4 Psionic Energy Dice. Choose up to a number of creatures equal to your Intelligence modifier (minimum 1) within 30 ft of you. You teleport each chosen creature to an unoccupied space you can see within 150 ft.\n\nWilling targets are simply moved. Unwilling targets must succeed on a Wisdom saving throw against your spell save DC or be teleported anyway.\n\nYou may include yourself among the chosen targets.',
      minLevel: 14,
      pedCost: 4,
    },
  ],
};

/** Species that automatically grant specific skill proficiencies */
export const SPECIES_AUTO_SKILLS: Record<string, string[]> = {
  'Elf':        ['perception'],
  'Half-Elf':   ['perception'],
  'Tabaxi':     ['perception', 'stealth'],
  'Harengon':   ['perception'],
};

/** Species traits that are PASSIVE (always on, no action needed) */
export const PASSIVE_TRAIT_KEYWORDS = [
  'you have resistance',
  'you have advantage',
  'you have darkvision',
  'you have proficiency',
  'you are immune',
  'you can\'t be',
  'you gain proficiency',
  'your hit point maximum',
  'you don\'t need to sleep',
  'you can move through',
];

/** Class features that are PASSIVE (always active, just informational) */
export const PASSIVE_FEATURE_NAMES = new Set([
  'Jack of All Trades',
  'Reliable Talent',
  'Elusive',
  'Feral Instinct',
  'Danger Sense',
  'Unarmored Defense',
  'Timeless Body',
  'Beast Spells',
  'Tongue of the Sun and Moon',
  'Empty Body',
  'Diamond Soul',
  'Mind Blank',
  'Durable Magic',
  'Spell Resistance',
  'Instinctive Pounce',
  'Weapon Mastery',
  'Extra Attack',
  'Fast Movement',
  'Indomitable Might',
  'Persistent Rage',
  'Tireless',
  'Land\'s Stride',
  'Vanish',
  'Foe Slayer',
  'Sneak Attack',
  'Expertise',
  'Roving',
  'Blindsense',
  'Slippery Mind',
  'Spell Mastery',
  'Primal Champion',
  'Superior Inspiration',
  'Stroke of Luck',
]);
