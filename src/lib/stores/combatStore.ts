// v2.645 (audit 4.6 slice 1): combat state's carrier, moved out of
// CombatContext into a Zustand store — same pattern as battleMapStore,
// whose header makes the argument: selector subscriptions let a consumer
// re-render only when the slice it reads changes, where the old context
// re-rendered all 14 useCombat consumers on any combat change.
//
// SCOPED, not a singleton: two CombatProviders mount concurrently
// (CampaignDashboard and CharacterSheet — potentially different
// campaigns), so each provider creates its own store instance via
// createCombatStore() and shares it through React context. Never export
// a module-level instance from here.
//
// The load() logic (orphan/dangling recovery included) moved verbatim
// from CombatContext v2.426–v2.644 — comments preserved. The useCombat()
// contract is pinned by CombatContext.test.tsx; the lifecycle by
// e2e/db/combat.spec.ts.
import { createStore, type StoreApi } from 'zustand/vanilla';
import { supabase } from '../supabase';
import type { CombatEncounter, CombatParticipant } from '../../types';
import {
  JOINED_COMBATANT_FIELDS,
  normalizeParticipantRow,
} from '../combatParticipantNormalize';

export interface CombatState {
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  loading: boolean;
  /** True once any load has completed — later loads are silent
   *  background refreshes and never flip `loading` (v2.645 slice 2). */
  hasLoaded: boolean;
  load: () => Promise<void>;
}

export type CombatStore = StoreApi<CombatState>;

/** v2.645 slice 2 — identity-preserving reconciliation. Realtime load()
 *  refetches the world, which used to mint fresh row objects every tick;
 *  every selector and memo downstream then saw new references and
 *  re-rendered even when NOTHING changed. Reusing the previous refs for
 *  deep-equal rows makes "no-op tick → no re-render" true everywhere at
 *  once. Deep-equal via JSON.stringify: rows are plain PostgREST data
 *  with stable key order per endpoint. Exported for tests. */
export function reconcileValue<T>(prev: T | null, next: T | null): T | null {
  if (prev === null || next === null) return next;
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

export function reconcileById<T extends { id?: unknown }>(prev: T[], next: T[]): T[] {
  const prevById = new Map(prev.map(p => [p.id, p]));
  let allReused = prev.length === next.length;
  const out = next.map((n, i) => {
    const old = prevById.get(n.id);
    if (old && JSON.stringify(old) === JSON.stringify(n)) {
      if (allReused && prev[i] !== old) allReused = false; // reordered
      return old;
    }
    allReused = false;
    return n;
  });
  return allReused ? prev : out;
}

export function createCombatStore(campaignId: string | null | undefined): CombatStore {
  return createStore<CombatState>((set, get) => ({
    encounter: null,
    participants: [],
    loading: true,
    hasLoaded: false,

    load: async () => {
      if (!campaignId) {
        set({ encounter: null, participants: [], loading: false, hasLoaded: true });
        return;
      }
      if (!get().hasLoaded) set({ loading: true });
      const { data: encData } = await supabase
        .from('combat_encounters')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const enc = (encData as CombatEncounter) ?? null;

      if (enc) {
        const { data: partData } = await (supabase as any)
          .from('combat_participants')
          .select('*, ' + JOINED_COMBATANT_FIELDS)
          .eq('encounter_id', enc.id)
          .order('turn_order', { ascending: true });

        // v2.426.0 — Fallback fetch for participants whose JOINed
        // combatants object is missing (combatant_id NULL or pointing at
        // a deleted/orphaned row). Recovery paths preserved verbatim from
        // CombatContext; see that file's git history for the full story.
        const rows = (partData ?? []) as Array<Record<string, unknown>>;
        const orphaned: string[] = [];
        const dangling: string[] = [];
        for (const r of rows) {
          const hasJoin = !!r.combatants;
          if (hasJoin) continue;
          const cbid = r.combatant_id as string | null | undefined;
          if (cbid) dangling.push(cbid);
          else orphaned.push((r.id as string) ?? '?');
        }
        if (orphaned.length) {
          console.warn(
            '[combatStore] participants with NULL combatant_id — attempting definition-based recovery',
            orphaned,
          );
          // v2.426.0 — Orphan recovery via (campaign_id, definition_type,
          // definition_id), the unique combatant key per v2.319.
          const orphanedRows = rows.filter(r =>
            !r.combatants && !r.combatant_id && r.entity_id
          );
          for (const r of orphanedRows) {
            const defType = r.participant_type as string;
            const defId = r.entity_id as string;
            const { data: cbRows } = await (supabase as any)
              .from('combatants')
              .select('id, current_hp, max_hp, temp_hp, active_conditions, condition_sources, active_buffs, exhaustion_level, death_save_successes, death_save_failures, is_stable, is_dead')
              .eq('campaign_id', campaignId)
              .eq('definition_type', defType)
              .eq('definition_id', defId)
              .limit(1);
            const cb = (cbRows ?? [])[0];
            if (cb) {
              r.combatants = cb;
            }
          }
        }
        if (dangling.length) {
          console.warn(
            '[combatStore] participants with dangling combatant_id (recovering via direct fetch)',
            dangling,
          );
          const { data: cbRows } = await (supabase as any)
            .from('combatants')
            .select('id, current_hp, max_hp, temp_hp, active_conditions, condition_sources, active_buffs, exhaustion_level, death_save_successes, death_save_failures, is_stable, is_dead')
            .in('id', dangling);
          const cbMap = new Map<string, any>();
          for (const c of (cbRows ?? []) as any[]) cbMap.set(c.id, c);
          for (const r of rows) {
            if (r.combatants) continue;
            const cbid = r.combatant_id as string | null | undefined;
            if (!cbid) continue;
            const cb = cbMap.get(cbid);
            if (cb) {
              // Patch the JOIN slot so normalizeParticipantRow can flatten as usual.
              r.combatants = cb;
            }
          }
        }

        // v2.316: normalize flattens combatants.* onto each row so every
        // useCombat() consumer reads through to the combatant.
        const normalized = rows.map(normalizeParticipantRow) as unknown as CombatParticipant[];
        set(state => ({
          encounter: reconcileValue(state.encounter, enc),
          participants: reconcileById(state.participants, normalized),
          loading: false,
          hasLoaded: true,
        }));
      } else {
        set(state => ({
          encounter: null,
          participants: state.participants.length ? [] : state.participants,
          loading: false,
          hasLoaded: true,
        }));
      }
    },
  }));
}
