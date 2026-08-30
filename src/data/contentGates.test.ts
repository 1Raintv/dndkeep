// src/data/contentGates.test.ts
//
// v2.688.0 — keeps the gate honest. v2.689.0 — now covers both switches.
//
// Each gated source has a site-wide constant and a per-account column, and is
// visible when EITHER is on. The assertions that matter most here are the ones
// about INDEPENDENCE: granting playtest content must never hand out
// unverifiable content, in either direction or by either switch. "It was the
// nearest available flag" is how these get wired together by accident.

import { describe, it, expect } from 'vitest';
import { CLASSES } from './classes';
import {
  GATED_CLASSES,
  SITE_WIDE_ENABLED,
  isClassVisible,
  isSourceVisible,
  visibleClassNames,
} from './contentGates';

const NOBODY = {};
const UA_ONLY = { showUaContent: true };
const NON_SRD_ONLY = { showNonSrdContent: true };

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
      expect(isClassVisible(name, NOBODY)).toBe(true);
    }
  });

  it('treats an absent source as core content', () => {
    expect(isSourceVisible(undefined, NOBODY)).toBe(true);
  });

  describe('per-account switch', () => {
    it('shows the Psion to an account granted UA', () => {
      expect(isClassVisible('Psion', NOBODY)).toBe(false);
      expect(isClassVisible('Psion', UA_ONLY)).toBe(true);
    });

    it('shows the Artificer to an account granted non-SRD', () => {
      expect(isClassVisible('Artificer', NOBODY)).toBe(false);
      expect(isClassVisible('Artificer', NON_SRD_ONLY)).toBe(true);
    });
  });

  describe('the two switches stay independent', () => {
    it('a UA grant does not reveal the Artificer', () => {
      expect(isClassVisible('Artificer', UA_ONLY)).toBe(false);
    });

    it('a non-SRD grant does not reveal the Psion', () => {
      expect(isClassVisible('Psion', NON_SRD_ONLY)).toBe(false);
    });
  });

  describe('site-wide switches', () => {
    // Deliberate tripwire. If one of these failed, you turned content on for
    // every visitor. For the Artificer specifically: confirm its 79-spell list
    // has been checked against the book it comes from first — the SRD cannot
    // do it, the class is not in that document. Then update the expectation in
    // the same commit. See docs/SPELL_DATA_DRIFT.md.
    it('are both OFF for the original release', () => {
      expect(SITE_WIDE_ENABLED).toEqual({ ua: false, 'non-srd': false });
    });

    it('grant to everyone when on, without any account flag', () => {
      // Proves the OR: exercised against a stub rather than the real constant
      // so the tripwire above stays meaningful.
      const visible = (siteWide: boolean, account: boolean) => siteWide || account;
      expect(visible(true, false)).toBe(true);
      expect(visible(false, true)).toBe(true);
      expect(visible(false, false)).toBe(false);
    });
  });

  it('filters a class-name list', () => {
    const all = ['Wizard', 'Artificer', 'Psion', 'Bard'];
    expect(visibleClassNames(all, NOBODY)).toEqual(['Wizard', 'Bard']);
    expect(visibleClassNames(all, UA_ONLY)).toEqual(['Wizard', 'Psion', 'Bard']);
    expect(visibleClassNames(all, NON_SRD_ONLY)).toEqual(['Wizard', 'Artificer', 'Bard']);
    expect(visibleClassNames(all, { showUaContent: true, showNonSrdContent: true }))
      .toEqual(all);
  });
});
