// src/lib/monsterUtils.ts
//
// v2.24.0 — Monster utility helpers. formatCR() was relocated here
// from the deleted src/data/monsters.ts when monsters migrated to
// the public.monsters table. Consumers should import from this
// module directly instead of the legacy static data file.

/**
 * Render a Challenge Rating value for display. Converts the three
 * fractional CRs that D&D 5e uses (1/8, 1/4, 1/2) to their single-
 * glyph equivalents. All other values (integers and, defensively,
 * unknown strings) are returned as-is.
 */
export function formatCR(cr: number | string): string {
  if (cr === '1/8') return '⅛';
  if (cr === '1/4') return '¼';
  if (cr === '1/2') return '½';
  return String(cr);
}
