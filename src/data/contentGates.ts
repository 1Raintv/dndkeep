// src/data/contentGates.ts
//
// v2.688.0 — One place that decides whether a piece of non-core content is
// shown. v2.689.0 — and two ways to turn each one on.
//
// Every gated source answers to BOTH controls, and is visible when EITHER says
// yes:
//
//   SITE-WIDE    the constants below. On for everybody, no database involved.
//   PER-ACCOUNT  a boolean column on profiles. On for one person.
//
// Owner's ask (2026-08-29): "they need to be able to be flipped on through the
// whole site or by only a certain account." Before this the two gated classes
// each had only one of the two — the Psion had the account column, the
// Artificer had the constant.
//
// ── THE TWO SOURCES, AND WHY THEY STAY SEPARATE ──────────────────────────
//
//   'ua'       Unearthed Arcana / playtest. Today: the Psion. It is unfinished
//              rules, not unlicensed ones — it may change under us.
//   'non-srd'  Published, but outside the SRD, so we hold no licensed source
//              to check it against. Today: the Artificer, which appears zero
//              times in SRD 5.2.1 while being fully implemented here.
//
// Different reasons, so different switches: turning playtest content on must
// never turn unverifiable content on as a side effect. contentGates.test.ts
// asserts that independence, because "it was the nearest available flag" is
// exactly how these get wired together by accident.
//
// ── TURNING SOMETHING ON ─────────────────────────────────────────────────
// Site-wide: flip its entry in SITE_WIDE below.
// One account: an admin sets the column — the client cannot. The v2.689
// migration added both flags to the profiles guard trigger, so a PATCH from
// the account itself is rejected with CONTENT_ACCESS_READONLY. Before that,
// `show_ua_content` was self-serve and one API call unlocked the Psion for
// anyone who thought to make it.
//
// v2.691.0 — the Artificer's spell list HAS now been verified. The owner
// supplied "Eberron: Forge of the Artificer" on 2026-08-29; all 79 spells are
// checked against its per-level tables and locked by artificerSpellList.test.ts.
// The original reason for this gate — "we cannot check any of it" — no longer
// applies to the spells.
//
// It stays off anyway, because that is what the owner asked for: the Artificer
// is "to be enabled and disabled", off for the original release. What remains
// undecided is not correctness but LICENSING — the class's feature write-ups in
// classes.ts came out of that paid book, and the SRD's terms do not cover them.
// Settle that before turning this on.
//
// NOTHING HERE DELETES ANYTHING. Class data, features and the class tags on
// spells all stay put; only the discovery surfaces filter. That is what makes
// a flip genuinely one line.

/** Where a piece of content comes from. Absent means core SRD. */
export type ContentSource = 'ua' | 'non-srd';

/**
 * Site-wide switches — on for every visitor, signed in or not.
 * Both off for the original release.
 */
export const SITE_WIDE_ENABLED: Record<ContentSource, boolean> = {
  ua: false,
  'non-srd': false,
};

/** Back-compat alias for the v2.688 name. Prefer SITE_WIDE_ENABLED. */
export const NON_SRD_CONTENT_ENABLED = SITE_WIDE_ENABLED['non-srd'];

/**
 * Classes whose visibility is gated, and by which rule.
 *
 * Duplicated from the `source` field on the CLASSES entries themselves so that
 * callers which only have a class NAME — the spell browser's class filter, the
 * class badges on a spell card — can ask without importing the class data
 * tables. Those tables are ~650 KB and pulling them into a page that doesn't
 * otherwise need them is the entry-chunk mistake CLAUDE.md warns about.
 *
 * `contentGates.test.ts` asserts this map and the CLASSES entries agree, so the
 * duplication cannot drift.
 */
export const GATED_CLASSES: Record<string, ContentSource> = {
  Psion: 'ua',
  Artificer: 'non-srd',
};

/** The viewer's per-account grants. Both default false. */
export interface GateContext {
  /** profiles.show_ua_content */
  showUaContent?: boolean;
  /** profiles.show_non_srd_content */
  showNonSrdContent?: boolean;
}

/** The per-account column that grants each source. */
const ACCOUNT_FLAG: Record<ContentSource, keyof GateContext> = {
  ua: 'showUaContent',
  'non-srd': 'showNonSrdContent',
};

/** Is content from this source visible to this viewer? */
export function isSourceVisible(source: ContentSource | undefined, ctx: GateContext = {}): boolean {
  if (!source) return true;                      // core SRD content
  if (SITE_WIDE_ENABLED[source]) return true;    // on for everyone
  return ctx[ACCOUNT_FLAG[source]] === true;     // or granted to this account
}

/** Is this class visible to this viewer? Takes the class name alone. */
export function isClassVisible(className: string, ctx: GateContext = {}): boolean {
  return isSourceVisible(GATED_CLASSES[className], ctx);
}

/** Filter a list of class names down to the ones this viewer may see. */
export function visibleClassNames(names: readonly string[], ctx: GateContext = {}): string[] {
  return names.filter(n => isClassVisible(n, ctx));
}

/**
 * v2.692.0 — Is this SPELL visible to this viewer?
 *
 * Gating classes was not enough. A spell carries its own source, and the spell
 * browser lists spells directly rather than through a class — so until this
 * existed, every one of the Psion's 14 UA spells (Ego Whip, Psionic Blast,
 * Thought Form...) was fully readable by any account, description and all.
 * Only their class BADGES were hidden, which made the leak easy to miss.
 *
 * The same hole would swallow anything imported from Eberron: Forge of the
 * Artificer. Tag such a spell `source: 'non-srd'` and it is hidden by the same
 * switch that hides the class — which is the point: an Artificer spell has no
 * business being visible to an account that cannot play an Artificer.
 *
 * Spells with no source, or 'srd', are core content and always visible.
 */
export function isSpellVisible(
  spell: { source?: string | null },
  ctx: GateContext = {},
): boolean {
  if (!spell.source || spell.source === 'srd') return true;
  if (spell.source === 'ua') return isSourceVisible('ua', ctx);
  // FAIL CLOSED. Anything else is, by definition, content outside the SRD, so
  // it answers to the non-SRD switch — including values this file has never
  // heard of. Production turned out to carry a third one nobody had written
  // down, `expansion`, on three Xanathar's/Tasha's spells (Find Greater Steed,
  // Holy Weapon, Tasha's Caustic Brew) that were visible to everyone.
  //
  // Defaulting unknown sources to VISIBLE would have been the friendlier
  // choice and the wrong one: it means the next source added to the database
  // leaks silently until someone remembers to update this file, which is
  // exactly how the UA spells stayed readable for so long.
  return isSourceVisible('non-srd', ctx);
}

/** Filter a spell list down to what this viewer may see. */
export function visibleSpells<T extends { source?: string | null }>(
  spells: readonly T[],
  ctx: GateContext = {},
): T[] {
  return spells.filter(s => isSpellVisible(s, ctx));
}
