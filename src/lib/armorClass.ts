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
import { itemBonusesActive } from './attunement';

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

  // Magic item +AC bonuses. Sum acBonus from every equipped item
  // whose bonuses are currently active per attunement rules.
  // itemBonusesActive handles the equipped + (attuned OR not-required)
  // RAW gate. For items with no magic_item_id (legacy), this falls
  // through the non-attuning branch and returns true when equipped.
  let itemAC = 0;
  for (const item of inventory) {
    if (!item.magical) continue;
    if (typeof item.acBonus !== 'number') continue;
    if (!itemBonusesActive(item)) continue;
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
    if (!item.magical) continue;
    if (typeof item.acBonus !== 'number' || item.acBonus === 0) continue;
    if (!itemBonusesActive(item)) continue;
    parts.push(`${item.name} ${item.acBonus >= 0 ? '+' : ''}${item.acBonus}`);
    total += item.acBonus;
  }

  return `${parts.join(' · ')} = ${total}`;
}

// v2.186.0 — Phase Q.0 pt 27: structured AC breakdown for the click-to-
// inspect popover on the character sheet's AC chip. Same logic as
// describeACBreakdown above, but returns an array of {label, value}
// rows plus a total — easier to render as a column of stat lines than
// parsing the dot-separated string. Both functions stay in sync because
// any change to the AC formula must update both.
export interface ACBreakdownRow {
  label: string;
  /** Signed integer for visual emphasis (e.g. "+1", "-1", "10"). */
  value: number;
  /** Optional helper text shown in muted color under the label. */
  detail?: string;
}

export interface ACBreakdown {
  rows: ACBreakdownRow[];
  total: number;
}

export function describeACBreakdownRows(
  character: Pick<Character, 'dexterity'>,
  inventory: InventoryItem[],
): ACBreakdown {
  const dexMod = Math.floor(((character.dexterity ?? 10) - 10) / 2);
  const armor = inventory.find(
    i => i.equipped && i.armorType && i.armorType !== 'shield' && typeof i.baseAC === 'number',
  );
  const shield = inventory.find(
    i => i.equipped && i.armorType === 'shield' && typeof i.baseAC === 'number',
  );

  const rows: ACBreakdownRow[] = [];
  let total = 0;

  if (armor) {
    const base = armor.baseAC ?? 10;
    rows.push({ label: armor.name, value: base, detail: `Base armor` });
    total += base;
    if (armor.addDexMod) {
      const cap = armor.maxDexBonus;
      const dex = typeof cap === 'number' ? Math.min(dexMod, cap) : dexMod;
      rows.push({
        label: 'DEX modifier',
        value: dex,
        detail: typeof cap === 'number' ? `Capped at +${cap} by armor` : undefined,
      });
      total += dex;
    }
  } else {
    rows.push({ label: 'Unarmored base', value: 10, detail: 'No armor equipped' });
    rows.push({ label: 'DEX modifier', value: dexMod });
    total += 10 + dexMod;
  }

  if (shield) {
    rows.push({ label: shield.name, value: shield.baseAC ?? 0, detail: 'Shield' });
    total += shield.baseAC ?? 0;
  }

  for (const item of inventory) {
    if (!item.magical) continue;
    if (typeof item.acBonus !== 'number' || item.acBonus === 0) continue;
    if (!itemBonusesActive(item)) continue;
    rows.push({
      label: item.name,
      value: item.acBonus,
      detail: 'Magic item bonus',
    });
    total += item.acBonus;
  }

  return { rows, total };
}

// ─── Combat-time AC layer ────────────────────────────────────────────
// v2.156.0 — Phase P pt 4. Buffs live on combat_participants.active_buffs
// as a jsonb array. Some of those buffs grant a flat +N AC bonus
// (Shield, Shield of Faith, Haste). Per RAW these stack on top of the
// character's base AC — they are NOT persisted on character.armor_class
// because they have durations and can drop (concentration break,
// Shield expiring at start of next turn, etc.).
//
// The correct time to layer them is at combat read time: when the
// attack resolver is comparing a d20 + to-hit against the target's AC.
// Prior to v2.156 the resolver used only the snapshot AC (equipment-
// only), so Shield of Faith and similar buffs had zero effect on hit
// rolls — a well-documented bug before Phase P but hidden because no
// one had yet audited that code path.
//
// Buff shape (lib/buffs.ts ActiveBuff): `{ name, acBonus?: number, ... }`.
// We accept a loose shape here because the caller (pendingAttack)
// reads `active_buffs` jsonb which may contain custom DM-added buffs.

export interface ActiveBuffLike {
  name?: string;
  acBonus?: number;
}

/**
 * Layer temporary-buff AC bonuses on top of a base AC value.
 *
 * Caller passes the character's persisted AC (the equipment-derived
 * number from `recomputeAC` or `character.armor_class`) along with
 * whatever ActiveBuff[] the target currently has in combat. Returns
 * the effective AC that attack rolls should be compared against.
 *
 * Note: this function handles ONLY additive acBonus values. Override-
 * style spells that SET AC to a floor (Mage Armor when wearing armor,
 * Barkskin's AC=16) are NOT handled here — those need their own
 * semantics and will fall to the DM to apply manually for now.
 */
export function effectiveCombatAC(
  baseAC: number,
  activeBuffs: ActiveBuffLike[] | null | undefined,
): number {
  if (!activeBuffs || activeBuffs.length === 0) return baseAC;
  let total = baseAC;
  for (const b of activeBuffs) {
    if (!b) continue;
    const bonus = b.acBonus;
    if (typeof bonus !== 'number' || bonus === 0) continue;
    total += bonus;
  }
  return total;
}

/**
 * Human-readable combat-AC breakdown for tooltips and attack resolution
 * displays. Shows the base AC + each contributing buff so a player can
 * see, e.g., "18 = 17 + Shield of Faith +2 + Shield +5".
 */
export function describeCombatACBreakdown(
  baseAC: number,
  activeBuffs: ActiveBuffLike[] | null | undefined,
): string {
  const effective = effectiveCombatAC(baseAC, activeBuffs);
  if (!activeBuffs || activeBuffs.length === 0 || effective === baseAC) {
    return `AC ${baseAC}`;
  }
  const parts = [`${baseAC}`];
  for (const b of activeBuffs) {
    if (!b) continue;
    const bonus = b.acBonus;
    if (typeof bonus !== 'number' || bonus === 0) continue;
    parts.push(`${b.name ?? 'buff'} ${bonus >= 0 ? '+' : ''}${bonus}`);
  }
  return `${parts.join(' + ')} = ${effective}`;
}
