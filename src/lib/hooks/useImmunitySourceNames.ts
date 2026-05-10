// v2.478.0 — useImmunitySourceNames.
//
// Resolves the human label for each `(target_type, target_id)` pair
// that appears as a source on a character's active_immunities list.
// The carry-over (Ship 3) writes immunities with `source_name: ''`
// because looking up the name at carry-over time would require
// per-source DB hits at end-of-encounter; cheaper to resolve at
// display time (sheet open) and cache the result.
//
// Sources can live in four tables:
//   - characters       (PCs)
//   - npcs             (NPCs the DM tracks)
//   - homebrew_monsters (campaign-scoped monster instances)
//   - monsters         (bestiary)
//
// We don't know which table a given source_id lives in without
// also tracking source_type. The campaign_condition_immunities
// table doesn't currently store source_type — every grant has the
// attacker as the source and the saver as the target, but the table
// only carries target_type explicitly. For now we fan out to all
// four tables in parallel, take the first hit, and cache.
//
// Performance: a typical character will have 0-3 immunities, mostly
// from the same campaign's bestiary entries. Four parallel SELECTs
// per source for a few sources is well under 100ms total. Cache
// dedupes within the session.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

interface CacheEntry {
  name: string;
  resolvedAt: number;
}

const sessionCache = new Map<string, CacheEntry>();

async function resolveOneSource(sourceId: string): Promise<string> {
  const cached = sessionCache.get(sourceId);
  if (cached) return cached.name;

  // Fan-out reads across the four candidate tables. .maybeSingle()
  // returns null if no row matches, so each SELECT either resolves
  // to a name or to null. First non-null wins.
  const [charRes, npcRes, hmRes, mRes] = await Promise.all([
    supabase.from('characters').select('name').eq('id', sourceId).maybeSingle(),
    supabase.from('npcs').select('name').eq('id', sourceId).maybeSingle(),
    supabase.from('homebrew_monsters').select('name').eq('id', sourceId).maybeSingle(),
    // The bestiary `monsters` table uses string slug IDs (e.g. 'adult-red-dragon'),
    // not UUIDs. .eq() on a UUID column would be a type error in
    // PostgREST, but here the column is text — safe.
    supabase.from('monsters').select('name').eq('id', sourceId).maybeSingle(),
  ]);

  const name =
    (charRes.data as { name?: string } | null)?.name ??
    (npcRes.data as { name?: string } | null)?.name ??
    (hmRes.data as { name?: string } | null)?.name ??
    (mRes.data as { name?: string } | null)?.name ??
    'Unknown source';
  sessionCache.set(sourceId, { name, resolvedAt: Date.now() });
  return name;
}

/**
 * Returns a Map<source_id, source_name>. Begins empty, fills in as
 * resolutions complete. Re-runs when the source_id list changes.
 *
 * Pass an array of source_ids extracted from active_immunities.
 */
export function useImmunitySourceNames(sourceIds: string[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(() => {
    // Seed from cache so already-resolved sources render immediately.
    const m = new Map<string, string>();
    for (const id of sourceIds) {
      const cached = sessionCache.get(id);
      if (cached) m.set(id, cached.name);
    }
    return m;
  });

  // Stable key for the deps array — sorting + joining the ids gives
  // us identity-by-value semantics so a new array reference with the
  // same ids doesn't re-trigger the effect.
  const key = [...sourceIds].sort().join('|');

  useEffect(() => {
    let cancelled = false;
    const unresolved = sourceIds.filter(id => !sessionCache.has(id));
    if (!unresolved.length) return;

    (async () => {
      const results = await Promise.all(unresolved.map(id => resolveOneSource(id).then(name => ({ id, name }))));
      if (cancelled) return;
      setNames(prev => {
        const next = new Map(prev);
        for (const { id, name } of results) next.set(id, name);
        return next;
      });
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return names;
}
