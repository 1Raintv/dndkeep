import { describe, expect, it } from 'vitest';
import { applySrdSpellDetails, SRD_SPELL_DETAILS } from './srdSpellDetails';
import { SPELL_MAP } from './spells';
import { parseSpellMechanics } from '../lib/spellParser';

describe('audited SRD 5.2.1 spell details', () => {
  it('covers exactly the reviewed batch with traceable sources', () => {
    expect(Object.keys(SRD_SPELL_DETAILS)).toHaveLength(15);
    for (const [id, entry] of Object.entries(SRD_SPELL_DETAILS)) {
      expect(SPELL_MAP[id].description).toBe(entry.description);
      expect(entry.rules_source?.page).toBeGreaterThanOrEqual(107);
      expect(entry.rules_source?.page).toBeLessThanOrEqual(175);
      expect(entry.description).not.toMatch(/\uFFFD|[a-z]-\n[a-z]/);
    }
  });
  it('upgrades stale canonical DB text but preserves personal and gated records', () => {
    const stale = { ...SPELL_MAP.sleep, description: 'Legacy HP pool', higher_levels: 'Roll more d8s' };
    const upgraded = applySrdSpellDetails(stale, true);
    expect(upgraded.description).toContain('fails the second save');
    expect(upgraded.higher_levels).toBeUndefined();
    expect(applySrdSpellDetails(stale, false)).toBe(stale);
    for (const source of ['ua', 'non-srd', 'expansion'] as const) {
      const privateSpell = { ...stale, source };
      expect(applySrdSpellDetails(privateSpell, true)).toBe(privateSpell);
    }
    const renamed = { ...stale, name: 'My Sleep' };
    expect(applySrdSpellDetails(renamed, true)).toBe(renamed);
    expect(applySrdSpellDetails(SPELL_MAP.fireball, true)).toBe(SPELL_MAP.fireball);
  });
  it('retains subtle targeting, termination, and action restrictions', () => {
    expect(SPELL_MAP.sleep.description).toContain('Immunity to the Exhaustion condition');
    expect(SPELL_MAP.sleep.description).toContain('someone within 5 feet');
    expect(SPELL_MAP.suggestion.description).toContain('no more than 25 words');
    expect(SPELL_MAP.suggestion.description).toContain('you or your allies deal damage');
    expect(SPELL_MAP.invisibility.description).toContain('deals damage, or casts a spell');
    expect(SPELL_MAP.haste.description).toContain('Attack (one attack only)');
    expect(SPELL_MAP.haste.description).toContain('Incapacitated');
    expect(SPELL_MAP['mage-hand'].description).toContain('carry more than 10 pounds');
    expect(SPELL_MAP.polymorph.description).toContain('creature type, Hit Points, and Hit Point Dice');
    expect(SPELL_MAP.polymorph.description).toContain('no Temporary Hit Points left');
    expect(SPELL_MAP.shield.casting_time).toContain('targeted by the Magic Missile spell');
    expect(SPELL_MAP.counterspell.description).toContain('slot isn’t expended');
    expect(SPELL_MAP.guidance.description).toContain('choose a skill');
    expect(SPELL_MAP.bless.components).toContain('worth 5+ GP');
  });
  it('keeps cast metadata consistent with the corrected edition', () => {
    expect(SPELL_MAP.jump.casting_time).toBe('1 bonus action');
    expect(SPELL_MAP.jump.description).toContain('spending 10 feet of movement');
    expect(SPELL_MAP['false-life'].heal_dice).toBe('2d4 + 4');
    expect(SPELL_MAP['false-life'].heal_at_slot_level?.['9']).toBe('2d4 + 44');
    expect(SPELL_MAP['false-life'].duration).toBe('Instantaneous');
    expect(SPELL_MAP.sleep.concentration).toBe(true);
    expect(SPELL_MAP.sleep.range).toBe('60 feet');
    expect(SPELL_MAP.sleep.area_of_effect).toEqual({ type: 'sphere', size: 5 });
    expect(parseSpellMechanics(SPELL_MAP.sleep.description, SPELL_MAP.sleep)).toMatchObject({ saveType: 'WIS', damageDice: null });
    expect(parseSpellMechanics(SPELL_MAP.counterspell.description, SPELL_MAP.counterspell).saveType).toBe('CON');
  });
});
