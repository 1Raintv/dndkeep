// v2.656.0 — feature text resolution.

import { describe, it, expect } from 'vitest';
import { resolveFeatureText } from './featureText';
import type { Character } from '../types';

describe('resolveFeatureText', () => {
  it('passes a plain string straight through', () => {
    expect(resolveFeatureText('Resistance to psychic damage.')).toBe('Resistance to psychic damage.');
  });

  it('returns empty for nothing', () => {
    expect(resolveFeatureText(undefined)).toBe('');
    expect(resolveFeatureText(null)).toBe('');
  });

  it('CALLS a function description — the whole point', () => {
    // Rendering the function object itself is what produced React's
    // "Functions are not valid as a React child" in the creator.
    const fn = ((c: Character) => `You have ${c.level} dice.`) as unknown as Parameters<typeof resolveFeatureText>[0];
    expect(resolveFeatureText(fn, { level: 7 })).toBe('You have 7 dice.');
  });

  it('defaults missing ability scores to 10 rather than NaN', () => {
    // HomebrewPage called these with only `{ level: 20 }`, so the ~50
    // features reading c.wisdom rendered the literal string "NaN".
    const fn = ((c: Character) =>
      `Temp HP ${Math.max(1, Math.floor((c.wisdom - 10) / 2))}`) as unknown as Parameters<typeof resolveFeatureText>[0];
    const out = resolveFeatureText(fn, { level: 20 });
    expect(out).not.toMatch(/NaN/);
    expect(out).toBe('Temp HP 1');
  });

  it('uses real scores when given them', () => {
    const fn = ((c: Character) =>
      `Add ${Math.floor((c.wisdom - 10) / 2)}`) as unknown as Parameters<typeof resolveFeatureText>[0];
    expect(resolveFeatureText(fn, { level: 5, wisdom: 18 })).toBe('Add 4');
  });

  it('defaults level to 1 when unspecified', () => {
    const fn = ((c: Character) => `L${c.level}`) as unknown as Parameters<typeof resolveFeatureText>[0];
    expect(resolveFeatureText(fn, {})).toBe('L1');
  });

  it('swallows a throwing description instead of blanking the page', () => {
    const fn = (() => { throw new Error('bad data'); }) as unknown as Parameters<typeof resolveFeatureText>[0];
    expect(resolveFeatureText(fn, { level: 3 })).toBe('');
  });
});
