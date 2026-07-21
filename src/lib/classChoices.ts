// v2.622.0 — General pick-one class-choice registry + persistence.
// Backing store: characters.class_choices jsonb (keyed map of
// choiceKey → optionValue). First consumer: Druid L7 Elemental Fury.
// All rules text sourced from SRD 5.2.1 (CC-BY-4.0) — nothing invented.

import { supabase } from './supabase';
import type { Character } from '../types';

export interface ClassChoiceOption {
  value: string;
  label: string;
  /** Short RAW summary shown on the option button's tooltip. */
  rulesText: string;
}

export interface ClassChoiceDef {
  /** Storage key inside characters.class_choices. */
  key: string;
  /** Class this choice belongs to (matches character.class_name). */
  className: string;
  /** Level at which the choice is made. */
  minLevel: number;
  /** Feature name as it appears in classFeatures.ts — used by
   *  FeaturesPanel to attach the picker to the right feature card. */
  featureName: string;
  options: ClassChoiceOption[];
}

export const CLASS_CHOICES: ClassChoiceDef[] = [
  {
    key: 'druid_elemental_fury',
    className: 'Druid',
    minLevel: 7,
    featureName: 'Elemental Fury',
    options: [
      {
        value: 'potent_spellcasting',
        label: 'Potent Spellcasting',
        rulesText: 'Add your Wisdom modifier to the damage you deal with any Druid cantrip. (L15 Improved: cantrips with a range of 10+ feet gain +300 ft range.)',
      },
      {
        value: 'primal_strike',
        label: 'Primal Strike',
        rulesText: 'Once on each of your turns when you hit a creature with an attack roll using a weapon or a Beast form\u2019s attack, you can cause the target to take an extra 1d8 Cold, Fire, Lightning, or Thunder damage (your choice). (L15 Improved: 2d8.)',
      },
    ],
  },
];

/** Choice defs applicable to this character (class + level gates met). */
export function choicesForCharacter(c: Pick<Character, 'class_name' | 'level'>): ClassChoiceDef[] {
  return CLASS_CHOICES.filter(d => d.className === c.class_name && c.level >= d.minLevel);
}

/** Def attached to a specific feature card, or null. */
export function choiceDefForFeature(
  c: Pick<Character, 'class_name' | 'level'>,
  featureName: string,
): ClassChoiceDef | null {
  return choicesForCharacter(c).find(d => d.featureName === featureName) ?? null;
}

/** Current selection for a key ('' = unchosen). */
export function getClassChoice(
  c: Pick<Character, 'class_choices'>,
  key: string,
): string {
  const map = (c.class_choices ?? {}) as Record<string, string>;
  return typeof map[key] === 'string' ? map[key] : '';
}

/** Persist a selection. Read-merge-write on the jsonb map, scoped
 *  UPDATE + SELECT confirm (house Supabase convention). Returns the
 *  confirmed map or null on failure. */
export async function setClassChoice(
  characterId: string,
  key: string,
  value: string,
): Promise<Record<string, string> | null> {
  try {
    const { data: row, error: readErr } = await (supabase as any)
      .from('characters')
      .select('class_choices')
      .eq('id', characterId)
      .single();
    if (readErr) return null;
    const next = { ...((row?.class_choices ?? {}) as Record<string, string>), [key]: value };
    const { error: writeErr } = await (supabase as any)
      .from('characters')
      .update({ class_choices: next })
      .eq('id', characterId);
    if (writeErr) return null;
    const { data: confirm } = await (supabase as any)
      .from('characters')
      .select('class_choices')
      .eq('id', characterId)
      .single();
    return (confirm?.class_choices ?? null) as Record<string, string> | null;
  } catch {
    return null;
  }
}
