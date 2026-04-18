// src/lib/hooks/useSpells.ts
//
// Single source of truth for spell data at runtime.
// Fetches from public.spells (canonical with owner_id IS NULL +
// the current user's homebrew). Falls back to the static SPELLS
// array for any spell ID not yet present in the DB so the app is
// resilient during the in-progress canonical seed.
//
// The hook caches the fetch at module scope so all consumers share
// one round trip per browser session. Mutations to homebrew should
// call invalidateSpellsCache() to force a refetch.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { SPELLS, SPELL_MAP } from '../../data/spells';
import type { SpellData } from '../../types';

// ─── Module-scope cache (survives unmounts within a session) ────────
let cachedSpells: SpellData[] | null = null;
let pendingFetch: Promise<SpellData[]> | null = null;

interface DbSpellRow {
  id: string;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  description: string;
  higher_levels: string | null;
  save_type: string | null;
  attack_type: 'ranged' | 'melee' | null;
  damage_dice: string | null;
  damage_type: string | null;
  damage_at_slot_level: Record<string, string> | null;
  damage_at_char_level: Record<string, string> | null;
  heal_dice: string | null;
  heal_at_slot_level: Record<string, string> | null;
  area_of_effect: { type: 'sphere'|'cone'|'cube'|'cylinder'|'line'; size: number } | null;
}

function rowToSpell(r: DbSpellRow): SpellData {
  return {
    id: r.id,
    name: r.name,
    level: r.level as SpellData['level'],
    school: r.school as SpellData['school'],
    casting_time: r.casting_time,
    range: r.range,
    components: r.components,
    duration: r.duration,
    concentration: r.concentration,
    ritual: r.ritual,
    classes: r.classes,
    description: r.description,
    ...(r.higher_levels ? { higher_levels: r.higher_levels } : {}),
    ...(r.save_type ? { save_type: r.save_type } : {}),
    ...(r.attack_type ? { attack_type: r.attack_type } : {}),
    ...(r.damage_dice ? { damage_dice: r.damage_dice } : {}),
    ...(r.damage_type ? { damage_type: r.damage_type } : {}),
    ...(r.damage_at_slot_level ? { damage_at_slot_level: r.damage_at_slot_level } : {}),
    ...(r.damage_at_char_level ? { damage_at_char_level: r.damage_at_char_level } : {}),
    ...(r.heal_dice ? { heal_dice: r.heal_dice } : {}),
    ...(r.heal_at_slot_level ? { heal_at_slot_level: r.heal_at_slot_level } : {}),
    ...(r.area_of_effect ? { area_of_effect: r.area_of_effect } : {}),
  };
}

async function fetchSpellsFromDb(): Promise<SpellData[]> {
  // RLS handles the visibility filter automatically — the user gets:
  // canonical (owner_id IS NULL), own homebrew, and public homebrew.
  const { data, error } = await supabase
    .from('spells')
    .select('id, name, level, school, casting_time, range, components, duration, concentration, ritual, classes, description, higher_levels, save_type, attack_type, damage_dice, damage_type, damage_at_slot_level, damage_at_char_level, heal_dice, heal_at_slot_level, area_of_effect')
    .order('level', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.warn('[useSpells] DB fetch failed, falling back to static only:', error.message);
    return [];
  }
  return (data as DbSpellRow[]).map(rowToSpell);
}

// Merge DB spells with static SPELLS, DB wins on ID collision
function mergeWithStatic(dbSpells: SpellData[]): SpellData[] {
  const dbIds = new Set(dbSpells.map(s => s.id));
  const fallbackOnly = SPELLS.filter(s => !dbIds.has(s.id));
  return [...dbSpells, ...fallbackOnly];
}

/** Force the next call to refetch from the DB. Call after homebrew mutations. */
export function invalidateSpellsCache(): void {
  cachedSpells = null;
  pendingFetch = null;
}

interface UseSpellsResult {
  spells: SpellData[];
  spellMap: Record<string, SpellData>;
  loading: boolean;
  error: string | null;
}

export function useSpells(): UseSpellsResult {
  // Synchronous initial value: prefer cached, otherwise static (instant render).
  // The async fetch then upgrades the list once the DB responds.
  const [spells, setSpells] = useState<SpellData[]>(() => cachedSpells ?? SPELLS);
  const [loading, setLoading] = useState<boolean>(() => cachedSpells === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (cachedSpells !== null) {
      // Already fetched; sync our local state in case it changed.
      setSpells(cachedSpells);
      setLoading(false);
      return;
    }

    if (pendingFetch === null) {
      pendingFetch = fetchSpellsFromDb()
        .then(dbSpells => {
          const merged = mergeWithStatic(dbSpells);
          cachedSpells = merged;
          return merged;
        })
        .catch(err => {
          // On hard error, keep static so the app still works.
          console.warn('[useSpells] fetch threw, using static fallback:', err);
          cachedSpells = SPELLS;
          return SPELLS;
        });
    }

    pendingFetch.then(merged => {
      if (cancelled) return;
      setSpells(merged);
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      setError(String(err?.message ?? err));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  // Build the map fresh on each spells change.
  const spellMap: Record<string, SpellData> = {};
  for (const s of spells) spellMap[s.id] = s;
  // Backfill any IDs missing from the DB list with the static map (defense-in-depth)
  for (const id in SPELL_MAP) {
    if (!(id in spellMap)) spellMap[id] = SPELL_MAP[id];
  }

  return { spells, spellMap, loading, error };
}

/**
 * Synchronous getter for a spell by ID. Reads from the cached DB list if
 * available, otherwise the static SPELL_MAP. Use this in places where a hook
 * is impractical (utility functions, event handlers).
 */
export function getSpellById(id: string): SpellData | undefined {
  if (cachedSpells) {
    const found = cachedSpells.find(s => s.id === id);
    if (found) return found;
  }
  return SPELL_MAP[id];
}
