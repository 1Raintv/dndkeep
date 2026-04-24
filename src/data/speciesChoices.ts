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

/** v2.191.0 — Phase Q.0 pt 32: convert a spell display name to the
    canonical kebab-case id used in src/data/spells.ts. We do this
    rather than storing ids in the legacy table because the legacy
    table is human-edited (DM facing), while ids are an implementation
    detail. Mismatches between species data and the spell catalogue
    surface as a missing-spell warning rather than a silent grant
    failure (caller can console.warn when lookup fails).

    The mapping rule is: lowercase, replace spaces with hyphens,
    strip apostrophes/quotes. Same convention as bestiary monster ids. */
function spellNameToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** v2.191.0 — top-level resolver: given a character's species,
    species_choices, and level, return the spell ids that should be
    auto-granted from species traits. Called by the spell-grant effect
    in CharacterSheet/index.tsx alongside subclass + class grants.

    Today only Tiefling has a per-level spell-grant trait; future
    species (Aasimar, Dragonborn ancestry-tied cantrips, Genasi
    elemental cantrips) plug in here as additional branches. */
export function getSpeciesGrantedSpellIds(
  species: string | undefined,
  speciesChoices: Record<string, string> | undefined,
  characterLevel: number,
): string[] {
  if (!species) return [];
  const ids: string[] = [];

  if (species === 'Tiefling') {
    const legacyId = speciesChoices?.tieflingLegacy;
    const legacy = getTieflingLegacy(legacyId);
    if (legacy) {
      for (const grant of legacy.spells) {
        if (characterLevel >= grant.unlockLevel) {
          ids.push(spellNameToId(grant.spellName));
        }
      }
    }
  }

  return ids;
}

/** v2.201.0 — Phase Q.0 pt 41: feature_uses key for tracking once-per-LR
    legacy spell casts. RAW (2024 PHB) Tiefling: each legacy spell at L3+
    can be cast once per long rest WITHOUT a spell slot, OR with a slot
    like a normal spell. The free path increments this key; doLongRest
    wipes feature_uses so the free cast auto-refreshes.

    Key shape `legacy:<spell-id>` namespaces under "legacy:" so it
    won't collide with class feature_uses entries (e.g. "Action Surge")
    which are keyed by ability name. */
export function legacySpellFeatureKey(spellName: string): string {
  const id = spellName
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `legacy:${id}`;
}

/** v2.191.0 — full set of spell ids that COULD be granted across
    every legacy/choice for a species, regardless of which one the
    player picked. Used by the spell-grant effect to detect stale
    auto-grants — e.g. if a Tiefling switches from Infernal to
    Abyssal, we need to know to strip Fire Bolt / Hellish Rebuke /
    Darkness so they don't linger in known_spells.

    Returns ALL possible species-granted spell ids for the species,
    not gated by level or current choice. */
export function getAllPossibleSpeciesSpellIds(species: string | undefined): string[] {
  if (!species) return [];
  const ids: string[] = [];
  if (species === 'Tiefling') {
    for (const legacy of TIEFLING_LEGACIES) {
      for (const grant of legacy.spells) {
        ids.push(spellNameToId(grant.spellName));
      }
    }
  }
  return ids;
}
