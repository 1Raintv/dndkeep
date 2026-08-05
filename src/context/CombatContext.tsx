// v2.645 (audit 4.6 slice 1): CombatContext is now a thin shell around a
// SCOPED Zustand store (src/lib/stores/combatStore.ts) — the context
// carries the store INSTANCE, not the state. useCombat() keeps its exact
// pre-move contract ({encounter, participants, currentActor, loading,
// refresh}) — pinned by CombatContext.test.tsx and e2e/db/combat.spec.ts —
// so all 14 consumers work unchanged. What the move buys: consumers can
// now migrate to granular selectors (useCombatSelector below) so a HP
// tick re-renders only the widgets that read HP, instead of every combat
// consumer — the same argument battleMapStore's header makes for tokens.
//
// Realtime lifecycle stays HERE (React owns subscription lifetimes);
// state and load logic live in the store (lib-testable, no React).
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { supabase } from '../lib/supabase';
import { deriveCurrentActor } from '../lib/combatSelectors';
import { createCombatStore, type CombatState, type CombatStore } from '../lib/stores/combatStore';
import type { CombatEncounter, CombatParticipant } from '../types';

interface CombatContextValue {
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  currentActor: CombatParticipant | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CombatStoreContext = createContext<CombatStore | null>(null);

// Outside-provider fallback: the old context default was static empty
// state with loading:false — preserve that exactly for any stray
// consumer rendered outside a CombatProvider.
const DETACHED: CombatStore = createCombatStore(null);
DETACHED.setState({ loading: false });

/** Granular subscription — the migration target for hot consumers.
 *  Re-renders only when the selected slice changes. */
export function useCombatSelector<T>(selector: (s: CombatState) => T): T {
  const store = useContext(CombatStoreContext) ?? DETACHED;
  return useStore(store, selector);
}

/** Pre-move contract, unchanged. Consumers that only need a slice should
 *  prefer useCombatSelector — this hook still re-renders on any combat
 *  change (it reads everything). */
export function useCombat(): CombatContextValue {
  const encounter = useCombatSelector(s => s.encounter);
  const participants = useCombatSelector(s => s.participants);
  const loading = useCombatSelector(s => s.loading);
  const refresh = useCombatSelector(s => s.load);
  const currentActor = useMemo(
    () => deriveCurrentActor(encounter, participants),
    [encounter, participants],
  );
  return useMemo(
    () => ({ encounter, participants, currentActor, loading, refresh }),
    [encounter, participants, currentActor, loading, refresh],
  );
}

interface CombatProviderProps {
  campaignId: string | null | undefined;
  children: React.ReactNode;
}

export function CombatProvider({ campaignId, children }: CombatProviderProps) {
  // One store instance per provider per campaign — recreated when the
  // campaign changes so stale state can't leak across campaigns.
  const store = useMemo(() => createCombatStore(campaignId), [campaignId]);

  useEffect(() => {
    const load = () => { void store.getState().load(); };
    load();
    if (!campaignId) return;

    const ch = supabase
      .channel(`combat:${campaignId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'combat_encounters',
        filter: `campaign_id=eq.${campaignId}`,
      }, load)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'combat_participants',
        filter: `campaign_id=eq.${campaignId}`,
      }, load)
      // v2.410.0 — combatants too: HP writes land there, and the joined
      // fields must refresh (see store header / git history).
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'combatants',
        filter: `campaign_id=eq.${campaignId}`,
      }, load)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [campaignId, store]);

  // Toggle body.in-combat class for the ambient yellow glow.
  const encounter = useStore(store, s => s.encounter);
  useEffect(() => {
    if (encounter && encounter.status === 'active') {
      document.body.classList.add('in-combat');
    } else {
      document.body.classList.remove('in-combat');
    }
    return () => { document.body.classList.remove('in-combat'); };
  }, [encounter]);

  return <CombatStoreContext.Provider value={store}>{children}</CombatStoreContext.Provider>;
}
