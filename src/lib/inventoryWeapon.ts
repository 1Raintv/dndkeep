// v2.266.0 — Inventory ↔ WeaponItem bridge.
//
// Pulled out of CharacterSheet/index.tsx (where the same conversion
// logic lived inline as `inventoryAsWeapons.map(...)` since v2.184).
// Lifting it makes the Inventory tab able to swing equipped weapons
// without forking the conversion math, and keeps a single source of
// truth for the damage-resolution cascade described inline below.
//
// Why this helper exists: the Actions tab needs `WeaponItem`-shaped
// rows so it can render the existing weapon attack UI. An equipped
// inventory item is conceptually a weapon but it stores its damage
// info as free-form strings (`item.damage`, `item.description`,
// catalogue link, magical bonus fields). This module collapses that
// into the strict `WeaponItem` shape callers can swing.

import type { ComputedStats, InventoryItem, WeaponItem } from '../types';
import { getMagicItemById } from './hooks/useMagicItems';
import { itemRequiresAttunement } from './attunement';

/** Mirrors the v2.179.0 inventoryWeapons predicate from index.tsx.
 *  Returns true if the item should be treated as a weapon for the
 *  purposes of attack rendering / striking — i.e. it's equipped, has
 *  weapon characteristics, and (if attunement is required) is
 *  attuned. Potions are excluded; they have their own Use button. */
export function isStrikeableInventoryWeapon(item: InventoryItem): boolean {
  if (item.category === 'Potion') return false;
  if (!item.equipped) return false;
  const catalogueType = (item as any).magic_item_id
    ? getMagicItemById((item as any).magic_item_id)?.type
    : undefined;
  const looksLikeWeapon =
    item.damage ||
    item.is_weapon ||
    item.category?.toLowerCase() === 'weapon' ||
    item.category?.toLowerCase() === 'weapons' ||
    catalogueType === 'weapon' ||
    catalogueType === 'staff';
  if (!looksLikeWeapon) return false;
  if (itemRequiresAttunement(item) && !(item as any).attuned) return false;
  return true;
}

/** Convert an inventory weapon row into a WeaponItem so the same
 *  attack pipeline (WeaponsTracker / strike modal) can swing it.
 *
 *  Damage resolution cascade — IMPORTANT, do not reorder without
 *  understanding the v2.184 bug. We pick the first candidate string
 *  that contains parseable dice (e.g. `1d8 slashing`). Without the
 *  dice-presence test, fluff descriptions like a Luck Blade's
 *  "[LEGENDARY — Requires Attunement] +1 attack/damage…" win and
 *  the attack misfires with a bogus 1d4 fallback. */
export function inventoryItemToWeapon(
  item: InventoryItem,
  computed: ComputedStats,
): WeaponItem {
  const catalogueEntry = (item as any).magic_item_id
    ? getMagicItemById((item as any).magic_item_id)
    : undefined;
  const candidates = [
    item.damage,
    catalogueEntry?.baseDamageDice,
    item.description,
    (item as any).notes,
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);
  const DICE_RE = /\d+d\d+/;
  const dmgStr = candidates.find(s => DICE_RE.test(s)) ?? candidates[0] ?? '';
  const diceMatch = dmgStr.match(/(\d+d\d+)/);
  const bonusMatch = dmgStr.match(/[+\-]\d+/);
  const typeMatch = dmgStr.match(/(slashing|piercing|bludgeoning|fire|cold|lightning|poison|acid|necrotic|radiant|psychic|thunder|force)/i);

  const strMod = computed.modifiers.strength ?? 0;
  const dexMod = computed.modifiers.dexterity ?? 0;
  const isFinesse = item.properties?.toLowerCase().includes('finesse');
  // Finesse uses better of STR/DEX. Ranged weapons (range string isn't
  // 'Melee') use DEX. Everything else STR. Same logic the Actions tab
  // has been using since v2.184.
  const isRanged = !!(item.range && !item.range.toLowerCase().includes('melee'));
  const atkMod = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod;

  const pb = computed.proficiency_bonus ?? 2;
  const magicAtkBonus = typeof (item as any).attackBonus === 'number' ? (item as any).attackBonus : 0;
  const magicDmgBonus = typeof (item as any).damageBonus === 'number' ? (item as any).damageBonus : 0;

  return {
    // Prefix the synthetic id so the Actions tab and Inventory don't
    // collide if both render strikes for the same underlying row.
    id: `inv_${item.id}`,
    name: item.name,
    attackBonus: atkMod + pb + magicAtkBonus,
    damageDice: diceMatch ? diceMatch[1] : '1d4',
    damageBonus: (bonusMatch ? parseInt(bonusMatch[0]) : atkMod) + magicDmgBonus,
    damageType: typeMatch ? typeMatch[1].toLowerCase() : 'bludgeoning',
    range: item.range ?? 'Melee',
    properties: item.properties ?? '',
    notes: '',
  };
}
