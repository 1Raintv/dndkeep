// src/data/contentGates.ts
//
// v2.688.0 — One place that decides whether a piece of non-core content is
// shown, and one place to flip it.
//
// Two kinds of content are gated, for different reasons and by different
// switches:
//
//   'ua'      Unearthed Arcana / playtest. Today: the Psion. Gated per ACCOUNT
//             by profiles.show_ua_content (v2.329.0, T7), so the owner can use
//             it while nobody else sees it.
//   'non-srd' Published but outside the SRD, so we have no licensed source to
//             check it against. Today: the Artificer. Gated SITE-WIDE by the
//             constant below, off for launch.
//
// WHY THE ARTIFICER IS HERE (decided 2026-08-29). Auditing the spell catalog
// against the SRD 5.2.1 PDF turned up 10 spells where this repo and production
// disagreed about Artificer availability — and the SRD could not settle any of
// them, because the Artificer does not appear in that document even once. The
// class is fully implemented here (subclasses, features, a 79-spell list) but
// no part of it traces to a source we hold. Rather than ship rules we cannot
// stand behind, it goes dark until someone checks it against the book it
// actually comes from. Owner's call: "let's keep this off and remove what is
// currently there from public view", with a tag so it can be flipped on later.
//
// TO TURN THE ARTIFICER BACK ON: set NON_SRD_CONTENT_ENABLED to true. That is
// the whole switch — every surface below asks this module. Do it once the
// spell list has been verified against its source, not before.
//
// NOTE none of this deletes anything. The Artificer's class data, features and
// spell tags all stay exactly where they are, so an existing character still
// loads and the flip is genuinely one line. Gating is at the DISCOVERY
// surfaces — the pickers and browsers where someone would find it.

/** Where a piece of content comes from. Absent means core SRD. */
export type ContentSource = 'ua' | 'non-srd';

/**
 * Site-wide switch for published-but-not-SRD content (the Artificer).
 * Off for the original release. See the header before flipping it.
 */
export const NON_SRD_CONTENT_ENABLED = false;

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

export interface GateContext {
  /** profiles.show_ua_content for the signed-in user. */
  showUaContent: boolean;
}

/** Is content from this source visible to this viewer? */
export function isSourceVisible(source: ContentSource | undefined, ctx: GateContext): boolean {
  if (source === 'ua') return ctx.showUaContent;
  if (source === 'non-srd') return NON_SRD_CONTENT_ENABLED;
  return true;
}

/** Is this class visible to this viewer? Takes the class name alone. */
export function isClassVisible(className: string, ctx: GateContext): boolean {
  return isSourceVisible(GATED_CLASSES[className], ctx);
}

/** Filter a list of class names down to the ones this viewer may see. */
export function visibleClassNames(names: readonly string[], ctx: GateContext): string[] {
  return names.filter(n => isClassVisible(n, ctx));
}
