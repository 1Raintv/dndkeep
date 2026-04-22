// v2.153.0 — Phase P pt 1 of Magic Items.
//
// Central AC recompute helper. Implements the "cumulative write-on-equip"
// model: every time a piece of equipment is equipped, unequipped, or
// has its attunement toggled, callers invoke `recomputeAC(character,
// inventory)` and persist the result via Character.armor_class.
//
// Components:
//   1. Base AC — 10 + Dex mod (unarmored); or, if armor is equipped,
//      armor baseAC + optional Dex mod (capped at maxDexBonus)
//   2. Shield — flat +AC from equipped shield (stacks with armor)
//   3. Magic item bonuses — sum of acBonus from all equipped items
//      that are magical (v2.155 gates on attuned for items that
//      require attunement)
//
// Does NOT include:
//   • Buff acBonus (Shield spell +5, Shield of Faith +2, Haste +2) —
//     those live in combat_participants.active_buffs and are layered
//     on top at combat read time. Buff AC is not persisted to
//     character.armor_class.
//   • Class features that grant unarmored AC (Monk's Martial Arts,
//     Barbarian's Unarmored Defense, Draconic Sorcerer). Those are
//     character-specific derivations that pre-date Phase P and live
//     in CharacterSettings / the unarmored-defense toggle. If the
//     character's base unarmored AC is set through that path,
//     recomputeAC still works — it just starts from whatever "no
//     armor + no shield" baseline the character arrived with.
//
// Behavior is deliberately conservative for the v2.153 introduction:
// we only recompute when there's a signal that AC should change
// (armor equip, shield equip, +AC magic item equip). Callers that
// want the pure write-on-equip invariant wire this into the
// Inventory component's equip toggle path.

import type { Character, InventoryItem } from '../types';

export interface RecomputeACOptions {
  /** When false (default), returns the current armor_class unchanged.
   *  Used as a safety fuse for components that aren't fully migrated
   *  yet — can be flipped on after verifying the inventory shape. */
  enabled?: boolean;
}

/**
 * Recompute a character's total AC from their ability scores, equipped
 * armor/shield, and equipped magic items.
 *
 * Returns a number suitable for direct persistence to
 * `character.armor_class`. Callers pass the character AFTER the
 * equip/unequip mutation has been applied locally so the inventory
 * reflects the intended new state.
 */
export function recomputeAC(
  character: Pick<Character, 'armor_class' | 'dexterity'>,
  inventory: InventoryItem[],
  options: RecomputeACOptions = {},
): number {
  const enabled = options.enabled ?? true;
  if (!enabled) return character.armor_class;

  const dexMod = Math.floor(((character.dexterity ?? 10) - 10) / 2);

  // Find the single equipped armor piece (non-shield). If the user
  // somehow has multiple armor pieces flagged equipped, we take the
  // first — Inventory's toggle should prevent this in practice, but
  // the guard avoids summing two chest pieces.
  const equippedArmor = inventory.find(
    i => i.equipped && i.armorType && i.armorType !== 'shield' && typeof i.baseAC === 'number',
  );
  const equippedShield = inventory.find(
    i => i.equipped && i.armorType === 'shield' && typeof i.baseAC === 'number',
  );

  // Armor contribution
  let armorAC: number;
  if (equippedArmor) {
    const base = equippedArmor.baseAC ?? 10;
    if (equippedArmor.addDexMod) {
      const cap = equippedArmor.maxDexBonus;
      const dex = typeof cap === 'number' ? Math.min(dexMod, cap) : dexMod;
      armorAC = base + dex;
    } else {
      armorAC = base;
    }
  } else {
    // Unarmored — 10 + Dex. Class-specific unarmored defense
    // overrides (Monk, Barb) are not computed here; if the character
    // already has a higher unarmored AC persisted, we preserve the
    // delta via character.armor_class on the caller side when they
    // opt out of this helper.
    armorAC = 10 + dexMod;
  }

  // Shield
  const shieldAC = equippedShield ? (equippedShield.baseAC ?? 0) : 0;

  // Magic item +AC bonuses. Sum acBonus from every equipped item.
  // v2.155 gates on attuned for items flagged requires_attunement;
  // until then the gate is "equipped + magical + has acBonus".
  let itemAC = 0;
  for (const item of inventory) {
    if (!item.equipped) continue;
    if (!item.magical) continue;
    if (typeof item.acBonus !== 'number') continue;
    itemAC += item.acBonus;
  }

  return armorAC + shieldAC + itemAC;
}

/**
 * Human-readable AC breakdown for tooltips. Mirrors the computation in
 * recomputeAC so the tooltip always matches the displayed total.
 *
 * Example output: "Scale Mail 14 +DEX(≤2) +1 · Shield +2 · Ring of
 * Protection +1 = 18"
 */
export function describeACBreakdown(
  character: Pick<Character, 'dexterity'>,
  inventory: InventoryItem[],
): string {
  const dexMod = Math.floor(((character.dexterity ?? 10) - 10) / 2);

  const armor = inventory.find(
    i => i.equipped && i.armorType && i.armorType !== 'shield' && typeof i.baseAC === 'number',
  );
  const shield = inventory.find(
    i => i.equipped && i.armorType === 'shield' && typeof i.baseAC === 'number',
  );

  const parts: string[] = [];
  let total = 0;

  if (armor) {
    const base = armor.baseAC ?? 10;
    let armorAC = base;
    let dexText = '';
    if (armor.addDexMod) {
      const cap = armor.maxDexBonus;
      const dex = typeof cap === 'number' ? Math.min(dexMod, cap) : dexMod;
      armorAC = base + dex;
      dexText = typeof cap === 'number'
        ? ` ${dex >= 0 ? '+' : ''}${dex} DEX(≤${cap})`
        : ` ${dex >= 0 ? '+' : ''}${dex} DEX`;
    }
    parts.push(`${armor.name} ${base}${dexText}`);
    total += armorAC;
  } else {
    parts.push(`Unarmored 10 ${dexMod >= 0 ? '+' : ''}${dexMod} DEX`);
    total += 10 + dexMod;
  }

  if (shield) {
    parts.push(`${shield.name} +${shield.baseAC ?? 0}`);
    total += shield.baseAC ?? 0;
  }

  for (const item of inventory) {
    if (!item.equipped || !item.magical) continue;
    if (typeof item.acBonus !== 'number' || item.acBonus === 0) continue;
    parts.push(`${item.name} ${item.acBonus >= 0 ? '+' : ''}${item.acBonus}`);
    total += item.acBonus;
  }

  return `${parts.join(' · ')} = ${total}`;
}
