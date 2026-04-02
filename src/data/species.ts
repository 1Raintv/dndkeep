import type { SpeciesData } from '../types';

export const SPECIES: SpeciesData[] = [
  {
    name: 'Human',
    size: 'Medium', speed: 30, darkvision: 0,
    languages: ['Common', 'One language of your choice'],
    traits: [
      { name: 'Resourceful', description: 'You gain Heroic Inspiration whenever you finish a Long Rest.' },
      { name: 'Skillful', description: 'You gain proficiency in one skill of your choice.' },
      { name: 'Versatile', description: "You gain an Origin feat of your choice. Consult the Player's Handbook for feat options." },
    ],
  },
  {
    name: 'Elf',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common', 'Elvish'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Elven Lineage', description: "You are part of a lineage granting supernatural abilities. Choose Drow (Faerie Fire at 3rd, Darkness at 5th), High Elf (Detect Magic at 3rd, Misty Step at 5th), or Wood Elf (Speak with Animals at 3rd, Pass without Trace at 5th)." },
      { name: 'Fey Ancestry', description: 'You have advantage on saving throws to avoid or end the Charmed condition.' },
      { name: 'Keen Senses', description: 'You have proficiency in the Perception skill.' },
      { name: 'Trance', description: "You don't need to sleep. You meditate deeply for 4 hours a day, gaining the benefit of 8 hours of sleep." },
    ],
  },
  {
    name: 'Dwarf',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common', 'Dwarvish'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Dwarven Resilience', description: 'You have advantage on saving throws against poison, and resistance to Poison damage.' },
      { name: 'Dwarven Toughness', description: 'Your Hit Point maximum increases by 1, and again whenever you gain a level.' },
      { name: 'Stonecunning', description: 'As a Bonus Action, gain Tremorsense 60 ft for 10 minutes (must be on or touching stone). Uses equal proficiency bonus, recharges on Short or Long Rest.' },
    ],
  },
  {
    name: 'Halfling',
    size: 'Small', speed: 30, darkvision: 0,
    languages: ['Common', 'Halfling'],
    traits: [
      { name: 'Brave', description: 'You have advantage on saving throws to avoid or end the Frightened condition.' },
      { name: 'Halfling Nimbleness', description: 'You can move through the space of any creature that is a size larger than you.' },
      { name: 'Luck', description: 'When you roll a 1 on a d20 for a D20 Test, you can reroll the die and must use the new roll.' },
      { name: 'Naturally Stealthy', description: 'You can take the Hide action even when obscured only by a creature at least one size larger than you.' },
    ],
  },
  {
    name: 'Gnome',
    size: 'Small', speed: 30, darkvision: 60,
    languages: ['Common', 'Gnomish'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Gnomish Cunning', description: 'You have advantage on Intelligence, Wisdom, and Charisma saving throws.' },
      { name: 'Gnomish Lineage', description: "Choose Forest Gnome (Minor Illusion cantrip, Speak with Animals 1/day), Rock Gnome (Mending and Prestidigitation, proficiency with Tinker's Tools), or Svirfneblin (Blindsight 10 ft, Disguise Self 1/day, Nondetection on self always)." },
    ],
  },
  {
    name: 'Half-Elf',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common', 'Elvish', 'One language of your choice'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Fey Ancestry', description: "You have advantage on saving throws against being charmed, and magic can't put you to sleep." },
      { name: 'Keen Senses', description: 'You have proficiency in the Perception skill.' },
      { name: 'Skill Versatility', description: 'You gain proficiency in two skills of your choice.' },
    ],
  },
  {
    name: 'Tiefling',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common', 'Infernal'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Fiendish Legacy', description: 'Choose a legacy: Abyssal (Poison Spray, Ray of Sickness at 3rd, Hold Person at 5th), Chthonic (Chill Touch, False Life at 3rd, Ray of Enfeeblement at 5th), or Infernal (Fire Bolt, Hellish Rebuke at 3rd, Darkness at 5th).' },
      { name: 'Otherworldly Presence', description: 'You know the Thaumaturgy cantrip. Charisma is your spellcasting ability for it.' },
    ],
  },
  {
    name: 'Dragonborn',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common', 'Draconic'],
    traits: [
      { name: 'Draconic Ancestry', description: 'Choose a dragon type (Black, Blue, Brass, Bronze, Copper, Gold, Green, Red, Silver, or White). This determines your Breath Weapon damage type and Damage Resistance.' },
      { name: 'Breath Weapon', description: 'As a Bonus Action, exhale destructive energy (15-ft cone or 30-ft line). Dexterity save (DC 8 + CON mod + Prof Bonus). Fail: 1d10 damage (your type), scaling to 4d10 at 17th level. Uses equal to Proficiency Bonus per Long Rest.' },
      { name: 'Damage Resistance', description: 'You have resistance to the damage type associated with your Draconic Ancestry.' },
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light.' },
      { name: 'Draconic Flight', description: 'At 5th level, you can use a Bonus Action to manifest spectral wings, gaining a flying speed equal to your walking speed for 10 minutes. Once per Long Rest.' },
    ],
  },
  {
    name: 'Half-Orc',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common', 'Orc'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Adrenaline Rush', description: 'You can take the Dash action as a Bonus Action. When you do, you gain Temporary Hit Points equal to your Proficiency Bonus. Uses equal to Proficiency Bonus per Short or Long Rest.' },
      { name: 'Powerful Build', description: 'You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.' },
      { name: 'Relentless Endurance', description: 'When reduced to 0 HP but not killed outright, you can drop to 1 HP instead. Once per Long Rest.' },
    ],
  },
  {
    name: 'Aasimar',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Celestial Resistance', description: 'You have resistance to Necrotic damage and Radiant damage.' },
      { name: 'Healing Hands', description: 'As an Action, touch a creature and roll a number of d4s equal to your Proficiency Bonus. The creature regains HP equal to the total. Once per Long Rest.' },
      { name: 'Light Bearer', description: 'You know the Light cantrip. Charisma is your spellcasting ability for it.' },
      { name: 'Celestial Revelation', description: 'At 3rd level, use a Bonus Action to unleash celestial energy for 1 minute: Heavenly Wings (fly speed = walk speed), Inner Radiance (bright light 10 ft, enemies take Radiant damage), or Necrotic Shroud (frighten enemies within 10 ft). Once per Long Rest.' },
    ],
  },
  {
    name: 'Orc',
    size: 'Medium', speed: 30, darkvision: 120,
    languages: ['Common', 'Orc'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 120 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Adrenaline Rush', description: 'You can take the Dash action as a Bonus Action. When you do, you gain Temporary Hit Points equal to your Proficiency Bonus. Uses equal to Proficiency Bonus per Short or Long Rest.' },
      { name: 'Powerful Build', description: 'You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.' },
      { name: 'Relentless Endurance', description: 'When reduced to 0 HP but not killed outright, you can drop to 1 HP instead. Once per Long Rest.' },
    ],
  },
  {
    name: 'Goliath',
    size: 'Medium', speed: 35, darkvision: 0,
    languages: ['Common', 'Giant'],
    traits: [
      { name: 'Large Form', description: 'Starting at 5th level, you can change your size to Large as a Bonus Action if you\'re in a big enough space. This lasts until you return to Medium as a Bonus Action or until you die. Once per Long Rest.' },
      { name: 'Little Giant', description: 'You have proficiency in the Athletics skill, and you count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.' },
      { name: 'Mountain Born', description: 'You\'re acclimated to high altitude, including elevations above 20,000 feet. You also naturally adapted to cold climates (as per the Dungeon Master\'s Guide).' },
      { name: 'Stone\'s Endurance', description: 'When you take damage, you can use your Reaction to roll a d12 and add your Constitution modifier. Reduce the damage taken by the total. Uses equal to Proficiency Bonus per Long Rest.' },
    ],
  },
  {
    name: 'Tabaxi',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common', 'One of your choice'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Cat\'s Claws', description: 'You have retractable claws. Climb speed equal to your walking speed. Claws are natural weapons dealing 1d6 + Strength modifier Slashing damage.' },
      { name: 'Cat\'s Talent', description: 'You have proficiency in Perception and Stealth.' },
      { name: 'Feline Agility', description: 'Your reflexes let you move with a burst of speed. When you move on your turn, you can double your speed until the end of your turn. Once you do this, you can\'t do it again until you move 0 feet on one of your turns.' },
    ],
  },
  {
    name: 'Ardling',
    size: 'Medium', speed: 30, darkvision: 60,
    languages: ['Common', 'Celestial'],
    traits: [
      { name: 'Darkvision', description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.' },
      { name: 'Celestial Legacy', description: 'Choose an animal form: Elephant (Strength), Hippogriff (Dexterity), or Owl (Intelligence/Wisdom). You gain a trait, a 1st-level spell, and higher-level spells at levels 3 and 5 based on your choice. Charisma is your spellcasting ability.' },
      { name: 'Divine Magic', description: 'You know the Sacred Flame cantrip. At 3rd level you can cast Divine Favor once per Long Rest. At 5th level you can cast Lesser Restoration once per Long Rest.' },
      { name: 'Resistance', description: 'You have Resistance to Radiant damage.' },
    ],
  },
];

export const SPECIES_MAP: Record<string, SpeciesData> = Object.fromEntries(
  SPECIES.map(s => [s.name, s])
);
