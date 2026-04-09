// SRD Equipment Catalogue — full item database with armor AC, roll expressions, and effects

export type ItemCategory = 'Weapon' | 'Armor' | 'Adventuring Gear' | 'Tools' | 'Mount & Vehicle' | 'Trade Good' | 'Magic Item' | 'Potion' | 'Scroll' | 'Wondrous Item';

export interface CatalogueItem {
  name: string;
  category: ItemCategory;
  weight: number;
  cost?: string;
  notes?: string;
  // Armor properties
  armorType?: 'light' | 'medium' | 'heavy' | 'shield';
  baseAC?: number;          // e.g. 11 for leather, 13 for chain shirt
  addDexMod?: boolean;      // true for light/medium
  maxDexBonus?: number;     // 2 for medium, undefined = no cap
  stealthDisadvantage?: boolean;
  strengthReq?: number;
  // Roll expression for use button (potions, scrolls, etc.)
  rollExpression?: string;  // e.g. "2d4+2", "1d4", "4d4"
  rollLabel?: string;       // e.g. "Healing", "Fire Damage"
  // Weapon stat table fields (D&D Beyond style)
  damage?: string;          // e.g. "1d8 slashing", "2d6 fire"
  range?: string;           // e.g. "5 ft.", "80/320 ft.", "Touch"
  properties?: string;      // e.g. "Versatile, Finesse"
  castingTime?: string;     // for scrolls: "1 Action"
  saveOrHit?: string;       // e.g. "+13 to hit" or "DC 15 DEX"
  // Effects when equipped
  effect?: string;
}

export const ALL_CATEGORIES: ItemCategory[] = [
  'Weapon', 'Armor', 'Potion', 'Scroll', 'Wondrous Item', 'Magic Item',
  'Adventuring Gear', 'Tools', 'Mount & Vehicle', 'Trade Good',
];

export const CATALOGUE: CatalogueItem[] = [
  // ── Weapons — Simple Melee ──────────────────────────────────────
  { name: 'Club',          category: 'Weapon', weight: 2,    cost: '1 sp',   damage: '1d4 bludgeoning', range: '5 ft.', properties: 'Light', notes: '1d4 bludgeoning · light' },
  { name: 'Dagger',        category: 'Weapon', weight: 1,    cost: '2 gp',   damage: '1d4 piercing', range: '5 ft. / 20/60 ft.', properties: 'Finesse, Light, Thrown', notes: '1d4 piercing · finesse, light, thrown (20/60)' },
  { name: 'Greatclub',     category: 'Weapon', weight: 10,   cost: '2 sp',   notes: '1d8 bludgeoning · two-handed' },
  { name: 'Handaxe',       category: 'Weapon', weight: 2,    cost: '5 gp',   damage: '1d6 slashing', range: '5 ft. / 20/60 ft.', properties: 'Light, Thrown', notes: '1d6 slashing · light, thrown (20/60)' },
  { name: 'Javelin',       category: 'Weapon', weight: 2,    cost: '5 sp',   notes: '1d6 piercing · thrown (30/120)' },
  { name: 'Light Hammer',  category: 'Weapon', weight: 2,    cost: '2 gp',   notes: '1d4 bludgeoning · light, thrown (20/60)' },
  { name: 'Mace',          category: 'Weapon', weight: 4,    cost: '5 gp',   damage: '1d6 bludgeoning', range: '5 ft.', properties: '—', notes: '1d6 bludgeoning' },
  { name: 'Quarterstaff',  category: 'Weapon', weight: 4,    cost: '2 sp',   damage: '1d6/1d8 bludgeoning', range: '5 ft.', properties: 'Versatile', notes: '1d6/1d8 bludgeoning · versatile' },
  { name: 'Sickle',        category: 'Weapon', weight: 2,    cost: '1 gp',   notes: '1d4 slashing · light' },
  { name: 'Spear',         category: 'Weapon', weight: 3,    cost: '1 gp',   damage: '1d6/1d8 piercing', range: '5 ft. / 20/60 ft.', properties: 'Versatile, Thrown', notes: '1d6/1d8 piercing · thrown (20/60), versatile' },
  // ── Weapons — Simple Ranged ──────────────────────────────────────
  { name: 'Crossbow, Light', category: 'Weapon', weight: 5,  cost: '25 gp',  damage: '1d8 piercing', range: '80/320 ft.', properties: 'Loading, Two-Handed', notes: '1d8 piercing · loading, two-handed (80/320)' },
  { name: 'Dart',            category: 'Weapon', weight: 0.25, cost: '5 cp', notes: '1d4 piercing · finesse, thrown (20/60)' },
  { name: 'Shortbow',        category: 'Weapon', weight: 2,  cost: '25 gp',  damage: '1d6 piercing', range: '80/320 ft.', properties: 'Two-Handed', notes: '1d6 piercing · two-handed (80/320)' },
  { name: 'Sling',           category: 'Weapon', weight: 0,  cost: '1 sp',   notes: '1d4 bludgeoning · (30/120)' },
  // ── Weapons — Martial Melee ──────────────────────────────────────
  { name: 'Battleaxe',     category: 'Weapon', weight: 4,    cost: '10 gp',  damage: '1d8/1d10 slashing', range: '5 ft.', properties: 'Versatile', notes: '1d8/1d10 slashing · versatile' },
  { name: 'Flail',         category: 'Weapon', weight: 2,    cost: '10 gp',  notes: '1d8 bludgeoning' },
  { name: 'Glaive',        category: 'Weapon', weight: 6,    cost: '20 gp',  notes: '1d10 slashing · heavy, reach, two-handed' },
  { name: 'Greataxe',      category: 'Weapon', weight: 7,    cost: '30 gp',  notes: '1d12 slashing · heavy, two-handed' },
  { name: 'Greatsword',    category: 'Weapon', weight: 6,    cost: '50 gp',  damage: '2d6 slashing', range: '5 ft.', properties: 'Heavy, Two-Handed', notes: '2d6 slashing · heavy, two-handed' },
  { name: 'Halberd',       category: 'Weapon', weight: 6,    cost: '20 gp',  notes: '1d10 slashing · heavy, reach, two-handed' },
  { name: 'Lance',         category: 'Weapon', weight: 6,    cost: '10 gp',  notes: '1d12 piercing · reach' },
  { name: 'Longsword',     category: 'Weapon', weight: 3,    cost: '15 gp',  damage: '1d8/1d10 slashing', range: '5 ft.', properties: 'Versatile', notes: '1d8/1d10 slashing · versatile' },
  { name: 'Maul',          category: 'Weapon', weight: 10,   cost: '10 gp',  notes: '2d6 bludgeoning · heavy, two-handed' },
  { name: 'Morningstar',   category: 'Weapon', weight: 4,    cost: '15 gp',  notes: '1d8 piercing' },
  { name: 'Pike',          category: 'Weapon', weight: 18,   cost: '5 gp',   notes: '1d10 piercing · heavy, reach, two-handed' },
  { name: 'Rapier',        category: 'Weapon', weight: 2,    cost: '25 gp',  damage: '1d8 piercing', range: '5 ft.', properties: 'Finesse', notes: '1d8 piercing · finesse' },
  { name: 'Scimitar',      category: 'Weapon', weight: 3,    cost: '25 gp',  notes: '1d6 slashing · finesse, light' },
  { name: 'Shortsword',    category: 'Weapon', weight: 2,    cost: '10 gp',  damage: '1d6 piercing', range: '5 ft.', properties: 'Finesse, Light', notes: '1d6 piercing · finesse, light' },
  { name: 'Trident',       category: 'Weapon', weight: 4,    cost: '5 gp',   notes: '1d6/1d8 piercing · thrown (20/60), versatile' },
  { name: 'War Pick',      category: 'Weapon', weight: 2,    cost: '5 gp',   notes: '1d8 piercing' },
  { name: 'Warhammer',     category: 'Weapon', weight: 2,    cost: '15 gp',  notes: '1d8/1d10 bludgeoning · versatile' },
  { name: 'Whip',          category: 'Weapon', weight: 3,    cost: '2 gp',   notes: '1d4 slashing · finesse, reach' },
  // ── Weapons — Martial Ranged ──────────────────────────────────────
  { name: 'Blowgun',         category: 'Weapon', weight: 1,  cost: '10 gp',  notes: '1 piercing · loading (25/100)' },
  { name: 'Crossbow, Hand',  category: 'Weapon', weight: 3,  cost: '75 gp',  notes: '1d6 piercing · light, loading (30/120)' },
  { name: 'Crossbow, Heavy', category: 'Weapon', weight: 18, cost: '50 gp',  notes: '1d10 piercing · heavy, loading, two-handed (100/400)' },
  { name: 'Longbow',         category: 'Weapon', weight: 2,  cost: '50 gp',  damage: '1d8 piercing', range: '150/600 ft.', properties: 'Heavy, Two-Handed', notes: '1d8 piercing · heavy, two-handed (150/600)' },
  { name: 'Net',             category: 'Weapon', weight: 3,  cost: '1 gp',   notes: 'Restrained · thrown (5/15)' },

  // ── Light Armor ──────────────────────────────────────────────────
  { name: 'Padded Armor',   category: 'Armor', weight: 8,  cost: '5 gp',   armorType: 'light', baseAC: 11, addDexMod: true, stealthDisadvantage: true, notes: 'AC 11 + DEX mod' },
  { name: 'Leather Armor',  category: 'Armor', weight: 10, cost: '10 gp',  armorType: 'light', baseAC: 11, addDexMod: true, notes: 'AC 11 + DEX mod' },
  { name: 'Studded Leather',category: 'Armor', weight: 13, cost: '45 gp',  armorType: 'light', baseAC: 12, addDexMod: true, notes: 'AC 12 + DEX mod' },
  // ── Medium Armor ──────────────────────────────────────────────────
  { name: 'Hide Armor',     category: 'Armor', weight: 12, cost: '10 gp',  armorType: 'medium', baseAC: 12, addDexMod: true, maxDexBonus: 2, notes: 'AC 12 + DEX mod (max +2)' },
  { name: 'Chain Shirt',    category: 'Armor', weight: 20, cost: '50 gp',  armorType: 'medium', baseAC: 13, addDexMod: true, maxDexBonus: 2, notes: 'AC 13 + DEX mod (max +2)' },
  { name: 'Scale Mail',     category: 'Armor', weight: 45, cost: '50 gp',  armorType: 'medium', baseAC: 14, addDexMod: true, maxDexBonus: 2, stealthDisadvantage: true, notes: 'AC 14 + DEX mod (max +2)' },
  { name: 'Breastplate',    category: 'Armor', weight: 20, cost: '400 gp', armorType: 'medium', baseAC: 14, addDexMod: true, maxDexBonus: 2, notes: 'AC 14 + DEX mod (max +2)' },
  { name: 'Half Plate',     category: 'Armor', weight: 40, cost: '750 gp', armorType: 'medium', baseAC: 15, addDexMod: true, maxDexBonus: 2, stealthDisadvantage: true, notes: 'AC 15 + DEX mod (max +2)' },
  // ── Heavy Armor ──────────────────────────────────────────────────
  { name: 'Ring Mail',      category: 'Armor', weight: 40, cost: '30 gp',   armorType: 'heavy', baseAC: 14, stealthDisadvantage: true, notes: 'AC 14, no DEX bonus' },
  { name: 'Chain Mail',     category: 'Armor', weight: 55, cost: '75 gp',   armorType: 'heavy', baseAC: 16, stealthDisadvantage: true, strengthReq: 13, notes: 'AC 16, STR 13 required' },
  { name: 'Splint Armor',   category: 'Armor', weight: 60, cost: '200 gp',  armorType: 'heavy', baseAC: 17, stealthDisadvantage: true, strengthReq: 15, notes: 'AC 17, STR 15 required' },
  { name: 'Plate Armor',    category: 'Armor', weight: 65, cost: '1,500 gp',armorType: 'heavy', baseAC: 18, stealthDisadvantage: true, strengthReq: 15, notes: 'AC 18, STR 15 required' },
  // ── Shields ──────────────────────────────────────────────────────
  { name: 'Shield',         category: 'Armor', weight: 6,  cost: '10 gp',   armorType: 'shield', baseAC: 2,  notes: '+2 AC bonus while wielded' },
  { name: 'Shield, +1',     category: 'Armor', weight: 6,  cost: '—',       armorType: 'shield', baseAC: 3,  notes: '+3 AC bonus (magic)' },
  { name: 'Shield, +2',     category: 'Armor', weight: 6,  cost: '—',       armorType: 'shield', baseAC: 4,  notes: '+4 AC bonus (magic)' },
  { name: 'Shield, +3',     category: 'Armor', weight: 6,  cost: '—',       armorType: 'shield', baseAC: 5,  notes: '+5 AC bonus (magic)' },

  // ── Potions ──────────────────────────────────────────────────────
  { name: 'Potion of Healing',        category: 'Potion', weight: 0.5, cost: '50 gp',     rollExpression: '2d4+2', rollLabel: 'Healing', damage: '2d4+2', range: 'Self', castingTime: '1 Action', notes: 'Restores 2d4+2 HP when you drink it' },
  { name: 'Potion of Greater Healing', category: 'Potion', weight: 0.5, cost: '100 gp',   rollExpression: '4d4+4', rollLabel: 'Healing', damage: '4d4+4', range: 'Self', castingTime: '1 Action', notes: 'Restores 4d4+4 HP' },
  { name: 'Potion of Superior Healing',category: 'Potion', weight: 0.5, cost: '500 gp',   rollExpression: '8d4+8', rollLabel: 'Healing',     notes: 'Restores 8d4+8 HP' },
  { name: 'Potion of Supreme Healing', category: 'Potion', weight: 0.5, cost: '5,000 gp', rollExpression: '10d4+20', rollLabel: 'Healing',   notes: 'Restores 10d4+20 HP' },
  { name: 'Potion of Climbing',       category: 'Potion', weight: 0.5, cost: '180 gp',    notes: 'Climbing speed equal to walking speed, 1 hour' },
  { name: 'Potion of Water Breathing',category: 'Potion', weight: 0.5, cost: '180 gp',    notes: 'Breathe underwater for 1 hour' },
  { name: 'Potion of Heroism',        category: 'Potion', weight: 0.5, cost: '180 gp',    rollExpression: '1d4+1',  rollLabel: 'Temp HP',    notes: '10 temp HP + Blessed for 1 hour' },
  { name: 'Potion of Invisibility',   category: 'Potion', weight: 0.5, cost: '180 gp',    notes: 'Invisible until you attack or cast, up to 1 hour' },
  { name: 'Potion of Resistance',     category: 'Potion', weight: 0.5, cost: '300 gp',    notes: 'Resistance to one damage type for 1 hour' },
  { name: 'Potion of Speed',          category: 'Potion', weight: 0.5, cost: '400 gp',    notes: 'Haste spell effect for 1 minute' },
  { name: 'Potion of Fire Breath',    category: 'Potion', weight: 0.5, cost: '150 gp',    rollExpression: '4d6',    rollLabel: 'Fire',       notes: 'As bonus action, exhale fire (30 ft cone): 4d6 fire, DEX save DC 13 for half' },
  { name: 'Potion of Giant Strength (Hill)',   category: 'Potion', weight: 0.5, cost: '200 gp',   notes: 'STR becomes 21 for 1 hour' },
  { name: 'Potion of Giant Strength (Stone)',  category: 'Potion', weight: 0.5, cost: '400 gp',   notes: 'STR becomes 23 for 1 hour' },
  { name: 'Potion of Giant Strength (Frost)',  category: 'Potion', weight: 0.5, cost: '400 gp',   notes: 'STR becomes 23 for 1 hour' },
  { name: 'Potion of Giant Strength (Fire)',   category: 'Potion', weight: 0.5, cost: '800 gp',   notes: 'STR becomes 25 for 1 hour' },
  { name: 'Potion of Giant Strength (Cloud)',  category: 'Potion', weight: 0.5, cost: '1,500 gp', notes: 'STR becomes 27 for 1 hour' },
  { name: 'Potion of Giant Strength (Storm)',  category: 'Potion', weight: 0.5, cost: '2,000 gp', notes: 'STR becomes 29 for 1 hour' },

  // ── Scrolls ──────────────────────────────────────────────────────
  { name: 'Spell Scroll (Cantrip)',  category: 'Scroll', weight: 0, cost: '25 gp',      notes: 'Contains a random cantrip. Casters only.' },
  { name: 'Spell Scroll (1st)',      category: 'Scroll', weight: 0, cost: '75 gp',      notes: 'Contains a 1st-level spell. Spell save DC 13, +5 to hit.' },
  { name: 'Spell Scroll (2nd)',      category: 'Scroll', weight: 0, cost: '150 gp',     notes: 'Contains a 2nd-level spell. DC 13, +5 to hit.' },
  { name: 'Spell Scroll (3rd)',      category: 'Scroll', weight: 0, cost: '300 gp',     notes: 'Contains a 3rd-level spell. DC 15, +7 to hit.' },
  { name: 'Scroll of Fireball',      category: 'Scroll', weight: 0, cost: '300 gp',     rollExpression: '8d6', rollLabel: 'Fire', damage: '8d6 fire', range: '150 ft.', castingTime: '1 Action', saveOrHit: 'DC 15 DEX', notes: '8d6 fire damage in 20ft radius, DEX save DC 15 for half' },
  { name: 'Scroll of Lightning Bolt',category: 'Scroll', weight: 0, cost: '300 gp',     rollExpression: '8d6', rollLabel: 'Lightning', notes: '8d6 lightning in 100ft line, DEX save DC 15 for half' },
  { name: 'Scroll of Magic Missile', category: 'Scroll', weight: 0, cost: '75 gp',      rollExpression: '3d4+3', rollLabel: 'Force', damage: '3×(1d4+1) force', range: '120 ft.', castingTime: '1 Action', notes: 'Three darts, 1d4+1 each, auto-hit' },
  { name: 'Scroll of Cure Wounds',   category: 'Scroll', weight: 0, cost: '75 gp',      rollExpression: '1d8+3', rollLabel: 'Healing', damage: '1d8+3', range: 'Touch', castingTime: '1 Action', notes: 'Restores 1d8+3 HP on touch' },
  { name: 'Scroll of Burning Hands', category: 'Scroll', weight: 0, cost: '75 gp',      rollExpression: '3d6', rollLabel: 'Fire', notes: '3d6 fire in 15ft cone, DEX save DC 13 for half' },
  { name: 'Scroll of Ice Storm',     category: 'Scroll', weight: 0, cost: '300 gp',     rollExpression: '2d8+4d6', rollLabel: 'Cold/Bludgeoning', notes: '2d8 bludgeoning + 4d6 cold in 20ft radius' },
  { name: 'Scroll of Healing Word',  category: 'Scroll', weight: 0, cost: '75 gp',      rollExpression: '1d4+3', rollLabel: 'Healing', notes: 'Restores 1d4+3 HP as bonus action' },
  { name: 'Scroll of Protection',    category: 'Scroll', weight: 0, cost: '180 gp',     notes: 'Protection from a creature type for 5 minutes' },
  { name: 'Scroll of Teleportation', category: 'Scroll', weight: 0, cost: '5,000 gp',   notes: 'Teleports you to a known location' },

  // ── Wondrous Items ───────────────────────────────────────────────
  { name: 'Bag of Holding',          category: 'Wondrous Item', weight: 15, cost: '—',      notes: 'Interior 64 cu ft, 500 lb capacity. Extradimensional space.' },
  { name: 'Cloak of Protection',     category: 'Wondrous Item', weight: 1,  cost: '—',      notes: '+1 AC and +1 to all saving throws (requires attunement)' },
  { name: 'Boots of Speed',          category: 'Wondrous Item', weight: 1,  cost: '—',      notes: 'Double walking speed as bonus action. Requires attunement.' },
  { name: 'Boots of Elvenkind',      category: 'Wondrous Item', weight: 1,  cost: '—',      notes: 'Advantage on DEX (Stealth) checks to move silently' },
  { name: 'Boots of Striding',       category: 'Wondrous Item', weight: 1,  cost: '—',      notes: 'Speed becomes 30 ft minimum, not reduced by difficult terrain' },
  { name: 'Gloves of Missile Snaring',category:'Wondrous Item', weight: 0,  cost: '—',      notes: 'Reduce ranged attack damage by 1d10+DEX mod as reaction' },
  { name: 'Gloves of Thievery',      category: 'Wondrous Item', weight: 0,  cost: '—',      notes: '+5 to Sleight of Hand and tool checks to pick locks/disarm' },
  { name: 'Goggles of Night',        category: 'Wondrous Item', weight: 0,  cost: '—',      notes: 'Darkvision 60 ft, or extend darkvision by 60 ft' },
  { name: 'Headband of Intellect',   category: 'Wondrous Item', weight: 0,  cost: '—',      notes: 'INT becomes 19 while wearing. Requires attunement.' },
  { name: 'Periapt of Health',       category: 'Wondrous Item', weight: 0,  cost: '—',      notes: 'Immune to diseases' },
  { name: 'Periapt of Wound Closure',category: 'Wondrous Item', weight: 0,  cost: '—',      notes: 'Stabilize at 0 HP automatically, double death save healing. Requires attunement.' },
  { name: 'Ring of Protection',      category: 'Wondrous Item', weight: 0,  cost: '—',      notes: '+1 AC and +1 to saving throws. Requires attunement.' },
  { name: 'Ring of Regeneration',    category: 'Wondrous Item', weight: 0,  cost: '—',      notes: 'Regain 1d6 HP every 10 minutes. Requires attunement.', rollExpression: '1d6', rollLabel: 'Regeneration' },
  { name: 'Ring of Resistance',      category: 'Wondrous Item', weight: 0,  cost: '—',      notes: 'Resistance to one damage type. Requires attunement.' },
  { name: 'Ring of Spell Storing',   category: 'Wondrous Item', weight: 0,  cost: '—',      notes: 'Store up to 5 levels of spells. Requires attunement.' },
  { name: 'Necklace of Fireballs',   category: 'Wondrous Item', weight: 1,  cost: '—',      rollExpression: '7d6', rollLabel: 'Fire', notes: 'Throw beads as action: 7d6 fire in 20ft radius' },
  { name: 'Amulet of Health',        category: 'Wondrous Item', weight: 0,  cost: '—',      notes: 'CON becomes 19. Requires attunement.' },
  { name: 'Belt of Giant Strength',  category: 'Wondrous Item', weight: 1,  cost: '—',      notes: 'STR score set by belt type (19–29). Requires attunement.' },
  { name: 'Winged Boots',            category: 'Wondrous Item', weight: 1,  cost: '—',      notes: 'Fly speed = walking speed for 4 hours/day. Requires attunement.' },

  // ── Magic Armor ──────────────────────────────────────────────────
  { name: 'Armor, +1 (Leather)',   category: 'Magic Item', weight: 10, cost: '—', armorType: 'light', baseAC: 12, addDexMod: true, notes: 'AC 12 + DEX mod (magic +1)' },
  { name: 'Armor, +1 (Chain Mail)',category: 'Magic Item', weight: 55, cost: '—', armorType: 'heavy', baseAC: 17, notes: 'AC 17 (magic +1)' },
  { name: 'Armor, +1 (Plate)',     category: 'Magic Item', weight: 65, cost: '—', armorType: 'heavy', baseAC: 19, strengthReq: 15, notes: 'AC 19 (magic +1)' },
  { name: 'Armor, +2 (Plate)',     category: 'Magic Item', weight: 65, cost: '—', armorType: 'heavy', baseAC: 20, strengthReq: 15, notes: 'AC 20 (magic +2)' },
  { name: 'Armor, +3 (Plate)',     category: 'Magic Item', weight: 65, cost: '—', armorType: 'heavy', baseAC: 21, strengthReq: 15, notes: 'AC 21 (magic +3)' },
  { name: 'Mithral Armor',        category: 'Magic Item', weight: 20, cost: '—', armorType: 'medium', baseAC: 13, addDexMod: true, maxDexBonus: 2, notes: 'No Stealth disadvantage, no Str req, AC 13+DEX' },
  { name: 'Adamantine Armor',     category: 'Magic Item', weight: 65, cost: '—', armorType: 'heavy', baseAC: 18, notes: 'Critical hits against you become normal hits' },
  { name: 'Elven Chain',          category: 'Magic Item', weight: 20, cost: '—', armorType: 'medium', baseAC: 14, addDexMod: true, maxDexBonus: 2, notes: 'AC 14+DEX, proficiency not required. Requires attunement.' },
  { name: 'Glamoured Studded Leather', category: 'Magic Item', weight: 13, cost: '—', armorType: 'light', baseAC: 12, addDexMod: true, notes: 'AC 12+DEX, can magically change appearance. Requires attunement.' },

  // ── Magic Weapons ────────────────────────────────────────────────
  { name: 'Weapon, +1',            category: 'Magic Item', weight: 2,  cost: '—', notes: '+1 to attack and damage rolls' },
  { name: 'Weapon, +2',            category: 'Magic Item', weight: 2,  cost: '—', notes: '+2 to attack and damage rolls' },
  { name: 'Weapon, +3',            category: 'Magic Item', weight: 2,  cost: '—', notes: '+3 to attack and damage rolls' },
  { name: 'Flame Tongue (Longsword)',category:'Magic Item', weight: 3, cost: '—', rollExpression: '2d6', rollLabel: 'Fire',     notes: '+2d6 fire damage, sheds bright light 40ft. Requires attunement.' },
  { name: 'Vorpal Sword',          category: 'Magic Item', weight: 3,  cost: '—', notes: 'Nat 20 severs head. +3 to attack/damage. Requires attunement.' },
  { name: 'Sword of Wounding',     category: 'Magic Item', weight: 3,  cost: '—', rollExpression: '1d4', rollLabel: 'Necrotic', notes: 'On hit: 1d4 necrotic at start of target\'s turns until healed. Requires attunement.' },
  { name: 'Dagger of Venom',       category: 'Magic Item', weight: 1,  cost: '—', rollExpression: '2d10', rollLabel: 'Poison', notes: '+1 attack/damage. Coat in poison once/day: DC 15 CON or 2d10 poison, poisoned.' },
  { name: 'Holy Avenger',          category: 'Magic Item', weight: 3,  cost: '—', rollExpression: '2d10', rollLabel: 'Radiant', notes: 'Paladins: +3, +2d10 radiant vs undead/fiends. Aura of protection. Requires attunement by Paladin.' },
  { name: 'Staff of Striking',     category: 'Magic Item', weight: 4,  cost: '—', rollExpression: '1d6', rollLabel: 'Force',   notes: '+3 attack/damage. Expend charges for +1d6 force per charge (max 3). Requires attunement.' },

  // ── Rods, Wands, Staves ──────────────────────────────────────────
  { name: 'Wand of Magic Missiles', category: 'Magic Item', weight: 1, cost: '—', rollExpression: '7d4+7', rollLabel: 'Force',  notes: '7 charges. 1–3 charges: fire 1–3 extra magic missiles (1d4+1 each).' },
  { name: 'Wand of Fireballs',      category: 'Magic Item', weight: 1, cost: '—', rollExpression: '8d6', rollLabel: 'Fire',    notes: '7 charges. Expend to cast fireball at 3rd–10th level. Requires attunement.' },
  { name: 'Wand of Lightning Bolts',category: 'Magic Item', weight: 1, cost: '—', rollExpression: '8d6', rollLabel: 'Lightning', notes: '7 charges. Expend to cast lightning bolt. Requires attunement.' },
  { name: 'Rod of Lordly Might',    category: 'Magic Item', weight: 5, cost: '—', notes: 'Multiple functions: +3 mace, various combat modes. Requires attunement.' },
  { name: 'Staff of Power',         category: 'Magic Item', weight: 4, cost: '—', rollExpression: '2d6+2', rollLabel: 'Varies', notes: '+2 AC, attack, saves. 20 charges for spells. Requires attunement by spellcaster.' },
  { name: 'Staff of the Magi',      category: 'Magic Item', weight: 4, cost: '—', notes: '+2 AC. 50 charges for many spells. Requires attunement by spellcaster.' },

  // ── Adventuring Gear ─────────────────────────────────────────────
  { name: 'Rope, Hempen (50 ft)', category: 'Adventuring Gear', weight: 10,  cost: '1 gp' },
  { name: 'Rope, Silk (50 ft)',   category: 'Adventuring Gear', weight: 5,   cost: '10 gp' },
  { name: 'Torch',               category: 'Adventuring Gear', weight: 1,   cost: '1 cp',  notes: 'Bright light 20ft, dim light 20ft more. 1 hour.' },
  { name: 'Lantern, Bullseye',   category: 'Adventuring Gear', weight: 2,   cost: '10 gp', notes: 'Bright cone 60ft, dim 60ft more. 6 hours per oil.' },
  { name: 'Lantern, Hooded',     category: 'Adventuring Gear', weight: 2,   cost: '5 gp',  notes: 'Bright light 30ft, dim 30ft more. 6 hours per oil.' },
  { name: 'Oil (flask)',         category: 'Adventuring Gear', weight: 1,   cost: '1 sp',  rollExpression: '1d4', rollLabel: 'Fire', notes: 'Ignite on ground: 5 ft square burns 2 rounds, 1d4 fire/round. Or splash: 1d4 fire.' },
  { name: 'Acid (vial)',         category: 'Adventuring Gear', weight: 1,   cost: '25 gp', rollExpression: '2d6', rollLabel: 'Acid', notes: 'Throw at creature: 2d6 acid, DEX DC 13 to avoid.' },
  { name: 'Alchemist\'s Fire',   category: 'Adventuring Gear', weight: 1,   cost: '50 gp', rollExpression: '1d4', rollLabel: 'Fire', notes: 'Ranged attack: creature burns, 1d4 fire/round until DC 10 DEX to extinguish.' },
  { name: 'Antitoxin (vial)',    category: 'Adventuring Gear', weight: 0,   cost: '50 gp', notes: 'Advantage on poison saves for 1 hour.' },
  { name: 'Caltrops (bag)',      category: 'Adventuring Gear', weight: 2,   cost: '1 gp',  notes: 'Covers 5 sq ft. DC 15 DEX save or 1 piercing, speed halved.' },
  { name: 'Crowbar',            category: 'Adventuring Gear', weight: 5,   cost: '2 gp',  notes: 'Advantage on STR checks requiring leverage.' },
  { name: 'Grappling Hook',     category: 'Adventuring Gear', weight: 4,   cost: '2 gp' },
  { name: 'Healer\'s Kit',      category: 'Adventuring Gear', weight: 3,   cost: '5 gp',  notes: '10 uses. Stabilize creature without Medicine check.' },
  { name: 'Holy Water (flask)',  category: 'Adventuring Gear', weight: 1,   cost: '25 gp', rollExpression: '2d6', rollLabel: 'Radiant', notes: 'Throw at undead or fiend: 2d6 radiant if hits.' },
  { name: 'Hunting Trap',       category: 'Adventuring Gear', weight: 25,  cost: '5 gp',  notes: 'Large or smaller: grappled, DC 13 STR to escape, 1d4 piercing.' },
  { name: 'Tinderbox',          category: 'Adventuring Gear', weight: 1,   cost: '5 sp',  notes: 'Light a campfire or torch as action (or 1 minute outdoors).' },
  { name: 'Backpack',           category: 'Adventuring Gear', weight: 5,   cost: '2 gp',  notes: '1 cu ft / 30 lb capacity.' },
  { name: 'Bedroll',            category: 'Adventuring Gear', weight: 7,   cost: '1 gp' },
  { name: 'Blanket',            category: 'Adventuring Gear', weight: 3,   cost: '5 sp' },
  { name: 'Rations (1 day)',    category: 'Adventuring Gear', weight: 2,   cost: '5 sp' },
  { name: 'Waterskin',          category: 'Adventuring Gear', weight: 5,   cost: '2 sp',  notes: 'Holds 4 pints of liquid.' },
  { name: 'Spyglass',           category: 'Adventuring Gear', weight: 1,   cost: '1,000 gp', notes: 'See objects up to 10× closer.' },
  { name: 'Thieves\' Tools',    category: 'Tools', weight: 1,  cost: '25 gp', notes: 'Pick locks, disarm traps.' },
  { name: 'Herbalism Kit',      category: 'Tools', weight: 3,  cost: '5 gp' },
  { name: 'Climber\'s Kit',     category: 'Adventuring Gear', weight: 12, cost: '25 gp',  notes: 'Pitons, boots, gloves, harness. Anchor 1 creature.' },
];

/**
 * Calculate the effective AC from a piece of armor given the character's DEX modifier.
 */
export function calcArmorAC(item: CatalogueItem, dexMod: number): number {
  if (!item.baseAC) return 10 + dexMod; // unarmored
  if (item.armorType === 'shield') return item.baseAC; // shields are additive
  if (item.addDexMod) {
    const cappedDex = item.maxDexBonus !== undefined ? Math.min(dexMod, item.maxDexBonus) : dexMod;
    return item.baseAC + cappedDex;
  }
  return item.baseAC; // heavy armor — flat value
}

/**
 * Get a human-readable AC breakdown string for tooltip display.
 */
export function acBreakdown(item: CatalogueItem | null, dexMod: number): string {
  if (!item) return `10 + ${dexMod} DEX (Unarmored)`;
  if (item.armorType === 'shield') return `+${item.baseAC} (Shield bonus)`;
  if (item.addDexMod) {
    const capped = item.maxDexBonus !== undefined ? Math.min(dexMod, item.maxDexBonus) : dexMod;
    const capNote = item.maxDexBonus !== undefined && dexMod > item.maxDexBonus ? ` (capped at +${item.maxDexBonus})` : '';
    return `${item.baseAC} base + ${capped} DEX${capNote}`;
  }
  return `${item.baseAC} (${item.name}, heavy)`;
}
