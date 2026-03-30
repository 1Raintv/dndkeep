import type { MonsterData } from '../types';

export const MONSTERS: MonsterData[] = [
  // CR 0–1/4
  {
    id: 'kobold', name: 'Kobold', type: 'Humanoid', cr: '1/8', size: 'Small',
    hp: 5, hp_formula: '2d6 - 2', ac: 12, ac_note: 'Natural Armor',
    speed: 30, str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8,
    attack_name: 'Dagger', attack_bonus: 4, attack_damage: '1d4 + 2',
    xp: 25,
  },
  {
    id: 'bandit', name: 'Bandit', type: 'Humanoid', cr: '1/8', size: 'Medium',
    hp: 11, hp_formula: '2d8 + 2', ac: 12, ac_note: 'Leather Armor',
    speed: 30, str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
    attack_name: 'Scimitar', attack_bonus: 3, attack_damage: '1d6 + 1',
    xp: 25,
  },
  {
    id: 'goblin', name: 'Goblin', type: 'Humanoid', cr: '1/4', size: 'Small',
    hp: 7, hp_formula: '2d6', ac: 15, ac_note: 'Leather Armor, Shield',
    speed: 30, str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
    attack_name: 'Scimitar', attack_bonus: 4, attack_damage: '1d6 + 2',
    xp: 50,
  },
  {
    id: 'skeleton', name: 'Skeleton', type: 'Undead', cr: '1/4', size: 'Medium',
    hp: 13, hp_formula: '2d8 + 4', ac: 13, ac_note: 'Armor Scraps',
    speed: 30, str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
    attack_name: 'Shortsword', attack_bonus: 4, attack_damage: '1d6 + 2',
    xp: 50,
  },
  {
    id: 'zombie', name: 'Zombie', type: 'Undead', cr: '1/4', size: 'Medium',
    hp: 22, hp_formula: '3d8 + 9', ac: 8, ac_note: '',
    speed: 20, str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5,
    attack_name: 'Slam', attack_bonus: 3, attack_damage: '1d6 + 1',
    xp: 50,
  },
  {
    id: 'wolf', name: 'Wolf', type: 'Beast', cr: '1/4', size: 'Medium',
    hp: 11, hp_formula: '2d8 + 2', ac: 13, ac_note: 'Natural Armor',
    speed: 40, str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
    attack_name: 'Bite', attack_bonus: 4, attack_damage: '2d4 + 2',
    xp: 50,
  },
  // CR 1/2
  {
    id: 'orc', name: 'Orc', type: 'Humanoid', cr: '1/2', size: 'Medium',
    hp: 15, hp_formula: '2d8 + 6', ac: 13, ac_note: 'Hide Armor',
    speed: 30, str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
    attack_name: 'Greataxe', attack_bonus: 5, attack_damage: '1d12 + 3',
    xp: 100,
  },
  {
    id: 'hobgoblin', name: 'Hobgoblin', type: 'Humanoid', cr: '1/2', size: 'Medium',
    hp: 11, hp_formula: '2d8 + 2', ac: 18, ac_note: 'Chain Mail, Shield',
    speed: 30, str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9,
    attack_name: 'Longsword', attack_bonus: 3, attack_damage: '1d8 + 1',
    xp: 100,
  },
  // CR 1
  {
    id: 'ghoul', name: 'Ghoul', type: 'Undead', cr: 1, size: 'Medium',
    hp: 22, hp_formula: '5d8', ac: 12, ac_note: '',
    speed: 30, str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6,
    attack_name: 'Bite', attack_bonus: 2, attack_damage: '2d6 + 2',
    xp: 200,
  },
  {
    id: 'giant-spider', name: 'Giant Spider', type: 'Beast', cr: 1, size: 'Large',
    hp: 26, hp_formula: '4d10 + 4', ac: 14, ac_note: 'Natural Armor',
    speed: 30, str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4,
    attack_name: 'Bite', attack_bonus: 5, attack_damage: '1d8 + 3',
    xp: 200,
  },
  // CR 2
  {
    id: 'ogre', name: 'Ogre', type: 'Giant', cr: 2, size: 'Large',
    hp: 59, hp_formula: '7d10 + 21', ac: 11, ac_note: 'Hide Armor',
    speed: 40, str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7,
    attack_name: 'Greatclub', attack_bonus: 6, attack_damage: '2d8 + 4',
    xp: 450,
  },
  {
    id: 'harpy', name: 'Harpy', type: 'Monstrosity', cr: 1, size: 'Medium',
    hp: 38, hp_formula: '7d8 + 7', ac: 11, ac_note: '',
    speed: 20, str: 12, dex: 13, con: 12, int: 7, wis: 10, cha: 13,
    attack_name: 'Claws', attack_bonus: 3, attack_damage: '2d4 + 1',
    xp: 200,
  },
  // CR 3
  {
    id: 'werewolf', name: 'Werewolf', type: 'Humanoid', cr: 3, size: 'Medium',
    hp: 84, hp_formula: '9d8 + 45', ac: 12, ac_note: 'In Humanoid Form',
    speed: 30, str: 15, dex: 13, con: 14, int: 10, wis: 11, cha: 10,
    attack_name: 'Multiattack (Bite + Claws)', attack_bonus: 4, attack_damage: '2d6 + 2',
    xp: 700,
  },
  {
    id: 'basilisk', name: 'Basilisk', type: 'Monstrosity', cr: 3, size: 'Medium',
    hp: 52, hp_formula: '8d8 + 16', ac: 15, ac_note: 'Natural Armor',
    speed: 20, str: 16, dex: 8, con: 15, int: 2, wis: 8, cha: 7,
    attack_name: 'Bite', attack_bonus: 5, attack_damage: '2d6 + 3',
    xp: 700,
  },
  {
    id: 'wight', name: 'Wight', type: 'Undead', cr: 3, size: 'Medium',
    hp: 45, hp_formula: '6d8 + 18', ac: 14, ac_note: 'Studded Leather, Shield',
    speed: 30, str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15,
    attack_name: 'Longsword', attack_bonus: 4, attack_damage: '1d8 + 2',
    xp: 700,
  },
  {
    id: 'owlbear', name: 'Owlbear', type: 'Monstrosity', cr: 3, size: 'Large',
    hp: 59, hp_formula: '7d10 + 21', ac: 13, ac_note: 'Natural Armor',
    speed: 40, str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7,
    attack_name: 'Beak', attack_bonus: 7, attack_damage: '1d10 + 5',
    xp: 700,
  },
  // CR 5
  {
    id: 'troll', name: 'Troll', type: 'Giant', cr: 5, size: 'Large',
    hp: 84, hp_formula: '8d10 + 40', ac: 15, ac_note: 'Natural Armor',
    speed: 30, str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7,
    attack_name: 'Multiattack (Bite + 2 Claws)', attack_bonus: 7, attack_damage: '2d6 + 4',
    xp: 1800,
  },
  {
    id: 'vampire-spawn', name: 'Vampire Spawn', type: 'Undead', cr: 5, size: 'Medium',
    hp: 82, hp_formula: '11d8 + 33', ac: 15, ac_note: 'Natural Armor',
    speed: 30, str: 16, dex: 16, con: 16, int: 11, wis: 10, cha: 12,
    attack_name: 'Claws', attack_bonus: 6, attack_damage: '2d6 + 3',
    xp: 1800,
  },
  // CR 6
  {
    id: 'medusa', name: 'Medusa', type: 'Monstrosity', cr: 6, size: 'Medium',
    hp: 127, hp_formula: '17d8 + 51', ac: 15, ac_note: 'Natural Armor',
    speed: 30, str: 10, dex: 15, con: 16, int: 12, wis: 13, cha: 15,
    attack_name: 'Snake Hair', attack_bonus: 5, attack_damage: '4d4 + 2',
    xp: 2300,
  },
  // CR 7
  {
    id: 'young-red-dragon', name: 'Young Red Dragon', type: 'Dragon', cr: 10, size: 'Large',
    hp: 178, hp_formula: '17d10 + 85', ac: 18, ac_note: 'Natural Armor',
    speed: 40, str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19,
    attack_name: 'Multiattack (Bite + 2 Claws)', attack_bonus: 10, attack_damage: '2d10 + 6',
    xp: 5900,
  },
  // CR 13
  {
    id: 'beholder', name: 'Beholder', type: 'Aberration', cr: 13, size: 'Large',
    hp: 180, hp_formula: '19d10 + 76', ac: 18, ac_note: 'Natural Armor',
    speed: 0, str: 10, dex: 14, con: 18, int: 17, wis: 15, cha: 17,
    attack_name: 'Bite', attack_bonus: 5, attack_damage: '4d6',
    xp: 10000,
  },
];

export const MONSTER_MAP: Record<string, MonsterData> = Object.fromEntries(
  MONSTERS.map(m => [m.id, m])
);

/** Format CR for display: fractional CRs as strings, integer CRs as numbers. */
export function formatCR(cr: number | string): string {
  if (typeof cr === 'string') return cr;
  return String(cr);
}
