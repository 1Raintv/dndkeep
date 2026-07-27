// v2.629.0 — Weapon Mastery (2024 PHB / SRD 5.2.1, CC-BY-4.0).
//
// Every weapon has exactly one mastery property; a character can USE
// that property only via a feature that unlocks it (the Weapon
// Mastery class feature for Barbarian / Fighter / Paladin / Ranger /
// Rogue, or the Weapon Master feat). Mastery property descriptions
// below are SRD 5.2.1 verbatim (Interpretation B: CC-BY content ships
// verbatim). Weapon→mastery mapping is from the SRD 5.2.1 Weapons
// table.
//
// Class scaling (SRD 5.2.1 class feature tables):
//   Barbarian: 2 @ L1, 3 @ L4, 4 @ L10 — Simple/Martial MELEE only
//   Fighter:   3 @ L1, 4 @ L4, 5 @ L10, 6 @ L16
//   Paladin:   2 (fixed)
//   Ranger:    2 (fixed)
//   Rogue:     2 (fixed) — only weapons Rogues are proficient with
//              (Simple weapons + Martial weapons with Finesse or
//              Light)
// Swap cadence (all five): change ONE chosen weapon per Long Rest.

export type MasteryName =
  | 'Cleave' | 'Graze' | 'Nick' | 'Push' | 'Sap' | 'Slow' | 'Topple' | 'Vex';

export const MASTERY_PROPERTIES: Record<MasteryName, string> = {
  Cleave:
    "If you hit a creature with a melee attack roll using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless that modifier is negative. You can make this extra attack only once per turn.",
  Graze:
    "If your attack roll with this weapon misses a creature, you can deal damage to that creature equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and the damage can be increased only by increasing the ability modifier.",
  Nick:
    'When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn.',
  Push:
    'If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from yourself if it is Large or smaller.',
  Sap:
    'If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn.',
  Slow:
    "If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If you hit the creature more than once with a weapon that has this property, the Speed reduction doesn't stack.",
  Topple:
    'If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 plus the ability modifier used to make the attack roll and your Proficiency Bonus). On a failed save, the creature has the Prone condition.',
  Vex:
    'If you hit a creature with this weapon and deal damage to the creature, you have Advantage on your next attack roll against that creature before the end of your next turn.',
};

export type WeaponGroup =
  | 'simple_melee' | 'simple_ranged' | 'martial_melee' | 'martial_ranged';

export interface MasteryWeapon {
  name: string;
  group: WeaponGroup;
  mastery: MasteryName;
  light?: boolean;
  finesse?: boolean;
}

// SRD 5.2.1 Weapons table (Mastery column).
export const MASTERY_WEAPONS: MasteryWeapon[] = [
  // Simple Melee
  { name: 'Club',           group: 'simple_melee',  mastery: 'Slow',   light: true },
  { name: 'Dagger',         group: 'simple_melee',  mastery: 'Nick',   light: true, finesse: true },
  { name: 'Greatclub',      group: 'simple_melee',  mastery: 'Push' },
  { name: 'Handaxe',        group: 'simple_melee',  mastery: 'Vex',    light: true },
  { name: 'Javelin',        group: 'simple_melee',  mastery: 'Slow' },
  { name: 'Light Hammer',   group: 'simple_melee',  mastery: 'Nick',   light: true },
  { name: 'Mace',           group: 'simple_melee',  mastery: 'Sap' },
  { name: 'Quarterstaff',   group: 'simple_melee',  mastery: 'Topple' },
  { name: 'Sickle',         group: 'simple_melee',  mastery: 'Nick',   light: true },
  { name: 'Spear',          group: 'simple_melee',  mastery: 'Sap' },
  // Simple Ranged
  { name: 'Dart',           group: 'simple_ranged', mastery: 'Vex',    finesse: true },
  { name: 'Light Crossbow', group: 'simple_ranged', mastery: 'Slow' },
  { name: 'Shortbow',       group: 'simple_ranged', mastery: 'Vex' },
  { name: 'Sling',          group: 'simple_ranged', mastery: 'Slow' },
  // Martial Melee
  { name: 'Battleaxe',      group: 'martial_melee', mastery: 'Topple' },
  { name: 'Flail',          group: 'martial_melee', mastery: 'Sap' },
  { name: 'Glaive',         group: 'martial_melee', mastery: 'Graze' },
  { name: 'Greataxe',       group: 'martial_melee', mastery: 'Cleave' },
  { name: 'Greatsword',     group: 'martial_melee', mastery: 'Graze' },
  { name: 'Halberd',        group: 'martial_melee', mastery: 'Cleave' },
  { name: 'Lance',          group: 'martial_melee', mastery: 'Topple' },
  { name: 'Longsword',      group: 'martial_melee', mastery: 'Sap' },
  { name: 'Maul',           group: 'martial_melee', mastery: 'Topple' },
  { name: 'Morningstar',    group: 'martial_melee', mastery: 'Sap' },
  { name: 'Pike',           group: 'martial_melee', mastery: 'Push' },
  { name: 'Rapier',         group: 'martial_melee', mastery: 'Vex',    finesse: true },
  { name: 'Scimitar',       group: 'martial_melee', mastery: 'Nick',   light: true, finesse: true },
  { name: 'Shortsword',     group: 'martial_melee', mastery: 'Vex',    light: true, finesse: true },
  { name: 'Trident',        group: 'martial_melee', mastery: 'Topple' },
  { name: 'War Pick',       group: 'martial_melee', mastery: 'Sap' },
  { name: 'Warhammer',      group: 'martial_melee', mastery: 'Push' },
  { name: 'Whip',           group: 'martial_melee', mastery: 'Slow',   finesse: true },
  // Martial Ranged
  { name: 'Blowgun',        group: 'martial_ranged', mastery: 'Vex' },
  { name: 'Hand Crossbow',  group: 'martial_ranged', mastery: 'Vex',   light: true },
  { name: 'Heavy Crossbow', group: 'martial_ranged', mastery: 'Push' },
  { name: 'Longbow',        group: 'martial_ranged', mastery: 'Slow' },
  { name: 'Musket',         group: 'martial_ranged', mastery: 'Slow' },
  { name: 'Pistol',         group: 'martial_ranged', mastery: 'Vex' },
];

/** Number of Weapon Mastery choices for this class/level. 0 = class
 *  has no Weapon Mastery feature. */
export function masterySlots(className: string | null | undefined, level: number): number {
  switch ((className ?? '').trim()) {
    case 'Barbarian':
      return level >= 10 ? 4 : level >= 4 ? 3 : 2;
    case 'Fighter':
      return level >= 16 ? 6 : level >= 10 ? 5 : level >= 4 ? 4 : 3;
    case 'Paladin':
    case 'Ranger':
    case 'Rogue':
      return 2;
    default:
      return 0;
  }
}

/** Weapons this class may choose mastery in.
 *  Barbarian: melee only. Rogue: proficiency-shaped (Simple weapons +
 *  Martial weapons with Finesse or Light). Others: everything. */
export function eligibleMasteryWeapons(className: string | null | undefined): MasteryWeapon[] {
  const cls = (className ?? '').trim();
  if (cls === 'Barbarian') {
    return MASTERY_WEAPONS.filter(w => w.group === 'simple_melee' || w.group === 'martial_melee');
  }
  if (cls === 'Rogue') {
    return MASTERY_WEAPONS.filter(w =>
      w.group === 'simple_melee' || w.group === 'simple_ranged' || !!w.finesse || !!w.light,
    );
  }
  return MASTERY_WEAPONS;
}

/** Mastery property for a weapon name (case-insensitive), or null. */
export function masteryForWeapon(weaponName: string | null | undefined): MasteryName | null {
  if (!weaponName) return null;
  const n = weaponName.trim().toLowerCase();
  // Exact match first, then prefix match so inventory names like
  // "Longsword +1" or "Dagger (silvered)" still resolve.
  const exact = MASTERY_WEAPONS.find(w => w.name.toLowerCase() === n);
  if (exact) return exact.mastery;
  const prefix = MASTERY_WEAPONS.find(w => n.startsWith(w.name.toLowerCase()));
  return prefix ? prefix.mastery : null;
}
