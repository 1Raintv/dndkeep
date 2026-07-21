// v2.618.0 — Range-text parsing for target-picker gating (the queued
// "must be in range to target" item). Shared by PlayerAttackButton
// call sites (weapons via WeaponsTracker, spells via SpellCastButton);
// the DM's monster flows already had their own parsers + the
// RangeAwareTargetPicker (v2.364).
//
// Philosophy matches the DM side: FAIL OPEN. A null return means "no
// gate" — better to allow a possibly-out-of-range click on weird
// homebrew text than to block a valid play. Ranged weapons gate on
// the LONG range (RAW: attacks between normal and long range are
// legal at disadvantage; the disadvantage reminder is a follow-up).

/** Parse a spell/weapon range string to a max distance in feet.
 *  "60 feet" → 60 · "Touch" → 5 · "Self" → 5 · "80/320" → 320 ·
 *  "1 mile" → 5280 · "Melee" → 5 · unparseable → null (no gate). */
export function parseRangeToFt(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text.trim();
  if (/^self\b/i.test(s)) return 5;
  if (/touch/i.test(s)) return 5;
  const mi = s.match(/(\d+)\s*miles?/i);
  if (mi) return parseInt(mi[1], 10) * 5280;
  const longRange = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (longRange) return parseInt(longRange[2], 10);
  const ft = s.match(/(\d+)\s*(?:feet|ft\.?)/i);
  if (ft) return parseInt(ft[1], 10);
  if (/melee/i.test(s)) return 5;
  const bare = s.match(/^(\d+)$/);
  if (bare) return parseInt(bare[1], 10);
  return null;
}

/** Max range for a weapon row: melee = 5 ft (10 with the Reach
 *  property); ranged parses the range string (long range governs). */
export function weaponMaxRangeFt(
  range: string | null | undefined,
  properties: string | null | undefined,
): number | null {
  if (range && /melee/i.test(range)) {
    return /reach/i.test(properties ?? '') ? 10 : 5;
  }
  return parseRangeToFt(range);
}
