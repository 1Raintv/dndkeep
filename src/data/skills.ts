import type { SkillData } from '../types';

// v2.67.0: requiresSight marks skills that typically need vision. When the
// character is Blinded, these skills auto-fail per 2024 PHB Blinded condition.
// Only the three most clearly-sight-dependent skills are flagged:
//   - Perception: most often "you look at the room" — primarily visual
//   - Investigation: examining clues / searching — almost always visual
//   - Sleight of Hand: legerdemain by feel alone is not realistic
// Other skills (Insight via tone of voice, Stealth via being quiet, etc.) work
// without sight per RAW. Perception via hearing/smell is still possible — the
// DM can override the auto-fail when the check explicitly uses another sense.
export const SKILLS: SkillData[] = [
  { name: 'Acrobatics',      ability: 'dexterity' },
  { name: 'Animal Handling', ability: 'wisdom' },
  { name: 'Arcana',          ability: 'intelligence' },
  { name: 'Athletics',       ability: 'strength' },
  { name: 'Deception',       ability: 'charisma' },
  { name: 'History',         ability: 'intelligence' },
  { name: 'Insight',         ability: 'wisdom' },
  { name: 'Intimidation',    ability: 'charisma' },
  { name: 'Investigation',   ability: 'intelligence', requiresSight: true },
  { name: 'Medicine',        ability: 'wisdom' },
  { name: 'Nature',          ability: 'intelligence' },
  { name: 'Perception',      ability: 'wisdom',       requiresSight: true },
  { name: 'Performance',     ability: 'charisma' },
  { name: 'Persuasion',      ability: 'charisma' },
  { name: 'Religion',        ability: 'intelligence' },
  { name: 'Sleight of Hand', ability: 'dexterity',    requiresSight: true },
  { name: 'Stealth',         ability: 'dexterity' },
  { name: 'Survival',        ability: 'wisdom' },
];

export const SKILL_MAP: Record<string, SkillData> = Object.fromEntries(
  SKILLS.map(s => [s.name, s])
);
