import type { SpeciesData } from '../types';

export const SPECIES: SpeciesData[] = [
  {
    name: 'Human',
    size: 'Medium',
    speed: 30,
    darkvision: 0,
    languages: ['Common', 'One language of your choice'],
    traits: [
      {
        name: 'Resourceful',
        description: 'You gain Heroic Inspiration whenever you finish a Long Rest.',
      },
      {
        name: 'Skillful',
        description: 'You gain proficiency in one skill of your choice.',
      },
      {
        name: 'Versatile',
        description:
          'You gain an Origin feat of your choice. Consult the Player\'s Handbook for feat options.',
      },
    ],
  },
  {
    name: 'Elf',
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Elvish'],
    traits: [
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
      },
      {
        name: 'Elven Lineage',
        description:
          'You are part of a lineage that grants you supernatural abilities. Choose a lineage: Drow (Faerie Fire at level 3, Darkness at level 5), High Elf (Detect Magic at level 3, Misty Step at level 5), or Wood Elf (Speak with Animals at level 3, Pass without Trace at level 5).',
      },
      {
        name: 'Fey Ancestry',
        description: 'You have advantage on saving throws to avoid or end the Charmed condition.',
      },
      {
        name: 'Keen Senses',
        description: 'You have proficiency in the Perception skill.',
      },
      {
        name: 'Trance',
        description:
          'You don\'t need to sleep. Instead you meditate deeply for 4 hours a day. After resting this way, you gain the same benefit a human does from 8 hours of sleep.',
      },
    ],
  },
  {
    name: 'Dwarf',
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Dwarvish'],
    traits: [
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
      },
      {
        name: 'Dwarven Resilience',
        description:
          'You have advantage on saving throws against poison, and you have resistance against Poison damage.',
      },
      {
        name: 'Dwarven Toughness',
        description: 'Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level.',
      },
      {
        name: 'Stonecunning',
        description:
          'As a Bonus Action, you gain Tremorsense with a range of 60 feet for 10 minutes. You must be on a stone surface or touching a stone surface to use this Tremorsense. The stone can be any composition, including worked stone. You can\'t use this trait again until you finish a Short or Long Rest.',
      },
    ],
  },
  {
    name: 'Halfling',
    size: 'Small',
    speed: 30,
    darkvision: 0,
    languages: ['Common', 'Halfling'],
    traits: [
      {
        name: 'Brave',
        description: 'You have advantage on saving throws to avoid or end the Frightened condition.',
      },
      {
        name: 'Halfling Nimbleness',
        description: 'You can move through the space of any creature that is a size larger than you.',
      },
      {
        name: 'Luck',
        description:
          'When you roll a 1 on the d20 for a D20 Test, you can reroll the die, and you must use the new roll.',
      },
      {
        name: 'Naturally Stealthy',
        description:
          'You can take the Hide action even when you are obscured only by a creature that is at least one size larger than you.',
      },
    ],
  },
  {
    name: 'Gnome',
    size: 'Small',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Gnomish'],
    traits: [
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
      },
      {
        name: 'Gnomish Cunning',
        description: 'You have advantage on Intelligence, Wisdom, and Charisma saving throws.',
      },
      {
        name: 'Gnomish Lineage',
        description:
          'You are part of a magical lineage. Choose Forest Gnome (Minor Illusion cantrip, Speak with Animals 1/day), Rock Gnome (Mending and Prestidigitation cantrips, proficiency with Tinker\'s Tools), or Svirfneblin (Blindsight 10 ft, Disguise Self 1/day, Nondetection always active on self).',
      },
    ],
  },
  {
    name: 'Half-Elf',
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Elvish', 'One language of your choice'],
    traits: [
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
      },
      {
        name: 'Fey Ancestry',
        description: 'You have advantage on saving throws against being charmed, and magic can\'t put you to sleep.',
      },
      {
        name: 'Keen Senses',
        description: 'You have proficiency in the Perception skill.',
      },
      {
        name: 'Skill Versatility',
        description: 'You gain proficiency in two skills of your choice.',
      },
    ],
  },
  {
    name: 'Tiefling',
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Infernal'],
    traits: [
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
      },
      {
        name: 'Fiendish Legacy',
        description:
          'Choose a legacy: Abyssal (Poison Spray cantrip, Ray of Sickness at level 3, Hold Person at level 5), Chthonic (Chill Touch cantrip, False Life at level 3, Ray of Enfeeblement at level 5), or Infernal (Fire Bolt cantrip, Hellish Rebuke at level 3, Darkness at level 5).',
      },
      {
        name: 'Otherworldly Presence',
        description: 'You know the Thaumaturgy cantrip. Charisma is your spellcasting ability for it.',
      },
    ],
  },
  {
    name: 'Dragonborn',
    size: 'Medium',
    speed: 30,
    darkvision: 0,
    languages: ['Common', 'Draconic'],
    traits: [
      {
        name: 'Draconic Ancestry',
        description:
          'Your lineage stems from a dragon. Choose a dragon type (Black, Blue, Brass, Bronze, Copper, Gold, Green, Red, Silver, or White). This determines your Breath Weapon damage type and Damage Resistance.',
      },
      {
        name: 'Breath Weapon',
        description:
          'As a Bonus Action, you can exhale destructive energy in a 15-foot cone (or 30-foot line for some lineages). Each creature in that area must succeed on a Dexterity saving throw (DC = 8 + CON modifier + Proficiency Bonus). On a failure it takes 1d10 damage (your ancestry type). Damage increases to 2d10 at level 5, 3d10 at level 11, and 4d10 at level 17. You can use this a number of times equal to your Proficiency Bonus, regaining all uses on a Long Rest.',
      },
      {
        name: 'Damage Resistance',
        description: 'You have resistance to the damage type associated with your Draconic Ancestry.',
      },
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light.',
      },
    ],
  },
  {
    name: 'Half-Orc',
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Orc'],
    traits: [
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
      },
      {
        name: 'Adrenaline Rush',
        description:
          'You can take the Dash action as a Bonus Action. When you do so, you gain a number of Temporary Hit Points equal to your Proficiency Bonus. You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest.',
      },
      {
        name: 'Powerful Build',
        description:
          'You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.',
      },
      {
        name: 'Relentless Endurance',
        description:
          'When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once you use this trait, you can\'t use it again until you finish a Long Rest.',
      },
    ],
  },
];

export const SPECIES_MAP: Record<string, SpeciesData> = Object.fromEntries(
  SPECIES.map(s => [s.name, s])
);
