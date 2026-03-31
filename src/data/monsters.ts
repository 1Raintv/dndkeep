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

  // ── CR 1/8 ─────────────────────────────────────────────────────────
  { id: 'guard', name: 'Guard', type: 'Humanoid', cr: '1/8', size: 'Medium', hp: 11, hp_formula: '2d8 + 2', ac: 16, ac_note: 'Chain Shirt, Shield', speed: 30, str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10, attack_name: 'Spear', attack_bonus: 3, attack_damage: '1d6 + 1', xp: 25 },
  { id: 'tribal-warrior', name: 'Tribal Warrior', type: 'Humanoid', cr: '1/8', size: 'Medium', hp: 11, hp_formula: '2d8 + 2', ac: 12, ac_note: 'Hide Armor', speed: 30, str: 13, dex: 11, con: 12, int: 8, wis: 11, cha: 8, attack_name: 'Greatclub', attack_bonus: 3, attack_damage: '1d8 + 1', xp: 25 },
  { id: 'flumph', name: 'Flumph', type: 'Aberration', cr: '1/8', size: 'Small', hp: 7, hp_formula: '2d6', ac: 12, speed: 0, str: 6, dex: 15, con: 10, int: 14, wis: 14, cha: 11, attack_name: 'Tendrils', attack_bonus: 4, attack_damage: '1d4 + 2', xp: 25 },

  // ── CR 1/4 ─────────────────────────────────────────────────────────
  { id: 'wolf', name: 'Wolf', type: 'Beast', cr: '1/4', size: 'Medium', hp: 11, hp_formula: '2d8 + 2', ac: 13, ac_note: 'Natural Armor', speed: 40, str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6, attack_name: 'Bite', attack_bonus: 4, attack_damage: '2d4 + 2', xp: 50 },
  { id: 'giant-rat', name: 'Giant Rat', type: 'Beast', cr: '1/8', size: 'Small', hp: 7, hp_formula: '2d6', ac: 12, speed: 30, str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4, attack_name: 'Bite', attack_bonus: 4, attack_damage: '1d4 + 2', xp: 25 },
  { id: 'giant-spider', name: 'Giant Spider', type: 'Beast', cr: '1', size: 'Large', hp: 26, hp_formula: '4d10 + 4', ac: 14, ac_note: 'Natural Armor', speed: 30, str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4, attack_name: 'Bite', attack_bonus: 5, attack_damage: '1d8 + 3', xp: 200 },
  { id: 'stirge', name: 'Stirge', type: 'Beast', cr: '1/8', size: 'Tiny', hp: 2, hp_formula: '1d4', ac: 14, ac_note: 'Natural Armor', speed: 10, str: 4, dex: 16, con: 11, int: 2, wis: 8, cha: 6, attack_name: 'Blood Drain', attack_bonus: 5, attack_damage: '1d4 + 3', xp: 25 },
  { id: 'giant-bat', name: 'Giant Bat', type: 'Beast', cr: '1/4', size: 'Large', hp: 22, hp_formula: '4d10', ac: 13, speed: 10, str: 15, dex: 16, con: 11, int: 2, wis: 12, cha: 6, attack_name: 'Bite', attack_bonus: 4, attack_damage: '1d6 + 2', xp: 50 },
  { id: 'swarm-of-rats', name: 'Swarm of Rats', type: 'Beast', cr: '1/4', size: 'Medium', hp: 24, hp_formula: '7d8 - 7', ac: 10, speed: 30, str: 9, dex: 11, con: 9, int: 2, wis: 10, cha: 3, attack_name: 'Bites', attack_bonus: 2, attack_damage: '2d6', xp: 50 },
  { id: 'mud-mephit', name: 'Mud Mephit', type: 'Elemental', cr: '1/4', size: 'Small', hp: 27, hp_formula: '6d6 + 6', ac: 11, speed: 20, str: 8, dex: 12, con: 12, int: 9, wis: 11, cha: 7, attack_name: 'Fists', attack_bonus: 3, attack_damage: '2d4 + 1', xp: 50 },
  { id: 'smoke-mephit', name: 'Smoke Mephit', type: 'Elemental', cr: '1/4', size: 'Small', hp: 22, hp_formula: '5d6 + 5', ac: 12, speed: 30, str: 6, dex: 14, con: 12, int: 10, wis: 10, cha: 11, attack_name: 'Claws', attack_bonus: 4, attack_damage: '2d4 + 2', xp: 50 },

  // ── CR 1/2 ─────────────────────────────────────────────────────────
  { id: 'black-bear', name: 'Black Bear', type: 'Beast', cr: '1/2', size: 'Medium', hp: 19, hp_formula: '3d8 + 6', ac: 11, ac_note: 'Natural Armor', speed: 40, str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7, attack_name: 'Claws', attack_bonus: 4, attack_damage: '2d6 + 2', xp: 100 },
  { id: 'crocodile', name: 'Crocodile', type: 'Beast', cr: '1/2', size: 'Large', hp: 19, hp_formula: '3d10 + 3', ac: 12, ac_note: 'Natural Armor', speed: 20, str: 15, dex: 10, con: 13, int: 2, wis: 10, cha: 5, attack_name: 'Bite', attack_bonus: 4, attack_damage: '1d10 + 2', xp: 100 },
  { id: 'gnoll', name: 'Gnoll', type: 'Humanoid', cr: '1/2', size: 'Medium', hp: 22, hp_formula: '5d8', ac: 15, ac_note: 'Hide Armor, Shield', speed: 30, str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7, attack_name: 'Spear', attack_bonus: 4, attack_damage: '1d6 + 2', xp: 100 },
  { id: 'shadow', name: 'Shadow', type: 'Undead', cr: '1/2', size: 'Medium', hp: 16, hp_formula: '3d8 + 3', ac: 12, speed: 40, str: 6, dex: 14, con: 13, int: 6, wis: 10, cha: 8, attack_name: 'Strength Drain', attack_bonus: 4, attack_damage: '2d6 + 2', xp: 100 },
  { id: 'scout', name: 'Scout', type: 'Humanoid', cr: '1/2', size: 'Medium', hp: 16, hp_formula: '3d8 + 3', ac: 13, ac_note: 'Leather Armor', speed: 30, str: 11, dex: 14, con: 12, int: 11, wis: 13, cha: 11, attack_name: 'Shortsword', attack_bonus: 4, attack_damage: '1d6 + 2', xp: 100 },
  { id: 'cockatrice', name: 'Cockatrice', type: 'Monstrosity', cr: '1/2', size: 'Small', hp: 27, hp_formula: '6d6 + 6', ac: 11, speed: 20, str: 6, dex: 12, con: 12, int: 2, wis: 13, cha: 5, attack_name: 'Beak', attack_bonus: 3, attack_damage: '1d4 + 1', xp: 100 },
  { id: 'dust-mephit', name: 'Dust Mephit', type: 'Elemental', cr: '1/2', size: 'Small', hp: 17, hp_formula: '5d6', ac: 12, speed: 30, str: 5, dex: 14, con: 10, int: 9, wis: 11, cha: 10, attack_name: 'Claws', attack_bonus: 4, attack_damage: '2d4 + 2', xp: 100 },

  // ── CR 1 ───────────────────────────────────────────────────────────
  { id: 'dire-wolf', name: 'Dire Wolf', type: 'Beast', cr: '1', size: 'Large', hp: 37, hp_formula: '5d10 + 10', ac: 14, ac_note: 'Natural Armor', speed: 50, str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7, attack_name: 'Bite', attack_bonus: 5, attack_damage: '2d6 + 3', xp: 200 },
  { id: 'ghoul', name: 'Ghoul', type: 'Undead', cr: '1', size: 'Medium', hp: 22, hp_formula: '5d8', ac: 12, speed: 30, str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6, attack_name: 'Claws', attack_bonus: 4, attack_damage: '2d4 + 2', xp: 200 },
  { id: 'harpy', name: 'Harpy', type: 'Monstrosity', cr: '1', size: 'Medium', hp: 38, hp_formula: '7d8 + 7', ac: 11, speed: 20, str: 12, dex: 13, con: 12, int: 7, wis: 10, cha: 13, attack_name: 'Claws', attack_bonus: 3, attack_damage: '2d4 + 1', xp: 200 },
  { id: 'imp', name: 'Imp', type: 'Fiend', cr: '1', size: 'Tiny', hp: 10, hp_formula: '3d4 + 3', ac: 13, speed: 20, str: 6, dex: 17, con: 13, int: 11, wis: 12, cha: 14, attack_name: 'Sting', attack_bonus: 5, attack_damage: '1d4 + 3', xp: 200 },
  { id: 'giant-hyena', name: 'Giant Hyena', type: 'Beast', cr: '1', size: 'Large', hp: 45, hp_formula: '6d10 + 12', ac: 12, ac_note: 'Natural Armor', speed: 50, str: 16, dex: 14, con: 14, int: 2, wis: 12, cha: 7, attack_name: 'Bite', attack_bonus: 5, attack_damage: '2d6 + 3', xp: 200 },
  { id: 'specter', name: 'Specter', type: 'Undead', cr: '1', size: 'Medium', hp: 22, hp_formula: '5d8', ac: 12, speed: 50, str: 1, dex: 14, con: 11, int: 10, wis: 10, cha: 11, attack_name: 'Life Drain', attack_bonus: 4, attack_damage: '3d6', xp: 200 },
  { id: 'brown-bear', name: 'Brown Bear', type: 'Beast', cr: '1', size: 'Large', hp: 34, hp_formula: '4d10 + 12', ac: 11, ac_note: 'Natural Armor', speed: 40, str: 19, dex: 10, con: 16, int: 2, wis: 13, cha: 7, attack_name: 'Claws', attack_bonus: 6, attack_damage: '2d6 + 4', xp: 200 },
  { id: 'dryad', name: 'Dryad', type: 'Fey', cr: '1', size: 'Medium', hp: 22, hp_formula: '5d8', ac: 11, ac_note: 'Natural Armor', speed: 30, str: 10, dex: 12, con: 11, int: 14, wis: 15, cha: 18, attack_name: 'Club', attack_bonus: 2, attack_damage: '1d4', xp: 200 },
  { id: 'kuo-toa', name: 'Kuo-toa', type: 'Humanoid', cr: '1/4', size: 'Medium', hp: 18, hp_formula: '4d8', ac: 13, ac_note: 'Natural Armor, Shield', speed: 30, str: 13, dex: 10, con: 11, int: 11, wis: 10, cha: 8, attack_name: 'Spear', attack_bonus: 3, attack_damage: '1d6 + 1', xp: 50 },
  { id: 'needle-blight', name: 'Needle Blight', type: 'Plant', cr: '1/4', size: 'Medium', hp: 11, hp_formula: '2d8 + 2', ac: 12, ac_note: 'Natural Armor', speed: 30, str: 12, dex: 12, con: 13, int: 4, wis: 8, cha: 3, attack_name: 'Needles', attack_bonus: 3, attack_damage: '2d4 + 1', xp: 50 },
  { id: 'twig-blight', name: 'Twig Blight', type: 'Plant', cr: '1/8', size: 'Small', hp: 4, hp_formula: '1d6 + 1', ac: 13, ac_note: 'Natural Armor', speed: 20, str: 6, dex: 13, con: 12, int: 4, wis: 8, cha: 3, attack_name: 'Claws', attack_bonus: 3, attack_damage: '1d4 + 1', xp: 25 },

  // ── CR 2 ───────────────────────────────────────────────────────────
  { id: 'gargoyle', name: 'Gargoyle', type: 'Elemental', cr: '2', size: 'Medium', hp: 52, hp_formula: '7d8 + 21', ac: 15, ac_note: 'Natural Armor', speed: 30, str: 15, dex: 11, con: 16, int: 6, wis: 11, cha: 7, attack_name: 'Claws', attack_bonus: 4, attack_damage: '2d6 + 2', xp: 450 },
  { id: 'gelatinous-cube', name: 'Gelatinous Cube', type: 'Ooze', cr: '2', size: 'Large', hp: 84, hp_formula: '8d10 + 40', ac: 6, speed: 15, str: 14, dex: 3, con: 20, int: 1, wis: 6, cha: 1, attack_name: 'Pseudopod', attack_bonus: 4, attack_damage: '3d6 + 2', xp: 450 },
  { id: 'ghast', name: 'Ghast', type: 'Undead', cr: '2', size: 'Medium', hp: 36, hp_formula: '8d8', ac: 13, speed: 30, str: 16, dex: 17, con: 10, int: 11, wis: 10, cha: 8, attack_name: 'Claws', attack_bonus: 5, attack_damage: '2d6 + 3', xp: 450 },
  { id: 'gibbering-mouther', name: 'Gibbering Mouther', type: 'Aberration', cr: '2', size: 'Medium', hp: 67, hp_formula: '9d8 + 27', ac: 9, speed: 10, str: 10, dex: 8, con: 16, int: 3, wis: 10, cha: 6, attack_name: 'Bites', attack_bonus: 2, attack_damage: '5d6', xp: 450 },
  { id: 'hobgoblin', name: 'Hobgoblin', type: 'Humanoid', cr: '1/2', size: 'Medium', hp: 11, hp_formula: '2d8 + 2', ac: 18, ac_note: 'Chain Mail, Shield', speed: 30, str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9, attack_name: 'Longsword', attack_bonus: 3, attack_damage: '1d8 + 1', xp: 100 },
  { id: 'lizardfolk', name: 'Lizardfolk', type: 'Humanoid', cr: '1/2', size: 'Medium', hp: 22, hp_formula: '4d8 + 4', ac: 15, ac_note: 'Natural Armor, Shield', speed: 30, str: 15, dex: 10, con: 13, int: 7, wis: 12, cha: 7, attack_name: 'Bite', attack_bonus: 4, attack_damage: '1d6 + 2', xp: 100 },
  { id: 'vine-blight', name: 'Vine Blight', type: 'Plant', cr: '1/2', size: 'Medium', hp: 26, hp_formula: '4d8 + 8', ac: 12, ac_note: 'Natural Armor', speed: 10, str: 15, dex: 8, con: 14, int: 5, wis: 10, cha: 3, attack_name: 'Constrict', attack_bonus: 4, attack_damage: '2d6 + 2', xp: 100 },
  { id: 'polar-bear', name: 'Polar Bear', type: 'Beast', cr: '2', size: 'Large', hp: 42, hp_formula: '5d10 + 15', ac: 12, ac_note: 'Natural Armor', speed: 40, str: 20, dex: 10, con: 16, int: 2, wis: 13, cha: 7, attack_name: 'Claws', attack_bonus: 7, attack_damage: '2d6 + 5', xp: 450 },
  { id: 'nothic', name: 'Nothic', type: 'Aberration', cr: '2', size: 'Medium', hp: 45, hp_formula: '6d8 + 18', ac: 15, ac_note: 'Natural Armor', speed: 30, str: 14, dex: 16, con: 16, int: 13, wis: 10, cha: 8, attack_name: 'Rotting Gaze', attack_bonus: 4, attack_damage: '3d6 + 3', xp: 450 },
  { id: 'ankheg', name: 'Ankheg', type: 'Monstrosity', cr: '2', size: 'Large', hp: 39, hp_formula: '6d10 + 6', ac: 14, ac_note: 'Natural Armor', speed: 30, str: 17, dex: 11, con: 13, int: 1, wis: 13, cha: 6, attack_name: 'Bite', attack_bonus: 5, attack_damage: '2d6 + 3', xp: 450 },

  // ── CR 3 ───────────────────────────────────────────────────────────
  { id: 'bugbear', name: 'Bugbear', type: 'Humanoid', cr: '1', size: 'Medium', hp: 27, hp_formula: '5d8 + 5', ac: 16, ac_note: 'Hide Armor, Shield', speed: 30, str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9, attack_name: 'Morningstar', attack_bonus: 4, attack_damage: '2d8 + 2', xp: 200 },
  { id: 'wight', name: 'Wight', type: 'Undead', cr: '3', size: 'Medium', hp: 45, hp_formula: '6d8 + 18', ac: 14, ac_note: 'Studded Leather', speed: 30, str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15, attack_name: 'Longsword', attack_bonus: 4, attack_damage: '1d8 + 2', xp: 700 },
  { id: 'basilisk', name: 'Basilisk', type: 'Monstrosity', cr: '3', size: 'Medium', hp: 52, hp_formula: '8d8 + 16', ac: 15, ac_note: 'Natural Armor', speed: 20, str: 16, dex: 8, con: 15, int: 2, wis: 8, cha: 7, attack_name: 'Bite', attack_bonus: 5, attack_damage: '2d6 + 3', xp: 700 },
  { id: 'displacer-beast', name: 'Displacer Beast', type: 'Monstrosity', cr: '3', size: 'Large', hp: 85, hp_formula: '10d10 + 30', ac: 13, ac_note: 'Natural Armor', speed: 40, str: 18, dex: 15, con: 16, int: 6, wis: 12, cha: 8, attack_name: 'Tentacle', attack_bonus: 6, attack_damage: '1d6 + 4', xp: 700 },
  { id: 'doppelganger', name: 'Doppelganger', type: 'Monstrosity', cr: '3', size: 'Medium', hp: 52, hp_formula: '8d8 + 16', ac: 14, speed: 30, str: 11, dex: 18, con: 14, int: 11, wis: 12, cha: 14, attack_name: 'Slam', attack_bonus: 6, attack_damage: '2d6 + 4', xp: 700 },
  { id: 'green-hag', name: 'Green Hag', type: 'Fey', cr: '3', size: 'Medium', hp: 82, hp_formula: '11d8 + 33', ac: 17, ac_note: 'Natural Armor', speed: 30, str: 18, dex: 12, con: 16, int: 13, wis: 14, cha: 14, attack_name: 'Claws', attack_bonus: 6, attack_damage: '2d6 + 4', xp: 700 },
  { id: 'hell-hound', name: 'Hell Hound', type: 'Fiend', cr: '3', size: 'Medium', hp: 45, hp_formula: '7d8 + 14', ac: 15, ac_note: 'Natural Armor', speed: 50, str: 17, dex: 12, con: 14, int: 6, wis: 13, cha: 6, attack_name: 'Bite', attack_bonus: 5, attack_damage: '1d8 + 3', xp: 700 },
  { id: 'manticore', name: 'Manticore', type: 'Monstrosity', cr: '3', size: 'Large', hp: 68, hp_formula: '8d10 + 24', ac: 14, ac_note: 'Natural Armor', speed: 30, str: 17, dex: 16, con: 17, int: 7, wis: 12, cha: 8, attack_name: 'Claws', attack_bonus: 5, attack_damage: '2d6 + 3', xp: 700 },
  { id: 'owlbear', name: 'Owlbear', type: 'Monstrosity', cr: '3', size: 'Large', hp: 59, hp_formula: '7d10 + 21', ac: 13, ac_note: 'Natural Armor', speed: 40, str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7, attack_name: 'Claws', attack_bonus: 7, attack_damage: '2d8 + 5', xp: 700 },

  // ── CR 4 ───────────────────────────────────────────────────────────
  { id: 'banshee', name: 'Banshee', type: 'Undead', cr: '4', size: 'Medium', hp: 58, hp_formula: '13d8', ac: 12, speed: 40, str: 1, dex: 14, con: 10, int: 12, wis: 11, cha: 17, attack_name: 'Corrupting Touch', attack_bonus: 4, attack_damage: '3d6', xp: 1100 },
  { id: 'black-pudding', name: 'Black Pudding', type: 'Ooze', cr: '4', size: 'Large', hp: 85, hp_formula: '10d10 + 30', ac: 7, speed: 20, str: 16, dex: 5, con: 16, int: 1, wis: 6, cha: 1, attack_name: 'Pseudopod', attack_bonus: 5, attack_damage: '4d8 + 3', xp: 1100 },
  { id: 'chuul', name: 'Chuul', type: 'Aberration', cr: '4', size: 'Large', hp: 93, hp_formula: '11d10 + 33', ac: 16, ac_note: 'Natural Armor', speed: 30, str: 19, dex: 10, con: 16, int: 5, wis: 11, cha: 5, attack_name: 'Pincer', attack_bonus: 6, attack_damage: '2d6 + 4', xp: 1100 },
  { id: 'ettin', name: 'Ettin', type: 'Giant', cr: '4', size: 'Large', hp: 85, hp_formula: '10d10 + 30', ac: 12, ac_note: 'Natural Armor', speed: 40, str: 21, dex: 8, con: 17, int: 6, wis: 10, cha: 8, attack_name: 'Battleaxe', attack_bonus: 7, attack_damage: '2d8 + 5', xp: 1100 },
  { id: 'werewolf', name: 'Werewolf', type: 'Humanoid', cr: '3', size: 'Medium', hp: 58, hp_formula: '9d8 + 18', ac: 11, speed: 30, str: 15, dex: 13, con: 14, int: 10, wis: 11, cha: 10, attack_name: 'Bite', attack_bonus: 4, attack_damage: '2d6 + 2', xp: 700 },
  { id: 'werebear', name: 'Werebear', type: 'Humanoid', cr: '5', size: 'Medium', hp: 135, hp_formula: '18d8 + 54', ac: 11, speed: 30, str: 19, dex: 10, con: 17, int: 11, wis: 12, cha: 12, attack_name: 'Claw', attack_bonus: 7, attack_damage: '2d8 + 4', xp: 1800 },

  // ── CR 5 ───────────────────────────────────────────────────────────
  { id: 'flesh-golem', name: 'Flesh Golem', type: 'Construct', cr: '5', size: 'Medium', hp: 93, hp_formula: '11d8 + 44', ac: 9, speed: 30, str: 19, dex: 9, con: 18, int: 6, wis: 10, cha: 5, attack_name: 'Slam', attack_bonus: 7, attack_damage: '2d8 + 4', xp: 1800 },
  { id: 'hill-giant', name: 'Hill Giant', type: 'Giant', cr: '5', size: 'Huge', hp: 105, hp_formula: '10d12 + 40', ac: 13, ac_note: 'Natural Armor', speed: 40, str: 21, dex: 8, con: 19, int: 5, wis: 9, cha: 6, attack_name: 'Greatclub', attack_bonus: 8, attack_damage: '3d8 + 5', xp: 1800 },
  { id: 'roper', name: 'Roper', type: 'Monstrosity', cr: '5', size: 'Large', hp: 93, hp_formula: '11d10 + 33', ac: 20, ac_note: 'Natural Armor', speed: 10, str: 18, dex: 8, con: 17, int: 7, wis: 16, cha: 6, attack_name: 'Tendril', attack_bonus: 7, attack_damage: '2d6 + 4', xp: 1800 },
  { id: 'revenant', name: 'Revenant', type: 'Undead', cr: '5', size: 'Medium', hp: 136, hp_formula: '16d8 + 64', ac: 13, speed: 30, str: 18, dex: 14, con: 18, int: 13, wis: 16, cha: 18, attack_name: 'Fist', attack_bonus: 7, attack_damage: '2d6 + 4', xp: 1800 },
  { id: 'lamia', name: 'Lamia', type: 'Monstrosity', cr: '4', size: 'Large', hp: 97, hp_formula: '13d10 + 26', ac: 13, ac_note: 'Natural Armor', speed: 30, str: 16, dex: 13, con: 15, int: 14, wis: 15, cha: 16, attack_name: 'Claws', attack_bonus: 5, attack_damage: '2d10 + 3', xp: 1100 },

  // ── CR 6–8 ─────────────────────────────────────────────────────────
  { id: 'chimera', name: 'Chimera', type: 'Monstrosity', cr: '6', size: 'Large', hp: 114, hp_formula: '12d10 + 48', ac: 14, ac_note: 'Natural Armor', speed: 30, str: 19, dex: 11, con: 19, int: 3, wis: 14, cha: 10, attack_name: 'Bite', attack_bonus: 7, attack_damage: '2d8 + 4', xp: 2300 },
  { id: 'cyclops', name: 'Cyclops', type: 'Giant', cr: '6', size: 'Huge', hp: 138, hp_formula: '12d12 + 60', ac: 14, ac_note: 'Natural Armor', speed: 30, str: 22, dex: 11, con: 20, int: 8, wis: 6, cha: 9, attack_name: 'Greatclub', attack_bonus: 9, attack_damage: '3d8 + 6', xp: 2300 },
  { id: 'medusa', name: 'Medusa', type: 'Monstrosity', cr: '6', size: 'Medium', hp: 127, hp_formula: '17d8 + 51', ac: 15, ac_note: 'Natural Armor', speed: 30, str: 10, dex: 15, con: 16, int: 12, wis: 13, cha: 15, attack_name: 'Snakes', attack_bonus: 5, attack_damage: '1d4 + 2', xp: 2300 },
  { id: 'oni', name: 'Oni', type: 'Giant', cr: '7', size: 'Large', hp: 110, hp_formula: '13d10 + 39', ac: 16, ac_note: 'Chain Mail', speed: 30, str: 19, dex: 11, con: 16, int: 14, wis: 12, cha: 15, attack_name: 'Glaive', attack_bonus: 7, attack_damage: '2d10 + 4', xp: 2900 },
  { id: 'hydra', name: 'Hydra', type: 'Monstrosity', cr: '8', size: 'Huge', hp: 172, hp_formula: '15d12 + 75', ac: 15, ac_note: 'Natural Armor', speed: 30, str: 20, dex: 12, con: 20, int: 2, wis: 10, cha: 7, attack_name: 'Bite', attack_bonus: 8, attack_damage: '1d10 + 5', xp: 3900 },
  { id: 'stone-giant', name: 'Stone Giant', type: 'Giant', cr: '7', size: 'Huge', hp: 126, hp_formula: '11d12 + 55', ac: 17, ac_note: 'Natural Armor', speed: 40, str: 23, dex: 15, con: 20, int: 10, wis: 12, cha: 9, attack_name: 'Greatclub', attack_bonus: 9, attack_damage: '3d8 + 6', xp: 2900 },
  { id: 'fire-giant', name: 'Fire Giant', type: 'Giant', cr: '9', size: 'Huge', hp: 162, hp_formula: '13d12 + 78', ac: 18, ac_note: 'Plate', speed: 30, str: 25, dex: 9, con: 23, int: 10, wis: 14, cha: 13, attack_name: 'Greatsword', attack_bonus: 11, attack_damage: '6d6 + 7', xp: 5000 },
  { id: 'frost-giant', name: 'Frost Giant', type: 'Giant', cr: '8', size: 'Huge', hp: 138, hp_formula: '12d12 + 60', ac: 15, ac_note: 'Patchwork Armor', speed: 40, str: 23, dex: 9, con: 21, int: 9, wis: 10, cha: 12, attack_name: 'Greataxe', attack_bonus: 9, attack_damage: '3d12 + 6', xp: 3900 },

  // ── CR 9–12 ────────────────────────────────────────────────────────
  { id: 'abominable-yeti', name: 'Abominable Yeti', type: 'Monstrosity', cr: '9', size: 'Huge', hp: 137, hp_formula: '11d12 + 66', ac: 15, ac_note: 'Natural Armor', speed: 40, str: 24, dex: 10, con: 22, int: 9, wis: 13, cha: 9, attack_name: 'Claw', attack_bonus: 11, attack_damage: '2d6 + 7', xp: 5000 },
  { id: 'cloud-giant', name: 'Cloud Giant', type: 'Giant', cr: '9', size: 'Huge', hp: 200, hp_formula: '16d12 + 96', ac: 14, ac_note: 'Natural Armor', speed: 40, str: 27, dex: 10, con: 22, int: 12, wis: 16, cha: 16, attack_name: 'Morningstar', attack_bonus: 12, attack_damage: '3d8 + 8', xp: 5000 },
  { id: 'aboleth', name: 'Aboleth', type: 'Aberration', cr: '10', size: 'Large', hp: 135, hp_formula: '18d10 + 36', ac: 17, ac_note: 'Natural Armor', speed: 10, str: 21, dex: 9, con: 15, int: 18, wis: 15, cha: 18, attack_name: 'Tentacle', attack_bonus: 9, attack_damage: '2d6 + 5', xp: 5900 },
  { id: 'storm-giant', name: 'Storm Giant', type: 'Giant', cr: '13', size: 'Huge', hp: 230, hp_formula: '20d12 + 100', ac: 16, ac_note: 'Scale Mail', speed: 50, str: 29, dex: 14, con: 20, int: 16, wis: 18, cha: 18, attack_name: 'Greatsword', attack_bonus: 14, attack_damage: '6d6 + 9', xp: 10000 },
  { id: 'vampire', name: 'Vampire', type: 'Undead', cr: '13', size: 'Medium', hp: 144, hp_formula: '17d8 + 68', ac: 16, ac_note: 'Natural Armor', speed: 30, str: 18, dex: 18, con: 18, int: 17, wis: 15, cha: 18, attack_name: 'Unarmed Strike', attack_bonus: 9, attack_damage: '1d8 + 4', xp: 10000 },
  { id: 'vampire-spawn', name: 'Vampire Spawn', type: 'Undead', cr: '5', size: 'Medium', hp: 82, hp_formula: '11d8 + 33', ac: 15, ac_note: 'Natural Armor', speed: 30, str: 16, dex: 16, con: 16, int: 11, wis: 10, cha: 12, attack_name: 'Claws', attack_bonus: 6, attack_damage: '2d4 + 3', xp: 1800 },
  { id: 'lich', name: 'Lich', type: 'Undead', cr: '21', size: 'Medium', hp: 135, hp_formula: '18d8 + 54', ac: 17, ac_note: 'Natural Armor', speed: 30, str: 11, dex: 16, con: 16, int: 20, wis: 14, cha: 16, attack_name: 'Paralyzing Touch', attack_bonus: 12, attack_damage: '3d6', xp: 33000 },
  { id: 'pit-fiend', name: 'Pit Fiend', type: 'Fiend', cr: '20', size: 'Large', hp: 300, hp_formula: '24d10 + 168', ac: 19, ac_note: 'Natural Armor', speed: 30, str: 26, dex: 14, con: 24, int: 22, wis: 18, cha: 24, attack_name: 'Bite', attack_bonus: 14, attack_damage: '4d6 + 8', xp: 25000 },
  { id: 'marilith', name: 'Marilith', type: 'Fiend', cr: '16', size: 'Large', hp: 189, hp_formula: '18d10 + 90', ac: 18, ac_note: 'Natural Armor', speed: 40, str: 18, dex: 20, con: 20, int: 18, wis: 16, cha: 20, attack_name: 'Longsword', attack_bonus: 9, attack_damage: '2d8 + 5', xp: 15000 },
  { id: 'beholder', name: 'Beholder', type: 'Aberration', cr: '13', size: 'Large', hp: 180, hp_formula: '19d10 + 76', ac: 18, ac_note: 'Natural Armor', speed: 0, str: 10, dex: 14, con: 18, int: 17, wis: 15, cha: 17, attack_name: 'Bite', attack_bonus: 5, attack_damage: '4d6', xp: 10000 },
];

export const MONSTER_MAP: Record<string, MonsterData> = Object.fromEntries(
  MONSTERS.map(m => [m.id, m])
);

/** Format CR for display: fractional CRs as strings, integer CRs as numbers. */
export function formatCR(cr: number | string): string {
  if (typeof cr === 'string') return cr;
  return String(cr);
}
