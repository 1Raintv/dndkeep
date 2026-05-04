// v2.96.0 — Phase D of the Combat Backbone
//
// CombatContext tracks the active encounter for the currently-viewed campaign
// (or for the user's character's campaign when viewing a character sheet).
// Subscribes to realtime changes on combat_encounters + combat_participants so
// the yellow in-combat body glow and the bottom initiative strip stay in sync
// across all clients.
//
// Usage:
//   <CombatProvider campaignId={campaign.id}>
//     ...
//   </CombatProvider>
//
// Then anywhere inside:
//   const { encounter, participants, currentActor } = useCombat();

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { CombatEncounter, CombatParticipant } from '../types';
// v2.316: HP/conditions/buffs/death-save reads come from combatants
// via JOIN so all useCombat() consumers see the unified source.
import {
  JOINED_COMBATANT_FIELDS,
  normalizeParticipantRow,
} from '../lib/combatParticipantNormalize';

interface CombatContextValue {
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  currentActor: CombatParticipant | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CombatContext = createContext<CombatContextValue>({
  encounter: null,
  participants: [],
  currentActor: null,
  loading: false,
  refresh: async () => {},
});

export function useCombat() {
  return useContext(CombatContext);
}

interface CombatProviderProps {
  campaignId: string | null | undefined;
  children: React.ReactNode;
}

export function CombatProvider({ campaignId, children }: CombatProviderProps) {
  const [encounter, setEncounter] = useState<CombatEncounter | null>(null);
  const [participants, setParticipants] = useState<CombatParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!campaignId) {
      setEncounter(null);
      setParticipants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: encData } = await supabase
      .from('combat_encounters')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const enc = (encData as CombatEncounter) ?? null;
    setEncounter(enc);

    if (enc) {
      const { data: partData } = await (supabase as any)
        .from('combat_participants')
        .select('*, ' + JOINED_COMBATANT_FIELDS)
        .eq('encounter_id', enc.id)
        .order('turn_order', { ascending: true });
      // v2.316: normalize flattens combatants.* onto each row so
      // every useCombat() consumer reads through to the combatant.
      setParticipants(
        ((partData ?? []) as Array<Record<string, unknown>>)
          .map(normalizeParticipantRow) as unknown as CombatParticipant[]
      );
    } else {
      setParticipants([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (!campaignId) return;

    const ch = supabase
      .channel(`combat:${campaignId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'combat_encounters',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { load(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'combat_participants',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { load(); })
      // v2.410.0 — Subscribe to combatants too. The 11 virtual fields
      // on CombatParticipant (current_hp, max_hp, temp_hp, is_dead,
      // active_conditions, etc.) are joined from combatants at load
      // time via JOINED_COMBATANT_FIELDS. Pre-v2.410 we only listened
      // for combat_participants events, so a HP write to combatants
      // (which is what applyDamage and the QuickPanel both do) didn't
      // refresh currentActor.current_hp. Result: the MonsterActionPanel's
      // HP bar and the InitiativeStrip's per-tile HP bar (added in
      // v2.410) stayed stale until something else triggered a reload.
      // Now any combatant change reloads the participant list with
      // fresh joined HP.
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'combatants',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { load(); })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Toggle body.in-combat class for the ambient yellow glow
  useEffect(() => {
    if (encounter && encounter.status === 'active') {
      document.body.classList.add('in-combat');
    } else {
      document.body.classList.remove('in-combat');
    }
    return () => { document.body.classList.remove('in-combat'); };
  }, [encounter]);

  const currentActor = useMemo(() => {
    if (!encounter) return null;
    const visibleOrdered = [...participants]
      .filter(p => !p.is_dead)
      .sort((a, b) => a.turn_order - b.turn_order);
    return visibleOrdered[encounter.current_turn_index] ?? null;
  }, [encounter, participants]);

  const value: CombatContextValue = {
    encounter,
    participants,
    currentActor,
    loading,
    refresh: load,
  };

  return <CombatContext.Provider value={value}>{children}</CombatContext.Provider>;
}
