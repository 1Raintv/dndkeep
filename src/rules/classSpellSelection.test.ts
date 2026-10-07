import { describe, expect, it } from 'vitest';
import { addClassSpellSelection, removeClassSpellSelection } from './classSpellSelection';
import type { SpellSources } from './spellSources';
const input = { known: ['armor'], prepared: [] as string[], sources: { armor: ['class:Wizard'] } as SpellSources,
  preparationSources: {} as SpellSources, id: 'armor', className: 'Psion', autoPrepare: true };

describe('class spell selection transaction', () => {
  it.each([false,true])('restores Wizard readiness=%s after adding then removing Psion', wizardReady => {
    const before = { ...input, prepared: wizardReady ? ['armor'] : [], preparationSources: { armor: wizardReady ? ['class:Wizard'] : [] } as SpellSources };
    const added = addClassSpellSelection(before);
    expect(added.ok).toBe(true); if (!added.ok) return;
    expect(added.known).toEqual(['armor']);
    expect(added.prepared).toEqual(['armor']);
    const removed = removeClassSpellSelection({ ...input, ...added });
    expect(removed).toMatchObject({ ok: true, known: ['armor'], sources: input.sources, prepared: before.prepared, preparationSources: before.preparationSources });
  });
  it('blocks ambiguous preparation before making any ownership change', () => {
    const before = { ...input, prepared: ['armor'] };
    expect(addClassSpellSelection(before).ok).toBe(false);
    expect(before.sources).toEqual({ armor: ['class:Wizard'] });
  });
  it('does not automatically prepare a cantrip or ordinary spellbook entry', () => {
    const result = addClassSpellSelection({ ...input, autoPrepare: false });
    expect(result).toMatchObject({ ok: true, known: ['armor'], prepared: [], preparationSources: {} });
  });
  it('rejects malformed preparation even when adding a nonprepared choice', () => {
    expect(addClassSpellSelection({ ...input, autoPrepare: false, preparationSources: { armor: null } as unknown as SpellSources }).ok).toBe(false);
  });
  it('removes the last copy and its readiness together', () => {
    expect(removeClassSpellSelection({ ...input, sources: { armor: ['class:Psion'] }, prepared: ['armor'], preparationSources: { armor: ['class:Psion'] } })).toMatchObject({ ok: true, known: [], prepared: [], sources: {}, preparationSources: { armor: [] } });
  });
  it('preserves prepared feature copies', () => {
    expect(removeClassSpellSelection({ ...input, sources: { armor: ['class:Psion','feat'] }, prepared: ['armor'], preparationSources: { armor: ['class:Psion','feat'] } })).toMatchObject({ ok: true, known: ['armor'], prepared: ['armor'], sources: { armor: ['feat'] }, preparationSources: { armor: ['feat'] } });
  });
});
