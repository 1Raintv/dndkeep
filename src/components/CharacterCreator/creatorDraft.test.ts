import { beforeEach, describe, expect, it } from 'vitest';
import { clearCreatorDraft, emptyCreatorDraft, readCreatorDraft, writeCreatorDraft } from './creatorDraft';

const entries = new Map<string, string>();
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value); },
  removeItem: (key: string) => { entries.delete(key); },
};
beforeEach(() => entries.clear());
describe('creator draft recovery', () => {
  it('round-trips a late-step build including choices and wizard position', () => {
    const draft = emptyCreatorDraft();
    Object.assign(draft, { name: 'Mira', className: 'Wizard', level: 5, currentBuildLevel: 4, step: 4 });
    draft.buildChoices.spells = ['shield'];
    draft.buildChoices.asiChoices = { 4: { ability: 'intelligence', amount: 2 } };
    expect(writeCreatorDraft(storage, 'alice', draft)).toBe(true);
    expect(readCreatorDraft(storage, 'alice')).toEqual(draft);
    expect(readCreatorDraft(storage, 'bob')).toBeNull();
    expect(clearCreatorDraft(storage, 'alice')).toBe(true);
    expect(readCreatorDraft(storage, 'alice')).toBeNull();
  });

  it.each(['{broken', '{"version":2,"draft":{}}', '{"version":1,"draft":{"name":"x"}}'])('ignores incompatible storage: %s', raw => {
    storage.setItem('dndkeep:creator-draft:v1:alice', raw);
    expect(readCreatorDraft(storage, 'alice')).toBeNull();
  });

  it('rejects malformed nested choices and invalid wizard position', () => {
    const draft = emptyCreatorDraft();
    for (const broken of [
      { ...draft, currentBuildLevel: 30 },
      { ...draft, buildChoices: { ...draft.buildChoices, spells: null } },
      { ...draft, buildChoices: { ...draft.buildChoices, asiChoices: { 4: { amount: 'two' } } } },
    ]) {
      storage.setItem('dndkeep:creator-draft:v1:alice', JSON.stringify({ version: 1, draft: broken }));
      expect(readCreatorDraft(storage, 'alice')).toBeNull();
    }
  });

  it('handles blocked storage without crashing creation', () => {
    const blocked = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('blocked'); },
    };
    expect(readCreatorDraft(blocked, 'alice')).toBeNull();
    expect(writeCreatorDraft(blocked, 'alice', emptyCreatorDraft())).toBe(false);
    expect(clearCreatorDraft(blocked, 'alice')).toBe(false);
  });
});
