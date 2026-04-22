// v2.149.0 — Phase O pt 2 of Spell Wiring.
//
// Registry of attack-roll spells that fire MULTIPLE independent attack
// rolls per cast. Scorching Ray fires 3 rays at base, +1 per slot level
// above 2nd. Eldritch Blast scales by character level: 1 beam at L1,
// 2 at L5, 3 at L11, 4 at L17.
//
// Why a registry instead of structured data: the SRD import populates
// damage_dice (per beam) and attack_type correctly, but the beam
// COUNT isn't a structured field — it lives in description text. A
// registry is simpler, audit-able, and matches the Phase H
// BUFF_SPELL_REGISTRY pattern for spells that need special UI.
//
// Callers (MultiAttackPickerModal) use `computeDefaultAttackCount` to
// suggest a default; the UI lets the player adjust if they disagree
// with the registry (e.g., Hex'd target grants extra damage not extra
// beams — player keeps count at default, no override needed).

export type MultiAttackScaling =
  | { kind: 'slot_above_base'; base: number; increment: number; baseSlot: number }   // Scorching Ray
  | { kind: 'character_level'; tiers: Array<{ minLevel: number; count: number }> };  // Eldritch Blast

export interface MultiAttackSpellDef {
  /** Case-insensitive match against spell.name. */
  name: string;
  /** Per-beam damage dice. Falls back to spell.damage_dice when unset. */
  perBeamDice?: string;
  scaling: MultiAttackScaling;
}

export const MULTI_ATTACK_SPELLS: MultiAttackSpellDef[] = [
  {
    name: 'scorching ray',
    // 2024 PHB p.293: 3 rays at 2nd level, +1 ray per slot above 2nd.
    // Upcast at 3rd → 4 rays, 4th → 5 rays, ... up to 8 rays at 9th.
    scaling: { kind: 'slot_above_base', base: 3, increment: 1, baseSlot: 2 },
  },
  {
    name: 'eldritch blast',
    // 2024 PHB p.272 (Warlock spell list): 1 beam at L1, 2 at L5,
    // 3 at L11, 4 at L17. Tiers are inclusive lower bounds.
    scaling: {
      kind: 'character_level',
      tiers: [
        { minLevel: 1,  count: 1 },
        { minLevel: 5,  count: 2 },
        { minLevel: 11, count: 3 },
        { minLevel: 17, count: 4 },
      ],
    },
  },
];

const REGISTRY_MAP: Record<string, MultiAttackSpellDef> = Object.fromEntries(
  MULTI_ATTACK_SPELLS.map(s => [s.name.toLowerCase(), s]),
);

/**
 * Look up a multi-attack spell by name. Case-insensitive. Returns
 * `undefined` for single-attack spells or spells not in the registry.
 */
export function findMultiAttackSpell(
  spellName: string,
): MultiAttackSpellDef | undefined {
  return REGISTRY_MAP[spellName.trim().toLowerCase()];
}

/**
 * Compute the default beam/ray count for a multi-attack spell given
 * the slot level being cast and the caster's character level. Returns
 * a minimum of 1 (degenerate case shouldn't happen but guards UI).
 */
export function computeDefaultAttackCount(
  spell: MultiAttackSpellDef,
  slotLevel: number,
  characterLevel: number,
): number {
  const s = spell.scaling;
  if (s.kind === 'slot_above_base') {
    // Slots below base level fall back to `base` — shouldn't happen in
    // practice (the slot picker prevents it), but the guard avoids
    // negative counts.
    const bonus = Math.max(0, slotLevel - s.baseSlot);
    return Math.max(1, s.base + bonus * s.increment);
  }
  // character_level: pick the highest tier whose minLevel ≤ characterLevel.
  let count = 1;
  for (const tier of s.tiers) {
    if (characterLevel >= tier.minLevel) count = tier.count;
  }
  return Math.max(1, count);
}
