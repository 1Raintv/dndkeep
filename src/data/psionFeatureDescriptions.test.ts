import { describe, expect, it } from 'vitest';
import { CLASS_COMBAT_ABILITIES } from './classAbilities';
import { CLASS_MAP } from './classes';
import { CLASS_FEATURES } from './classFeatures';
import { CLASS_LEVEL_PROGRESSION } from './levelProgression';
import { TELEKINETIC_PROPEL_TEXT, TELEKINETIC_PROPEL_SUMMARY, WARP_PROPEL_TEXT, WARP_PROPEL_SUMMARY } from './psionFeatureDescriptions';

describe('Psion Propel reference consistency', () => {
  it('keeps all Warp Propel references tied to the supplied complete rule', () => {
    const action = CLASS_COMBAT_ABILITIES.Psion.find(a => a.name === 'Warp Propel')!;
    const feature = CLASS_MAP.Psion.subclasses.find(s => s.name === 'Psi Warper')!.features!.find(f => f.name === 'Warp Propel')!;
    expect(action.description).toBe(WARP_PROPEL_SUMMARY);
    expect(action.descriptionLong).toContain(WARP_PROPEL_TEXT);
    expect(action.descriptionLong).toContain(TELEKINETIC_PROPEL_TEXT);
    expect(feature.description).toBe(WARP_PROPEL_TEXT);
    for (const text of [WARP_PROPEL_TEXT, WARP_PROPEL_SUMMARY]) {
      expect(text).toContain('unoccupied space you can see');
      expect(text).toMatch(/within 30 (feet|ft) of you/);
      expect(text).toContain('horizontal to you');
      expect(text).not.toMatch(/prone|where it was|Mass Teleportation/);
    }
    expect(action.descriptionLong).not.toMatch(/prone|where it was|Mass Teleportation/);
    expect(action.minLevel).toBe(3);
  });
  it('preserves targeting, straight movement, roll timing and conditional cost', () => {
    expect(TELEKINETIC_PROPEL_TEXT).toContain('Large or smaller creature other than you');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('you can see within 30 feet of yourself');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('Strength saving throw');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('straight toward you or straight away from you');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('when you take this Bonus Action');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('5 times the number rolled');
    expect(TELEKINETIC_PROPEL_TEXT).toContain('only if the target fails');
    const action = CLASS_COMBAT_ABILITIES.Psion.find(a => a.name === 'Telekinetic Propel')!;
    expect(action.description).toBe(TELEKINETIC_PROPEL_SUMMARY);
    expect(action.descriptionLong).toContain(TELEKINETIC_PROPEL_TEXT);
    expect(CLASS_FEATURES.Psion.find(f => f.name === 'Psionic Power')!.description).toContain(TELEKINETIC_PROPEL_TEXT);
    expect(CLASS_LEVEL_PROGRESSION.Psion[0].features).toContain(`Telekinetic Propel: ${TELEKINETIC_PROPEL_SUMMARY}`);
  });
});
