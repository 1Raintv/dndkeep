// src/lib/hooks/useMagicItems.ts
//
// v2.154.0 — Phase P pt 2: single source of truth for magic items at
// runtime. Fetches from public.magic_items (canonical SRD with
// owner_id IS NULL + the current user's homebrew, RLS-gated). Falls
// back to the static MAGIC_ITEMS array for any ID not yet present in
// the DB so the app stays resilient if Supabase is slow or down on
// first load.
//
// Mirrors lib/hooks/useSpells.ts structurally so callers can use the
// same patterns (useMagicItems()/invalidateMagicItemsCache()/
// getMagicItemById()).

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { MAGIC_ITEMS, MAGIC_ITEM_MAP, type MagicItem } from '../../data/magicItems';

// ─── Module-scope cache ──────────────────────────────────────────────
let cachedItems: MagicItem[] | null = null;
let pendingFetch: Promise<MagicItem[]> | null = null;

// DB row shape. ac/save/attack/damage bonuses come back as nullable
// integers. requires_attunement is snake-cased in the DB but we
// expose as camelCase to match the static type.
interface DbMagicItemRow {
  id: string;
  name: string;
  item_type: MagicItem['type'];
  rarity: MagicItem['rarity'];
  requires_attunement: boolean;
  description: string;
  weight: number | null;
  ac_bonus: number | null;
  save_bonus: number | null;
  attack_bonus: number | null;
  damage_bonus: number | null;
  max_charges: number | null;
  recharge: string | null;
}

function rowToMagicItem(r: DbMagicItemRow): MagicItem {
  const out: MagicItem = {
    id: r.id,
    name: r.name,
    type: r.item_type,
    rarity: r.rarity,
    requiresAttunement: r.requires_attunement,
    description: r.description,
    ...(r.weight !== null ? { weight: r.weight } : {}),
    ...(r.ac_bonus !== null ? { acBonus: r.ac_bonus } : {}),
    ...(r.save_bonus !== null ? { saveBonus: r.save_bonus } : {}),
    ...(r.attack_bonus !== null ? { attackBonus: r.attack_bonus } : {}),
    ...(r.damage_bonus !== null ? { damageBonus: r.damage_bonus } : {}),
  };
  return out;
}

async function fetchMagicItemsFromDb(): Promise<MagicItem[]> {
  const { data, error } = await supabase
    .from('magic_items')
    .select('id, name, item_type, rarity, requires_attunement, description, weight, ac_bonus, save_bonus, attack_bonus, damage_bonus, max_charges, recharge')
    .order('rarity', { ascending: true })
    .order('name',   { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[useMagicItems] DB fetch failed, falling back to static only:', error.message);
    return [];
  }
  return (data as DbMagicItemRow[]).map(rowToMagicItem);
}

/** Merge DB with static — DB wins on id collision, static fills gaps. */
function mergeWithStatic(dbItems: MagicItem[]): MagicItem[] {
  const dbIds = new Set(dbItems.map(i => i.id));
  const fallbackOnly = MAGIC_ITEMS.filter(i => !dbIds.has(i.id));
  return [...dbItems, ...fallbackOnly];
}

export function invalidateMagicItemsCache(): void {
  cachedItems = null;
  pendingFetch = null;
}

interface UseMagicItemsResult {
  items: MagicItem[];
  itemMap: Record<string, MagicItem>;
  loading: boolean;
  error: string | null;
}

export function useMagicItems(): UseMagicItemsResult {
  // Sync initial: prefer cache, else static (instant first paint).
  const [items, setItems]   = useState<MagicItem[]>(() => cachedItems ?? MAGIC_ITEMS);
  const [loading, setLoading] = useState<boolean>(() => cachedItems === null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (cachedItems !== null) {
      setItems(cachedItems);
      setLoading(false);
      return;
    }

    if (pendingFetch === null) {
      pendingFetch = fetchMagicItemsFromDb()
        .then(dbItems => {
          const merged = mergeWithStatic(dbItems);
          cachedItems = merged;
          return merged;
        })
        .catch(err => {
          // eslint-disable-next-line no-console
          console.warn('[useMagicItems] fetch threw, using static fallback:', err);
          cachedItems = MAGIC_ITEMS;
          return MAGIC_ITEMS;
        });
    }

    pendingFetch.then(merged => {
      if (cancelled) return;
      setItems(merged);
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      setError(String(err?.message ?? err));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  // Build id map fresh each render. Backfill from static map so
  // consumers doing lookups by id never get undefined for known items.
  const itemMap: Record<string, MagicItem> = {};
  for (const i of items) itemMap[i.id] = i;
  for (const id in MAGIC_ITEM_MAP) {
    if (!(id in itemMap)) itemMap[id] = MAGIC_ITEM_MAP[id];
  }

  return { items, itemMap, loading, error };
}

/**
 * Synchronous getter. Prefers cached DB list (if loaded), falls back
 * to the static map. Use in event handlers / utility code where a
 * hook isn't practical.
 */
export function getMagicItemById(id: string): MagicItem | undefined {
  if (cachedItems) {
    const found = cachedItems.find(i => i.id === id);
    if (found) return found;
  }
  return MAGIC_ITEM_MAP[id];
}
