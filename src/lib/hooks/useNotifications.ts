// src/lib/hooks/useNotifications.ts
//
// v2.161.0 — Phase Q.0 pt 2 of Notifications.
//
// Subscribes to campaign_chat realtime inserts and accumulates
// notification-worthy messages (announcements, save_prompts, and
// auto-emitted player events from v2.162). On mount, also backfills
// the recent history (last 50 rows) so the inbox has content even on
// first load.
//
// Filters at the subscription layer to "notification" message types:
//   • announcement
//   • save_prompt
//   • player_down / player_revived / player_dead (v2.162)
// Skips regular chat / dice rolls — those belong in a separate
// chat panel (not built yet).
//
// Caveats:
//   • Backfill is one-shot on mount. Old messages from BEFORE the
//     last 50 won't appear in the inbox even if they were unread.
//     This is the right trade-off — chat history can grow huge in
//     long campaigns.
//   • Realtime requires the campaign_chat table to be in the
//     supabase_realtime publication (fixed in v2.160).

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import {
  countUnread, markAllRead, getLastReadAt,
  type NotificationMessage,
} from '../notifications';

const NOTIF_TYPES = ['announcement', 'save_prompt', 'check_prompt', 'short_rest_prompt', 'long_rest_completed', 'player_down', 'player_revived', 'player_dead'];
const BACKFILL_LIMIT = 50;

interface UseNotificationsResult {
  messages: NotificationMessage[];
  unreadCount: number;
  /** Most recent message that has arrived since mount, used to drive toasts. */
  latestArrival: NotificationMessage | null;
  markRead: () => void;
}

export function useNotifications(campaignId: string | null): UseNotificationsResult {
  const [messages, setMessages] = useState<NotificationMessage[]>([]);
  const [latestArrival, setLatestArrival] = useState<NotificationMessage | null>(null);
  // unreadCount is computed from messages + lastReadAt; we trigger a
  // re-derivation by bumping a tick when markRead is called.
  const [readTick, setReadTick] = useState(0);

  // Backfill on mount / campaign change
  useEffect(() => {
    if (!campaignId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('campaign_chat')
      .select('id, campaign_id, message, message_type, character_name, created_at')
      .eq('campaign_id', campaignId)
      .in('message_type', NOTIF_TYPES)
      .order('created_at', { ascending: false })
      .limit(BACKFILL_LIMIT)
      .then(({ data }) => {
        if (cancelled || !data) return;
        // Reverse so oldest-first matches accumulation order, then we
        // present newest-first in the UI by sorting at render time.
        setMessages(data as NotificationMessage[]);
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  // Realtime subscription
  useEffect(() => {
    if (!campaignId) return;
    const ch = supabase
      .channel(`notifications-${campaignId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'campaign_chat',
        filter: `campaign_id=eq.${campaignId}`,
      }, payload => {
        const row = payload.new as NotificationMessage;
        if (!NOTIF_TYPES.includes(row.message_type)) return;
        // Prepend (newest first ordering for the inbox)
        setMessages(prev => {
          // Defensive dedupe — realtime can occasionally double-fire
          if (prev.some(m => m.id === row.id)) return prev;
          return [row, ...prev];
        });
        setLatestArrival(row);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId]);

  const markRead = useCallback(() => {
    if (!campaignId) return;
    markAllRead(campaignId);
    setReadTick(t => t + 1);
  }, [campaignId]);

  // Derive unread count. readTick + messages.length both invalidate.
  const unreadCount = campaignId
    ? countUnread(messages, campaignId)
    : 0;
  // readTick is referenced so React re-derives on markRead; the value
  // itself is irrelevant.
  void readTick;
  void getLastReadAt; // re-export reference to keep it tree-shaken-friendly

  return { messages, unreadCount, latestArrival, markRead };
}
