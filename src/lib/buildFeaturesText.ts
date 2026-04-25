import { CLASS_MAP } from '../data/classes';
import { SPECIES_MAP } from '../data/species';
import { BACKGROUND_MAP } from '../data/backgrounds';

/**
 * Builds a human-readable starting text for the features_and_traits field
 * based on the character's class, species, and background at level 1.
 * This text is editable — it's a starting point, not locked data.
 */
export function buildFeaturesText(
  className: string,
  speciesName: string,
  backgroundName: string,
  subclass: string | null
): string {
  const lines: string[] = [];

  // --- Class features at level 1 ---
  const cls = CLASS_MAP[className];
  if (cls) {
    lines.push(`=== ${cls.name} Features ===`);
    lines.push(`Hit Die: d${cls.hit_die}`);
    lines.push(`Saving Throw Proficiencies: ${cls.saving_throw_proficiencies.map(a => a.toUpperCase().slice(0, 3)).join(', ')}`);
    lines.push(`Armor Proficiencies: ${cls.armor_proficiencies.join(', ') || 'None'}`);
    lines.push(`Weapon Proficiencies: ${cls.weapon_proficiencies.join(', ')}`);
    if (cls.tool_proficiencies.length > 0) {
      lines.push(`Tool Proficiencies: ${cls.tool_proficiencies.join(', ')}`);
    }
    if (cls.is_spellcaster && cls.spellcasting_ability) {
      lines.push(`Spellcasting Ability: ${cls.spellcasting_ability.charAt(0).toUpperCase() + cls.spellcasting_ability.slice(1)}`);
    }

    // Level-1 class-specific feature notes
    const classNotes = LEVEL_1_FEATURES[cls.name];
    if (classNotes) {
      lines.push('');
      lines.push(classNotes);
    }

    if (subclass) {
      lines.push('');
      lines.push(`Subclass: ${subclass}`);
      const sc = cls.subclasses.find(s => s.name === subclass);
      if (sc) lines.push(sc.description);
    }
    lines.push('');
  }

  // --- Species traits ---
  const sp = SPECIES_MAP[speciesName];
  if (sp) {
    lines.push(`=== ${sp.name} Traits ===`);
    lines.push(`Size: ${sp.size}  Speed: ${sp.speed} ft.`);
    // v2.243.1 — DO NOT emit a separate `Darkvision: X ft.` line here. Every
    // species in species.ts that has darkvision > 0 also has an explicit
    // `Darkvision` entry in `sp.traits` with the full RAW description, so
    // emitting both produced duplicate Darkvision rows on the Features tab
    // (e.g. Tiefling). The trait iteration below covers it.
    sp.traits.forEach(t => {
      lines.push('');
      lines.push(`${t.name}: ${t.description}`);
    });
    lines.push('');
  }

  // --- Background feature ---
  const bg = BACKGROUND_MAP[backgroundName];
  if (bg) {
    lines.push(`=== ${bg.name} — ${bg.feature_name} ===`);
    lines.push(bg.feature_description);
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Brief level-1 feature descriptions by class.
 * Avoids copying full SRD text — enough to remind the player what they have.
 */
const LEVEL_1_FEATURES: Record<string, string> = {
  Barbarian: [
    'Rage (2/Long Rest): Bonus action. Advantage on STR checks/saves, +2 melee damage, resistance to B/P/S damage. Lasts 1 min.',
    'Unarmored Defense: AC = 10 + DEX mod + CON mod (no armor).',
  ].join('\n'),

  Bard: [
    'Bardic Inspiration (CHA mod/Long Rest): Bonus action, grant 1d6 inspiration die to a creature within 60 ft.',
    'Spellcasting: Full caster (CHA). Knows 2 cantrips, 4 spells. 2 first-level slots.',
  ].join('\n'),

  Cleric: [
    'Spellcasting: Full caster (WIS). Prepares WIS mod + level spells from the full Cleric list.',
    'Divine Domain: Chosen at level 1 — grants domain spells and domain features.',
    'Channel Divinity available from level 2.',
  ].join('\n'),

  Druid: [
    'Spellcasting: Full caster (WIS). Prepares WIS mod + level spells from the Druid list.',
    'Druidic: You know Druidic, a secret language.',
    'Wild Shape available from level 2.',
  ].join('\n'),

  Fighter: [
    'Fighting Style: Choose one (e.g. Archery, Defense, Dueling, Great Weapon Fighting).',
    'Second Wind (1/Short or Long Rest): Bonus action. Regain 1d10 + Fighter level HP.',
    'Action Surge available from level 2.',
  ].join('\n'),

  Monk: [
    'Unarmored Defense: AC = 10 + DEX mod + WIS mod (no armor, no shield).',
    'Martial Arts: Use DEX for unarmed strikes. Unarmed damage = 1d4. Bonus action unarmed strike after unarmed/monk weapon attack.',
    'Ki available from level 2.',
  ].join('\n'),

  Paladin: [
    'Divine Sense (1 + CHA mod per Long Rest): Action. Detect celestials, fiends, undead within 60 ft.',
    'Lay on Hands (5 × level HP pool/Long Rest): Touch to restore HP or cure disease/poison (5 HP).',
    'Spellcasting and Divine Smite available from level 2.',
  ].join('\n'),

  Ranger: [
    'Favored Enemy: Choose one enemy type. Advantage on Survival to track, Intelligence to recall info.',
    'Natural Explorer: Choose one terrain. Several exploration bonuses.',
    'Spellcasting available from level 2.',
  ].join('\n'),

  Rogue: [
    'Expertise: Double proficiency bonus for two chosen skills.',
    'Sneak Attack (1d6): Once per turn, deal extra damage when you have advantage OR an ally is adjacent to target.',
    "Thieves' Cant: Secret rogue language and code.",
  ].join('\n'),

  Sorcerer: [
    'Spellcasting: Full caster (CHA). Knows 2 cantrips, 2 spells. 2 first-level slots.',
    'Sorcerous Origin: Grants features at levels 1, 6, 14, 18.',
    'Sorcery Points and Metamagic available from level 2.',
  ].join('\n'),

  Warlock: [
    'Otherworldly Patron: Choose your patron — grants expanded spell list and features.',
    'Pact Magic: Short-rest slots. All slots same level. Eldritch Blast cantrip recommended.',
    'Eldritch Invocations available from level 2.',
  ].join('\n'),

  Wizard: [
    'Spellcasting: Full caster (INT). Spellbook with 6 spells at level 1 (copy more as you find them).',
    'Arcane Recovery (1/Long Rest): Short rest: recover spell slots totalling up to half your Wizard level.',
    'Arcane Tradition (subclass) chosen at level 2.',
  ].join('\n'),
};
