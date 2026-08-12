// v2.656.0 — Resolving class/subclass feature text.
//
// `ClassFeature.description` (and `descriptionLong`) is
// `string | ((c: Character) => string)`: many features interpolate live
// numbers, e.g. Psi Warrior's die size off `c.level` or a Cleric's temp
// HP off `c.wisdom`. Anything rendering one of these has to CALL it.
//
// The character creator did not, and React logged
// "Functions are not valid as a React child" on every build/review step
// showing a subclass feature with a computed description — the function
// object was handed straight to JSX, so the text silently rendered as
// nothing.
//
// HomebrewPage did call it, but with `{ level: 20 } as any`. The ~50
// features that read `c.wisdom` / `c.charisma` / `c.intelligence` then
// computed against `undefined` and rendered the literal string "NaN".
//
// Hence one resolver, with two jobs: call the function, and hand it a
// context complete enough that the arithmetic inside produces a number.

import type { Character } from '../types';

export type FeatureText = string | ((c: Character) => string) | null | undefined;

/**
 * What a description function may read. Everything is optional because
 * the creator has no Character yet — missing scores default to 10 (a +0
 * modifier), which yields sane copy instead of NaN.
 */
export interface FeatureTextContext {
  level?: number;
  name?: string;
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
}

/**
 * Render feature text to a string.
 *
 * Never throws: these functions live in `src/data` and are hand-authored,
 * so a bad one must degrade to empty text rather than blank the whole
 * creator step it appears in.
 */
export function resolveFeatureText(text: FeatureText, ctx: FeatureTextContext = {}): string {
  if (typeof text === 'string') return text;
  if (typeof text !== 'function') return '';
  const character = {
    level: ctx.level ?? 1,
    name: ctx.name ?? '',
    strength: ctx.strength ?? 10,
    dexterity: ctx.dexterity ?? 10,
    constitution: ctx.constitution ?? 10,
    intelligence: ctx.intelligence ?? 10,
    wisdom: ctx.wisdom ?? 10,
    charisma: ctx.charisma ?? 10,
  } as unknown as Character;
  try {
    return text(character) ?? '';
  } catch {
    // A description that reads a field we didn't supply. Swallow it —
    // one broken blurb must not take the surrounding UI down.
    return '';
  }
}
