import { forgetClassSpell, isSpellSources, learnClassSpell, type SpellSource, type SpellSources } from './spellSources';
import { setSpellSourcePrepared, type SpellPreparationSources } from './spellPreparation';

interface ClassSpellSelection {
  known: readonly string[]; prepared: readonly string[];
  sources: SpellSources; preparationSources: SpellPreparationSources;
  id: string; className: string;
}
type SelectionResult = { ok: true; known: string[]; sources: SpellSources;
  prepared: string[]; preparationSources: SpellPreparationSources } | { ok: false; reason: string };

/** v2.787 — Ownership and readiness must be one proposed change. Never save a
 * learned/removed copy before discovering ambiguous preparation blocks it. */
export function addClassSpellSelection(input: ClassSpellSelection & { autoPrepare: boolean }): SelectionResult {
  if (!isSpellSources(input.preparationSources)) return { ok: false, reason: 'Spell preparation sources could not be read.' };
  const learned = learnClassSpell(input.known, input.sources, input.id, input.className);
  if (!learned.ok) return learned;
  if (!input.autoPrepare) return { ...learned, prepared: [...input.prepared], preparationSources: { ...input.preparationSources } };
  const readiness = setSpellSourcePrepared({ ...input, sources: learned.sources, source: `class:${input.className}` as SpellSource, ready: true });
  return readiness.ok ? { ...learned, ...readiness } : readiness;
}

export function removeClassSpellSelection(input: ClassSpellSelection): SelectionResult {
  const forgotten = forgetClassSpell(input.known, input.sources, input.id, input.className);
  if (!forgotten.ok) return forgotten;
  const readiness = setSpellSourcePrepared({ ...input, sources: forgotten.sources, source: `class:${input.className}` as SpellSource, ready: false });
  return readiness.ok ? { ...forgotten, ...readiness } : readiness;
}
