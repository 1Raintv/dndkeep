/**
 * classRegistry.ts
 *
 * The single source of truth for all classes available in the app.
 *
 * Architecture:
 *  Layer 1 — Static core (CLASSES in data/classes.ts)
 *    • 13 official 2024 PHB classes + UA subclasses
 *    • Always available, zero latency, no DB call
 *    • Mutating this file = changing official rules
 *
 *  Layer 2 — Dynamic extension (homebrew_classes Supabase table)
 *    • Fully custom classes created by Pro users
 *    • Each entry is a ClassData-shaped JSONB object
 *    • Merged at runtime in useClassRegistry()
 *    • Public homebrew classes visible to all users
 *
 * Adding a new official class or subclass:
 *    → Edit src/data/classes.ts only. No other files need changing.
 *
 * Adding a homebrew class:
 *    → User fills in the Homebrew Workshop form → saved to homebrew_classes table
 *    → useClassRegistry() merges it automatically on next load
 *
 * Feature spec for a subclass (SubclassFeature):
 *    {
 *      level: number,          // which level the feature unlocks
 *      name: string,           // "Empower Sneak Attack"
 *      description: string,    // full rules text
 *      mechanics?: [{          // optional — drives automation
 *        type: 'resource' | 'bonus' | 'reaction' | 'passive' | 'spell_list',
 *        details: string,      // "1d6 per spell level as Force damage"
 *        dice?: string,        // "Xd6" — X = dynamic based on spell level
 *        ability?: string      // "intelligence"
 *      }]
 *    }
 */

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { CLASSES } from '../data/classes';
import type { ClassData } from '../types';

/** Runtime class entry — official or homebrew */
export interface ClassEntry extends ClassData {
  id?: string;         // only set for homebrew classes
  owner_id?: string;   // only set for homebrew classes
  is_public?: boolean; // only set for homebrew classes
}

let _cache: ClassEntry[] | null = null;

/** Fetch homebrew classes from DB and merge with static official classes */
export async function loadAllClasses(userId?: string): Promise<ClassEntry[]> {
  // Start with the static official classes
  const official: ClassEntry[] = CLASSES.map(c => ({ ...c, source: c.source ?? 'official' as const }));

  try {
    // Fetch user's own homebrew + all public homebrew
    let query = supabase.from('homebrew_classes').select('*');
    if (userId) {
      query = query.or(`user_id.eq.${userId},is_public.eq.true`);
    } else {
      query = query.eq('is_public', true);
    }
    const { data } = await query.order('name');
    if (!data?.length) return official;

    const homebrew: ClassEntry[] = data.map((row: any) => ({
      id: row.id,
      owner_id: row.user_id,
      name: row.name,
      description: row.description,
      hit_die: row.hit_die,
      primary_abilities: row.primary_abilities,
      saving_throw_proficiencies: row.saving_throw_proficiencies,
      skill_choices: row.skill_choices,
      skill_count: row.skill_count,
      armor_proficiencies: row.armor_proficiencies,
      weapon_proficiencies: row.weapon_proficiencies,
      tool_proficiencies: row.tool_proficiencies,
      is_spellcaster: row.is_spellcaster,
      spellcasting_ability: row.spellcasting_ability,
      spellcaster_type: row.spellcaster_type,
      subclasses: row.subclasses ?? [],
      source: 'homebrew' as const,
      is_public: row.is_public,
    }));

    return [...official, ...homebrew];
  } catch {
    return official;
  }
}

/** React hook — returns merged class list, loading state, and a refresh fn */
export function useClassRegistry(userId?: string) {
  const [classes, setClasses] = useState<ClassEntry[]>(CLASSES as ClassEntry[]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    const all = await loadAllClasses(userId);
    _cache = all;
    setClasses(all);
    setLoading(false);
  }

  useEffect(() => {
    if (_cache) { setClasses(_cache); return; }
    refresh();
  }, [userId]);

  return { classes, loading, refresh };
}

/** Lookup a single class by name across official + homebrew */
export function findClass(name: string, allClasses: ClassEntry[]): ClassEntry | undefined {
  return allClasses.find(c => c.name.toLowerCase() === name.toLowerCase());
}
