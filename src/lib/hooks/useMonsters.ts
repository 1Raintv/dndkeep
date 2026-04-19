// src/lib/hooks/useMonsters.ts
//
// v2.24.0 — Single source of truth for monster data at runtime.
// Fetches from public.monsters (canonical with owner_id IS NULL +
// the current user's homebrew). The static src/data/monsters.ts
// fallback was removed once the canonical seed (334 monsters) was
// complete.
//
// The hook caches the fetch at module scope so all consumers share
// one round trip per browser session. Mutations to homebrew should
// call invalidateMonstersCache() to force a refetch.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { MonsterData, CreatureSize, MonsterTrait, MonsterAction, MonsterLegendaryAction } from '../../types';

// ─── Module-scope cache (survives unmounts within a session) ────────
let cachedMonsters: MonsterData[] | null = null;
let cachedMonsterMap: Record<string, MonsterData> = {};
let pendingFetch: Promise<MonsterData[]> | null = null;

interface DbMonsterRow {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  alignment: string | null;
  cr: string;          // DB stores text to accommodate "1/8", "1/4", "1/2"
  xp: number;
  size: string;
  hp: number;
  hp_formula: string;
  ac: number;
  ac_note: string | null;
  speed: number;
  fly_speed: number | null;
  swim_speed: number | null;
  climb_speed: number | null;
  burrow_speed: number | null;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  saving_throws: Record<string, number> | null;
  skills: Record<string, number> | null;
  damage_immunities: string[] | null;
  damage_resistances: string[] | null;
  damage_vulnerabilities: string[] | null;
  condition_immunities: string[] | null;
  senses: Record<string, string | number> | null;
  languages: string | null;
  proficiency_bonus: number | null;
  traits: MonsterTrait[] | null;
  actions: MonsterAction[] | null;
  reactions: MonsterTrait[] | null;
  legendary_actions: MonsterLegendaryAction[] | null;
  legendary_resistance_count: number | null;
  attack_name: string;
  attack_bonus: number;
  attack_damage: string;
}

/**
 * Normalize CR back into number|string to match MonsterData's contract.
 * Integer-like values become numbers so numeric sorts work; fractional
 * values (1/8, 1/4, 1/2) stay as strings.
 */
function normalizeCR(raw: string): number | string {
  if (raw === '1/8' || raw === '1/4' || raw === '1/2') return raw;
  const asNum = Number(raw);
  return Number.isFinite(asNum) ? asNum : raw;
}

function rowToMonster(r: DbMonsterRow): MonsterData {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    ...(r.subtype ? { subtype: r.subtype } : {}),
    ...(r.alignment ? { alignment: r.alignment } : {}),
    cr: normalizeCR(r.cr),
    xp: r.xp,
    size: r.size as CreatureSize,
    hp: r.hp,
    hp_formula: r.hp_formula,
    ac: r.ac,
    ...(r.ac_note ? { ac_note: r.ac_note } : {}),
    speed: r.speed,
    ...(r.fly_speed != null ? { fly_speed: r.fly_speed } : {}),
    ...(r.swim_speed != null ? { swim_speed: r.swim_speed } : {}),
    ...(r.climb_speed != null ? { climb_speed: r.climb_speed } : {}),
    ...(r.burrow_speed != null ? { burrow_speed: r.burrow_speed } : {}),
    str: r.str, dex: r.dex, con: r.con,
    int: r.int, wis: r.wis, cha: r.cha,
    ...(r.saving_throws ? { saving_throws: r.saving_throws } : {}),
    ...(r.skills ? { skills: r.skills } : {}),
    ...(r.damage_immunities ? { damage_immunities: r.damage_immunities } : {}),
    ...(r.damage_resistances ? { damage_resistances: r.damage_resistances } : {}),
    ...(r.damage_vulnerabilities ? { damage_vulnerabilities: r.damage_vulnerabilities } : {}),
    ...(r.condition_immunities ? { condition_immunities: r.condition_immunities } : {}),
    ...(r.senses ? { senses: r.senses } : {}),
    ...(r.languages ? { languages: r.languages } : {}),
    ...(r.proficiency_bonus != null ? { proficiency_bonus: r.proficiency_bonus } : {}),
    ...(r.traits ? { traits: r.traits } : {}),
    ...(r.actions ? { actions: r.actions } : {}),
    ...(r.reactions ? { reactions: r.reactions } : {}),
    ...(r.legendary_actions ? { legendary_actions: r.legendary_actions } : {}),
    ...(r.legendary_resistance_count != null ? { legendary_resistance_count: r.legendary_resistance_count } : {}),
    attack_name: r.attack_name,
    attack_bonus: r.attack_bonus,
    attack_damage: r.attack_damage,
  };
}

function buildDerivedCaches(monsters: MonsterData[]): void {
  cachedMonsterMap = {};
  for (const m of monsters) cachedMonsterMap[m.id] = m;
}

async function fetchMonstersFromDb(): Promise<MonsterData[]> {
  // RLS handles the visibility filter automatically — the user gets:
  // canonical (owner_id IS NULL), own homebrew, and public homebrew.
  const { data, error } = await supabase
    .from('monsters')
    .select('id, name, type, subtype, alignment, cr, xp, size, hp, hp_formula, ac, ac_note, speed, fly_speed, swim_speed, climb_speed, burrow_speed, str, dex, con, int, wis, cha, saving_throws, skills, damage_immunities, damage_resistances, damage_vulnerabilities, condition_immunities, senses, languages, proficiency_bonus, traits, actions, reactions, legendary_actions, legendary_resistance_count, attack_name, attack_bonus, attack_damage')
    .order('name', { ascending: true });

  if (error) {
    console.error('[useMonsters] DB fetch failed:', error.message);
    return [];
  }
  return (data as DbMonsterRow[]).map(rowToMonster);
}

/** Force the next call to refetch from the DB. Call after homebrew mutations. */
export function invalidateMonstersCache(): void {
  cachedMonsters = null;
  cachedMonsterMap = {};
  pendingFetch = null;
}

interface UseMonstersResult {
  monsters: MonsterData[];
  monsterMap: Record<string, MonsterData>;
  loading: boolean;
  error: string | null;
}

export function useMonsters(): UseMonstersResult {
  // Synchronous initial value: prefer cached, otherwise empty array.
  // The async fetch then upgrades the list once the DB responds.
  const [monsters, setMonsters] = useState<MonsterData[]>(() => cachedMonsters ?? []);
  const [loading, setLoading] = useState<boolean>(() => cachedMonsters === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (cachedMonsters !== null) {
      setMonsters(cachedMonsters);
      setLoading(false);
      return;
    }

    if (pendingFetch === null) {
      pendingFetch = fetchMonstersFromDb()
        .then(dbMonsters => {
          cachedMonsters = dbMonsters;
          buildDerivedCaches(dbMonsters);
          return dbMonsters;
        })
        .catch(err => {
          console.error('[useMonsters] fetch threw:', err);
          cachedMonsters = [];
          buildDerivedCaches([]);
          return [];
        });
    }

    pendingFetch.then(result => {
      if (cancelled) return;
      setMonsters(result);
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      setError(String(err?.message ?? err));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  return {
    monsters,
    monsterMap: cachedMonsterMap,
    loading,
    error,
  };
}

/**
 * Synchronous getter for a monster by ID. Reads from the cached map if
 * available. Use this in places where a hook is impractical (utility
 * functions, event handlers). Returns undefined if cache not yet
 * populated or the ID is not found.
 */
export function getMonsterById(id: string): MonsterData | undefined {
  return cachedMonsterMap[id];
}

/** Synchronous accessor for the full monster list (cached). Empty until first fetch. */
export function getCachedMonsters(): MonsterData[] {
  return cachedMonsters ?? [];
}

/** Synchronous accessor for the monster map (cached). Empty until first fetch. */
export function getCachedMonsterMap(): Record<string, MonsterData> {
  return cachedMonsterMap;
}
