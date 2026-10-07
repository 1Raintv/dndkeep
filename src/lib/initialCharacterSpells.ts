import { buildRecommendedSetup } from '../data/recommendedLoadouts';
import type { SpellSource, SpellSources } from '../rules/spellSources';

/** v2.787 — Starter suggestions must not expand a player's custom selection.
 * Decide whether to backfill BEFORE adding automatic Mage Hand; that grant
 * neither counts as a deliberate choice nor suppresses an empty-build starter. */
export function buildInitialCharacterSpells(className: string, selected: readonly string[], mode: 'recommended' | 'blank') {
  const chosen = [...new Set(selected)];
  const suggested = mode === 'recommended' ? buildRecommendedSetup(className, chosen).addKnown : [];
  const known = [...new Set([...chosen, ...suggested, ...(className === 'Psion' ? ['mage-hand'] : [])])];
  const setup: { prepared: string[]; pinned: string[] } = mode === 'recommended' ? buildRecommendedSetup(className, known) : { prepared: [], pinned: [] };
  // These choices were made through this class's creator, so their origin is
  // known. Legacy character spell lists deliberately receive no such inference.
  const owner: SpellSource = `class:${className}`;
  const sources: SpellSources = Object.fromEntries(known.map(id => [id, [owner]]));
  if(className==='Psion')sources['mage-hand']=['grant:class:Psion'];
  const preparationSources: SpellSources = Object.fromEntries(known.map(id => [id, setup.prepared.includes(id) ? [owner] : []]));
  return { spell_preparation_sources: preparationSources, known_spells: known, prepared_spells: setup.prepared, pinned_spells: setup.pinned, spell_sources: sources };
}
