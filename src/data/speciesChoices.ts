/**
 * v2.188.0 — Phase Q.0 pt 29: per-species sub-choice catalogues.
 *
 * Houses the structured spell-grant tables for species traits that
 * unlock spells at specific levels (Tiefling Fiendish Legacy is the
 * only one today). The data shape is reusable for future species:
 * Aasimar Celestial Revelation, Dragonborn breath weapon ancestry,
 * Genasi element, etc.
 *
 * The Actions tab's SPECIES section reads from these maps to render
 * cast buttons gated by character level. Selection is persisted on
 * `characters.species_choices` jsonb (added in the v2.188 migration).
 */

export type TieflingLegacy = 'abyssal' | 'chthonic' | 'infernal';

export interface LegacySpellGrant {
  /** Display name of the spell. Must match the canonical name in
      src/data/spells.ts so the spell-cast pipeline can resolve it. */
  spellName: string;
  /** Character level at which this spell becomes available. RAW is
      always 1/3/5: cantrip → 2nd-level → 3rd-level. */
  unlockLevel: 1 | 3 | 5;
}

export interface TieflingLegacyDef {
  id: TieflingLegacy;
  /** Display name shown on the Species section header / picker pill. */
  name: string;
  /** One-line flavor description shown under the legacy name. */
  flavor: string;
  /** Three spell grants in 1/3/5 order. */
  spells: LegacySpellGrant[];
}

export const TIEFLING_LEGACIES: TieflingLegacyDef[] = [
  {
    id: 'abyssal',
    name: 'Abyssal',
    flavor: 'Heritage of chaotic demons. Sickness and domination.',
    spells: [
      { spellName: 'Poison Spray',     unlockLevel: 1 },
      { spellName: 'Ray of Sickness',  unlockLevel: 3 },
      { spellName: 'Hold Person',      unlockLevel: 5 },
    ],
  },
  {
    id: 'chthonic',
    name: 'Chthonic',
    flavor: 'Heritage of underworld powers. Death magic and resilience.',
    spells: [
      { spellName: 'Chill Touch',          unlockLevel: 1 },
      { spellName: 'False Life',           unlockLevel: 3 },
      { spellName: 'Ray of Enfeeblement',  unlockLevel: 5 },
    ],
  },
  {
    id: 'infernal',
    name: 'Infernal',
    flavor: 'Heritage of lawful devils. Fire and pact magic.',
    spells: [
      { spellName: 'Fire Bolt',       unlockLevel: 1 },
      { spellName: 'Hellish Rebuke',  unlockLevel: 3 },
      { spellName: 'Darkness',        unlockLevel: 5 },
    ],
  },
];

/** Lookup by id; undefined if no legacy chosen. */
export function getTieflingLegacy(id: string | undefined): TieflingLegacyDef | undefined {
  if (!id) return undefined;
  return TIEFLING_LEGACIES.find(l => l.id === id);
}

/** All spells available to the character right now given their level
    + chosen legacy. Returns empty array if legacy not chosen.
    Used by the Actions-tab SPECIES section to render cast buttons. */
export function getActiveLegacySpells(
  legacy: TieflingLegacyDef | undefined,
  characterLevel: number,
): LegacySpellGrant[] {
  if (!legacy) return [];
  return legacy.spells.filter(s => characterLevel >= s.unlockLevel);
}
