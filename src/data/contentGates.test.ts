// src/data/contentGates.test.ts
//
// v2.688.0 — Keeps the gate honest in two directions.
//
// 1. GATED_CLASSES duplicates the `source` tag that lives on the CLASSES
//    entries. That duplication is deliberate (see contentGates.ts — callers
//    holding only a class NAME must not have to import the 650 KB class data
//    tables), but a duplicate that can drift is a bug waiting to happen. This
//    asserts the two agree in both directions.
//
// 2. The Artificer is off, and off means off. If someone flips
//    NON_SRD_CONTENT_ENABLED without reading why it exists, the assertion
//    below fails and points them at the reason.

import { describe, it, expect } from 'vitest';
import { CLASSES } from './classes';
import {
  GATED_CLASSES,
  NON_SRD_CONTENT_ENABLED,
  isClassVisible,
  isSourceVisible,
  visibleClassNames,
} from './contentGates';

describe('content gates', () => {
  it('GATED_CLASSES matches the source tags on CLASSES', () => {
    const fromClasses: Record<string, string> = {};
    for (const c of CLASSES) {
      const source = (c as { source?: string }).source;
      if (source && source !== 'official') fromClasses[c.name] = source;
    }
    expect(fromClasses).toEqual(GATED_CLASSES);
  });

  it('leaves core SRD classes visible to everyone', () => {
    for (const name of ['Wizard', 'Cleric', 'Fighter', 'Bard']) {
      expect(isClassVisible(name, { showUaContent: false })).toBe(true);
    }
  });

  it('gates the Psion on the per-account UA flag', () => {
    expect(isClassVisible('Psion', { showUaContent: false })).toBe(false);
    expect(isClassVisible('Psion', { showUaContent: true })).toBe(true);
  });

  it('gates the Artificer site-wide, not per account', () => {
    // Turning UA on must NOT reveal the Artificer — different switch,
    // different reason. This is the assertion that catches someone wiring
    // the Artificer to show_ua_content because it was the nearest flag.
    expect(isClassVisible('Artificer', { showUaContent: true }))
      .toBe(NON_SRD_CONTENT_ENABLED);
    expect(isClassVisible('Artificer', { showUaContent: false }))
      .toBe(NON_SRD_CONTENT_ENABLED);
  });

  it('is OFF for the original release', () => {
    // Deliberate tripwire. If you are here because this failed, you turned the
    // Artificer on: confirm its 79-spell list has actually been checked
    // against the book it comes from first — the SRD cannot do it, the class
    // is not in that document. Then update this expectation in the same
    // commit. See docs/SPELL_DATA_DRIFT.md.
    expect(NON_SRD_CONTENT_ENABLED).toBe(false);
  });

  it('filters a class-name list', () => {
    const all = ['Wizard', 'Artificer', 'Psion', 'Bard'];
    expect(visibleClassNames(all, { showUaContent: false })).toEqual(['Wizard', 'Bard']);
    expect(visibleClassNames(all, { showUaContent: true })).toEqual(['Wizard', 'Psion', 'Bard']);
  });

  it('treats an absent source as core content', () => {
    expect(isSourceVisible(undefined, { showUaContent: false })).toBe(true);
  });
});
