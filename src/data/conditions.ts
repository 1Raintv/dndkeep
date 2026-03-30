import type { ConditionData } from '../types';

export const CONDITIONS: ConditionData[] = [
  {
    name: 'Blinded',
    description: 'A blinded creature can\'t see.',
    effects: [
      'Automatically fails any ability check requiring sight.',
      'Attack rolls against the creature have advantage.',
      'The creature\'s attack rolls have disadvantage.',
    ],
  },
  {
    name: 'Charmed',
    description: 'A charmed creature regards the charmer as a trusted friend.',
    effects: [
      'Can\'t attack the charmer or target the charmer with harmful abilities or effects.',
      'The charmer has advantage on ability checks to interact socially with the creature.',
    ],
  },
  {
    name: 'Deafened',
    description: 'A deafened creature can\'t hear.',
    effects: [
      'Automatically fails any ability check requiring hearing.',
    ],
  },
  {
    name: 'Exhaustion',
    description: 'Exhaustion is measured in six levels. Effects are cumulative.',
    effects: [
      'Level 1: Disadvantage on ability checks.',
      'Level 2: Speed halved.',
      'Level 3: Disadvantage on attack rolls and saving throws.',
      'Level 4: Hit point maximum halved.',
      'Level 5: Speed reduced to 0.',
      'Level 6: Death.',
    ],
  },
  {
    name: 'Frightened',
    description: 'A frightened creature is afraid of a specific source.',
    effects: [
      'Disadvantage on ability checks and attack rolls while the source of fear is in line of sight.',
      'Can\'t willingly move closer to the source of its fear.',
    ],
  },
  {
    name: 'Grappled',
    description: 'A grappled creature is restrained by a grappler.',
    effects: [
      'Speed becomes 0 and can\'t benefit from bonuses to speed.',
      'The condition ends if the grappler is incapacitated.',
      'The condition ends if the creature is removed from reach of the grappler.',
    ],
  },
  {
    name: 'Incapacitated',
    description: 'An incapacitated creature can\'t take actions or reactions.',
    effects: [
      'Can\'t take actions.',
      'Can\'t take reactions.',
    ],
  },
  {
    name: 'Invisible',
    description: 'An invisible creature is impossible to see without special means.',
    effects: [
      'Impossible to see without magic or special sense. Considered heavily obscured for hiding.',
      'Attack rolls against the creature have disadvantage.',
      'The creature\'s attack rolls have advantage.',
    ],
  },
  {
    name: 'Paralyzed',
    description: 'A paralyzed creature is incapacitated and can\'t move or speak.',
    effects: [
      'Incapacitated — can\'t take actions or reactions.',
      'Can\'t move or speak.',
      'Automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
      'Any attack that hits the creature is a critical hit if the attacker is within 5 feet.',
    ],
  },
  {
    name: 'Petrified',
    description: 'A petrified creature is transformed into solid inanimate substance.',
    effects: [
      'Incapacitated, can\'t move or speak, and is unaware of its surroundings.',
      'Attack rolls against the creature have advantage.',
      'Automatically fails Strength and Dexterity saving throws.',
      'Resistance to all damage.',
      'Immune to poison and disease.',
    ],
  },
  {
    name: 'Poisoned',
    description: 'A poisoned creature feels ill and weakened.',
    effects: [
      'Disadvantage on attack rolls and ability checks.',
    ],
  },
  {
    name: 'Prone',
    description: 'A prone creature is lying on the ground.',
    effects: [
      'Only movement option is to crawl unless it stands up (uses half speed).',
      'Disadvantage on attack rolls.',
      'Attack rolls against the creature have advantage if the attacker is within 5 feet; otherwise disadvantage.',
    ],
  },
  {
    name: 'Restrained',
    description: 'A restrained creature is held in place.',
    effects: [
      'Speed becomes 0 and can\'t benefit from bonuses to speed.',
      'Attack rolls against the creature have advantage.',
      'The creature\'s attack rolls have disadvantage.',
      'Disadvantage on Dexterity saving throws.',
    ],
  },
  {
    name: 'Stunned',
    description: 'A stunned creature is overwhelmed.',
    effects: [
      'Incapacitated — can\'t take actions or reactions.',
      'Can\'t move.',
      'Can speak only falteringly.',
      'Automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
    ],
  },
  {
    name: 'Unconscious',
    description: 'An unconscious creature is inert.',
    effects: [
      'Incapacitated, can\'t move or speak, and is unaware of its surroundings.',
      'Drops whatever it\'s holding and falls prone.',
      'Automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
      'Any attack that hits the creature is a critical hit if the attacker is within 5 feet.',
    ],
  },
];

export const CONDITION_MAP: Record<string, ConditionData> = Object.fromEntries(
  CONDITIONS.map(c => [c.name, c])
);
