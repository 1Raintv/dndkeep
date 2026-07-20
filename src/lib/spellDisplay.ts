// v2.590.0 — display helpers for spell metadata.
//
// Some 2024 casting times are full reaction triggers ("1 reaction,
// which you take when a creature you can see within 30 feet of
// yourself makes a Charisma-based ability check or saving throw" —
// e.g. Ego Whip). Collapsed list rows should show only the short
// form; the full trigger belongs in the expanded/detail view.

/** "1 reaction, which you take when..." -> "1 reaction". */
export function shortCastingTime(ct: string): string {
  const comma = ct.indexOf(',');
  return comma === -1 ? ct : ct.slice(0, comma);
}
