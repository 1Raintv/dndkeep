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

      // v2.426.0 — Fallback fetch for participants whose JOINed
      // combatants object is missing. User report: "the combat tab
      // shows 0/256 but the dragon's token bar shows 256/256." Root
      // cause: the token HP bar reads from `combatants` directly
      // via tokenStateMap, while CombatContext reads through the
      // combat_participants FK JOIN. If the JOIN returns no row
      // (combatant_id is NULL or points to a deleted/orphaned row),
      // normalizeParticipantRow returns the row unchanged → all the
      // HP/condition fields are undefined → ?? 0 fallback in render
      // shows 0/256.
      //
      // Recovery: walk the result, find rows where JOIN failed but
      // we still have a combatant_id pointing somewhere; bulk-fetch
      // those combatants directly and patch them onto the rows
      // before normalize. If combatant_id IS null, we can't recover
      // here without a name+campaign heuristic — log loudly so the
      // root cause (probably a missed cp_ensure_combatant_link) gets
      // a separate fix.
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
          '[CombatContext] participants with NULL combatant_id — attempting definition-based recovery',
          orphaned,
        );
        // v2.426.0 — Orphan recovery via (campaign_id, definition_type,
        // definition_id) which is how combatants are uniquely keyed
        // per the v2.319 architecture. We don't have campaign_id on
        // each participant row directly here (we have it in scope as
        // `campaignId`), and we have entity_id + participant_type per
        // row, so we can do this lookup. Rare path — only fires when
        // cp_ensure_combatant_link didn't run for some reason.
        const orphanedRows = rows.filter(r =>
          !r.combatants && !r.combatant_id && r.entity_id
        );
        for (const r of orphanedRows) {
          const defType = r.participant_type as string;
          const defId = r.entity_id as string;
          // characters table id is uuid; combatants.definition_id is
          // text and stores it as text. Same for npc/monster ids.
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
          '[CombatContext] participants with dangling combatant_id (recovering via direct fetch)',
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
            // Patch the JOIN slot so normalizeParticipantRow can
            // flatten as usual.
            r.combatants = cb;
          }
        }
      }

      // v2.316: normalize flattens combatants.* onto each row so
      // every useCombat() consumer reads through to the combatant.
      setParticipants(
        rows.map(normalizeParticipantRow) as unknown as CombatParticipant[]
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
