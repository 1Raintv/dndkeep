/**
 * Artificer Infusions — 2024 PHB
 * These are class-exclusive magical modifications available to Artificers.
 * Infusions are learned at level 2 and applied to items during a Long Rest.
 * Infusion count scales: 2 active at lv2, 4 at lv6, 6 at lv10, 8 at lv14, 10 at lv18, 12 at lv20.
 */

export interface ArtificerInfusion {
  id: string;
  name: string;
  minLevel: number;       // minimum Artificer level required
  item: string;           // what item type it applies to
  description: string;
  requiresAttunement?: boolean;
  spellsGranted?: string[];  // spell IDs granted by this infusion
}

export const ARTIFICER_INFUSIONS: ArtificerInfusion[] = [
  // ── Available at Level 2 ───────────────────────────────────────────────────
  {
    id: 'enhanced-arcane-focus',
    name: 'Enhanced Arcane Focus',
    minLevel: 2,
    item: 'Rod, staff, or wand (requires attunement)',
    requiresAttunement: true,
    description: 'While holding this item, a creature gains a +1 bonus to spell attack rolls. Additionally, the creature ignores half cover when making a spell attack. The bonus increases to +2 when you reach 10th level in this class.',
  },
  {
    id: 'enhanced-defense',
    name: 'Enhanced Defense',
    minLevel: 2,
    item: 'A suit of armor or a shield',
    requiresAttunement: false,
    description: 'A creature gains a +1 bonus to Armor Class while wearing this armor or wielding this shield. The bonus increases to +2 when you reach 10th level in this class.',
  },
  {
    id: 'enhanced-weapon',
    name: 'Enhanced Weapon',
    minLevel: 2,
    item: 'A simple or martial weapon',
    requiresAttunement: false,
    description: 'This magic weapon grants a +1 bonus to attack and damage rolls made with it. The bonus increases to +2 when you reach 10th level in this class.',
  },
  {
    id: 'homunculus-servant',
    name: 'Homunculus Servant',
    minLevel: 2,
    item: 'A gem or crystal worth at least 100 gp',
    requiresAttunement: false,
    description: 'You learn intricate methods for magically creating a special homunculus that serves you. The item you infuse serves as the creature\'s heart, around which the creature\'s body instantly forms. The homunculus is friendly to you and your companions and obeys your commands. In combat, it shares your initiative count but takes its turn immediately after yours. It can move and use its reaction on its own, but the only action it takes on its turn is the Dodge action, unless you take a bonus action to command it to take another action. See the stat block in the Player\'s Handbook for its statistics.',
  },
  {
    id: 'mind-sharpener',
    name: 'Mind Sharpener',
    minLevel: 2,
    item: 'A suit of armor or robes',
    requiresAttunement: true,
    description: 'The infused item can send a jolt to the wearer to refocus their mind. The item has 4 charges. When the wearer fails a Constitution saving throw to maintain concentration on a spell, the wearer can use its reaction to expend 1 of the item\'s charges to succeed instead. The item regains 1d4 expended charges daily at dawn.',
  },
  {
    id: 'repeating-shot',
    name: 'Repeating Shot',
    minLevel: 2,
    item: 'A simple or martial weapon with the ammunition property (requires attunement)',
    requiresAttunement: true,
    description: 'This magic weapon grants a +1 bonus to attack and damage rolls made with it, and it ignores the loading property if it has it. If the weapon lacks ammunition, it produces its own, magically creating one piece of ammunition when you use the weapon to make a ranged attack. The ammunition created by the weapon vanishes the instant after it hits or misses a target.',
  },
  {
    id: 'returning-weapon',
    name: 'Returning Weapon',
    minLevel: 2,
    item: 'A simple or martial weapon with the thrown property',
    requiresAttunement: false,
    description: 'This magic weapon grants a +1 bonus to attack and damage rolls made with it, and it returns to the wielder\'s hand immediately after it is used to make a ranged attack.',
  },
  {
    id: 'bag-of-holding',
    name: 'Replicate Magic Item: Bag of Holding',
    minLevel: 2,
    item: 'A bag',
    requiresAttunement: false,
    description: 'Using this infusion, you replicate a particular magic item. The item must be of common or uncommon rarity. Bag of Holding: This bag has an interior space considerably larger than its outside dimensions. The bag can hold up to 500 pounds, not exceeding a volume of 64 cubic feet. The bag weighs 15 pounds, regardless of its contents.',
  },
  {
    id: 'goggles-of-night',
    name: 'Replicate Magic Item: Goggles of Night',
    minLevel: 2,
    item: 'A pair of goggles',
    requiresAttunement: false,
    description: 'Replicate: Goggles of Night. While wearing these dark lenses, you have darkvision out to a range of 60 feet. If you already have darkvision, wearing the goggles increases its range by 60 feet.',
  },
  {
    id: 'wand-of-magic-detection',
    name: 'Replicate Magic Item: Wand of Magic Detection',
    minLevel: 2,
    item: 'A wand',
    requiresAttunement: false,
    description: 'Replicate: Wand of Magic Detection (3 charges). While holding it, you can expend 1 charge to cast Detect Magic from it. The wand regains 1d3 expended charges daily at dawn.',
  },

  // ── Available at Level 6 ───────────────────────────────────────────────────
  {
    id: 'boots-of-the-winding-path',
    name: 'Boots of the Winding Path',
    minLevel: 6,
    item: 'A pair of boots (requires attunement)',
    requiresAttunement: true,
    description: 'While wearing these boots, a creature can teleport up to 15 feet as a bonus action to an unoccupied space the creature can see. The creature must have occupied that space at some point during the current turn.',
  },
  {
    id: 'radiant-weapon',
    name: 'Radiant Weapon',
    minLevel: 6,
    item: 'A simple or martial weapon (requires attunement)',
    requiresAttunement: true,
    description: 'This magic weapon grants a +1 bonus to attack and damage rolls made with it. While holding it, the wielder can use a bonus action to cause it to shed bright light in a 30-foot radius and dim light for an additional 30 feet. The wielder can extinguish the light as a bonus action. The weapon has 4 charges. As a reaction immediately after being hit by an attack, the wielder can expend 1 charge and cause the attacker to be blinded until the end of the attacker\'s next turn, unless the attacker succeeds on a Constitution saving throw against your spell save DC. The weapon regains 1d4 expended charges daily at dawn.',
  },
  {
    id: 'repulsion-shield',
    name: 'Repulsion Shield',
    minLevel: 6,
    item: 'A shield (requires attunement)',
    requiresAttunement: true,
    description: 'A creature gains a +1 bonus to Armor Class while wielding this shield. The shield has 4 charges. While holding it, the wielder can use a reaction immediately after being hit by a melee attack to expend 1 of the shield\'s charges and push the attacker up to 15 feet away. The shield regains 1d4 expended charges daily at dawn.',
  },
  {
    id: 'resistant-armor',
    name: 'Resistant Armor',
    minLevel: 6,
    item: 'A suit of armor (requires attunement)',
    requiresAttunement: true,
    description: 'While wearing this armor, a creature has resistance to one of the following damage types, which you choose when you infuse the item: acid, cold, fire, force, lightning, necrotic, poison, psychic, radiant, or thunder.',
  },

  // ── Available at Level 10 ──────────────────────────────────────────────────
  {
    id: 'boots-of-levitation',
    name: 'Replicate Magic Item: Boots of Levitation',
    minLevel: 10,
    item: 'A pair of boots (requires attunement)',
    requiresAttunement: true,
    description: 'Replicate: Boots of Levitation. While you wear these boots, you can use an action to cast the Levitate spell on yourself at will.',
  },
  {
    id: 'boots-of-speed',
    name: 'Replicate Magic Item: Boots of Speed',
    minLevel: 10,
    item: 'A pair of boots (requires attunement)',
    requiresAttunement: true,
    description: 'Replicate: Boots of Speed. While you wear these boots, you can use a bonus action and click the boots\' heels together. If you do, the boots double your walking speed, and any creature that makes an opportunity attack against you has disadvantage on the attack roll. If you click your heels together again, you end the effect. When the boots\' property has been used for a total of 10 minutes, the magic ceases to function until you finish a long rest.',
  },
  {
    id: 'cloak-of-protection',
    name: 'Replicate Magic Item: Cloak of Protection',
    minLevel: 10,
    item: 'A cloak (requires attunement)',
    requiresAttunement: true,
    description: 'Replicate: Cloak of Protection. You gain a +1 bonus to AC and saving throws while you wear this cloak.',
  },
  {
    id: 'spell-refueling-ring',
    name: 'Spell-Refueling Ring',
    minLevel: 10,
    item: 'A ring (requires attunement)',
    requiresAttunement: true,
    description: 'While wearing this ring, the creature can recover one expended spell slot as a bonus action. The recovered slot can be of 3rd level or lower. Once used, this property can\'t be used again until the next dawn.',
  },

  // ── Available at Level 14 ──────────────────────────────────────────────────
  {
    id: 'arcane-propulsion-armor',
    name: 'Arcane Propulsion Armor',
    minLevel: 14,
    item: 'A suit of armor (requires attunement)',
    requiresAttunement: true,
    description: 'The wearer of this armor gains these benefits: The wearer\'s walking speed increases by 5 feet. The armor includes gauntlets, each of which is a magic melee weapon that can be wielded only when the hand is holding nothing. The wearer is proficient with the gauntlets, and each one deals 1d8 force damage on a hit and has the thrown property, with a normal range of 20 feet and a long range of 60 feet. When thrown, the gauntlet detaches and flies at the target of the attack, then immediately returns to the wearer and reattaches. The armor can\'t be removed against the wearer\'s will.',
  },
  {
    id: 'helm-of-awareness',
    name: 'Replicate Magic Item: Helm of Awareness',
    minLevel: 14,
    item: 'A helm (requires attunement)',
    requiresAttunement: true,
    description: 'Replicate: Helm of Awareness. While wearing this helm, you have advantage on initiative rolls. In addition, you can\'t be surprised; if you would be surprised, you simply aren\'t.',
  },
];

/** Get infusions available at a given Artificer level */
export function getAvailableInfusions(artificerLevel: number): ArtificerInfusion[] {
  return ARTIFICER_INFUSIONS.filter(i => i.minLevel <= artificerLevel);
}

/** Get the number of infusions that can be active at once */
export function getActiveInfusionCount(artificerLevel: number): number {
  if (artificerLevel >= 20) return 12;
  if (artificerLevel >= 18) return 10;
  if (artificerLevel >= 14) return 8;
  if (artificerLevel >= 10) return 6;
  if (artificerLevel >= 6) return 4;
  return 2;
}
