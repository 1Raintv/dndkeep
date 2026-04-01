/**
 * Static options for interactive class choices.
 * Used by StepBuild to let players pick spells, cantrips, metamagic, etc.
 */

export const METAMAGIC_OPTIONS = [
  { id: 'careful', name: 'Careful Spell', cost: 1, description: 'Chosen creatures automatically succeed on saves against your spell.' },
  { id: 'distant', name: 'Distant Spell', cost: 1, description: 'Double the range of a spell, or make a touch spell reach 30ft.' },
  { id: 'empowered', name: 'Empowered Spell', cost: 1, description: 'Reroll up to your Charisma modifier damage dice (must keep new rolls).' },
  { id: 'extended', name: 'Extended Spell', cost: 1, description: 'Double the duration of a spell (max 24 hours).' },
  { id: 'heightened', name: 'Heightened Spell', cost: 3, description: 'One target of your spell has disadvantage on their first saving throw.' },
  { id: 'quickened', name: 'Quickened Spell', cost: 2, description: 'Cast a spell with a casting time of 1 action as a Bonus Action.' },
  { id: 'seeking', name: 'Seeking Spell', cost: 1, description: 'If you miss with a spell attack, you can reroll once. You must use the new roll.' },
  { id: 'subtle', name: 'Subtle Spell', cost: 1, description: 'Cast without Verbal or Somatic components — invisible to observers.' },
  { id: 'transmuted', name: 'Transmuted Spell', cost: 1, description: 'Change a spell\'s damage type: Acid, Cold, Fire, Lightning, Poison, or Thunder.' },
  { id: 'twinned', name: 'Twinned Spell', cost: '1/spell level', description: 'Target a second creature with a single-target spell that doesn\'t already affect multiple targets.' },
];

export const FIGHTING_STYLE_OPTIONS = [
  { id: 'archery', name: 'Archery', description: '+2 to attack rolls with ranged weapons.' },
  { id: 'defense', name: 'Defense', description: '+1 to AC while wearing armor.' },
  { id: 'dueling', name: 'Dueling', description: '+2 to damage when wielding a weapon in one hand and no other weapons.' },
  { id: 'gwf', name: 'Great Weapon Fighting', description: 'Reroll 1s and 2s on damage dice for two-handed or versatile weapons.' },
  { id: 'protection', name: 'Protection', description: 'Use your Reaction to impose disadvantage on an attack against a nearby ally (requires Shield).' },
  { id: 'interception', name: 'Interception', description: 'Reduce damage to a nearby ally by 1d10 + Proficiency Bonus as a Reaction.' },
  { id: 'two-weapon', name: 'Two-Weapon Fighting', description: 'Add your ability modifier to the damage of your off-hand attack.' },
  { id: 'thrown', name: 'Thrown Weapon Fighting', description: '+2 damage with thrown weapons. Draw thrown weapons as part of the attack.' },
  { id: 'blind', name: 'Blind Fighting', description: '10ft Blindsight — see invisible/hidden creatures within range.' },
  { id: 'unarmed', name: 'Unarmed Fighting', description: 'Unarmed strikes deal 1d6 (or 1d8 unarmed) + auto 1d4 to grappled creatures.' },
];

export const WARLOCK_INVOCATIONS = [
  { id: 'agonizing-blast', name: 'Agonizing Blast', prereq: 'Eldritch Blast cantrip', description: 'Add Charisma modifier to Eldritch Blast damage.' },
  { id: 'armor-of-shadows', name: 'Armor of Shadows', prereq: null, description: 'Cast Mage Armor on yourself at will without expending a spell slot.' },
  { id: 'beast-speech', name: 'Beast Speech', prereq: null, description: 'Cast Speak with Animals at will without expending a spell slot.' },
  { id: 'beguiling-influence', name: 'Beguiling Influence', prereq: null, description: 'Gain proficiency in Deception and Persuasion.' },
  { id: 'book-of-ancient-secrets', name: 'Book of Ancient Secrets', prereq: 'Pact of the Tome', description: 'Write rituals into your Book of Shadows and cast them.' },
  { id: 'devils-sight', name: "Devil's Sight", prereq: null, description: 'See normally in darkness, magical or otherwise, to a range of 120ft.' },
  { id: 'eldritch-mind', name: 'Eldritch Mind', prereq: null, description: 'Advantage on Concentration saving throws.' },
  { id: 'eldritch-sight', name: 'Eldritch Sight', prereq: null, description: 'Cast Detect Magic at will without expending a spell slot.' },
  { id: 'eldritch-spear', name: 'Eldritch Spear', prereq: 'Eldritch Blast cantrip', description: 'Range of Eldritch Blast becomes 300 feet.' },
  { id: 'eyes-of-the-runekeeper', name: 'Eyes of the Rune Keeper', prereq: null, description: 'Read all writing.' },
  { id: 'fiendish-vigor', name: 'Fiendish Vigor', prereq: null, description: 'Cast False Life on yourself at will as a 1st-level spell without expending a spell slot.' },
  { id: 'gaze-of-two-minds', name: 'Gaze of Two Minds', prereq: null, description: 'Use your action to touch a willing humanoid and perceive through their senses until start of your next turn.' },
  { id: 'mask-of-many-faces', name: 'Mask of Many Faces', prereq: null, description: 'Cast Disguise Self at will without expending a spell slot.' },
  { id: 'misty-visions', name: 'Misty Visions', prereq: null, description: 'Cast Silent Image at will without expending a spell slot.' },
  { id: 'one-with-shadows', name: 'One with Shadows', prereq: null, description: 'When in dim light or darkness, use your action to become invisible until you move or take an action.' },
  { id: 'repelling-blast', name: 'Repelling Blast', prereq: 'Eldritch Blast cantrip', description: 'When you hit with Eldritch Blast, push the creature up to 10ft away.' },
  { id: 'thief-of-five-fates', name: 'Thief of Five Fates', prereq: null, description: 'Cast Bane once using a Warlock spell slot. Regain on Long Rest.' },
  { id: 'thirsting-blade', name: 'Thirsting Blade', prereq: 'Level 5, Pact of the Blade', description: 'Attack twice with your pact weapon.' },
];

export const EXPERTISE_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

export const DIVINE_ORDERS = [
  { id: 'protective', name: 'Protective', description: 'Trained with martial weapons and heavy armor.' },
  { id: 'thaumaturge', name: 'Thaumaturge', description: 'Learn one extra Cleric cantrip and one extra prepared spell from your domain.' },
];

export const PRIMAL_ORDERS = [
  { id: 'magician', name: 'Magician', description: 'Learn one extra Druid cantrip and keep your Wildshape uses longer.' },
  { id: 'warden', name: 'Warden', description: 'Trained with martial weapons and medium armor.' },
];
