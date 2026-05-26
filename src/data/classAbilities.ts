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
  /** v2.376.0 — flat maxUses for non-scaling features (species traits like
   *  Healing Hands "1× per long rest" or Large Form "1× per long rest").
   *  Class abilities that scale with level should use maxUsesFn instead.
   *  getMaxUses prefers maxUsesFn when both are present. */
  maxUses?: number;
  maxUsesFn?: (c: Character) => number;
  rest?: 'short' | 'long';
  /** v2.506.0 — Recovery trigger for limited-use features whose
   *  refresh isn't a rest. Today only 'movement' (Tabaxi Feline
   *  Agility: usable again after you move 0 ft on one of your turns).
   *  When set, the use-tracker box still renders (manual click to
   *  exhaust/restore), AND combat auto-resets the use at the end of
   *  any turn the character moved 0 ft — see resetMovementGatedFeatures
   *  in combatEncounter.ts. Mutually exclusive with `rest` in practice;
   *  if both are set, `rest` wins for the tracker label. */
  recovery?: 'movement';
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
  /** v2.324.0 — T3 limited-use refactor. Optional range string surfaced as
   *  inline metadata in the Actions tab subtitle (e.g. "Long Rest · 30 ft").
   *  Free-form to accommodate compound ranges ("30/150 ft" for Mass
   *  Teleportation, "Self (30 ft)" for emanation effects). Display-only;
   *  no automation reads it. Backfilled for Psi Warper abilities first;
   *  other classes will follow in later refactors. */
  range?: string;
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
      // v2.520.0 — Full dynamic richness pass. Rage damage bonus scales
      // by level (2024 PHB: +2 at 1, +3 at 9, +4 at 16). Uses scale and
      // become unlimited at 20 (Primal Champion makes rage effectively
      // free to maintain, but RAW uses still cap until 20 grants
      // unlimited). Recovery on a Long Rest (one use returns on a Short
      // Rest from level 1 per 2024 rules).
      description: (c: any) => {
        const bonus = c?.level >= 16 ? 4 : c?.level >= 9 ? 3 : 2;
        return `Bonus Action: enter Rage for 10 minutes. +${bonus} damage on Strength-based attacks, Advantage on Strength checks and saves, and Resistance to Bludgeoning, Piercing, and Slashing damage.`;
      },
      descriptionLong: (c: any) => {
        const bonus = c?.level >= 16 ? 4 : c?.level >= 9 ? 3 : 2;
        const uses = c?.level >= 20 ? 999 : c?.level >= 17 ? 6 : c?.level >= 12 ? 5 : c?.level >= 6 ? 4 : c?.level >= 3 ? 3 : 2;
        return `Enter Rage as a Bonus Action (no heavy armor). While raging:\n\n• +${bonus} bonus to damage on Strength-based weapon attacks (scales: +2 at levels 1–8, +3 at 9–15, +4 at 16+).\n• Advantage on Strength checks and Strength saving throws.\n• Resistance to Bludgeoning, Piercing, and Slashing damage.\n\nRage lasts 10 minutes. It ends early if you don Heavy armor or are Incapacitated. You can extend it by taking damage or making an attack roll against an enemy each turn (until Persistent Rage at 15).\n\nUses at your level: ${uses === 999 ? 'unlimited' : uses}. You regain one expended use on a Short Rest and all on a Long Rest.`;
      },
      minLevel: 1,
      rest: 'long',
      maxUsesFn: (c: any) => c?.level >= 20 ? 999 : c?.level >= 17 ? 6 : c?.level >= 12 ? 5 : c?.level >= 6 ? 4 : c?.level >= 3 ? 3 : 2,
    },
    {
      name: 'Reckless Attack',
      actionType: 'free',
      description: 'When you make your first attack on your turn, you can attack recklessly: gain Advantage on melee Strength attacks this turn, but attacks against you have Advantage until your next turn.',
      descriptionLong: 'At the start of your turn, before your first attack, you can decide to attack recklessly. Doing so gives you Advantage on melee weapon attack rolls using Strength during this turn, but attack rolls against you have Advantage until your next turn. This is the primary enabler for Brutal Strike at level 9+.',
      minLevel: 2,
    },
    {
      name: 'Danger Sense',
      actionType: 'reaction',
      description: 'Advantage on Dexterity saving throws against effects you can see (e.g. traps, spells), unless Incapacitated.',
      descriptionLong: 'You have an uncanny sense for danger. You have Advantage on Dexterity saving throws against effects you can see, such as a Fireball or a swinging trap. You don\'t benefit while Incapacitated.',
      minLevel: 2,
    },
    {
      name: 'Brutal Strike',
      actionType: 'free',
      // v2.520.0 — Extra damage die scales at 17 (Improved Brutal Strike:
      // 1d10 → 2d10) and lets you apply two effects.
      description: (c: any) => {
        const dice = c?.level >= 17 ? '2d10' : '1d10';
        const effects = c?.level >= 17 ? 'two Brutal Strike effects' : 'one Brutal Strike effect';
        return `When you use Reckless Attack, you can forgo Advantage on one attack. If it hits, deal +${dice} damage and apply ${effects} (Forceful Blow: push 15 ft + move; Hamstring Blow: reduce Speed by 15 ft).`;
      },
      descriptionLong: (c: any) => {
        const dice = c?.level >= 17 ? '2d10' : '1d10';
        const improved = c?.level >= 17;
        return `When you Reckless Attack, you can choose to forgo Advantage on one of your attack rolls. If that attack hits, it deals an extra ${dice} damage and you apply ${improved ? 'two' : 'one'} of these effects:\n\n• Forceful Blow — the target is pushed 15 ft straight away; you can then move up to half your Speed toward it.\n• Hamstring Blow — the target\'s Speed is reduced by 15 ft until the start of your next turn.\n\n${improved ? 'Improved Brutal Strike (level 17): the bonus damage is 2d10 and you may apply both effects on the same strike. The effects must be different.' : 'At level 17 (Improved Brutal Strike), the damage increases to 2d10 and you can apply two different effects.'}`;
      },
      minLevel: 9,
    },
    {
      name: 'Relentless Rage',
      actionType: 'special',
      // v2.520.0 — DC scaling: starts at 10, +5 each subsequent use in
      // the same rage (RAW). Surface the rule clearly.
      description: 'When you drop to 0 HP while Raging and don\'t die outright, you can make a DC 10 Constitution save to drop to 1 HP instead. The DC increases by 5 each time you use it (resets on a rest).',
      descriptionLong: 'If you drop to 0 Hit Points while Raging and don\'t die outright, you can make a Constitution saving throw (DC 10). On a success, you drop to 1 Hit Point instead. Each time you use this feature after the first, the DC increases by 5. The DC resets to 10 when you finish a Short or Long Rest. This is what keeps a raging Barbarian on their feet long past where others would fall.',
      minLevel: 11,
      save: { ability: 'CON', dc: 10, targetMode: 'any' },
    },
    {
      name: 'Persistent Rage',
      actionType: 'free',
      description: 'Your Rage is so fierce it ends early only if you choose to end it, fall Unconscious, or don Heavy armor — never from inaction.',
      descriptionLong: 'When you Rage, it lasts until you choose to end it, you fall Unconscious, or you don Heavy armor. You no longer need to attack or take damage each turn to maintain it. Additionally, when you roll Initiative and have no uses of Rage left, you regain one use.',
      minLevel: 15,
    },
    {
      name: 'Indomitable Might',
      actionType: 'free',
      description: (c: any) => {
        const str = c?.strength ?? 10;
        return `If your total for a Strength check is less than your Strength score (${str}), you can use that score (${str}) in place of the total.`;
      },
      descriptionLong: (c: any) => {
        const str = c?.strength ?? 10;
        return `If your total for a Strength check is less than your Strength score, you can use that score in place of the total. At your current Strength of ${str}, any Strength check resolves as at least ${str} before situational modifiers. This makes you reliably able to break, lift, and shove.`;
      },
      minLevel: 18,
    },
    {
      name: 'Primal Champion',
      actionType: 'free',
      description: 'Your Strength and Constitution scores increase by 4, to a maximum of 25.',
      descriptionLong: 'You embody primal power. Your Strength and Constitution scores increase by 4, and your maximum for those scores becomes 25. (Apply this via the settings stat editor if not already reflected.) Combined with unlimited Rage at level 20, you are a force of nature.',
      minLevel: 20,
    },
  ],

  Bard: [
    {
      name: 'Bardic Inspiration',
      actionType: 'bonus',
      // v2.526.0 — Full richness pass. Die scales d6/d8/d10/d12 at levels
      // 1/5/10/15. Uses = CHA modifier (min 1). From level 5 (Font of
      // Inspiration) it recharges on a Short OR Long Rest.
      description: (c: any) => {
        const lvl = c?.level ?? 1;
        const die = lvl >= 15 ? 'd12' : lvl >= 10 ? 'd10' : lvl >= 5 ? 'd8' : 'd6';
        return `Bonus Action: give a creature within 60 ft a Bardic Inspiration ${die}. Within 10 minutes they can add it to one d20 Test (ability check, attack roll, or saving throw), even after seeing the roll, before knowing the outcome.`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 1;
        const die = lvl >= 15 ? 'd12' : lvl >= 10 ? 'd10' : lvl >= 5 ? 'd8' : 'd6';
        const uses = Math.max(1, Math.floor(((c?.charisma ?? 10) - 10) / 2));
        const recharge = lvl >= 5 ? 'Short or Long Rest (Font of Inspiration)' : 'Long Rest';
        return `As a Bonus Action, you give one creature other than yourself within 60 ft a Bardic Inspiration die: a ${die} at your level (d6 at 1\u20134, d8 at 5\u20139, d10 at 10\u201314, d12 at 15+).\n\nOnce within 10 minutes, the creature can roll the die and add it to one d20 Test it makes (ability check, attack roll, or saving throw). It can do so after seeing the d20 roll but before the outcome is announced.\n\nUses: equal to your Charisma modifier (currently ${uses}, minimum 1), regained on a ${recharge}.${lvl >= 20 ? '\n\nSuperior Inspiration (level 20): when you roll Initiative, you regain expended uses until you have at least two.' : ''}`;
      },
      minLevel: 1,
      rest: 'short',
      maxUsesFn: (c: any) => Math.max(1, cha(c)),
    },
    {
      name: 'Jack of All Trades',
      actionType: 'free',
      // v2.526.0 — Half proficiency (round down) to any ability check that
      // doesn't already include proficiency.
      description: (c: any) => {
        const half = Math.floor(proficiencyBonus(c?.level ?? 2) / 2);
        return `Add half your proficiency bonus (+${half}) to any ability check you make that doesn\u2019t already include your proficiency bonus.`;
      },
      descriptionLong: (c: any) => {
        const half = Math.floor(proficiencyBonus(c?.level ?? 2) / 2);
        return `You can add half your proficiency bonus, rounded down (currently +${half}), to any ability check you make that doesn\u2019t already include your proficiency bonus. This also improves your Initiative rolls. It makes you competent at virtually everything, even skills you aren\u2019t trained in.`;
      },
      minLevel: 2,
    },
    {
      name: 'Song of Rest',
      actionType: 'free',
      // v2.526.0 — Extra healing during a Short Rest; die scales
      // d6/d8/d10/d12 at 2/9/13/17.
      description: (c: any) => {
        const lvl = c?.level ?? 2;
        const die = lvl >= 17 ? 'd12' : lvl >= 13 ? 'd10' : lvl >= 9 ? 'd8' : 'd6';
        return `During a Short Rest, allies who spend Hit Dice to heal regain an extra ${die} Hit Points (once each).`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 2;
        const die = lvl >= 17 ? 'd12' : lvl >= 13 ? 'd10' : lvl >= 9 ? 'd8' : 'd6';
        return `If you or any friendly creatures who can hear your performance regain Hit Points at the end of a Short Rest by spending one or more Hit Dice, each of those creatures regains an extra ${die} Hit Points (d6 at levels 2\u20138, d8 at 9\u201312, d10 at 13\u201316, d12 at 17+).`;
      },
      minLevel: 2,
    },
    {
      name: 'Countercharm',
      actionType: 'action',
      description: 'Start a performance until the end of your next turn. You and friendly creatures within 30 ft have Advantage on saving throws to avoid or end the Frightened and Charmed conditions.',
      descriptionLong: 'As a Magic action, you can start a performance that lasts until the end of your next turn. During that time, you and any friendly creatures within 30 ft of you have Advantage on saving throws to avoid or end the Frightened and Charmed conditions. A creature must be able to hear you to gain this benefit.',
      minLevel: 6,
    },
  ],

  Cleric: [
    {
      name: 'Divine Order',
      actionType: 'free',
      // v2.526.0/2.527.0 — Level-1 choice: Protector (martial/Heavy armor)
      // or Thaumaturge (extra cantrip + WIS-mod bonus to Religion/Arcana
      // checks about supernatural matters).
      description: 'Your level-1 calling: Protector (martial weapon + Heavy armor training) or Thaumaturge (an extra Cleric cantrip and bonus arcana/religion knowledge).',
      descriptionLong: 'At level 1 you chose one of two sacred callings:\n\u2022 Protector \u2014 you gained training with Martial weapons and Heavy armor.\n\u2022 Thaumaturge \u2014 you know one extra Cleric cantrip, and you add your Wisdom modifier (min +1) to Intelligence (Arcana or Religion) checks about gods, the planes, and the divine.',
      minLevel: 1,
    },
    {
      name: 'Channel Divinity',
      actionType: 'special',
      // v2.527.0 — Uses scale 2/3/4 at levels 2/6/11 (corrected from the
      // prior data which used 18). Recharges on a Short OR Long Rest.
      description: (c: any) => {
        const uses = c?.level >= 11 ? 4 : c?.level >= 6 ? 3 : 2;
        return `Channel divine energy (${uses} uses per Short/Long Rest) to fuel Divine Spark, Turn Undead, or your subclass option.`;
      },
      descriptionLong: (c: any) => {
        const uses = c?.level >= 11 ? 4 : c?.level >= 6 ? 3 : 2;
        return `You can channel divine energy ${uses} times per Short or Long Rest (2 uses at levels 2\u20135, 3 at 6\u201310, 4 at 11+).\n\nBase options:\n\u2022 Divine Spark \u2014 a Magic action to heal or harm (see its entry).\n\u2022 Turn Undead \u2014 brandish your holy symbol to drive off Undead.\n\u2022 Plus any option granted by your subclass.`;
      },
      minLevel: 2,
      rest: 'short',
      maxUsesFn: (c: any) => c?.level >= 11 ? 4 : c?.level >= 6 ? 3 : 2,
    },
    {
      name: 'Divine Spark',
      actionType: 'action',
      // v2.527.0 — New 2024 Channel Divinity option. Magic action: point
      // and roll dice = 1d8, scaling +1d8 at 7/13/18. Heal a creature, or
      // force a CON save for radiant/necrotic damage (half on success).
      description: (c: any) => {
        const lvl = c?.level ?? 2;
        const dice = lvl >= 18 ? 4 : lvl >= 13 ? 3 : lvl >= 7 ? 2 : 1;
        return `Magic Action (spend 1 Channel Divinity): roll ${dice}d8. Restore that many Hit Points to a creature within 30 ft, OR force a Constitution save for ${dice}d8 Radiant or Necrotic damage (half on a success).`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 2;
        const dice = lvl >= 18 ? 4 : lvl >= 13 ? 3 : lvl >= 7 ? 2 : 1;
        return `As a Magic action, you point at a creature within 60 ft and channel energy by spending one use of Channel Divinity. Roll ${dice}d8 (1d8 at levels 2\u20136, 2d8 at 7\u201312, 3d8 at 13\u201317, 4d8 at 18+) and choose:\n\u2022 Heal \u2014 restore Hit Points equal to the roll.\n\u2022 Harm \u2014 the target makes a Constitution saving throw, taking Radiant or Necrotic damage (your choice) equal to the roll on a failure, or half as much on a success.`;
      },
      minLevel: 2,
      isPool: true,
      save: { ability: 'CON', dc: 'spell', targetMode: 'enemies' },
    },
    {
      name: 'Turn Undead',
      actionType: 'action',
      // v2.527.0 — WIS save chip; Sear Undead (level 5) adds radiant
      // damage even on a successful save.
      description: 'Magic Action (spend 1 Channel Divinity): each Undead within 30 ft must make a Wisdom save or be Frightened and Incapacitated, moving away from you, for 1 minute or until it takes damage.',
      descriptionLong: 'As a Magic action, you spend one use of Channel Divinity and present your holy symbol. Each Undead within 30 ft that can see or hear you must make a Wisdom saving throw. On a failure, the creature is Frightened and Incapacitated, and must spend its turns trying to move as far from you as it can, for 1 minute or until it takes any damage or you\u2019re Incapacitated.\n\nFrom level 5 (Sear Undead), when an Undead fails this save it also takes Radiant damage equal to your Wisdom modifier (and even creatures that succeed are seared \u2014 see Sear Undead).',
      minLevel: 2,
      isPool: true,
      save: { ability: 'WIS', dc: 'spell', targetMode: 'enemies' },
    },
    {
      name: 'Sear Undead',
      actionType: 'free',
      description: (c: any) => {
        const wis = Math.max(1, Math.floor(((c?.wisdom ?? 10) - 10) / 2));
        return `When you Turn Undead, you can also deal ${wis}d8 Radiant damage, divided among the Undead you affect.`;
      },
      descriptionLong: 'Whenever you use Turn Undead, you can roll a number of d8s equal to your Wisdom modifier (minimum 1) and deal that much Radiant damage to one Undead you would affect, or divide the dice among several. This lets your Turn double as a damage tool, not just crowd control.',
      minLevel: 5,
    },
    {
      name: 'Divine Intervention',
      actionType: 'action',
      // v2.527.0 — 2024: you cast any Cleric spell of level 5 or lower for
      // free as part of the action (no components). 1 use per Long Rest;
      // Greater Divine Intervention (level 20) once per week casts Wish.
      description: (c: any) => {
        const cap = c?.level >= 20 ? 'any Cleric spell (and Wish once per 2d4 days at level 20)' : 'any Cleric spell of level 5 or lower';
        return `Magic Action: cast ${cap} without expending a spell slot or components. Once per Long Rest.`;
      },
      descriptionLong: (c: any) => {
        const greater = c?.level >= 20;
        return `As a Magic action, you call on your deity to intervene: you cast any Cleric spell of level 5 or lower as part of this action, without expending a spell slot or providing material components.\n\nOnce you use this feature, you can\u2019t use it again until you finish a Long Rest.${greater ? '\n\nGreater Divine Intervention (level 20): you can instead cast Wish this way. If you do, you can\u2019t use Divine Intervention again for 2d4 Long Rests.' : ''}`;
      },
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
      // v2.521.0 — Full richness pass. 2024 Second Wind heals 1d10 +
      // Fighter level and has multiple uses that scale (2 at 1, 3 at 4,
      // 4 at 10). Recovers all on a Long Rest, one on a Short Rest.
      description: (c: any) => {
        const lvl = c?.level ?? 1;
        return `Bonus Action: regain 1d10 + ${lvl} Hit Points. Also fuels Tactical Mind.`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 1;
        const uses = lvl >= 10 ? 4 : lvl >= 4 ? 3 : 2;
        return `Bonus Action: regain 1d10 + your Fighter level (currently 1d10 + ${lvl}) Hit Points.\n\nUses at your level: ${uses}. You regain one expended use on a Short Rest and all of them on a Long Rest (2 uses at levels 1–3, 3 at 4–9, 4 at 10+).\n\nFrom level 2, you can also spend a use of Second Wind on Tactical Mind to add 1d10 to a failed ability check without expending the healing.`;
      },
      minLevel: 1,
      rest: 'short',
      maxUsesFn: (c: any) => c?.level >= 10 ? 4 : c?.level >= 4 ? 3 : 2,
    },
    {
      name: 'Tactical Mind',
      actionType: 'free',
      // v2.521.0 — New 2024 feature. On a failed ability check, spend a
      // Second Wind use to add 1d10; if it still fails, the use isn't
      // expended.
      description: 'When you fail an ability check, you can expend a use of Second Wind to add 1d10 to the check. If it still fails, the use isn\'t spent.',
      descriptionLong: 'When you fail an ability check, you can expend one use of Second Wind to roll 1d10 and add it to the check, potentially turning the failure into a success. You don\'t regain the Hit Points — this trades the use for the bonus. If the check still fails even with the +1d10, the use of Second Wind isn\'t expended. Shares the Second Wind use pool.',
      minLevel: 2,
    },
    {
      name: 'Action Surge',
      actionType: 'special',
      description: (c: any) => {
        const uses = c?.level >= 17 ? 2 : 1;
        return `Take one additional action on your turn. ${uses === 2 ? 'Usable twice per rest (but only once per turn).' : 'Once per Short or Long Rest.'}`;
      },
      descriptionLong: (c: any) => {
        const uses = c?.level >= 17 ? 2 : 1;
        return `On your turn, take one additional action. This does not grant an extra Bonus Action.\n\nUses at your level: ${uses} (1 use at levels 2–16, 2 uses at 17+). You can use it only once on a given turn even with two uses available. Recovers on a Short or Long Rest.\n\nCombined with Extra Attack, Action Surge is the Fighter's signature burst — at level 11 (Two Extra Attacks) an Action Surge turn delivers up to six weapon attacks.`;
      },
      minLevel: 2,
      rest: 'short',
      maxUsesFn: (c: any) => c?.level >= 17 ? 2 : 1,
    },
    {
      name: 'Extra Attack',
      actionType: 'free',
      // v2.521.0 — Surfaced as an at-a-glance reminder of how many
      // attacks the Attack action grants at this level (2 at 5, 3 at 11,
      // 4 at 20).
      description: (c: any) => {
        const lvl = c?.level ?? 1;
        const attacks = lvl >= 20 ? 4 : lvl >= 11 ? 3 : 2;
        return `When you take the Attack action, you can attack ${attacks} times instead of once.`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 1;
        const attacks = lvl >= 20 ? 4 : lvl >= 11 ? 3 : 2;
        return `When you take the Attack action on your turn, you can make ${attacks} attacks instead of one (2 attacks at levels 5–10, 3 at 11–19, 4 at 20). Action Surge can double this for one turn.`;
      },
      minLevel: 5,
    },
    {
      name: 'Indomitable',
      actionType: 'free',
      // v2.521.0 — Dynamic uses; on reroll you add your Fighter level to
      // the new roll (2024 change).
      description: (c: any) => {
        const lvl = c?.level ?? 1;
        const uses = lvl >= 17 ? 3 : lvl >= 13 ? 2 : 1;
        return `Reroll a failed saving throw, adding your Fighter level (+${lvl}) to the new roll. ${uses} use${uses === 1 ? '' : 's'} per Long Rest.`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 1;
        const uses = lvl >= 17 ? 3 : lvl >= 13 ? 2 : 1;
        return `When you fail a saving throw, you can reroll it. You must use the new roll, and you add your Fighter level (+${lvl}) to it.\n\nUses at your level: ${uses} (1 at levels 9–12, 2 at 13–16, 3 at 17+). All uses recover on a Long Rest.`;
      },
      minLevel: 9,
      rest: 'long',
      maxUsesFn: (c: any) => c?.level >= 17 ? 3 : c?.level >= 13 ? 2 : 1,
    },
    {
      name: 'Studied Attacks',
      actionType: 'free',
      // v2.521.0 — New 2024 level-13 feature: after you miss a creature
      // with an attack, you have Advantage on your next attack against
      // it before the end of your next turn.
      description: 'When you miss a creature with an attack roll, you have Advantage on your next attack roll against that creature before the end of your next turn.',
      descriptionLong: 'You learn from each miss. When you make an attack roll against a creature and miss, you have Advantage on your next attack roll against that same creature before the end of your next turn. This makes your offense self-correcting — a whiff sets up a near-guaranteed follow-up.',
      minLevel: 13,
    },
  ],

  Monk: [
    {
      name: 'Martial Arts',
      actionType: 'free',
      // v2.522.0 — Full richness pass. Martial Arts die scales d6→d12
      // (d6 1-4, d8 5-10, d10 11-16, d12 17+). Unarmed strikes use DEX,
      // and you get a Bonus Action unarmed strike when you Attack.
      description: (c: any) => {
        const lvl = c?.level ?? 1;
        const die = lvl >= 17 ? 'd12' : lvl >= 11 ? 'd10' : lvl >= 5 ? 'd8' : 'd6';
        return `Your Unarmed Strikes and Monk weapons deal ${die} damage and can use Dexterity. When you Attack, you can make one Unarmed Strike as a Bonus Action.`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 1;
        const die = lvl >= 17 ? 'd12' : lvl >= 11 ? 'd10' : lvl >= 5 ? 'd8' : 'd6';
        return `While unarmored and not wielding a Shield:\n\n• Your Unarmed Strikes and Monk weapons deal ${die} damage (the Martial Arts die — d6 at levels 1–4, d8 at 5–10, d10 at 11–16, d12 at 17+).\n• You can use Dexterity instead of Strength for the attack and damage rolls of Unarmed Strikes and Monk weapons.\n• When you take the Attack action, you can make one Unarmed Strike as a Bonus Action.`;
      },
      minLevel: 1,
    },
    {
      name: "Monk's Focus (Focus Points)",
      actionType: 'special',
      // v2.522.0 — Focus pool = Monk level (from level 2). Recovers on a
      // Short or Long Rest; Uncanny Metabolism (L2) lets you regain all
      // once per Long Rest on initiative.
      description: (c: any) => {
        const lvl = c?.level ?? 1;
        const pts = lvl >= 2 ? lvl : 0;
        return pts > 0
          ? `You have ${pts} Focus Points. Spend them on Flurry of Blows, Patient Defense, Step of the Wind, and other Monk features. Regain all on a Short or Long Rest.`
          : `Focus Points unlock at level 2.`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 1;
        const pts = lvl >= 2 ? lvl : 0;
        return `Your Focus Points equal your Monk level (currently ${pts}). You spend them to fuel Flurry of Blows, Patient Defense, Step of the Wind, Stunning Strike (which refunds on a save), and subclass features.\n\nRecovery: regain all expended Focus Points on a Short or Long Rest. At level 2, Uncanny Metabolism lets you regain all Focus Points once per Long Rest when you roll Initiative (and roll your Martial Arts die to regain HP).`;
      },
      minLevel: 2,
      rest: 'short',
      isPool: true,
      maxUsesFn: (c: any) => c?.level ?? 1,
    },
    {
      name: 'Flurry of Blows',
      actionType: 'bonus',
      // v2.522.0 — Two strikes (three at level 10 via Heightened Focus).
      description: (c: any) => {
        const strikes = c?.level >= 10 ? 3 : 2;
        return `Spend 1 Focus Point after taking the Attack action to make ${strikes} Unarmed Strikes as a Bonus Action.`;
      },
      descriptionLong: (c: any) => {
        const strikes = c?.level >= 10 ? 3 : 2;
        return `Immediately after you take the Attack action, you can spend 1 Focus Point to make ${strikes} Unarmed Strikes as a Bonus Action (two strikes at levels 1–9, three at 10+ via Heightened Focus). Each uses your Martial Arts die and Dexterity.`;
      },
      minLevel: 1,
      isPool: true,
    },
    {
      name: 'Patient Defense',
      actionType: 'bonus',
      description: 'Take the Disengage action as a Bonus Action for free, or spend 1 Focus Point to take both Disengage and Dodge as a Bonus Action.',
      descriptionLong: 'As a Bonus Action you can take the Disengage action for free. Alternatively, spend 1 Focus Point to take both the Disengage and the Dodge actions as a single Bonus Action — attackers have Disadvantage against you and you make Dexterity saves with Advantage until your next turn.',
      minLevel: 1,
      isPool: true,
    },
    {
      name: 'Step of the Wind',
      actionType: 'bonus',
      description: 'Take the Dash action as a Bonus Action for free, or spend 1 Focus Point to take both Dash and Disengage, and double your jump distance.',
      descriptionLong: 'As a Bonus Action you can take the Dash action for free. Alternatively, spend 1 Focus Point to take both the Dash and Disengage actions as a Bonus Action, and your jump distance is doubled for the turn. You can also bring along a willing creature your size or smaller at later subclass tiers.',
      minLevel: 1,
      isPool: true,
    },
    {
      name: 'Deflect Attacks',
      actionType: 'reaction',
      // v2.522.0 — Reduction = 1d10 + DEX + Monk level. At 13 (Deflect
      // Energy) it also works on any damage type.
      description: (c: any) => {
        const lvl = c?.level ?? 3;
        const energy = lvl >= 13 ? ' Works against any damage type.' : '';
        return `Reaction when hit by an attack that deals Bludgeoning, Piercing, or Slashing damage: reduce the damage by 1d10 + your Dexterity modifier + your Monk level.${energy}`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 3;
        const energy = lvl >= 13;
        return `Reaction, when you're hit by an attack roll that deals Bludgeoning, Piercing, or Slashing damage${energy ? ' (or any damage type, via Deflect Energy at level 13)' : ''}: reduce the damage by 1d10 + your Dexterity modifier + your Monk level.\n\nIf you reduce the damage to 0, you can spend 1 Focus Point to redirect it — make a ranged Unarmed Strike (or throw the deflected projectile) at a creature within 5 ft (melee) or 60 ft, dealing two rolls of your Martial Arts die${energy ? ' of the same damage type you deflected' : ''} on a hit.`;
      },
      minLevel: 3,
      isPool: true,
    },
    {
      name: 'Stunning Strike',
      actionType: 'free',
      // v2.522.0 — CON save spec wired through the v2.247 save resolver.
      description: 'Once per turn when you hit with a Monk weapon or Unarmed Strike, spend 1 Focus Point to force a Constitution save. On a failure the target is Stunned until the start of your next turn; on a success it has Speed halved and grants Advantage until then.',
      descriptionLong: 'Once per turn, when you hit a creature with a Monk weapon or an Unarmed Strike, you can spend 1 Focus Point to attempt a stun. The target makes a Constitution saving throw against your Ki save DC (8 + proficiency + Dexterity).\n\n• Failure: Stunned until the start of your next turn.\n• Success: its Speed is halved until the start of your next turn, and the next attack against it before then has Advantage.\n\n(2024 change: a save no longer fully wastes the point — you still get the speed/advantage effect.)',
      minLevel: 5,
      isPool: true,
      save: { ability: 'CON', dc: 'spell', targetMode: 'enemies' },
    },
    {
      name: 'Slow Fall',
      actionType: 'reaction',
      description: (c: any) => {
        const lvl = c?.level ?? 4;
        return `Reaction when you fall: reduce falling damage by ${lvl * 5}.`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 4;
        return `As a Reaction when you fall, you can reduce the falling damage you take by an amount equal to five times your Monk level (currently ${lvl * 5}). Often enough to negate a fall entirely.`;
      },
      minLevel: 4,
    },
    {
      name: 'Superior Defense',
      actionType: 'special',
      description: 'Spend 3 Focus Points at the start of your turn to gain Resistance to all damage except Force for 1 minute.',
      descriptionLong: 'At the start of your turn, you can spend 3 Focus Points to give yourself Resistance to all damage except Force damage for 1 minute (or until you\'re Incapacitated). The ultimate Monk survival tool for a tough fight.',
      minLevel: 18,
      isPool: true,
    },
  ],

  Paladin: [
    {
      name: 'Lay on Hands',
      actionType: 'bonus',
      // v2.523.0 — Full richness pass. Healing pool = 5 x Paladin level,
      // refreshed on a Long Rest. 5 HP from the pool also ends one
      // disease or neutralizes one poison.
      description: (c: any) => {
        const pool = (c?.level ?? 1) * 5;
        return `Bonus Action: draw from a healing pool of ${pool} HP to restore Hit Points by touch. You can also spend 5 HP from the pool to end one Disease or neutralize one Poison.`;
      },
      descriptionLong: (c: any) => {
        const pool = (c?.level ?? 1) * 5;
        return `You have a pool of healing power equal to five times your Paladin level (currently ${pool} HP), refreshed on a Long Rest.\n\n• Bonus Action, touch: restore any number of Hit Points from the pool to a creature (not your own Undead/Construct).\n• Spend 5 HP from the pool instead to end one Disease or neutralize one Poison affecting the creature.\n\nThe pool replenishes fully on a Long Rest.`;
      },
      minLevel: 1,
      rest: 'long',
      maxUsesFn: (c: any) => (c?.level ?? 1) * 5,
      isPool: true,
    },
    {
      name: 'Divine Smite',
      actionType: 'bonus',
      // v2.523.0 — 2024: Divine Smite is a level-1 Paladin spell, cast as
      // a Bonus Action after a hit, scaling with slot level. We surface
      // it here as the always-available signature strike and show the
      // current min/max radiant dice.
      description: (c: any) => {
        const lvl = c?.level ?? 1;
        // Max slot level available scales the cap; base is 2d8, +1d8 per
        // slot level above 1st, capped at 5d8 (slot 4) +1d8 vs fiend/undead.
        const maxSlot = lvl >= 17 ? 5 : lvl >= 13 ? 4 : lvl >= 9 ? 3 : lvl >= 3 ? 2 : 1;
        const maxDice = Math.min(5, 1 + maxSlot); // 2d8 at slot1 ... 5d8 at slot4+
        return `Bonus Action after hitting with a melee weapon or Unarmed Strike: expend a spell slot to deal +2d8 Radiant damage (+1d8 per slot level above 1st, up to ${maxDice}d8; +1d8 extra vs Fiends and Undead).`;
      },
      descriptionLong: `Once per turn, immediately after you hit a target with a melee weapon or an Unarmed Strike, you can expend a spell slot to deal extra Radiant damage (this is the Divine Smite spell, cast as a Bonus Action).\n\n• Damage: 2d8 for a 1st-level slot, +1d8 for each slot level above 1st, to a maximum of 5d8.\n• +1d8 additional if the target is a Fiend or an Undead.\n\nBecause it's a spell in the 2024 rules, you can use it once per turn and it counts against the one-leveled-spell-per-turn rule.`,
      minLevel: 1,
    },
    {
      name: 'Channel Divinity',
      actionType: 'special',
      // v2.523.0 — Uses scale 1/2/3 at levels 3/7/11. 2024 base options:
      // Divine Sense and Abjure Foes (level 9), plus subclass options.
      description: (c: any) => {
        const uses = c?.level >= 11 ? 3 : c?.level >= 7 ? 2 : 1;
        return `Channel divine energy (${uses} use${uses === 1 ? '' : 's'} per Short/Long Rest) to fuel Divine Sense, Abjure Foes (level 9+), or your subclass options.`;
      },
      descriptionLong: (c: any) => {
        const uses = c?.level >= 11 ? 3 : c?.level >= 7 ? 2 : 1;
        const abjure = c?.level >= 9;
        return `You can channel divine energy ${uses} time(s) per Short or Long Rest (1 use at levels 3–6, 2 at 7–10, 3 at 11+).\n\nBase options:\n• Divine Sense — as a Bonus Action, know the location of Celestials, Fiends, and Undead within 60 ft, and learn their creature type, until the end of your next turn.${abjure ? '\n• Abjure Foes (level 9) — Magic action: up to your Charisma modifier of creatures within 60 ft must succeed on a Wisdom save or be Frightened (and unable to take Reactions) for 1 minute.' : ''}\n• Plus any options granted by your subclass (e.g. Sacred Weapon, Nature\'s Wrath).`;
      },
      minLevel: 3,
      rest: 'short',
      maxUsesFn: (c: any) => c?.level >= 11 ? 3 : c?.level >= 7 ? 2 : 1,
      save: { ability: 'WIS', dc: 'spell', targetMode: 'enemies' },
    },
    {
      name: 'Aura of Protection',
      actionType: 'free',
      // v2.523.0 — Aura grants a bonus to saves equal to CHA mod (min +1)
      // to you and allies within range. Range expands 10ft -> 30ft at 18.
      description: (c: any) => {
        const cha = Math.max(1, Math.floor(((c?.charisma ?? 10) - 10) / 2));
        const range = c?.level >= 18 ? 30 : 10;
        return `You and allies within ${range} ft gain a +${cha} bonus to all saving throws (equal to your Charisma modifier, minimum +1).`;
      },
      descriptionLong: (c: any) => {
        const cha = Math.max(1, Math.floor(((c?.charisma ?? 10) - 10) / 2));
        const range = c?.level >= 18 ? 30 : 10;
        return `While you\'re conscious, you and friendly creatures within ${range} ft of you gain a bonus to saving throws equal to your Charisma modifier (currently +${cha}, minimum +1).\n\nThe aura\'s radius is 10 ft (expanding to 30 ft at level 18 via Aura Expansion). This is the Paladin\'s defining party-buff — stacking with Aura of Courage (immunity to Frightened) at level 10.`;
      },
      minLevel: 6,
    },
    {
      name: 'Aura of Courage',
      actionType: 'free',
      description: (c: any) => {
        const range = c?.level >= 18 ? 30 : 10;
        return `You and allies within ${range} ft can\'t be Frightened while you\'re conscious.`;
      },
      descriptionLong: (c: any) => {
        const range = c?.level >= 18 ? 30 : 10;
        return `While you\'re conscious, you and friendly creatures within ${range} ft of you are immune to the Frightened condition. If an ally is already Frightened, they aren\'t affected by it while in the aura. Radius expands to 30 ft at level 18.`;
      },
      minLevel: 10,
    },
    {
      name: 'Radiant Strikes',
      actionType: 'free',
      description: 'Your melee weapon and Unarmed Strikes deal an extra 1d8 Radiant damage on a hit.',
      descriptionLong: 'Your strikes carry divine power. When you hit a target with a melee weapon or an Unarmed Strike, the target takes an extra 1d8 Radiant damage. This applies on every qualifying hit — no resource required — significantly raising your sustained damage.',
      minLevel: 11,
    },
  ],

  Ranger: [
    {
      name: "Hunter's Mark",
      actionType: 'bonus',
      // v2.524.0 — Full richness pass. Always-prepared; Favored Enemy
      // grants free casts that scale 2/3/4/5/6 at levels 1/5/9/13/17.
      // Extra damage die is 1d6 (rises to 1d10 at level 11 with no
      // dedicated feature, but RAW the die stays 1d6 — extra damage is
      // applied on each hit; Foe Slayer adds WIS at 18).
      description: (c: any) => {
        const lvl = c?.level ?? 1;
        const free = lvl >= 17 ? 6 : lvl >= 13 ? 5 : lvl >= 9 ? 4 : lvl >= 5 ? 3 : 2;
        return `Bonus Action: mark a creature you can see. Deal +1d6 damage to it on each weapon hit; Advantage to find it. Always prepared, and you can cast it ${free}× per Long Rest without a spell slot.`;
      },
      descriptionLong: (c: any) => {
        const lvl = c?.level ?? 1;
        const free = lvl >= 17 ? 6 : lvl >= 13 ? 5 : lvl >= 9 ? 4 : lvl >= 5 ? 3 : 2;
        const precise = lvl >= 17 ? '\n• Precise Hunter (level 17): you have Advantage on attack rolls against the marked creature.' : '';
        const foeSlayer = lvl >= 18 ? '\n• Foe Slayer (level 18): the extra damage die becomes 1d10 instead of 1d6.' : '';
        const die = lvl >= 18 ? '1d10' : '1d6';
        return `Hunter's Mark is always prepared and doesn't count against your prepared spells. Via Favored Enemy you can cast it ${free} times per Long Rest without expending a spell slot (free casts: 2 at levels 1-4, 3 at 5-8, 4 at 9-12, 5 at 13-16, 6 at 17+).\n\nWhile concentrating (up to 1 hour):\n• Deal an extra ${die} damage to the marked target on each hit with a weapon attack.\n• You have Advantage on Wisdom (Perception) and Wisdom (Survival) checks to find it.\n• Move the mark to a new creature as a Bonus Action if the target drops.${precise}${foeSlayer}`;
      },
      minLevel: 1,
      rest: 'long',
      maxUsesFn: (c: any) => c?.level >= 17 ? 6 : c?.level >= 13 ? 5 : c?.level >= 9 ? 4 : c?.level >= 5 ? 3 : 2,
    },
    {
      name: 'Deft Explorer',
      actionType: 'free',
      description: 'You gain Expertise in one skill, know an extra language, and are a master of wilderness travel.',
      descriptionLong: 'You have Expertise in one of your skill proficiencies (double proficiency bonus), and you learn two additional languages. Combined with Tireless and Roving, you become exceptional at exploration — fast, hard to exhaust, and skilled at navigating the wild.',
      minLevel: 2,
    },
    {
      name: 'Roving',
      actionType: 'free',
      description: 'Your Speed increases by 10 ft, and you gain a Climb Speed and a Swim Speed equal to your Speed.',
      descriptionLong: 'Your Speed increases by 10 feet while you aren\u2019t wearing Heavy armor, and you gain a Climb Speed and a Swim Speed equal to your Speed. You can traverse vertical and aquatic terrain as easily as open ground.',
      minLevel: 3,
    },
    {
      name: 'Extra Attack',
      actionType: 'free',
      description: 'When you take the Attack action, you can attack twice instead of once.',
      descriptionLong: 'When you take the Attack action on your turn, you can make two attacks instead of one. Pairs with Hunter\u2019s Mark to apply the bonus damage die on each hit.',
      minLevel: 5,
    },
    {
      name: 'Tireless',
      actionType: 'action',
      // v2.524.0 — Magic action to grant self temp HP = 1d8 + WIS mod,
      // WIS-mod times per Long Rest; also reduces Exhaustion on a Short Rest.
      description: (c: any) => {
        const wis = Math.max(1, Math.floor(((c?.wisdom ?? 10) - 10) / 2));
        return `Magic Action: give yourself 1d8 + ${wis} Temporary Hit Points (${wis}× per Long Rest). Your Exhaustion also drops by 1 whenever you finish a Short Rest.`;
      },
      descriptionLong: (c: any) => {
        const wis = Math.max(1, Math.floor(((c?.wisdom ?? 10) - 10) / 2));
        return `As a Magic Action, you can give yourself Temporary Hit Points equal to 1d8 + your Wisdom modifier (currently 1d8 + ${wis}). You can use this ${wis} time(s) (equal to your Wisdom modifier, minimum once) per Long Rest.\n\nIn addition, whenever you finish a Short Rest, your Exhaustion level decreases by 1.`;
      },
      minLevel: 6,
      rest: 'long',
      maxUsesFn: (c: any) => Math.max(1, Math.floor(((c?.wisdom ?? 10) - 10) / 2)),
    },
    {
      name: "Nature's Veil",
      actionType: 'bonus',
      // v2.524.0 — Bonus Action invisibility until end of next turn,
      // WIS-mod times per Long Rest.
      description: (c: any) => {
        const wis = Math.max(1, Math.floor(((c?.wisdom ?? 10) - 10) / 2));
        return `Bonus Action: become Invisible until the end of your next turn. ${wis}× per Long Rest.`;
      },
      descriptionLong: (c: any) => {
        const wis = Math.max(1, Math.floor(((c?.wisdom ?? 10) - 10) / 2));
        return `As a Bonus Action, you draw on the spirits of nature to become Invisible, along with any equipment you are wearing or carrying, until the end of your next turn.\n\nYou can use this ${wis} time(s) (equal to your Wisdom modifier, minimum once) per Long Rest. Excellent for repositioning, escaping, or setting up an Advantage attack.`;
      },
      minLevel: 7,
      rest: 'long',
      maxUsesFn: (c: any) => Math.max(1, Math.floor(((c?.wisdom ?? 10) - 10) / 2)),
    },
  ],

  Rogue: [
    {
      name: 'Sneak Attack',
      actionType: 'free',
      // v2.525.0 — Full richness pass. Keep the {{sneak_dice}} placeholder
      // in the short description (ClassAbilitiesSection substitutes it with
      // Math.ceil(level/2)); add a dynamic descriptionLong that shows the
      // actual dice + the trigger conditions in full.
      description: 'Once per turn, deal extra damage when you have Advantage on the attack roll OR an ally is adjacent to your target (and you don\u2019t have Disadvantage). Current: {{sneak_dice}}d6.',
      descriptionLong: (c: any) => {
        const dice = Math.ceil((c?.level ?? 1) / 2);
        return `Once per turn, you can deal an extra ${dice}d6 damage to one creature you hit with an attack if you have Advantage on the attack roll, using a Finesse or Ranged weapon. You don\u2019t need Advantage if another enemy of the target is within 5 ft of it, that enemy isn\u2019t Incapacitated, and you don\u2019t have Disadvantage on the roll.\n\nSneak Attack damage scales to ${dice}d6 at your level (1d6 at levels 1\u20132, rising by 1d6 every two levels to 10d6 at level 19\u201320). From level 5, you can trade Sneak Attack dice for Cunning Strike effects.`;
      },
      minLevel: 1,
    },
    {
      name: 'Cunning Action',
      actionType: 'bonus',
      description: 'Take the Dash, Disengage, or Hide action as a Bonus Action.',
      descriptionLong: 'On each of your turns, you can use a Bonus Action to take the Dash, Disengage, or Hide action. This is what makes the Rogue so mobile and slippery \u2014 dart in, strike, and vanish in a single turn.',
      minLevel: 2,
    },
    {
      name: 'Steady Aim',
      actionType: 'bonus',
      // v2.525.0 — New 2024 level-3 feature. Bonus Action: gain Advantage
      // on your next attack this turn, but your Speed becomes 0 until the
      // end of the turn. Reliable Sneak Attack enabler.
      description: 'Bonus Action: gain Advantage on your next attack roll this turn. Your Speed becomes 0 until the end of the turn.',
      descriptionLong: 'As a Bonus Action, you give yourself Advantage on your next attack roll on the current turn. You can use this only if you haven\u2019t moved during this turn, and after you use it, your Speed is 0 until the end of the turn. A dependable way to guarantee Sneak Attack when no ally is in position.',
      minLevel: 3,
    },
    {
      name: 'Cunning Strike',
      actionType: 'free',
      // v2.525.0 — New 2024 level-5 feature. Spend Sneak Attack dice to add
      // effects. Improved at 11 (two effects) and Devious Strikes at 14.
      description: (c: any) => {
        const improved = c?.level >= 11;
        return `When you deal Sneak Attack damage, you can forgo some of the dice to add an effect: Poison (1d6, CON save or Poisoned), Trip (1d6, DEX save or Prone), or Withdraw (1d6, move without provoking).${improved ? ' You can apply two different effects (Improved Cunning Strike).' : ''}`;
      },
      descriptionLong: (c: any) => {
        const improved = c?.level >= 11;
        const devious = c?.level >= 14;
        return `When you deal Sneak Attack damage, you can forgo some of the dice to add a Cunning Strike effect (each costs 1d6 of Sneak Attack):\n\n• Poison \u2014 the target makes a Constitution save or is Poisoned for 1 minute.\n• Trip \u2014 the target makes a Dexterity save or is knocked Prone (target must be Large or smaller).\n• Withdraw \u2014 you move up to half your Speed without provoking Opportunity Attacks.${devious ? '\n\nDevious Strikes (level 14): you also unlock Daze, Knock Out, and Obscure \u2014 stronger effects costing more dice.' : ''}\n\n${improved ? 'Improved Cunning Strike (level 11): you can apply two different effects with one Sneak Attack (paying the dice cost of each).' : 'At level 11 (Improved Cunning Strike) you can apply two effects at once.'} The save DC equals 8 + your proficiency bonus + your Dexterity modifier.`;
      },
      minLevel: 5,
      save: { ability: 'CON', dc: 'spell', targetMode: 'enemies' },
    },
    {
      name: 'Uncanny Dodge',
      actionType: 'reaction',
      description: 'Reaction when an attacker you can see hits you: halve the attack\u2019s damage against you.',
      descriptionLong: 'When an attacker you can see hits you with an attack roll, you can use your Reaction to halve the attack\u2019s damage against you (rounded down). A reliable way to survive a big hit \u2014 especially against a critical.',
      minLevel: 5,
    },
    {
      name: 'Evasion',
      actionType: 'free',
      description: 'When you make a Dexterity save to take half damage, you instead take no damage on a success and only half on a failure.',
      descriptionLong: 'When you\u2019re subjected to an effect that allows a Dexterity saving throw to take only half damage (such as Fireball), you take no damage on a success and only half damage on a failure. You can\u2019t use this while Incapacitated.',
      minLevel: 7,
    },
    {
      name: 'Reliable Talent',
      actionType: 'free',
      description: 'When you make an ability check using a skill or tool you have proficiency in, treat any d20 roll of 9 or lower as a 10.',
      descriptionLong: 'Whenever you make an ability check that uses a skill or tool proficiency, you can treat a d20 roll of 9 or lower as a 10. Your floor on a proficient check becomes 10 + your bonuses \u2014 you essentially can\u2019t fumble what you\u2019re trained in.',
      minLevel: 7,
    },
    {
      name: 'Slippery Mind',
      actionType: 'free',
      description: 'You gain proficiency in Wisdom and Charisma saving throws.',
      descriptionLong: 'You gain proficiency in Wisdom and Charisma saving throws, shoring up two of the most commonly targeted mental saves. Combined with Evasion and your Dexterity-save proficiency, you become resilient against most save-or-suffer effects.',
      minLevel: 15,
    },
    {
      name: 'Elusive',
      actionType: 'free',
      description: 'No attack roll has Advantage against you while you aren\u2019t Incapacitated.',
      descriptionLong: 'No attack roll has Advantage against you while you aren\u2019t Incapacitated. Flanking, hidden attackers, and most Advantage tricks simply don\u2019t work on you \u2014 a major defensive boost at high levels.',
      minLevel: 18,
    },
    {
      name: 'Stroke of Luck',
      actionType: 'free',
      description: 'Turn a missed attack into a hit, or a failed ability check into a success (treat the d20 as a 20). Once per Short or Long Rest.',
      descriptionLong: 'If your attack roll misses a target within range, you can turn the miss into a hit. Alternatively, if you fail an ability check, you can treat the d20 roll as a 20. Once you use this feature, you can\u2019t use it again until you finish a Short or Long Rest. The ultimate clutch button.',
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
    // v2.368.0 — Removed bogus 'Telekinesis' entry that previously sat
    // between Psionic Energy Dice and Subtle Telekinesis. Telekinesis is
    // a level-5 spell (src/data/spells.ts line 3949, classes include
    // 'Psion'), not a class ability — having it here caused the spell
    // to appear twice for Psions (once on Spells tab via the real spell,
    // once on Actions tab as a fake class ability) and the duplicate had
    // a STR save flow that doesn't match the real spell's STR contest
    // mechanic. The real spell renders correctly on the Spells tab.
    // v2.187.0 — Phase Q.0 pt 28: Subtle Telekinesis is a base Psion class
    // feature (not subclass). Cast Mage Hand at-will but invisible. No PED
    // cost. Surfaces here so the player can see + click "Use" to log it.
    {
      name: 'Subtle Telekinesis',
      actionType: 'action',
      description: 'Cast Mage Hand at will. The hand is invisible.',
      descriptionLong: 'You can cast Mage Hand without expending a spell slot or material components, and the spectral hand is invisible. The hand can interact with objects, push or pull, and carry items as normal — but onlookers see only the items moving on their own. Useful for stealth, infiltration, or unsettling NPCs.',
      minLevel: 1,
      range: '30 ft',
    },
    // v2.369.0 — Backfilled the missing base-class abilities. Both
    // Telekinetic Propel and Telepathic Connection are level-1 features
    // per classFeatures.ts line 343 ("Psionic Power"); pre-v2.369 they
    // existed only in description text with no clickable row, so the
    // user had no way to use them through the UI. Telekinetic Propel
    // also has a STR save when used with a die — wired through the
    // v2.247 save resolver so it prompts for a target with the proper
    // save flow. The free 5ft push/pull (no die spent) is described
    // in the long text since it doesn't need a save.
    {
      name: 'Telekinetic Propel',
      actionType: 'bonus',
      description: 'Push or pull a creature within 30 ft. Free 5 ft, or spend 1 PED to move it die × 5 ft (STR save negates).',
      descriptionLong: 'Bonus Action. Choose a creature you can see within 30 ft of you.\n\n• Free version (no die spent): the creature is pushed or pulled 5 ft in any direction. No saving throw — but you can\'t move targets larger than Large.\n\n• Powered version: spend 1 Psionic Energy Die. The target must succeed on a Strength saving throw against your spell save DC or be pushed or pulled a number of feet equal to the die roll × 5 (and ignores the size cap). On a successful save, no movement.\n\nAt level 3+ a Psi Warper unlocks Warp Propel: when the powered version succeeds, you may teleport the target instead of pushing.',
      minLevel: 1,
      range: '30 ft',
      // STR save only fires on the powered (PED-spent) version. The Use
      // button always opens the save resolver; for the free version the
      // DM can mark "Auto-Fail" on every target since there is no save.
      // Free vs powered toggle isn't modeled yet — costs default to 0
      // unless the player explicitly types in a die count via cost arg.
      save: { ability: 'STR', dc: 'spell', targetMode: 'any' },
    },
    {
      name: 'Telepathic Connection',
      actionType: 'bonus',
      description: 'Establish telepathy within 30 ft. Spend 1 PED to extend range by die × 10 ft for 1 hour.',
      descriptionLong: 'Bonus Action. Choose one creature you can see within 30 ft of you. You can speak to that creature telepathically (one-way) for 1 hour.\n\nSpend 1 Psionic Energy Die: extend the range by the die roll × 10 ft. The connection lasts 1 hour and ends early if you become incapacitated.\n\nThe target doesn\'t have to share a language with you, but it has to be able to understand at least one language.',
      minLevel: 1,
      range: '30 ft',
      // No save — telepathic connection is one-way and the target
      // doesn't get a chance to refuse per UA RAW.
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
      range: '30 ft',
    },
    {
      name: 'Warp Propel',
      actionType: 'special',
      description: 'When a target fails the save vs Telekinetic Propel, teleport it to an unoccupied space within 30 ft instead of pushing.',
      descriptionLong: 'Modifies your Telekinetic Propel feature. When a target fails the saving throw against Telekinetic Propel, you can choose to teleport the target to an unoccupied space you can see within 30 ft of where it was, instead of pushing it. The teleported target lands prone.\n\nCombines with Mass Teleportation at level 14.',
      minLevel: 3,
      range: '30 ft',
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
      range: '60 ft',
      // v2.369.0 — Shatter's CON save vs spell save DC. AoE; targetMode
      // 'any' lets the picker include allies in the radius.
      save: { ability: 'CON', dc: 'spell', targetMode: 'any' },
    },
    {
      name: 'Teleporter Combat',
      actionType: 'bonus',
      description: 'After casting Misty Step, immediately cast a Psion cantrip (action casting time) as part of the same Bonus Action.',
      descriptionLong: 'When you cast Misty Step (whether via spell slot or via your Free Misty Step feature), you may immediately cast one Psion cantrip with an Action casting time as part of the same Bonus Action — without taking a separate Action.\n\nThis effectively lets you teleport and attack in the same turn while keeping your Action free for Dash, Dodge, or another use.',
      minLevel: 6,
      range: 'Self',
    },
    {
      name: 'Duplicitous Target',
      actionType: 'reaction',
      description: 'Reaction: when attacked, spend 1 PED to swap places with a willing ally within 30 ft. Attack hits them instead.',
      descriptionLong: 'When a creature you can see attacks you, you can use your Reaction and spend 1 Psionic Energy Die to swap places with a willing ally within 30 ft. The ally takes the attack instead of you.\n\nThe ally must be willing — you can\'t involuntarily swap with an unwilling target. Both you and the ally must have line of sight to each other and there must be no full cover between you.',
      minLevel: 10,
      pedCost: 1,
      range: '30 ft',
    },
    {
      name: 'Mass Teleportation',
      actionType: 'action',
      description: 'Magic action: spend 4 PED. Teleport up to INT mod creatures within 30 ft to spaces within 150 ft. Unwilling targets WIS save.',
      descriptionLong: 'Take a Magic action and spend 4 Psionic Energy Dice. Choose up to a number of creatures equal to your Intelligence modifier (minimum 1) within 30 ft of you. You teleport each chosen creature to an unoccupied space you can see within 150 ft.\n\nWilling targets are simply moved. Unwilling targets must succeed on a Wisdom saving throw against your spell save DC or be teleported anyway.\n\nYou may include yourself among the chosen targets.',
      minLevel: 14,
      pedCost: 4,
      range: '30/150 ft',
      // v2.369.0 — WIS save fires for unwilling targets only. targetMode
      // 'any' so the picker exposes Auto-Pass: the DM marks willing
      // allies as willing → no save rolled, they teleport. Unwilling
      // creatures roll the save normally.
      save: { ability: 'WIS', dc: 'spell', targetMode: 'any' },
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
