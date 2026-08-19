/**
 * v2.674.0 — Psion Discipline key resolution.
 *
 * The bug these guard: both pickers wrote `disc.name` while the Actions tab
 * looked entries up by `disc.id`, so `find` always missed and a Psion's
 * chosen disciplines rendered nowhere. Writes store ids now, but production
 * characters (every Psion created before this fix) still hold names — so the
 * resolver has to accept both forever, not just during a migration window.
 */
import { describe, it, expect } from 'vitest';
import {
  PSION_DISCIPLINES,
  findDiscipline,
  hasDiscipline,
  withoutDiscipline,
  getDisciplineCount,
} from './psionDisciplines';

const BIOFEEDBACK = PSION_DISCIPLINES[0];

describe('findDiscipline', () => {
  it('resolves every discipline by its id', () => {
    for (const d of PSION_DISCIPLINES) {
      expect(findDiscipline(d.id)).toBe(d);
    }
  });

  it('resolves every discipline by its legacy display name', () => {
    // The exact strings sitting in class_resources on pre-v2.674 characters.
    for (const d of PSION_DISCIPLINES) {
      expect(findDiscipline(d.name)).toBe(d);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(findDiscipline('BIOFEEDBACK')).toBe(BIOFEEDBACK);
    expect(findDiscipline('  biofeedback ')).toBe(BIOFEEDBACK);
  });

  it('returns undefined for junk rather than throwing', () => {
    // These come out of a jsonb column; a hand-edited row must not crash a sheet.
    expect(findDiscipline('swift-precognition')).toBeUndefined(); // renamed in UA v2
    expect(findDiscipline('')).toBeUndefined();
  });

  it('never resolves one key to two different disciplines', () => {
    // A single-word discipline's id IS its lowercased name (Biofeedback),
    // which is fine — what would break the resolver is one key that two
    // DIFFERENT disciplines answer to.
    const owner = new Map<string, string>();
    for (const d of PSION_DISCIPLINES) {
      for (const key of [d.id, d.name.toLowerCase()]) {
        expect(owner.get(key) ?? d.id).toBe(d.id);
        owner.set(key, d.id);
      }
    }
  });
});

describe('hasDiscipline', () => {
  it('matches a stored id and a stored legacy name alike', () => {
    expect(hasDiscipline(['biofeedback'], BIOFEEDBACK)).toBe(true);
    expect(hasDiscipline(['Biofeedback'], BIOFEEDBACK)).toBe(true);
  });

  it('handles a mixed array — a legacy pick plus a post-fix one', () => {
    const mixed = ['Biofeedback', 'id-insinuation'];
    expect(hasDiscipline(mixed, BIOFEEDBACK)).toBe(true);
    expect(hasDiscipline(mixed, findDiscipline('id-insinuation')!)).toBe(true);
    expect(hasDiscipline(mixed, findDiscipline('sharpened-mind')!)).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(hasDiscipline([], BIOFEEDBACK)).toBe(false);
  });
});

describe('withoutDiscipline', () => {
  it('removes a legacy name-keyed pick', () => {
    expect(withoutDiscipline(['Biofeedback', 'id-insinuation'], BIOFEEDBACK))
      .toEqual(['id-insinuation']);
  });

  it('removes an id-keyed pick and leaves the rest untouched', () => {
    expect(withoutDiscipline(['biofeedback', 'Sharpened Mind'], BIOFEEDBACK))
      .toEqual(['Sharpened Mind']);
  });

  it('leaves unrecognised entries alone', () => {
    expect(withoutDiscipline(['swift-precognition'], BIOFEEDBACK))
      .toEqual(['swift-precognition']);
  });
});

describe('getDisciplineCount', () => {
  // UA 2025 Psion v2 features table: 2 at level 2, +1 at 5/10/13/17.
  it.each([
    [1, 0], [2, 2], [4, 2], [5, 3], [9, 3], [10, 4],
    [12, 4], [13, 5], [16, 5], [17, 6], [20, 6],
  ])('level %i → %i disciplines', (level, count) => {
    expect(getDisciplineCount(level)).toBe(count);
  });
});
