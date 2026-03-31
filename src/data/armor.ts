export interface ArmorData {
  id: string;
  name: string;
  type: 'light' | 'medium' | 'heavy' | 'unarmored' | 'special';
  baseAC: number;
  dexBonus: 'full' | 'max2' | 'none';
  stealthDisadvantage: boolean;
  strRequirement: number;
  cost: string;
}

export const ARMOR_LIST: ArmorData[] = [
  // Unarmored
  { id: 'unarmored',       name: 'Unarmored',       type: 'unarmored', baseAC: 10, dexBonus: 'full', stealthDisadvantage: false, strRequirement: 0, cost: '—' },
  // Light
  { id: 'padded',          name: 'Padded',           type: 'light', baseAC: 11, dexBonus: 'full', stealthDisadvantage: true,  strRequirement: 0, cost: '5 gp' },
  { id: 'leather',         name: 'Leather',          type: 'light', baseAC: 11, dexBonus: 'full', stealthDisadvantage: false, strRequirement: 0, cost: '10 gp' },
  { id: 'studded-leather', name: 'Studded Leather',  type: 'light', baseAC: 12, dexBonus: 'full', stealthDisadvantage: false, strRequirement: 0, cost: '45 gp' },
  // Medium
  { id: 'hide',            name: 'Hide',             type: 'medium', baseAC: 12, dexBonus: 'max2', stealthDisadvantage: false, strRequirement: 0, cost: '10 gp' },
  { id: 'chain-shirt',     name: 'Chain Shirt',      type: 'medium', baseAC: 13, dexBonus: 'max2', stealthDisadvantage: false, strRequirement: 0, cost: '50 gp' },
  { id: 'scale-mail',      name: 'Scale Mail',       type: 'medium', baseAC: 14, dexBonus: 'max2', stealthDisadvantage: true,  strRequirement: 0, cost: '50 gp' },
  { id: 'breastplate',     name: 'Breastplate',      type: 'medium', baseAC: 14, dexBonus: 'max2', stealthDisadvantage: false, strRequirement: 0, cost: '400 gp' },
  { id: 'half-plate',      name: 'Half Plate',       type: 'medium', baseAC: 15, dexBonus: 'max2', stealthDisadvantage: true,  strRequirement: 0, cost: '750 gp' },
  // Heavy
  { id: 'ring-mail',       name: 'Ring Mail',        type: 'heavy', baseAC: 14, dexBonus: 'none', stealthDisadvantage: true,  strRequirement: 0,  cost: '30 gp' },
  { id: 'chain-mail',      name: 'Chain Mail',       type: 'heavy', baseAC: 16, dexBonus: 'none', stealthDisadvantage: true,  strRequirement: 13, cost: '75 gp' },
  { id: 'splint',          name: 'Splint',           type: 'heavy', baseAC: 17, dexBonus: 'none', stealthDisadvantage: true,  strRequirement: 15, cost: '200 gp' },
  { id: 'plate',           name: 'Plate',            type: 'heavy', baseAC: 18, dexBonus: 'none', stealthDisadvantage: true,  strRequirement: 15, cost: '1,500 gp' },
  // Special
  { id: 'natural-armor',   name: 'Natural Armor',    type: 'special', baseAC: 13, dexBonus: 'full', stealthDisadvantage: false, strRequirement: 0, cost: '—' },
  { id: 'mage-armor',      name: 'Mage Armor',       type: 'special', baseAC: 13, dexBonus: 'full', stealthDisadvantage: false, strRequirement: 0, cost: '—' },
  { id: 'shield-only',     name: 'Unarmored + Shield', type: 'special', baseAC: 12, dexBonus: 'full', stealthDisadvantage: false, strRequirement: 0, cost: '—' },
];

export const ARMOR_MAP: Record<string, ArmorData> = Object.fromEntries(ARMOR_LIST.map(a => [a.id, a]));

export function calcArmorAC(armorId: string, dexterity: number, hasShield = false): number {
  const armor = ARMOR_MAP[armorId] ?? ARMOR_MAP['unarmored'];
  const dexMod = Math.floor((dexterity - 10) / 2);

  let ac: number;
  if (armor.dexBonus === 'full') ac = armor.baseAC + dexMod;
  else if (armor.dexBonus === 'max2') ac = armor.baseAC + Math.min(2, dexMod);
  else ac = armor.baseAC;

  if (hasShield) ac += 2;
  return ac;
}

// Which classes get armor proficiency automatically
export const HEAVY_ARMOR_CLASSES = ['Fighter', 'Paladin', 'Cleric'];
export const MEDIUM_ARMOR_CLASSES = ['Fighter', 'Paladin', 'Cleric', 'Ranger', 'Druid', 'Bard'];
export const LIGHT_ARMOR_CLASSES  = ['Fighter', 'Paladin', 'Cleric', 'Ranger', 'Druid', 'Bard', 'Rogue', 'Warlock'];
