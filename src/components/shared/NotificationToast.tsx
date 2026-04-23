// src/components/shared/NotificationToast.tsx
//
// v2.161.0 — Phase Q.0 pt 2 of Notifications.
//
// Brief popup that shows an incoming notification for ~5 seconds at
// the top of the screen, then auto-dismisses. The full message stays
// in the inbox (NotificationsButton popover) afterward.
//
// Mounted as a sibling to NotificationsButton in CharacterPage.
// Receives messages via the onNewArrival callback the button forwards.
//
// Multiple rapid notifications stack briefly — each gets its own 5s
// timer. Dismissed early with a click on the X button.

import { useEffect, useState, useCallback } from 'react';
import { messageTypeLabel } from '../../lib/notifications';

export interface ToastItem {
  id: string;
  message: string;
  message_type: string;
  character_name: string | null;
}

interface Props {
  /** Latest message to display. New objects (different ref) trigger a fresh toast. */
  latest: ToastItem | null;
}

const TOAST_DURATION_MS = 5000;

export default function NotificationToast({ latest }: Props) {
  const [active, setActive] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (!latest) return;
    setActive(prev => {
      // Defensive dedupe — if the same id arrives twice (e.g. parent
      // re-renders), don't re-add it.
      if (prev.some(t => t.id === latest.id)) return prev;
      return [...prev, latest];
    });
    const timer = setTimeout(() => {
      setActive(prev => prev.filter(t => t.id !== latest.id));
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [latest]);

  const dismiss = useCallback((id: string) => {
    setActive(prev => prev.filter(t => t.id !== id));
  }, []);

  if (active.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {active.map(t => {
        const accent =
          t.message_type === 'player_dead' ? '#ef4444' :
          t.message_type === 'player_down' ? '#f97316' :
          t.message_type === 'player_revived' ? '#4ade80' :
          t.message_type === 'check_prompt' ? '#a78bfa' :
          t.message_type === 'save_prompt' ? '#60a5fa' :
          t.message_type === 'short_rest_prompt' ? '#60a5fa' :
          t.message_type === 'long_rest_completed' ? 'var(--c-gold-l)' :
          'var(--c-gold-l)';
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              minWidth: 280,
              maxWidth: 480,
              padding: '12px 16px',
              borderRadius: 10,
              background: 'var(--c-card)',
              border: `1px solid ${accent}`,
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              animation: 'fadeInDown 0.25s ease-out',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
                color: accent,
                marginBottom: 4,
              }}>
                {messageTypeLabel(t.message_type)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--t-1)', lineHeight: 1.5 }}>
                {t.message}
              </div>
            </div>
            <button
              onClick={() => dismiss(t.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--t-3)',
                fontSize: 16,
                padding: '0 4px',
                lineHeight: 1,
              }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
