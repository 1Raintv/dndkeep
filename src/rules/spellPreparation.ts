import { isSpellSources, type SpellSource, type SpellSources } from './spellSources';

/** Missing entries mean legacy readiness is unknown. An explicit empty entry
 * means no source has this spell prepared. This differs from learned sources,
 * where an empty entry is itself unknown ownership. */
export type SpellPreparationSources = Record<string, readonly SpellSource[]>;
interface PreparationInput {
  id: string;
  source: SpellSource;
  ready: boolean;
  /** Ownership after the proposed learning/removal operation. */
  sources: SpellSources;
  prepared: readonly string[];
  preparationSources: SpellPreparationSources;
}
type PreparationResult =
  | { ok: true; prepared: string[]; preparationSources: SpellPreparationSources }
  | { ok: false; reason: string };

/** v2.787 — Global preparation is the union of independently prepared copies.
 * A Psion choice cannot prepare a Wizard copy as a side effect, nor remove an
 * independently prepared copy. Unknown legacy readiness needs explicit review
 * before an operation that could change another source's readiness. */
export function setSpellSourcePrepared(input: PreparationInput): PreparationResult {
  const { id, source, ready, sources, prepared, preparationSources } = input;
  if (!isSpellSources(sources) || !isSpellSources(preparationSources) || !isSpellSources({ [id]: [source] }))
    return { ok: false, reason: 'Spell preparation sources could not be read.' };
  const owners = sources[id] ?? [];
  if (ready && !owners.includes(source))
    return { ok: false, reason: 'Confirm this spell was learned through the selected source.' };
  const reviewed = Object.prototype.hasOwnProperty.call(preparationSources, id);
  if (!reviewed && prepared.includes(id) && owners.some(owner => owner !== source))
    return { ok: false, reason: 'Review which sources have this spell prepared before changing it.' };
  // An unprepared global spell has no prepared copy, even on a legacy record.
  // If the sole remaining owner is the edited source, no other readiness is lost.
  const previous = reviewed ? preparationSources[id] : [];
  const remaining = previous.filter(owner => owner !== source && owners.includes(owner));
  const next = [...new Set([...remaining, ...(ready ? [source] : [])])];
  const nextPrepared = new Set(prepared);
  if (next.length) nextPrepared.add(id); else nextPrepared.delete(id);
  return { ok: true, prepared: [...nextPrepared], preparationSources: { ...preparationSources, [id]: next } };
}

/** A source review is an explicit claim, never a guess from a class spell list.
 * Replace only the reviewed spell's readiness; keep unrelated legacy entries. */
export function reviewSpellPreparation(input: {
  id: string; readySources: readonly SpellSource[]; sources: SpellSources;
  prepared: readonly string[]; preparationSources: SpellPreparationSources;
}): PreparationResult {
  if (!isSpellSources(input.sources) || !isSpellSources(input.preparationSources)
      || !isSpellSources({ [input.id]: input.readySources }))
    return { ok: false, reason: 'Spell preparation sources could not be read.' };
  if (input.readySources.some(source => !input.sources[input.id]?.includes(source)))
    return { ok: false, reason: 'A prepared source must also own this spell.' };
  const readySources = [...new Set(input.readySources)];
  const prepared = new Set(input.prepared);
  if (readySources.length) prepared.add(input.id); else prepared.delete(input.id);
  return { ok: true, prepared: [...prepared], preparationSources: { ...input.preparationSources, [input.id]: readySources } };
}
