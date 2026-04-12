/**
 * Class resource tracking — the feature D&D Beyond can't do properly.
 * Each resource knows its max uses per level, when it recovers, and how to display.
 */

export type RecoveryType = 'short' | 'long' | 'day';

export interface ClassResourceDef {
  id: string;
  name: string;
  description: string;
  recovery: RecoveryType;
  getMax: (level: number, abilityScores: Record<string, number>) => number;
  minLevel: number;
  emoji: string;
}

const abilityMod = (score: number) => Math.floor((score - 10) / 2);

export const CLASS_RESOURCES: Record<string, ClassResourceDef[]> = {
  Barbarian: [
    {
      id: 'rage',
      name: 'Rage',
      emoji: '🔥',
      description: 'Enter a rage as a bonus action. Lasts 1 minute. +Str to melee attack/damage, resistance to B/P/S damage.',
      recovery: 'long',
      minLevel: 1,
      getMax: (level) => {
        if (level >= 20) return 999; // Unlimited
        if (level >= 17) return 6;
        if (level >= 12) return 5;
        if (level >= 9) return 4;
        if (level >= 6) return 3;
        return 2;
      },
    },
    {
      id: 'relentless-rage',
      name: 'Relentless Rage',
      emoji: '💢',
      description: 'When dropped to 0 HP while raging, make DC 10 CON save (increases by 5 each use). On success, drop to 1 HP instead.',
      recovery: 'short',
      minLevel: 11,
      getMax: () => 1,
    },
    {
      id: 'brutal-strike',
      name: 'Brutal Strike',
      emoji: '⚔️',
      description: 'Forgo advantage to deal an extra 1d10 damage and apply a brutal effect.',
      recovery: 'short',
      minLevel: 9,
      getMax: () => 1,
    },
  ],

  Bard: [
    {
      id: 'bardic-inspiration',
      name: 'Bardic Inspiration',
      emoji: '🎵',
      description: 'Give a creature a Bardic Inspiration die (1d6–1d12) to add to an ability check, attack, or save.',
      recovery: 'long', // short rest at level 5+
      minLevel: 1,
      getMax: (level, scores) => Math.max(1, abilityMod(scores.charisma ?? 10)),
    },
    {
      id: 'song-of-rest',
      name: 'Song of Rest',
      emoji: '🎶',
      description: 'During a short rest, you can play music to help allies recover an extra 1d6 HP (scales with level).',
      recovery: 'short',
      minLevel: 2,
      getMax: () => 1,
    },
    {
      id: 'countercharm',
      name: 'Countercharm',
      emoji: '🛡️',
      description: 'Use action to perform music granting advantage on saves vs being frightened or charmed.',
      recovery: 'short',
      minLevel: 6,
      getMax: () => 1,
    },
  ],

  Cleric: [
    {
      id: 'channel-divinity',
      name: 'Channel Divinity',
      emoji: '✝️',
      description: 'Channel divine energy for Turn Undead and domain-specific effects.',
      recovery: 'short',
      minLevel: 2,
      getMax: (level) => {
        if (level >= 18) return 3;
        if (level >= 6) return 2;
        return 1;
      },
    },
    {
      id: 'divine-intervention',
      name: 'Divine Intervention',
      emoji: '🌟',
      description: 'Implore your deity to intervene. At level 20, succeeds automatically.',
      recovery: 'long',
      minLevel: 10,
      getMax: () => 1,
    },
  ],

  Druid: [
    {
      id: 'wild-shape',
      name: 'Wild Shape',
      emoji: '🐾',
      description: 'Magically transform into a beast you have seen. Max CR scales with level.',
      recovery: 'short',
      minLevel: 2,
      getMax: () => 2,
    },
    {
      id: 'wild-shape-cr',
      name: 'Max Wild Shape CR',
      emoji: '📊',
      description: 'Maximum CR for Wild Shape beasts.',
      recovery: 'long',
      minLevel: 2,
      getMax: (level) => {
        if (level >= 8) return 1;
        if (level >= 4) return 0.5;
        return 0.25;
      },
    },
  ],

  Fighter: [
    {
      id: 'second-wind',
      name: 'Second Wind',
      emoji: '💨',
      description: 'Bonus action: regain 1d10 + fighter level HP.',
      recovery: 'short',
      minLevel: 1,
      getMax: () => 1,
    },
    {
      id: 'action-surge',
      name: 'Action Surge',
      emoji: '⚡',
      description: 'Take one additional action on your turn.',
      recovery: 'short',
      minLevel: 2,
      getMax: (level) => level >= 17 ? 2 : 1,
    },
    {
      id: 'indomitable',
      name: 'Indomitable',
      emoji: '🛡️',
      description: 'Reroll a saving throw (must use new result).',
      recovery: 'long',
      minLevel: 9,
      getMax: (level) => {
        if (level >= 17) return 3;
        if (level >= 13) return 2;
        return 1;
      },
    },
    {
      id: 'superiority-dice',
      name: 'Superiority Dice',
      emoji: '🎲',
      description: 'Battle Master maneuver dice (d8, scaling to d12). Used for combat maneuvers.',
      recovery: 'short',
      minLevel: 3,
      getMax: (level) => {
        if (level >= 15) return 6;
        if (level >= 7) return 5;
        return 4;
      },
    },
  ],

  Monk: [
    {
      id: 'ki-points',
      name: 'Ki Points',
      emoji: '☯️',
      description: 'Fuel monk abilities: Flurry of Blows, Patient Defense, Step of the Wind, Stunning Strike.',
      recovery: 'short',
      minLevel: 2,
      getMax: (level) => level,
    },
    {
      id: 'stunning-strike',
      name: 'Stunning Strike',
      emoji: '💫',
      description: 'Spend 1 ki after hitting to force CON save or target is stunned until end of your next turn.',
      recovery: 'short',
      minLevel: 5,
      getMax: () => 999, // Tracked via ki points
    },
  ],

  Paladin: [
    {
      id: 'lay-on-hands',
      name: 'Lay on Hands',
      emoji: '🤲',
      description: 'Restore HP equal to your pool, or spend 5 HP to cure a disease/poison.',
      recovery: 'long',
      minLevel: 1,
      getMax: (level) => level * 5,
    },
    {
      id: 'channel-divinity',
      name: 'Channel Divinity',
      emoji: '✝️',
      description: 'Sacred Weapon or Turn the Unholy, plus oath-specific effects.',
      recovery: 'short',
      minLevel: 3,
      getMax: (level) => {
        if (level >= 11) return 3;
        if (level >= 6) return 2;
        return 1;
      },
    },
    {
      id: 'divine-sense',
      name: 'Divine Sense',
      emoji: '👁️',
      description: 'Know the location of celestials, fiends, and undead within 60 ft.',
      recovery: 'long',
      minLevel: 1,
      getMax: (level, scores) => 1 + Math.max(1, abilityMod(scores.charisma ?? 10)),
    },
  ],

  Ranger: [
    {
      id: 'hunters-mark',
      name: "Hunter's Mark",
      emoji: '🎯',
      description: 'Free Hunter\'s Mark uses that don\'t require spell slots (no concentration at higher levels).',
      recovery: 'long',
      minLevel: 1,
      getMax: (level) => {
        if (level >= 17) return 999;
        if (level >= 13) return 3;
        if (level >= 9) return 2;
        return 1;
      },
    },
    {
      id: 'natural-explorer',
      name: 'Favored Terrain',
      emoji: '🌲',
      description: 'Chose a favored terrain type — reminder for double proficiency on related checks.',
      recovery: 'day',
      minLevel: 1,
      getMax: () => 1,
    },
  ],

  Rogue: [
    {
      id: 'sneak-attack',
      name: 'Sneak Attack',
      emoji: '🗡️',
      description: 'Deal extra damage once per turn when you have advantage or an ally adjacent to the target.',
      recovery: 'short',
      minLevel: 1,
      getMax: () => 1, // Once per turn reminder
    },
    {
      id: 'uncanny-dodge',
      name: 'Uncanny Dodge',
      emoji: '🌀',
      description: 'Reaction: halve the damage from one attack you can see.',
      recovery: 'short',
      minLevel: 5,
      getMax: () => 1,
    },
    {
      id: 'stroke-of-luck',
      name: 'Stroke of Luck',
      emoji: '🍀',
      description: 'Turn a failed attack or ability check into a success.',
      recovery: 'short',
      minLevel: 20,
      getMax: () => 1,
    },
  ],

  Sorcerer: [
    {
      id: 'sorcery-points',
      name: 'Sorcery Points',
      emoji: '✨',
      description: 'Fuel metamagic and Font of Magic: convert to/from spell slots.',
      recovery: 'long',
      minLevel: 2,
      getMax: (level) => level,
    },
    {
      id: 'wild-magic-surge',
      name: 'Tides of Chaos',
      emoji: '🌀',
      description: 'Wild Magic: Gain advantage on one attack, check, or save (then DM may trigger surge).',
      recovery: 'long',
      minLevel: 1,
      getMax: () => 1,
    },
  ],

  Warlock: [
    {
      id: 'mystic-arcanum-6',
      name: 'Mystic Arcanum (6th)',
      emoji: '📜',
      description: 'Cast a 6th-level spell once per long rest without using a spell slot.',
      recovery: 'long',
      minLevel: 11,
      getMax: () => 1,
    },
    {
      id: 'mystic-arcanum-7',
      name: 'Mystic Arcanum (7th)',
      emoji: '📜',
      description: 'Cast a 7th-level spell once per long rest without using a spell slot.',
      recovery: 'long',
      minLevel: 13,
      getMax: () => 1,
    },
    {
      id: 'mystic-arcanum-8',
      name: 'Mystic Arcanum (8th)',
      emoji: '📜',
      description: 'Cast an 8th-level spell once per long rest without using a spell slot.',
      recovery: 'long',
      minLevel: 15,
      getMax: () => 1,
    },
    {
      id: 'mystic-arcanum-9',
      name: 'Mystic Arcanum (9th)',
      emoji: '📜',
      description: 'Cast a 9th-level spell once per long rest without using a spell slot.',
      recovery: 'long',
      minLevel: 17,
      getMax: () => 1,
    },
    {
      id: 'eldritch-master',
      name: 'Eldritch Master',
      emoji: '👿',
      description: 'Spend 1 minute entreating your patron to regain all Pact Magic spell slots.',
      recovery: 'long',
      minLevel: 20,
      getMax: () => 1,
    },
  ],

  Wizard: [
    {
      id: 'arcane-recovery',
      name: 'Arcane Recovery',
      emoji: '📚',
      description: 'Short rest: recover spell slots with combined level ≤ half your wizard level (rounded up). Not 6th+ level slots.',
      recovery: 'day',
      minLevel: 1,
      getMax: () => 1,
    },
    {
      id: 'spell-mastery',
      name: 'Spell Mastery',
      emoji: '⚗️',
      description: 'Cast chosen 1st and 2nd level spells at their lowest level without expending a slot.',
      recovery: 'day',
      minLevel: 18,
      getMax: () => 999,
    },
    {
      id: 'signature-spells',
      name: 'Signature Spells',
      emoji: '✍️',
      description: 'Two 3rd-level spells always prepared, cast each once per short rest without a slot.',
      recovery: 'short',
      minLevel: 20,
      getMax: () => 2,
    },
  ],

  Artificer: [
    {
      id: 'infuse-item',
      name: 'Infuse Item',
      emoji: '⚙️',
      description: 'Infuse mundane items with temporary magical properties.',
      recovery: 'long',
      minLevel: 2,
      getMax: (level) => {
        if (level >= 20) return 12;
        if (level >= 18) return 10;
        if (level >= 14) return 8;
        if (level >= 10) return 6;
        if (level >= 6) return 4;
        return 2;
      },
    },
    {
      id: 'flash-of-genius',
      name: 'Flash of Genius',
      emoji: '💡',
      description: 'Reaction: add INT modifier to an ability check or save made by you or a creature within 30 ft.',
      recovery: 'long',
      minLevel: 7,
      getMax: (level, scores) => Math.max(1, abilityMod(scores.intelligence ?? 10)),
    },
  ],

  Psion: [
    {
      id: 'psionic-energy-dice',
      name: 'Psionic Energy Dice',
      emoji: '🧠',
      description: 'Pool of psionic energy dice. Spend to power Telekinetic Propel, Telepathic Connection, and other psionic abilities. Regain all on Long Rest; regain 1 on Short Rest.',
      recovery: 'long',
      minLevel: 1,
      getMax: (level) => {
        // Scales: 4d6 at 1, up to 12d12 at 17+
        // Pool count: 2×prof bonus
        if (level >= 17) return 12;
        if (level >= 13) return 10;
        if (level >= 9) return 8;
        if (level >= 5) return 6;
        return 4;
      },
    },
    {
      id: 'psionic-restoration',
      name: 'Psionic Restoration',
      emoji: '🔄',
      description: 'Once per Long Rest: 1-minute meditation to regain Psionic Energy Dice equal to half your Psion level (rounded up).',
      recovery: 'long',
      minLevel: 5,
      getMax: () => 1,
    },
  ],
};
export function getCharacterResources(
  className: string,
  level: number,
  abilityScores: Record<string, number>
): ClassResourceDef[] {
  const resources = CLASS_RESOURCES[className] ?? [];
  return resources.filter(r => level >= r.minLevel);
}

/** Build the default class_resources object for a new character */
export function buildDefaultResources(
  className: string,
  level: number,
  abilityScores: Record<string, number>
): Record<string, number> {
  const resources = getCharacterResources(className, level, abilityScores);
  const result: Record<string, number> = {};
  for (const r of resources) {
    const max = r.getMax(level, abilityScores);
    if (max !== 999) result[r.id] = max; // Start at full
  }
  return result;
}

export const RECOVERY_LABELS: Record<RecoveryType, string> = {
  short: 'Short Rest',
  long: 'Long Rest',
  day: 'Daily',
};
