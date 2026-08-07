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

// ----------------------------------------------------------------
// v2.637 perf (audit 6.6) — ONE realtime channel per campaign, shared
// across hook instances via refcount.
//
// History: v2.472 tried to share by channel NAME and crashed — Supabase's
// .channel(name) returns the already-subscribed channel, and calling
// .on() after .subscribe() throws. v2.475 fixed the crash by giving each
// hook instance a random-suffixed channel, at the cost of duplicate
// subscriptions carrying identical traffic (this hook mounts in both
// CampaignDashboard and InitiativeStrip, so every session paid 2x).
//
// This version shares correctly: the channel is created and .subscribe()d
// exactly once per campaignId, with a SINGLE .on() handler that fans out
// to a listener set in JS. Later consumers only add a listener — no
// post-subscribe .on() call, so the v2.472 crash cannot recur. The last
// consumer to unmount tears the channel down, which frees the name for
// a fresh .channel() on any later remount.
type SharedConcEntry = {
  channel: ReturnType<typeof supabase.channel>;
  refs: number;
  listeners: Set<() => void>;
};
const sharedConcChannels = new Map<string, SharedConcEntry>();

// Exported for unit tests (the refcount/fan-out rules are exactly the
// part with crash history — see the v2.472 note above).
export function acquireConcChannel(campaignId: string, onEvent: () => void): () => void {
  let entry = sharedConcChannels.get(campaignId);
  if (!entry) {
    const listeners = new Set<() => void>();
    const channel = supabase
      .channel(`conc-${campaignId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'characters',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { for (const l of listeners) l(); })
      .subscribe();
    entry = { channel, refs: 0, listeners };
    sharedConcChannels.set(campaignId, entry);
  }
  entry.refs++;
  entry.listeners.add(onEvent);
  const acquired = entry;
  return () => {
    acquired.listeners.delete(onEvent);
    acquired.refs--;
    if (acquired.refs <= 0) {
      sharedConcChannels.delete(campaignId);
      supabase.removeChannel(acquired.channel);
    }
  };
}

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
    // v2.637 — shared refcounted channel (see acquireConcChannel above;
    // replaces the v2.475 per-instance random-suffix channels).
    const release = acquireConcChannel(campaignId, () => { load(); });

    return () => {
      cancelled = true;
      release();
    };
  }, [campaignId]);

  return map;
}
