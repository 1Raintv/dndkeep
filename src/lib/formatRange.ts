// v2.505.0 — Shared range-string display formatter.
//
// Background: spell and ability range values come from heterogeneous
// sources — the live `spells` table, the static spells.ts fallback,
// species trait data, and class-ability data — and they were authored
// inconsistently over time:
//   "30 feet", "30 ft", "30 ft.", "5 ft. / 20/60 ft.", "15 ft cone",
//   "Self", "Touch", "Self (30-foot radius)", etc.
// The visible symptom: the Actions tab shows a spell as "30 feet" in
// one row and an ability as "30 ft" in another, so the two surfaces
// look mismatched even though they mean the same thing.
//
// Rather than rewrite hundreds of data rows (and re-introduce drift
// the next time someone adds a spell), we normalize at DISPLAY time.
// Every compact range cell pipes through formatRange() so the column
// reads uniformly as "30 ft", "5 ft", "Self", "Touch", etc.
//
// Rules:
//   - "feet" / "foot" / "ft." / "ft"  → "ft" (no trailing period)
//   - keep numeric distances and compound ranges ("20/60 ft",
//     "5 ft / 20/60 ft") intact, just normalizing each unit token
//   - leave non-distance words ("Self", "Touch", "Sight", "Special",
//     "Unlimited") as-is, only fixing capitalization to Title Case
//   - preserve trailing descriptors like "cone", "radius", "line"
//     but normalize the unit inside them ("15 feet cone" → "15 ft cone")
//   - empty / nullish → "" (caller decides placeholder)
//
// This is display-only. The underlying data is untouched, and nothing
// that parses range for mechanics reads the formatted string.

/**
 * Normalize a free-form range string for compact display.
 * Collapses every spelled-out / punctuated feet unit to a bare "ft".
 */
export function formatRange(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';

  // Normalize all feet spellings to "ft". Order matters: handle the
  // longer "feet"/"foot" words before the abbreviations, and strip a
  // trailing period on "ft." Word boundaries keep us from mangling
  // words that merely contain these letters.
  s = s
    .replace(/\bfeet\b/gi, 'ft')
    .replace(/\bfoot\b/gi, 'ft')
    .replace(/\bft\.\B/gi, 'ft')   // "ft." mid-string
    .replace(/\bft\./gi, 'ft')      // "ft." at end
    .replace(/\bft\b/gi, 'ft');     // normalize casing of bare "ft"

  // Collapse any doubled spaces introduced by the replacements.
  s = s.replace(/\s{2,}/g, ' ').trim();

  // Title-case the common non-distance keywords so "self" / "SELF"
  // render consistently as "Self", etc. Only touch a token if the
  // whole string is that keyword (don't capitalize inside compound
  // descriptors).
  const KEYWORDS: Record<string, string> = {
    self: 'Self',
    touch: 'Touch',
    sight: 'Sight',
    special: 'Special',
    unlimited: 'Unlimited',
  };
  const lower = s.toLowerCase();
  if (KEYWORDS[lower]) return KEYWORDS[lower];

  // "Self (30 ft radius)" style — capitalize a leading "self".
  if (/^self\b/i.test(s)) {
    s = s.replace(/^self\b/i, 'Self');
  }

  return s;
}
