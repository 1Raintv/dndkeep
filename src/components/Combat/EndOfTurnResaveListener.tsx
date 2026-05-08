// v2.452.0 — Surfaces v2.445's end-of-turn re-save auto-rolls to the
// UI. Pre-v2.452 these rolls were log-only — players had no idea
// their character was rolling against Frightful Presence at end of
// turn, only that the condition stayed (or disappeared). This
// listener subscribes to combat_events INSERTs filtered by
// event_type='condition_resave' for the active campaign, and
// dispatches a toast for each one with the d20 + result.
//
// Mount once in DM view (CampaignDashboard) with isDM=true to surface
// every re-save in the campaign, and once per player view
// (CharacterSheet) with the character's name + isDM=false to filter
// to events where actor_name matches the local character. The
// emit-side does not stamp actor_id on these self-events (matches
// the death_save_rolled convention), so name-match is the
// canonical filter — same approach used in CombatEventLog filtering
// elsewhere.
//
// Visibility: events flagged 'hidden_from_players' are silently
// skipped on the player side. DM sees everything regardless.

import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../shared/Toast';

interface ResavePayload {
  condition?: string;
  d20?: number;
  total?: number;
  bonus?: number;
  dc?: number;
  ability?: string;
  passed?: boolean;
  trigger?: string;
}

interface CombatEventRowLike {
  id: string;
  campaign_id: string;
  actor_name: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  visibility: string;
}

interface Props {
  campaignId: string;
  /** When set, only re-saves whose actor_name matches are surfaced.
   *  Used by player view (CharacterSheet) to avoid spamming a player
   *  with toasts about other party members' rolls. DM omits this. */
  forActorName?: string;
  /** DM mode: shows every event regardless of visibility. Player mode
   *  (false) filters out 'hidden_from_players' events so DM-private
   *  monster re-saves don't leak. */
  isDM: boolean;
}

export default function EndOfTurnResaveListener({
  campaignId, forActorName, isDM,
}: Props) {
  const { showToast } = useToast();
  // Dedupe ids in case the realtime channel double-delivers — the
  // postgres_changes provider has done this in edge cases historically.
  // We keep a small bounded set; the toast itself auto-dismisses, so
  // an unbounded set isn't necessary. Using a ref so we don't trigger
  // re-renders on inserts.
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!campaignId) return;
    const channelName = `resave-listener:${campaignId}:${forActorName ?? 'all'}`;
    const ch = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'combat_events',
        // DB-side filter narrows to this campaign; we filter event_type
        // + visibility + actor_name client-side because postgres_changes
        // filter syntax is single-column.
        filter: `campaign_id=eq.${campaignId}`,
      }, (payload) => {
        const row = payload.new as CombatEventRowLike | undefined;
        if (!row || row.event_type !== 'condition_resave') return;
        if (seenIdsRef.current.has(row.id)) return;
        seenIdsRef.current.add(row.id);
        // Cheap eviction: cap at 200 so a long-running session doesn't
        // grow the Set unbounded. Order doesn't matter — we only need
        // to dedupe near-duplicates from the realtime provider.
        if (seenIdsRef.current.size > 200) {
          const first = seenIdsRef.current.values().next().value;
          if (first) seenIdsRef.current.delete(first);
        }

        // Visibility gate (player-side only). DM-private monster re-saves
        // shouldn't leak into player toasts.
        if (!isDM && row.visibility === 'hidden_from_players') return;

        // Actor-name gate (player-side only). Without actor_id stamped
        // on the event, name-match is the canonical filter.
        if (forActorName && row.actor_name !== forActorName) return;

        const p = (row.payload ?? {}) as ResavePayload;
        const condition = p.condition ?? 'condition';
        // Capitalize the condition for display ("frightened" → "Frightened").
        const condDisplay = condition.charAt(0).toUpperCase() + condition.slice(1);
        const d20 = typeof p.d20 === 'number' ? p.d20 : null;
        const total = typeof p.total === 'number' ? p.total : null;
        const dc = typeof p.dc === 'number' ? p.dc : null;
        const ability = typeof p.ability === 'string' ? p.ability : null;
        const passed = !!p.passed;

        // Compose: "Aria — Frightened save (DC 21 WIS): rolled 17. Failed — still Frightened."
        // Roll fragment: prefer "rolled X" with the total; the d20 is
        // useful but the total is what the player cares about (does it
        // beat the DC). If we somehow only have d20, use that.
        const rollFragment =
          total != null ? `rolled ${total}` :
          d20 != null ? `rolled ${d20}` :
          'rolled';
        const dcFragment = dc != null
          ? ` (DC ${dc}${ability ? ` ${ability}` : ''})`
          : '';
        const outcome = passed
          ? `Saved — ${condDisplay} ended.`
          : `Failed — still ${condDisplay}.`;

        const message =
          `${row.actor_name} — ${condDisplay} save${dcFragment}: ${rollFragment}. ${outcome}`;

        // Success → green ('success'), failure → yellow ('warn'). Failure
        // gets a longer dwell because the player wants to read what
        // their character is still suffering.
        showToast(message, passed ? 'success' : 'warn', {
          duration: passed ? 4500 : 6500,
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [campaignId, forActorName, isDM, showToast]);

  return null;
}
