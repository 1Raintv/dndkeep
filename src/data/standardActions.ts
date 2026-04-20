// v2.86.0 — 2024 PHB standard actions (Dash, Disengage, Dodge, Help, Hide,
// Influence, Ready, Search, Study, Utilize).
//
// These are actions every character can take regardless of class — the
// "Actions in Combat" category from the PHB. Attack and Magic are excluded
// here because they're already represented by weapon rows + spell rows.
//
// Short descriptions appear inline on the card; long descriptions are
// the RAW text, surfaced via a chevron/expand interaction.

export interface StandardAction {
  id: string;
  name: string;
  shortDescription: string;
  longDescription: string;
}

export const STANDARD_ACTIONS: StandardAction[] = [
  {
    id: 'dash',
    name: 'Dash',
    shortDescription: 'Gain extra Movement equal to your Speed for this turn.',
    longDescription:
      'When you take the Dash action, you gain extra Movement equal to your Speed for the current turn. Any increase or decrease to your Speed applies to this bonus Movement. For example, if your Speed is 30 feet and it\'s increased by 10 feet for the turn, you can move up to 80 feet on that turn if you Dash.',
  },
  {
    id: 'disengage',
    name: 'Disengage',
    shortDescription: 'Your movement doesn\'t provoke Opportunity Attacks for the rest of the turn.',
    longDescription:
      'If you take the Disengage action, for the rest of the current turn your movement doesn\'t provoke Opportunity Attacks.',
  },
  {
    id: 'dodge',
    name: 'Dodge',
    shortDescription: 'Attackers have Disadvantage. You have Advantage on DEX saves until your next turn.',
    longDescription:
      'If you take the Dodge action, attack rolls against you have Disadvantage, and you make Dexterity saving throws with Advantage. This benefit lasts until the start of your next turn or until you have the Incapacitated condition or your Speed is 0.',
  },
  {
    id: 'help',
    name: 'Help',
    shortDescription: 'Give an ally within 5 ft Advantage on one check or attack before your next turn.',
    longDescription:
      'When you take the Help action, you do one of the following:\n\n• Assist another creature\'s ability check. Choose one of your skill or tool proficiencies and an ally within 5 feet of you who is attempting an ability check with that skill or tool. The ally gains Advantage on that check, provided the ally makes it before the start of your next turn. You must be able to help with the task — the DM decides what works.\n\n• Assist an ally\'s attack roll. Feint or distract a creature within 5 feet of you, granting Advantage on the next attack roll against it by an ally within 5 feet of it. The Advantage is usable before the start of your next turn.',
  },
  {
    id: 'hide',
    name: 'Hide',
    shortDescription: 'DEX (Stealth) check vs DC 15. On success, gain Invisible until discovered.',
    longDescription:
      'With the Hide action, you make a Dexterity (Stealth) check against DC 15 while you\'re Heavily Obscured or behind Three-Quarters Cover or Total Cover, and you must be out of any enemy\'s line of sight; if you can see a creature, it can see you.\n\nOn a successful check, you have the Invisible condition. Make note of your check\'s total, which is the DC for a creature to find you with a Wisdom (Perception) check.\n\nThe condition ends on you immediately after any of the following: you make a sound louder than a whisper, an enemy finds you, you make an attack roll, or you cast a spell with a Verbal component.',
  },
  {
    id: 'influence',
    name: 'Influence',
    shortDescription: 'Ability check (CHA/WIS/INT) to urge a creature to do something.',
    longDescription:
      'With the Influence action, you urge a creature to do something. Describe or role-play how you\'re communicating with the creature. Are you trying to deceive, intimidate, amuse, or gently persuade? The DM then assesses the creature\'s attitude toward you to determine whether a roll is necessary and, if so, which ability check to use.\n\nThe DC equals 15 or the target\'s Intelligence score, whichever is higher. You succeed automatically if the target has a friendly attitude; you fail automatically if the target has a hostile attitude.',
  },
  {
    id: 'ready',
    name: 'Ready',
    shortDescription: 'Prepare a Reaction that triggers later this round.',
    longDescription:
      'You can ready a spell, an attack, or another action to occur later this round, allowing you to act in response to a trigger using your Reaction. To do so, take the Ready action on your turn, which lets you act later in the round using your Reaction.\n\nFirst, you decide what perceivable circumstance will trigger your Reaction. Then, you choose the action you will take in response to that trigger, or you choose to move up to your Speed in response to it. Example: "If the cultist steps on the trapdoor, I\'ll pull the lever that opens it."\n\nWhen the trigger occurs, you can take your Reaction right after the trigger finishes, or you can ignore the trigger.\n\nWhen you ready a spell, you cast it as normal but hold its energy, which you release with your Reaction. To be readied, a spell must have a casting time of an Action, and holding onto the spell\'s energy requires Concentration.',
  },
  {
    id: 'search',
    name: 'Search',
    shortDescription: 'Wisdom check to discern something — hidden creatures, clues, lore.',
    longDescription:
      'When you take the Search action, you make a Wisdom check to discern something not easily seen or heard. The DM decides which skill (if any) to apply to the check. Here are examples:\n\n• Wisdom (Insight) — spot a creature\'s emotional state, motives, or truthfulness.\n• Wisdom (Medicine) — determine the cause of an ailment or what condition a wounded creature is in.\n• Wisdom (Perception) — find something that\'s hidden.\n• Wisdom (Survival) — find tracks or follow them.',
  },
  {
    id: 'study',
    name: 'Study',
    shortDescription: 'Intelligence check to recall lore, analyze objects, or assess a puzzle.',
    longDescription:
      'When you take the Study action, you make an Intelligence check to study your memory, a book, a clue, or another source of knowledge and call to mind an important piece of information about it. The DM decides which skill (if any) to apply to the check:\n\n• Intelligence (Arcana) — lore about spells, magic items, eldritch symbols, magical traditions, planes of existence, and otherworldly creatures.\n• Intelligence (History) — lore about historical events, people, nations, and cultures.\n• Intelligence (Investigation) — deduce information from clues.\n• Intelligence (Nature) — lore about terrain, plants, animals, and weather.\n• Intelligence (Religion) — lore about gods, religious hierarchies, holy symbols, and practices.',
  },
  {
    id: 'utilize',
    name: 'Utilize',
    shortDescription: 'Interact with an object in a way that requires an Action.',
    longDescription:
      'You normally interact with an object while doing something else, such as when you draw a weapon as part of an attack. When an object requires your Action for its use, you take the Utilize action.\n\nExamples: pulling a long lever, triggering a trap mechanism, opening a stuck door, picking a lock, or searching through a messy bag for a specific item.',
  },
];
