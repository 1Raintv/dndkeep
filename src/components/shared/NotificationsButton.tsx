// src/components/shared/NotificationsButton.tsx
//
// v2.161.0 — Phase Q.0 pt 2 of Notifications.
//
// Bell icon with unread badge. Click opens a popover-style modal
// listing recent notifications newest-first. Marks all as read when
// the popover opens.

import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { messageTypeLabel, formatNotificationBody } from '../../lib/notifications';

interface Props {
  campaignId: string | null;
  /**
   * v2.173.0 — Phase Q.0 pt 14: character context for targeted
   * announcement filtering. When the DM sends an announcement to a
   * subset of players, the payload carries `targets: string[]` and
   * only matching characters see the row. Null (no character) means
   * "show all" — useful for DM view, admin tools, etc.
   */
  characterId?: string | null;
  /** Called when a NEW notification arrives. Used by parent to drive a transient toast. */
  onNewArrival?: (msg: { id: string; message: string; message_type: string; character_name: string | null }) => void;
}

export default function NotificationsButton({ campaignId, characterId = null, onNewArrival }: Props) {
  const { messages, unreadCount, latestArrival, markRead } = useNotifications(campaignId, characterId);
  const [open, setOpen] = useState(false);
  const lastSeenIdRef = useRef<string | null>(null);

  // Forward new arrivals to parent for toast display. Skip the
  // initial backfill (on first render, latestArrival is null).
  useEffect(() => {
    if (!latestArrival) return;
    if (lastSeenIdRef.current === latestArrival.id) return;
    lastSeenIdRef.current = latestArrival.id;
    onNewArrival?.(latestArrival);
  }, [latestArrival, onNewArrival]);

  function togglePopover() {
    if (!open) {
      // Opening — mark everything read
      markRead();
    }
    setOpen(o => !o);
  }

  if (!campaignId) return null;

  return (
    <>
      <button
        onClick={togglePopover}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
        style={{
          position: 'relative',
          background: 'none',
          border: '1px solid var(--c-border)',
          borderRadius: 6,
          padding: '4px 8px',
          cursor: 'pointer',
          color: unreadCount > 0 ? 'var(--c-gold-l)' : 'var(--t-2)',
          fontSize: 14,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            // v2.198.0 — Phase Q.0 pt 39: badge sized to fit 2-digit
            // counts. Previous (16x16, fontSize 9) cropped the second
            // digit when count >= 10 because padding 4+4=8 left only
            // 8px for the text — fine for "1", "9" but cut off on "10",
            // "23", etc. Bump to 20x20 with fontSize 10 + tighter
            // padding gives ~14px text width, enough for "99".
            // Repositioned slightly inward so the larger badge still
            // sits ON the bell rather than escaping to the right.
            top: -6,
            right: -6,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            background: '#ef4444',
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
            border: '1px solid var(--c-card)',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '10vh',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--c-card)',
              border: '1px solid var(--c-gold-bdr)',
              borderRadius: 10,
              width: '100%', maxWidth: 480,
              maxHeight: '70vh',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--c-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(212,160,23,0.08)',
            }}>
              <div style={{
                fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-gold-l)',
              }}>
                Notifications
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-2)', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 8 }}>
              {messages.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-3)', fontSize: 12 }}>
                  No notifications yet.
                </div>
              ) : (
                // Newest-first
                [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(m => (
                  <div key={m.id} style={{
                    padding: '10px 12px',
                    marginBottom: 4,
                    borderRadius: 6,
                    background: 'var(--c-raised)',
                    border: '1px solid var(--c-border)',
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: 4,
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                        color: m.message_type === 'announcement' ? 'var(--c-gold-l)'
                             : m.message_type === 'player_dead' ? '#ef4444'
                             : m.message_type === 'player_down' ? '#f97316'
                             : m.message_type === 'player_revived' ? '#4ade80'
                             : '#a78bfa',
                      }}>
                        {messageTypeLabel(m.message_type)}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
                        {formatRelativeTime(m.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--t-1)', lineHeight: 1.5 }}>
                      {formatNotificationBody(m.message_type, m.message)}
                    </div>
                    {m.character_name && m.character_name !== 'DM' && (
                      <div style={{ fontSize: 10, color: 'var(--t-3)', marginTop: 3 }}>
                        — {m.character_name}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
// v2.168.0 — Phase Q.0 pt 9: removed private formatSavePrompt /
// formatCheckPrompt. Both callers now use lib/notifications ->
// formatNotificationBody so the toast and inbox stay in sync.
