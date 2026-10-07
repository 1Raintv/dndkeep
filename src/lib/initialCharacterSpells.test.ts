import { describe, expect, it } from 'vitest';
import { buildInitialCharacterSpells } from './initialCharacterSpells';
import { buildRecommendedSetup } from '../data/recommendedLoadouts';

describe('initial character spell selection', () => {
  it('supplies the Psion starter choices only for an empty recommended build', () => {
    const result = buildInitialCharacterSpells('Psion', [], 'recommended');
    expect(result.known_spells).toEqual(['minor-illusion', 'telekinetic-fling', 'charm-person', 'command', 'dissonant-whispers', 'mage-armor', 'mage-hand']);
    expect(result.prepared_spells).toEqual(['charm-person', 'command', 'dissonant-whispers', 'mage-armor']);
    expect(result.pinned_spells).toEqual(result.prepared_spells);
    expect(Object.values(result.spell_sources)).toEqual(result.known_spells.map(() => ['class:Psion']));
  });
  it.each(['recommended', 'blank'] as const)('respects custom and duplicate selections in %s mode', mode => {
    const result = buildInitialCharacterSpells('Psion', ['shield', 'minor-illusion', 'shield'], mode);
    expect(result.known_spells).toEqual(['shield', 'minor-illusion', 'mage-hand']);
    expect(result.prepared_spells).toEqual(mode === 'recommended' ? ['shield'] : []);
    expect(result.spell_sources.shield).toEqual(['class:Psion']);
    expect(result.spell_preparation_sources.shield).toEqual(mode === 'recommended' ? ['class:Psion'] : []);
    expect(result.spell_preparation_sources['mage-hand']).toEqual([]);
  });
  it('keeps an empty blank build empty except the automatic class grant', () => {
    expect(buildInitialCharacterSpells('Psion', [], 'blank')).toEqual({
      spell_preparation_sources: { 'mage-hand': [] },
      known_spells: ['mage-hand'], prepared_spells: [], pinned_spells: [], spell_sources: { 'mage-hand': ['class:Psion'] },
    });
  });
  it('does not fill a deliberately partial selection', () => {
    expect(buildInitialCharacterSpells('Psion', ['minor-illusion'], 'recommended').known_spells).toEqual(['minor-illusion', 'mage-hand']);
  });
  it('preserves other classes recommended setup', () => {
    const expected = buildRecommendedSetup('Wizard', []);
    const result = buildInitialCharacterSpells('Wizard', [], 'recommended');
    expect(result.known_spells).toEqual(expected.addKnown);
    expect(result.prepared_spells).toEqual(expected.prepared);
    expect(result.pinned_spells).toEqual(expected.pinned);
    expect(Object.values(result.spell_sources).every(sources => sources[0] === 'class:Wizard')).toBe(true);
  });
});
