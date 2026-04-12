import type { Character } from '../types';

export type ActionType = 'action' | 'bonus' | 'reaction' | 'special' | 'free';

export interface ClassAbility {
  name: string;
  actionType: ActionType;
  description: string | ((character: any) => string);
  minLevel: number;
  maxUsesFn?: (c: Character) => number;
  rest?: 'short' | 'long';
  /** If true, it's a resource pool (uses cost, not limited total uses) */
  isPool?: boolean;
  psionicDie?: boolean;  // rolls correct die size on spend
}

function cha(c: Character) { return Math.floor((c.charisma - 10) / 2); }
function wis(c: Character) { return Math.floor((c.wisdom - 10) / 2); }
function prof(c: Character) { return c.proficiency_bonus ?? 2; }

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
      description: (c: any) => {
        const level = c?.level ?? 1;
        const die = level >= 17 ? 'd12' : level >= 11 ? 'd10' : level >= 5 ? 'd8' : 'd6';
        const count = level >= 17 ? 12 : level >= 13 ? 10 : level >= 9 ? 8 : level >= 5 ? 6 : 4;
        return `You have ${count} Psionic Energy Dice (${die} at level ${level}). Die size: d6 (lv 1–4) → d8 (lv 5–10) → d10 (lv 11–16) → d12 (lv 17+). Regain 1 die on Short Rest, all ${count} on Long Rest.`;
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
