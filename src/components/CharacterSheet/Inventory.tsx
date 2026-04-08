import { useState, useRef, useEffect } from 'react';
import type { Character, InventoryItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface InventoryProps {
  character: Character;
  onUpdateInventory: (items: InventoryItem[]) => void;
  onUpdateCurrency: (currency: Character['currency']) => void;
}

// ── SRD Equipment Catalogue ────────────────────────────────────────
type ItemCategory = 'Weapon' | 'Armor' | 'Adventuring Gear' | 'Tools' | 'Mount & Vehicle' | 'Trade Good' | 'Magic Item';

interface CatalogueItem {
  name: string;
  category: ItemCategory;
  weight: number;
  cost?: string;
  notes?: string;
}

const CATALOGUE: CatalogueItem[] = [
  // Weapons — Simple Melee
  { name: 'Club', category: 'Weapon', weight: 2, cost: '1 sp', notes: '1d4 bludgeoning' },
  { name: 'Dagger', category: 'Weapon', weight: 1, cost: '2 gp', notes: '1d4 piercing, finesse, light, thrown' },
  { name: 'Greatclub', category: 'Weapon', weight: 10, cost: '2 sp', notes: '1d8 bludgeoning, two-handed' },
  { name: 'Handaxe', category: 'Weapon', weight: 2, cost: '5 gp', notes: '1d6 slashing, light, thrown' },
  { name: 'Javelin', category: 'Weapon', weight: 2, cost: '5 sp', notes: '1d6 piercing, thrown' },
  { name: 'Light Hammer', category: 'Weapon', weight: 2, cost: '2 gp', notes: '1d4 bludgeoning, light, thrown' },
  { name: 'Mace', category: 'Weapon', weight: 4, cost: '5 gp', notes: '1d6 bludgeoning' },
  { name: 'Quarterstaff', category: 'Weapon', weight: 4, cost: '2 sp', notes: '1d6/1d8 bludgeoning, versatile' },
  { name: 'Sickle', category: 'Weapon', weight: 2, cost: '1 gp', notes: '1d4 slashing, light' },
  { name: 'Spear', category: 'Weapon', weight: 3, cost: '1 gp', notes: '1d6/1d8 piercing, thrown, versatile' },
  // Weapons — Simple Ranged
  { name: 'Crossbow, Light', category: 'Weapon', weight: 5, cost: '25 gp', notes: '1d8 piercing, loading, two-handed' },
  { name: 'Dart', category: 'Weapon', weight: 0.25, cost: '5 cp', notes: '1d4 piercing, finesse, thrown' },
  { name: 'Shortbow', category: 'Weapon', weight: 2, cost: '25 gp', notes: '1d6 piercing, two-handed' },
  { name: 'Sling', category: 'Weapon', weight: 0, cost: '1 sp', notes: '1d4 bludgeoning' },
  // Weapons — Martial Melee
  { name: 'Battleaxe', category: 'Weapon', weight: 4, cost: '10 gp', notes: '1d8/1d10 slashing, versatile' },
  { name: 'Flail', category: 'Weapon', weight: 2, cost: '10 gp', notes: '1d8 bludgeoning' },
  { name: 'Glaive', category: 'Weapon', weight: 6, cost: '20 gp', notes: '1d10 slashing, reach, two-handed' },
  { name: 'Greataxe', category: 'Weapon', weight: 7, cost: '30 gp', notes: '1d12 slashing, heavy, two-handed' },
  { name: 'Greatsword', category: 'Weapon', weight: 6, cost: '50 gp', notes: '2d6 slashing, heavy, two-handed' },
  { name: 'Halberd', category: 'Weapon', weight: 6, cost: '20 gp', notes: '1d10 slashing, heavy, reach, two-handed' },
  { name: 'Lance', category: 'Weapon', weight: 6, cost: '10 gp', notes: '1d12 piercing, reach' },
  { name: 'Longsword', category: 'Weapon', weight: 3, cost: '15 gp', notes: '1d8/1d10 slashing, versatile' },
  { name: 'Maul', category: 'Weapon', weight: 10, cost: '10 gp', notes: '2d6 bludgeoning, heavy, two-handed' },
  { name: 'Morningstar', category: 'Weapon', weight: 4, cost: '15 gp', notes: '1d8 piercing' },
  { name: 'Pike', category: 'Weapon', weight: 18, cost: '5 gp', notes: '1d10 piercing, heavy, reach, two-handed' },
  { name: 'Rapier', category: 'Weapon', weight: 2, cost: '25 gp', notes: '1d8 piercing, finesse' },
  { name: 'Scimitar', category: 'Weapon', weight: 3, cost: '25 gp', notes: '1d6 slashing, finesse, light' },
  { name: 'Shortsword', category: 'Weapon', weight: 2, cost: '10 gp', notes: '1d6 piercing, finesse, light' },
  { name: 'Trident', category: 'Weapon', weight: 4, cost: '5 gp', notes: '1d6/1d8 piercing, thrown, versatile' },
  { name: 'War Pick', category: 'Weapon', weight: 2, cost: '5 gp', notes: '1d8 piercing' },
  { name: 'Warhammer', category: 'Weapon', weight: 2, cost: '15 gp', notes: '1d8/1d10 bludgeoning, versatile' },
  { name: 'Whip', category: 'Weapon', weight: 3, cost: '2 gp', notes: '1d4 slashing, finesse, reach' },
  // Weapons — Martial Ranged
  { name: 'Blowgun', category: 'Weapon', weight: 1, cost: '10 gp', notes: '1 piercing, loading' },
  { name: 'Crossbow, Hand', category: 'Weapon', weight: 3, cost: '75 gp', notes: '1d6 piercing, light, loading' },
  { name: 'Crossbow, Heavy', category: 'Weapon', weight: 18, cost: '50 gp', notes: '1d10 piercing, heavy, loading, two-handed' },
  { name: 'Longbow', category: 'Weapon', weight: 2, cost: '50 gp', notes: '1d8 piercing, heavy, two-handed' },
  { name: 'Net', category: 'Weapon', weight: 3, cost: '1 gp', notes: 'Thrown, special' },
  // Armor — Light
  { name: 'Padded Armor', category: 'Armor', weight: 8, cost: '5 gp', notes: 'AC 11 + DEX, disadvantage on Stealth' },
  { name: 'Leather Armor', category: 'Armor', weight: 10, cost: '10 gp', notes: 'AC 11 + DEX' },
  { name: 'Studded Leather', category: 'Armor', weight: 13, cost: '45 gp', notes: 'AC 12 + DEX' },
  // Armor — Medium
  { name: 'Hide Armor', category: 'Armor', weight: 12, cost: '10 gp', notes: 'AC 12 + DEX (max 2)' },
  { name: 'Chain Shirt', category: 'Armor', weight: 20, cost: '50 gp', notes: 'AC 13 + DEX (max 2)' },
  { name: 'Scale Mail', category: 'Armor', weight: 45, cost: '50 gp', notes: 'AC 14 + DEX (max 2), Stealth disadvantage' },
  { name: 'Breastplate', category: 'Armor', weight: 20, cost: '400 gp', notes: 'AC 14 + DEX (max 2)' },
  { name: 'Half Plate', category: 'Armor', weight: 40, cost: '750 gp', notes: 'AC 15 + DEX (max 2), Stealth disadvantage' },
  // Armor — Heavy
  { name: 'Ring Mail', category: 'Armor', weight: 40, cost: '30 gp', notes: 'AC 14, Stealth disadvantage' },
  { name: 'Chain Mail', category: 'Armor', weight: 55, cost: '75 gp', notes: 'AC 16, STR 13, Stealth disadvantage' },
  { name: 'Splint Armor', category: 'Armor', weight: 60, cost: '200 gp', notes: 'AC 17, STR 15, Stealth disadvantage' },
  { name: 'Plate Armor', category: 'Armor', weight: 65, cost: '1500 gp', notes: 'AC 18, STR 15, Stealth disadvantage' },
  // Shields
  { name: 'Shield', category: 'Armor', weight: 6, cost: '10 gp', notes: '+2 AC' },
  // Adventuring Gear
  { name: 'Abacus', category: 'Adventuring Gear', weight: 2, cost: '2 gp' },
  { name: 'Acid (vial)', category: 'Adventuring Gear', weight: 1, cost: '25 gp', notes: 'Thrown, 2d6 acid damage' },
  { name: 'Alchemist\'s Fire', category: 'Adventuring Gear', weight: 1, cost: '50 gp', notes: '1d4 fire/turn until extinguished' },
  { name: 'Arrows (20)', category: 'Adventuring Gear', weight: 1, cost: '1 gp' },
  { name: 'Backpack', category: 'Adventuring Gear', weight: 5, cost: '2 gp', notes: 'Holds 30 lb / 1 cu ft' },
  { name: 'Ball Bearings (1000)', category: 'Adventuring Gear', weight: 2, cost: '1 gp' },
  { name: 'Bedroll', category: 'Adventuring Gear', weight: 7, cost: '1 gp' },
  { name: 'Bell', category: 'Adventuring Gear', weight: 0, cost: '1 gp' },
  { name: 'Blanket', category: 'Adventuring Gear', weight: 3, cost: '5 sp' },
  { name: 'Blowgun Needles (50)', category: 'Adventuring Gear', weight: 1, cost: '1 gp' },
  { name: 'Book', category: 'Adventuring Gear', weight: 5, cost: '25 gp' },
  { name: 'Bottle, Glass', category: 'Adventuring Gear', weight: 2, cost: '2 gp' },
  { name: 'Bucket', category: 'Adventuring Gear', weight: 2, cost: '5 cp' },
  { name: 'Caltrops (bag of 20)', category: 'Adventuring Gear', weight: 2, cost: '1 gp' },
  { name: 'Candle', category: 'Adventuring Gear', weight: 0, cost: '1 cp', notes: '5 ft bright, 5 ft dim for 1 hr' },
  { name: 'Crossbow Bolts (20)', category: 'Adventuring Gear', weight: 1.5, cost: '1 gp' },
  { name: 'Chain (10 feet)', category: 'Adventuring Gear', weight: 10, cost: '5 gp' },
  { name: 'Chalk (1 piece)', category: 'Adventuring Gear', weight: 0, cost: '1 cp' },
  { name: 'Chest', category: 'Adventuring Gear', weight: 25, cost: '5 gp', notes: 'Holds 300 lb / 12 cu ft' },
  { name: 'Climber\'s Kit', category: 'Adventuring Gear', weight: 12, cost: '25 gp' },
  { name: 'Crowbar', category: 'Adventuring Gear', weight: 5, cost: '2 gp', notes: 'Advantage on STR checks to open' },
  { name: 'Disguise Kit', category: 'Adventuring Gear', weight: 3, cost: '25 gp' },
  { name: 'Fishing Tackle', category: 'Adventuring Gear', weight: 4, cost: '1 gp' },
  { name: 'Flask or Tankard', category: 'Adventuring Gear', weight: 1, cost: '2 cp' },
  { name: 'Grappling Hook', category: 'Adventuring Gear', weight: 4, cost: '2 gp' },
  { name: 'Hammer', category: 'Adventuring Gear', weight: 3, cost: '1 gp' },
  { name: 'Healer\'s Kit', category: 'Adventuring Gear', weight: 3, cost: '5 gp', notes: '10 uses, stabilize without Medicine check' },
  { name: 'Holy Symbol', category: 'Adventuring Gear', weight: 1, cost: '5 gp' },
  { name: 'Holy Water (flask)', category: 'Adventuring Gear', weight: 1, cost: '25 gp', notes: '2d6 radiant vs undead/fiends' },
  { name: 'Hourglass', category: 'Adventuring Gear', weight: 1, cost: '25 gp' },
  { name: 'Hunting Trap', category: 'Adventuring Gear', weight: 25, cost: '5 gp' },
  { name: 'Ink (1 oz bottle)', category: 'Adventuring Gear', weight: 0, cost: '10 gp' },
  { name: 'Ink Pen', category: 'Adventuring Gear', weight: 0, cost: '2 cp' },
  { name: 'Jug or Pitcher', category: 'Adventuring Gear', weight: 4, cost: '2 cp' },
  { name: 'Ladder (10 ft)', category: 'Adventuring Gear', weight: 25, cost: '1 sp' },
  { name: 'Lamp', category: 'Adventuring Gear', weight: 1, cost: '5 sp', notes: '15 ft bright, 30 ft dim for 6 hrs/pint' },
  { name: 'Lantern, Bullseye', category: 'Adventuring Gear', weight: 2, cost: '10 gp', notes: '60 ft cone bright, 120 ft dim for 6 hrs/pint' },
  { name: 'Lantern, Hooded', category: 'Adventuring Gear', weight: 2, cost: '5 gp', notes: '30 ft bright, 60 ft dim for 6 hrs/pint' },
  { name: 'Lock', category: 'Adventuring Gear', weight: 1, cost: '10 gp' },
  { name: 'Magnifying Glass', category: 'Adventuring Gear', weight: 0, cost: '100 gp' },
  { name: 'Manacles', category: 'Adventuring Gear', weight: 6, cost: '2 gp' },
  { name: 'Mess Kit', category: 'Adventuring Gear', weight: 1, cost: '2 sp' },
  { name: 'Mirror, Steel', category: 'Adventuring Gear', weight: 0.5, cost: '5 gp' },
  { name: 'Oil (flask)', category: 'Adventuring Gear', weight: 1, cost: '1 sp', notes: 'Fuel lamp 6 hrs, splash 1d4+5 fire' },
  { name: 'Paper (one sheet)', category: 'Adventuring Gear', weight: 0, cost: '2 sp' },
  { name: 'Parchment (one sheet)', category: 'Adventuring Gear', weight: 0, cost: '1 sp' },
  { name: 'Perfume (vial)', category: 'Adventuring Gear', weight: 0, cost: '5 gp' },
  { name: 'Pick, Miner\'s', category: 'Adventuring Gear', weight: 10, cost: '2 gp' },
  { name: 'Piton', category: 'Adventuring Gear', weight: 0.25, cost: '5 cp' },
  { name: 'Poison, Basic (vial)', category: 'Adventuring Gear', weight: 0, cost: '100 gp', notes: 'DC 10 CON or 1d4 poison dmg' },
  { name: 'Pole (10-foot)', category: 'Adventuring Gear', weight: 7, cost: '5 cp' },
  { name: 'Pot, Iron', category: 'Adventuring Gear', weight: 10, cost: '2 gp' },
  { name: 'Pouch', category: 'Adventuring Gear', weight: 1, cost: '5 sp', notes: 'Holds 6 lb / 1/5 cu ft' },
  { name: 'Quiver', category: 'Adventuring Gear', weight: 1, cost: '1 gp', notes: 'Holds 20 arrows' },
  { name: 'Ram, Portable', category: 'Adventuring Gear', weight: 35, cost: '4 gp', notes: '+4 STR to break doors' },
  { name: 'Rations (1 day)', category: 'Adventuring Gear', weight: 2, cost: '5 sp' },
  { name: 'Robes', category: 'Adventuring Gear', weight: 4, cost: '1 gp' },
  { name: 'Rope, Hempen (50 ft)', category: 'Adventuring Gear', weight: 10, cost: '1 gp' },
  { name: 'Rope, Silk (50 ft)', category: 'Adventuring Gear', weight: 5, cost: '10 gp' },
  { name: 'Sack', category: 'Adventuring Gear', weight: 0.5, cost: '1 cp', notes: 'Holds 30 lb / 1 cu ft' },
  { name: 'Scale, Merchant\'s', category: 'Adventuring Gear', weight: 3, cost: '5 gp' },
  { name: 'Sealing Wax', category: 'Adventuring Gear', weight: 0, cost: '5 sp' },
  { name: 'Shovel', category: 'Adventuring Gear', weight: 5, cost: '2 gp' },
  { name: 'Signal Whistle', category: 'Adventuring Gear', weight: 0, cost: '5 cp' },
  { name: 'Sling Bullets (20)', category: 'Adventuring Gear', weight: 1.5, cost: '4 cp' },
  { name: 'Spellbook', category: 'Adventuring Gear', weight: 3, cost: '50 gp', notes: 'Blank, 100 pages' },
  { name: 'Spikes, Iron (10)', category: 'Adventuring Gear', weight: 5, cost: '1 gp' },
  { name: 'Spyglass', category: 'Adventuring Gear', weight: 1, cost: '1000 gp' },
  { name: 'Tent, Two-Person', category: 'Adventuring Gear', weight: 20, cost: '2 gp' },
  { name: 'Tinderbox', category: 'Adventuring Gear', weight: 1, cost: '5 sp' },
  { name: 'Torch', category: 'Adventuring Gear', weight: 1, cost: '1 cp', notes: '20 ft bright, 20 ft dim for 1 hr' },
  { name: 'Vial', category: 'Adventuring Gear', weight: 0, cost: '1 gp' },
  { name: 'Waterskin', category: 'Adventuring Gear', weight: 5, cost: '2 sp', notes: 'Holds 4 pints' },
  { name: 'Whetstone', category: 'Adventuring Gear', weight: 1, cost: '1 cp' },
  // Potions
  { name: 'Potion of Healing', category: 'Magic Item', weight: 0.5, cost: '50 gp', notes: 'Restores 2d4+2 HP' },
  { name: 'Potion of Greater Healing', category: 'Magic Item', weight: 0.5, cost: '150 gp', notes: 'Restores 4d4+4 HP' },
  { name: 'Potion of Superior Healing', category: 'Magic Item', weight: 0.5, cost: '500 gp', notes: 'Restores 8d4+8 HP' },
  { name: 'Potion of Supreme Healing', category: 'Magic Item', weight: 0.5, cost: '1350 gp', notes: 'Restores 10d4+20 HP' },
  { name: 'Antitoxin (vial)', category: 'Adventuring Gear', weight: 0, cost: '50 gp', notes: 'Advantage on saves vs poison for 1 hr' },
  // Tools
  { name: 'Alchemist\'s Supplies', category: 'Tools', weight: 8, cost: '50 gp' },
  { name: 'Brewer\'s Supplies', category: 'Tools', weight: 9, cost: '20 gp' },
  { name: 'Calligrapher\'s Supplies', category: 'Tools', weight: 5, cost: '10 gp' },
  { name: 'Carpenter\'s Tools', category: 'Tools', weight: 6, cost: '8 gp' },
  { name: 'Cartographer\'s Tools', category: 'Tools', weight: 6, cost: '15 gp' },
  { name: 'Cobbler\'s Tools', category: 'Tools', weight: 5, cost: '5 gp' },
  { name: 'Cook\'s Utensils', category: 'Tools', weight: 8, cost: '1 gp' },
  { name: 'Glassblower\'s Tools', category: 'Tools', weight: 5, cost: '30 gp' },
  { name: 'Jeweler\'s Tools', category: 'Tools', weight: 2, cost: '25 gp' },
  { name: 'Leatherworker\'s Tools', category: 'Tools', weight: 5, cost: '5 gp' },
  { name: 'Mason\'s Tools', category: 'Tools', weight: 8, cost: '10 gp' },
  { name: 'Painter\'s Supplies', category: 'Tools', weight: 5, cost: '10 gp' },
  { name: 'Potter\'s Tools', category: 'Tools', weight: 3, cost: '10 gp' },
  { name: 'Smith\'s Tools', category: 'Tools', weight: 8, cost: '20 gp' },
  { name: 'Tinker\'s Tools', category: 'Tools', weight: 10, cost: '50 gp' },
  { name: 'Weaver\'s Tools', category: 'Tools', weight: 5, cost: '1 gp' },
  { name: 'Woodcarver\'s Tools', category: 'Tools', weight: 5, cost: '1 gp' },
  { name: 'Disguise Kit', category: 'Tools', weight: 3, cost: '25 gp' },
  { name: 'Forgery Kit', category: 'Tools', weight: 5, cost: '15 gp' },
  { name: 'Herbalism Kit', category: 'Tools', weight: 3, cost: '5 gp' },
  { name: 'Poisoner\'s Kit', category: 'Tools', weight: 2, cost: '50 gp' },
  { name: 'Thieves\' Tools', category: 'Tools', weight: 1, cost: '25 gp', notes: 'Required for lock picking' },
  { name: 'Lute', category: 'Tools', weight: 2, cost: '35 gp', notes: 'Musical instrument' },
  { name: 'Drum', category: 'Tools', weight: 3, cost: '6 gp', notes: 'Musical instrument' },
  { name: 'Flute', category: 'Tools', weight: 1, cost: '2 gp', notes: 'Musical instrument' },
  { name: 'Lyre', category: 'Tools', weight: 2, cost: '30 gp', notes: 'Musical instrument' },
  { name: 'Horn', category: 'Tools', weight: 2, cost: '3 gp', notes: 'Musical instrument' },
  { name: 'Pan Flute', category: 'Tools', weight: 2, cost: '12 gp', notes: 'Musical instrument' },
  { name: 'Viol', category: 'Tools', weight: 1, cost: '30 gp', notes: 'Musical instrument' },
  { name: 'Navigator\'s Tools', category: 'Tools', weight: 2, cost: '25 gp' },
  { name: 'Vehicles (Land)', category: 'Mount & Vehicle', weight: 0, cost: 'Varies' },
  // Mounts
  { name: 'Draft Horse', category: 'Mount & Vehicle', weight: 0, cost: '50 gp', notes: 'Speed 40 ft, Large' },
  { name: 'Riding Horse', category: 'Mount & Vehicle', weight: 0, cost: '75 gp', notes: 'Speed 60 ft, Large' },
  { name: 'Warhorse', category: 'Mount & Vehicle', weight: 0, cost: '400 gp', notes: 'Speed 60 ft, Large' },
  { name: 'Pony', category: 'Mount & Vehicle', weight: 0, cost: '30 gp', notes: 'Speed 40 ft, Medium' },
  { name: 'Mule', category: 'Mount & Vehicle', weight: 0, cost: '8 gp', notes: 'Speed 40 ft, Medium' },
  { name: 'Camel', category: 'Mount & Vehicle', weight: 0, cost: '50 gp', notes: 'Speed 50 ft, Large' },
  { name: 'Elephant', category: 'Mount & Vehicle', weight: 0, cost: '200 gp', notes: 'Speed 40 ft, Huge' },
  { name: 'Mastiff', category: 'Mount & Vehicle', weight: 0, cost: '25 gp', notes: 'Speed 40 ft, Medium' },
  { name: 'Saddle, Exotic', category: 'Mount & Vehicle', weight: 40, cost: '60 gp' },
  { name: 'Saddle, Military', category: 'Mount & Vehicle', weight: 30, cost: '20 gp' },
  { name: 'Saddle, Pack', category: 'Mount & Vehicle', weight: 15, cost: '5 gp' },
  { name: 'Saddle, Riding', category: 'Mount & Vehicle', weight: 25, cost: '10 gp' },
  { name: 'Saddlebags', category: 'Mount & Vehicle', weight: 8, cost: '4 gp' },
  // Vehicles
  { name: 'Rowboat', category: 'Mount & Vehicle', weight: 0, cost: '50 gp', notes: 'Speed 1.5 mph' },
  { name: 'Keelboat', category: 'Mount & Vehicle', weight: 0, cost: '3000 gp' },
  { name: 'Galley', category: 'Mount & Vehicle', weight: 0, cost: '30000 gp' },
  { name: 'Sailing Ship', category: 'Mount & Vehicle', weight: 0, cost: '10000 gp' },
  { name: 'Warship', category: 'Mount & Vehicle', weight: 0, cost: '25000 gp' },
  { name: 'Cart', category: 'Mount & Vehicle', weight: 200, cost: '15 gp' },
  { name: 'Chariot', category: 'Mount & Vehicle', weight: 100, cost: '250 gp' },
  { name: 'Wagon', category: 'Mount & Vehicle', weight: 400, cost: '35 gp' },
  // Trade goods
  { name: 'Wheat (1 lb)', category: 'Trade Good', weight: 1, cost: '1 cp' },
  { name: 'Salt (1 lb)', category: 'Trade Good', weight: 1, cost: '5 cp' },
  { name: 'Iron (1 lb)', category: 'Trade Good', weight: 1, cost: '1 sp' },
  { name: 'Canvas (1 sq. yd)', category: 'Trade Good', weight: 1, cost: '1 sp' },
  { name: 'Cotton (1 lb)', category: 'Trade Good', weight: 1, cost: '5 sp' },
  { name: 'Glass (1 lb)', category: 'Trade Good', weight: 1, cost: '1 gp' },
  { name: 'Copper (1 lb)', category: 'Trade Good', weight: 1, cost: '5 gp' },
  { name: 'Ginger (1 lb)', category: 'Trade Good', weight: 1, cost: '1 gp' },
  { name: 'Cinnamon (1 lb)', category: 'Trade Good', weight: 1, cost: '2 gp' },
  { name: 'Silver (1 lb)', category: 'Trade Good', weight: 1, cost: '5 gp' },
  { name: 'Cloves (1 lb)', category: 'Trade Good', weight: 1, cost: '30 gp' },
  { name: 'Silk (1 sq. yd)', category: 'Trade Good', weight: 4, cost: '10 gp' },
  { name: 'Gold (1 lb)', category: 'Trade Good', weight: 1, cost: '50 gp' },
  { name: 'Platinum (1 lb)', category: 'Trade Good', weight: 1, cost: '500 gp' },
  { name: 'Saffron (1 lb)', category: 'Trade Good', weight: 1, cost: '15 gp' },
];

const ALL_CATEGORIES: ItemCategory[] = ['Weapon', 'Armor', 'Adventuring Gear', 'Tools', 'Mount & Vehicle', 'Trade Good', 'Magic Item'];

// ── Item Picker Modal ──────────────────────────────────────────────
function ItemPickerModal({ onAdd, onClose }: {
  onAdd: (item: CatalogueItem, qty: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'All'>('All');
  const [qty, setQty] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = CATALOGUE.filter(item => {
    const matchesSearch = search.trim() === '' ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.notes ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCat = category === 'All' || item.category === category;
    return matchesSearch && matchesCat;
  });

  function addItem(item: CatalogueItem) {
    onAdd(item, qty[item.name] ?? 1);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
          borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)', marginBottom: 8 }}>
              Add Item
            </div>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search equipment..."
              style={{ width: '100%', fontSize: 14, padding: '7px 10px', borderRadius: 7 }}
            />
          </div>
          <button onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', color: 'var(--t-2)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Category filters */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['All', ...ALL_CATEGORIES] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                border: category === cat ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
                background: category === cat ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                color: category === cat ? 'var(--c-gold-l)' : 'var(--t-2)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--t-3)' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t-3)', fontSize: 13 }}>
              No items match "{search}"
            </div>
          ) : (
            filtered.map(item => (
              <div
                key={item.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                  background: 'var(--c-raised)',
                  transition: 'background 0.1s',
                }}
              >
                {/* Category badge */}
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0,
                  background: item.category === 'Weapon' ? 'rgba(239,68,68,0.15)' :
                               item.category === 'Armor' ? 'rgba(59,130,246,0.15)' :
                               item.category === 'Magic Item' ? 'rgba(167,139,250,0.15)' :
                               'rgba(107,114,128,0.15)',
                  color: item.category === 'Weapon' ? '#f87171' :
                         item.category === 'Armor' ? '#60a5fa' :
                         item.category === 'Magic Item' ? '#a78bfa' :
                         'var(--t-3)',
                }}>
                  {item.category === 'Adventuring Gear' ? 'Gear' :
                   item.category === 'Mount & Vehicle' ? 'Mount' :
                   item.category === 'Trade Good' ? 'Trade' :
                   item.category}
                </span>

                {/* Name + notes */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-1)' }}>{item.name}</div>
                  {item.notes && (
                    <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.notes}
                    </div>
                  )}
                </div>

                {/* Cost + weight */}
                <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 11, color: 'var(--t-3)' }}>
                  {item.cost && <div>{item.cost}</div>}
                  {item.weight > 0 && <div>{item.weight} lb</div>}
                </div>

                {/* Qty stepper */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setQty(q => ({ ...q, [item.name]: Math.max(1, (q[item.name] ?? 1) - 1) }))}
                    style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid var(--c-border)', background: 'var(--c-card)', color: 'var(--t-2)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-gold-l)', minWidth: 20, textAlign: 'center' }}>{qty[item.name] ?? 1}</span>
                  <button onClick={() => setQty(q => ({ ...q, [item.name]: (q[item.name] ?? 1) + 1 }))}
                    style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid var(--c-border)', background: 'var(--c-card)', color: 'var(--t-2)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>

                {/* Add button */}
                <button
                  onClick={() => addItem(item)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                    border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)', flexShrink: 0 }}
                >
                  Add
                </button>
              </div>
            ))
          )}
        </div>

        {/* Custom item row at bottom */}
        <CustomItemRow onAdd={(name, w, q) => {
          onAdd({ name, category: 'Adventuring Gear', weight: w }, q);
          onClose();
        }} />
      </div>
    </div>
  );
}

function CustomItemRow({ onAdd }: { onAdd: (name: string, weight: number, qty: number) => void }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('0');
  const [qty, setQty] = useState('1');

  function submit() {
    if (!name.trim()) return;
    onAdd(name.trim(), parseFloat(weight) || 0, Math.max(1, parseInt(qty) || 1));
    setName(''); setWeight('0'); setQty('1');
  }

  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--t-3)', flexShrink: 0 }}>Custom:</span>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Item name" style={{ flex: 1, fontSize: 12 }}
        onKeyDown={e => e.key === 'Enter' && submit()} />
      <input value={qty} onChange={e => setQty(e.target.value)} type="number" min={1} style={{ width: 44, fontSize: 12 }} placeholder="Qty" />
      <input value={weight} onChange={e => setWeight(e.target.value)} type="number" min={0} step={0.1} style={{ width: 52, fontSize: 12 }} placeholder="lb" />
      <button onClick={submit} className="btn-gold btn-sm" disabled={!name.trim()}>Add</button>
    </div>
  );
}

// ── Currency Display ───────────────────────────────────────────────
function CurrencyDisplay({ currency, onUpdate }: {
  currency: Character['currency'];
  onUpdate: (currency: Character['currency']) => void;
}) {
  const [editing, setEditing] = useState<keyof Character['currency'] | null>(null);
  const [draft, setDraft] = useState('');

  const coins: { key: keyof Character['currency']; label: string; color: string }[] = [
    { key: 'pp', label: 'PP', color: '#e0e0e0' },
    { key: 'gp', label: 'GP', color: 'var(--c-gold-l)' },
    { key: 'ep', label: 'EP', color: '#60a5fa' },
    { key: 'sp', label: 'SP', color: '#9ca3af' },
    { key: 'cp', label: 'CP', color: '#b45309' },
  ];

  function open(key: keyof Character['currency']) {
    setDraft(String(currency[key]));
    setEditing(key);
  }

  function commit() {
    if (!editing) return;
    const v = Math.max(0, parseInt(draft, 10) || 0);
    onUpdate({ ...currency, [editing]: v });
    setEditing(null);
  }

  return (
    <div style={{
      display: 'flex', gap: 'var(--sp-3)', padding: 'var(--sp-3)',
      background: '#080d14', borderRadius: 'var(--r-md)',
      marginBottom: 'var(--sp-4)',
    }}>
      {coins.map(({ key, label, color }) => (
        <div key={key} style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}
          onClick={() => editing !== key && open(key)} title={`Click to edit ${label}`}>
          {editing === key ? (
            <input type="number" value={draft} min={0} autoFocus
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', textAlign: 'center', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color, background: 'var(--c-raised)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-sm)', padding: '1px 2px' }} />
          ) : (
            <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color }}>{currency[key]}</div>
          )}
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', letterSpacing: '0.08em' }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Inventory Component ───────────────────────────────────────
export default function Inventory({ character, onUpdateInventory, onUpdateCurrency }: InventoryProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');

  const inventory = character.inventory;
  const totalWeight = inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0);

  function toggleEquipped(id: string) {
    onUpdateInventory(inventory.map(item => item.id === id ? { ...item, equipped: !item.equipped } : item));
  }

  function removeItem(id: string) {
    onUpdateInventory(inventory.filter(item => item.id !== id));
  }

  function updateItem(id: string, updates: Partial<InventoryItem>) {
    onUpdateInventory(inventory.map(item => item.id === id ? { ...item, ...updates } : item));
  }

  function addFromCatalogue(catalogueItem: CatalogueItem, qty: number) {
    const item: InventoryItem = {
      id: uuidv4(),
      name: catalogueItem.name,
      quantity: qty,
      weight: catalogueItem.weight,
      description: catalogueItem.notes ?? '',
      equipped: false,
      magical: catalogueItem.category === 'Magic Item',
    };
    onUpdateInventory([...inventory, item]);
  }

  const filtered = search.trim()
    ? inventory.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : inventory;

  const equipped = filtered.filter(i => i.equipped);
  const carried = filtered.filter(i => !i.equipped);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none', flex: 1 }}>
          Inventory
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
            {totalWeight.toFixed(totalWeight % 1 === 0 ? 0 : 1)} lb
          </span>
          <button className="btn-gold btn-sm" onClick={() => setShowPicker(true)}>
            + Add Item
          </button>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--c-gold-bdr)', marginBottom: 'var(--sp-4)' }} />

      <CurrencyDisplay currency={character.currency} onUpdate={onUpdateCurrency} />

      {/* Search bar — only show when there are items */}
      {inventory.length > 4 && (
        <div style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter inventory..."
            style={{ width: '100%', fontSize: 13 }}
          />
        </div>
      )}

      {inventory.length === 0 ? (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', fontStyle: 'italic', fontFamily: 'var(--ff-body)' }}>
          No items carried
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', fontStyle: 'italic', fontFamily: 'var(--ff-body)' }}>
          No items match "{search}"
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
          {equipped.length > 0 && (
            <div style={{ marginBottom: 'var(--sp-2)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--ff-body)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-gold-l)', marginBottom: 'var(--sp-1)' }}>
                Equipped
              </div>
              {equipped.map(item => (
                <InventoryRow key={item.id} item={item} onToggle={toggleEquipped} onRemove={removeItem} onUpdate={updateItem} />
              ))}
            </div>
          )}
          {carried.length > 0 && (
            <div>
              {equipped.length > 0 && (
                <div style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--ff-body)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 'var(--sp-1)' }}>
                  Carried
                </div>
              )}
              {carried.map(item => (
                <InventoryRow key={item.id} item={item} onToggle={toggleEquipped} onRemove={removeItem} onUpdate={updateItem} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Item picker modal */}
      {showPicker && (
        <ItemPickerModal
          onAdd={(item, qty) => { addFromCatalogue(item, qty); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </section>
  );
}

// ── Inventory Row ──────────────────────────────────────────────────
function InventoryRow({ item, onToggle, onRemove, onUpdate }: {
  item: InventoryItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<InventoryItem>) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  function openName() { setNameDraft(item.name); setEditingName(true); }
  function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== item.name) onUpdate(item.id, { name: trimmed });
    setEditingName(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
      padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-sm)',
      background: item.equipped ? 'rgba(201,146,42,0.05)' : 'transparent',
      border: item.equipped ? '1px solid rgba(201,146,42,0.2)' : '1px solid transparent',
    }}>
      <input type="checkbox" checked={item.equipped} onChange={() => onToggle(item.id)}
        title="Toggle equipped" style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />

      {editingName ? (
        <input value={nameDraft} onChange={e => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
          autoFocus style={{ flex: 1, fontSize: 'var(--fs-sm)', fontFamily: 'var(--ff-body)' }} />
      ) : (
        <span onClick={openName} title="Click to rename" style={{
          flex: 1, fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)',
          color: item.equipped ? 'var(--t-1)' : 'var(--t-2)',
          fontWeight: item.equipped ? 600 : 400, cursor: 'text',
        }}>{item.name}</span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button className="btn-ghost btn-sm btn-icon"
          onClick={() => onUpdate(item.id, { quantity: Math.max(1, item.quantity - 1) })}
          disabled={item.quantity <= 1}
          style={{ width: 20, height: 20, fontSize: 12, padding: 0, color: 'var(--t-2)' }}>−</button>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-gold-l)', minWidth: 24, textAlign: 'center' }}>
          {item.quantity}
        </span>
        <button className="btn-ghost btn-sm btn-icon"
          onClick={() => onUpdate(item.id, { quantity: item.quantity + 1 })}
          style={{ width: 20, height: 20, fontSize: 12, padding: 0, color: 'var(--t-2)' }}>+</button>
      </div>

      {item.weight > 0 && (
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', flexShrink: 0 }}>
          {(item.weight * item.quantity).toFixed(item.weight % 1 === 0 ? 0 : 1)} lb
        </span>
      )}

      <button className="btn-ghost btn-sm" onClick={() => onRemove(item.id)}
        title="Remove item" style={{ color: 'var(--t-2)', padding: '2px 6px', flexShrink: 0 }}>✕</button>
    </div>
  );
}
