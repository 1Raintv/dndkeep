// v2.344.0 — Spell range parser.
//
// SRD spell data carries `range` as a free-text string ("60 feet",
// "Touch", "Self", "Self (10-foot radius)", "120/240 feet" for thrown
// or ranged-weapon flavor, "Sight", "Unlimited", "Special"). The
// targeting picker + map renderer both want a numeric feet value for
// (a) drawing the range circle around the caster, (b) flagging targets
// outside that radius in the picker.
//
// This helper consolidates the parsing into one place. Returns:
//   { kind: 'feet', ft: 60 }            — normal numeric range
//   { kind: 'self' }                    — "Self" with no AoE rider
//   { kind: 'touch' }                   — treated as 5 ft for grid math
//   { kind: 'self_aoe', radiusFt: 10 }  — "Self (10-foot radius)" etc.
//   { kind: 'special' }                 — "Sight", "Unlimited",
//                                          "Special" — no usable feet
//                                          value. Caller should skip
//                                          the range circle.
//
// Unknown formats fall through to 'special' so the renderer just
// doesn't draw a circle — no crash, no misleading visual.

export type ParsedRange =
  | { kind: 'feet'; ft: number }
  | { kind: 'self' }
  | { kind: 'touch' }
  | { kind: 'self_aoe'; radiusFt: number }
  | { kind: 'special' };

/** Convert a spell.range string into a structured value. */
export function parseSpellRange(rangeStr: string | null | undefined): ParsedRange {
  if (!rangeStr) return { kind: 'special' };
  const s = rangeStr.trim().toLowerCase();

  // "Self (X-foot radius)" — emanation-style spells. Spirit Guardians,
  // Spirit Shroud, Aura of Vitality. Render as a ring centered on
  // caster matching the AoE shape from area_of_effect.
  const selfAoe = s.match(/^self\s*\(\s*(\d+)\s*-?\s*foot\s*(?:radius|cone|cube|line|sphere)?\s*\)/);
  if (selfAoe) {
    return { kind: 'self_aoe', radiusFt: parseInt(selfAoe[1], 10) };
  }

  if (s === 'self') return { kind: 'self' };
  if (s === 'touch') return { kind: 'touch' };
  if (s === 'sight' || s === 'unlimited' || s === 'special') {
    return { kind: 'special' };
  }

  // "60 feet" / "60 ft" / "60 ft." / "120/240 feet" (thrown ranges —
  // take the first / "normal" range, the second is long range with
  // disadvantage and isn't reliable for spell targeting).
  const feet = s.match(/^(\d+)(?:\s*\/\s*\d+)?\s*(?:feet|ft\.?)/);
  if (feet) {
    return { kind: 'feet', ft: parseInt(feet[1], 10) };
  }

  return { kind: 'special' };
}

/** Convenience: numeric feet value usable for grid math, or null when
 *  the range can't be reduced to a single number (Self, Sight, etc.).
 *  Touch resolves to 5 ft because that's "adjacent cell" in 5e. */
export function resolveRangeFt(parsed: ParsedRange): number | null {
  switch (parsed.kind) {
    case 'feet':     return parsed.ft;
    case 'touch':    return 5;
    case 'self_aoe': return parsed.radiusFt;
    case 'self':     return 0;       // caster only — radius 0 makes
                                     // sense as "ring on caster's cell"
    case 'special':  return null;
  }
}
