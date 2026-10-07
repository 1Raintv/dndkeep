import { describe, expect, it } from 'vitest';
import { reviewSpellPreparation, setSpellSourcePrepared, isSpellPreparedThrough } from './spellPreparation';
import type { SpellSources } from './spellSources';

const both: SpellSources = { armor: ['class:Psion', 'class:Wizard'] };
const wizard: SpellSources = { armor: ['class:Wizard'] };
const base = { id: 'armor', source: 'class:Psion' as const, ready: true, sources: both, prepared: [], preparationSources: {} };

describe('independent spell preparation', () => {
  it('does not transfer Psion readiness to an initially unprepared Wizard copy', () => {
    const learned = setSpellSourcePrepared(base);
    expect(learned.ok).toBe(true); if (!learned.ok) return;
    expect(learned.preparationSources.armor).toEqual(['class:Psion']);
    const removed = setSpellSourcePrepared({ ...base, ...learned, sources: wizard, ready: false });
    expect(removed).toMatchObject({ ok: true, prepared: [], preparationSources: { armor: [] } });
  });
  it('preserves a separately prepared Wizard copy when Psion is removed', () => {
    const result = setSpellSourcePrepared({ ...base, sources: wizard, ready: false, prepared: ['armor', 'shield'], preparationSources: { armor: ['class:Psion', 'class:Wizard'] } });
    expect(result).toMatchObject({ ok: true, prepared: ['armor', 'shield'], preparationSources: { armor: ['class:Wizard'] } });
  });
  it('preparing one copy preserves another ready copy', () => {
    expect(setSpellSourcePrepared({ ...base, prepared: ['armor'], preparationSources: { armor: ['class:Wizard'] } })).toMatchObject({ ok: true, preparationSources: { armor: ['class:Wizard', 'class:Psion'] } });
  });
  it.each([true, false])('requires review of ambiguous legacy readiness when setting ready=%s', ready => {
    expect(setSpellSourcePrepared({ ...base, ready, prepared: ['armor'] }).ok).toBe(false);
  });
  it('permits clearing the final copy without guessing another source', () => {
    expect(setSpellSourcePrepared({ ...base, ready: false, sources: {}, prepared: ['armor'] })).toMatchObject({ ok: true, prepared: [], preparationSources: { armor: [] } });
  });
  it('rejects preparation through a source that does not own the spell', () => {
    expect(setSpellSourcePrepared({ ...base, sources: wizard }).ok).toBe(false);
  });
  it('explicit empty readiness is reviewed rather than unknown', () => {
    expect(setSpellSourcePrepared({ ...base, prepared: ['armor'], preparationSources: { armor: [] } })).toMatchObject({ ok: true, preparationSources: { armor: ['class:Psion'] } });
  });
  it('review records only independently owned sources and preserves unrelated spells', () => {
    const result = reviewSpellPreparation({ id: 'armor', readySources: ['class:Wizard', 'class:Wizard'], sources: both, prepared: ['shield'], preparationSources: { shield: ['class:Wizard'] } });
    expect(result).toEqual({ ok: true, prepared: ['shield', 'armor'], preparationSources: { shield: ['class:Wizard'], armor: ['class:Wizard'] } });
    expect(reviewSpellPreparation({ id: 'armor', readySources: ['feat'], sources: both, prepared: [], preparationSources: {} }).ok).toBe(false);
  });
  it('review can explicitly mark every copy unprepared', () => {
    expect(reviewSpellPreparation({ id: 'armor', readySources: [], sources: both, prepared: ['armor', 'shield'], preparationSources: {} })).toMatchObject({ ok: true, prepared: ['shield'], preparationSources: { armor: [] } });
  });
  it('rejects malformed persisted data without changing the input', () => {
    const malformed = { armor: null } as unknown as SpellSources;
    expect(setSpellSourcePrepared({ ...base, preparationSources: malformed }).ok).toBe(false);
    expect(malformed).toEqual({ armor: null });
  });
  it('does not mutate owned or prepared inputs', () => {
    const prepared = Object.freeze(['armor']);
    const preparationSources = Object.freeze({ armor: Object.freeze(['class:Wizard'] as const) });
    setSpellSourcePrepared({ ...base, prepared, preparationSources });
    expect(prepared).toEqual(['armor']);
    expect(preparationSources.armor).toEqual(['class:Wizard']);
  });
});

it('reads reviewed readiness without inferring or mutating legacy ownership',()=>{
 const input={id:'armor',source:'class:Psion' as const,prepared:['armor'],sources:both,preparationSources:{}};
 expect(isSpellPreparedThrough(input)).toBe(true);
 expect(isSpellPreparedThrough({...input,preparationSources:{armor:[]}})).toBe(false);
 expect(isSpellPreparedThrough({...input,preparationSources:{armor:['class:Wizard']}})).toBe(false);
 expect(isSpellPreparedThrough({...input,preparationSources:{armor:['class:Psion']}})).toBe(true);
 expect(isSpellPreparedThrough({...input,sources:wizard})).toBe(false);
 expect(input.preparationSources).toEqual({});
});
