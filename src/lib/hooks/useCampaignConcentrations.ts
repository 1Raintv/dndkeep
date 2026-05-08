// v2.457.0 — Campaign-wide character concentration map.
//
// Returns a Map<characterId, { spellId, roundsRemaining }> for every
// character in the campaign that's currently concentrating. Subscribes
// to realtime UPDATE events on the characters table so the map stays
// in sync as players cast / drop concentration mid-combat.
//
// Why a dedicated hook (vs piggybacking on PartyHPPanel's fetch):
// the InitiativeStrip lives outside PartyHPPanel's tree and runs in
// both DM and player views. Pulling its own subscription keeps the
// component self-contained and avoids prop-drilling concentration
// state through CombatProvider (which otherwise reads only
// combat_participants/encounters).
//
// Scope limitation: only characters concentrate via this field. NPCs
// and monsters track condition application via condition_sources +
// active_buffs but don't have a single "I am concentrating on X" row
// — they're omitted from this map by design. A future ship could
// reverse-derive monster concentration from condition_sources where
// the source is a known concentration-required spell, but that's
// fragile and out of scope here.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export interface ConcentrationEntry {
  spellId: string;
  roundsRemaining: number | null;
}

type ConcentrationMap = Record<string, ConcentrationEntry>;

export function useCampaignConcentrations(campaignId: string | null | undefined): ConcentrationMap {
  const [map, setMap] = useState<ConcentrationMap>({});

  useEffect(() => {
    if (!campaignId) {
      setMap({});
      return;
    }
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('characters')
        .select('id, concentration_spell, concentration_rounds_remaining')
        .eq('campaign_id', campaignId);
      if (cancelled) return;
      if (error) {
        console.warn('[useCampaignConcentrations] load failed', error);
        return;
      }
      const next: ConcentrationMap = {};
      for (const row of data ?? []) {
        const spellId = (row as { concentration_spell?: string | null }).concentration_spell;
        if (!spellId) continue;
        next[(row as { id: string }).id] = {
          spellId,
          roundsRemaining: (row as { concentration_rounds_remaining: number | null }).concentration_rounds_remaining ?? null,
        };
      }
      setMap(next);
    }

    load();
    const ch = supabase
      .channel(`conc-${campaignId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'characters',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [campaignId]);

  return map;
}
