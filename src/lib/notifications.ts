// src/lib/notifications.ts
//
// v2.161.0 — Phase Q.0 pt 2 of Notifications.
//
// Read/unread tracking lives in localStorage. The key shape is:
//   dndkeep:notifs:lastRead:<campaignId> = ISO timestamp string
//
// Why localStorage instead of a DB table:
//   • Zero migration cost
//   • Zero RLS surface area
//   • Notification read state is ephemeral UI preference, not
//     game-state truth. If a player opens DNDKeep on a different
//     device and sees old notifications as "unread", that's fine —
//     they're catching up.
//   • Future upgrade path is clean: swap the body of these functions
//     for DB calls without touching any caller.
//
// Caveats:
//   • Clearing browser storage = all notifications appear unread again
//   • Multi-device users may see different unread counts. Acceptable
//     trade-off for v2.161.

const KEY_PREFIX = 'dndkeep:notifs:lastRead:';

export interface NotificationMessage {
  id: string;
  campaign_id: string;
  message: string;
  message_type: string;
  character_name: string | null;
  created_at: string;
}

/** Get the last-read timestamp for a campaign. Returns epoch (1970) if never read. */
export function getLastReadAt(campaignId: string): Date {
  if (!campaignId) return new Date(0);
  try {
    const raw = localStorage.getItem(KEY_PREFIX + campaignId);
    if (!raw) return new Date(0);
    const d = new Date(raw);
    if (isNaN(d.getTime())) return new Date(0);
    return d;
  } catch {
    return new Date(0);
  }
}

/** Mark all notifications in a campaign as read up to NOW. */
export function markAllRead(campaignId: string): void {
  if (!campaignId) return;
  try {
    localStorage.setItem(KEY_PREFIX + campaignId, new Date().toISOString());
  } catch {
    // Storage unavailable — silently noop. Worst case: user sees
    // notifications as unread next time. Better than throwing.
  }
}

/** Count messages whose created_at is later than lastReadAt. */
export function countUnread(
  messages: NotificationMessage[],
  campaignId: string,
): number {
  if (!campaignId || messages.length === 0) return 0;
  const cutoff = getLastReadAt(campaignId);
  let count = 0;
  for (const m of messages) {
    if (new Date(m.created_at) > cutoff) count++;
  }
  return count;
}

/** Human label for a message_type. */
export function messageTypeLabel(t: string): string {
  switch (t) {
    case 'announcement': return 'DM Announcement';
    case 'save_prompt':  return 'Save Prompt';
    case 'check_prompt': return 'Ability Check';
    case 'short_rest_prompt': return 'Short Rest';
    case 'long_rest_completed': return 'Long Rest';
    case 'player_down':  return 'Player Down';
    case 'player_revived': return 'Player Revived';
    case 'player_dead':  return 'Player Dead';
    default: return t.replace(/_/g, ' ');
  }
}

// v2.168.0 — Phase Q.0 pt 9: shared notification-body formatter.
//
// Several message_types wrap a JSON payload inside the `message` column
// (save_prompt = {ability,dc}, check_prompt = {target,kind,dc,adv,dis},
// short_rest_prompt = {kind:'short'}). Rendering the raw JSON in the
// NotificationToast popup was ugly — e.g. the user saw the literal
// string `{"target":"Arcana","kind":"skill"}` under the toast header.
//
// Previously NotificationsButton had its own private formatCheckPrompt
// / formatSavePrompt helpers, so the inbox rendered nicely but the
// toast did not. This function centralizes the logic so both consumers
// stay in sync.
//
// Always returns a human-readable string; falls back to the raw message
// when the payload is not valid JSON for that type (e.g. announcement).
export function formatNotificationBody(messageType: string, message: string): string {
  try {
    switch (messageType) {
      case 'save_prompt': {
        const p = JSON.parse(message);
        const ability = String(p.ability ?? '').toUpperCase();
        const dc = p.dc ? ` · DC ${p.dc}` : '';
        return `${ability} save${dc}`;
      }
      case 'check_prompt': {
        const p = JSON.parse(message);
        const target = String(p.target ?? '');
        const dc = p.dc ? ` · DC ${p.dc}` : '';
        const adv = p.advantage ? ' · ADV' : p.disadvantage ? ' · DIS' : '';
        // Use just the target name ("Arcana") or "STR check" style.
        // The messageTypeLabel already says "Ability Check" in the
        // header, so don't duplicate the word "check" when the target
        // is a skill.
        return `${target}${dc}${adv}`;
      }
      case 'short_rest_prompt':
        return 'The DM called for a short rest.';
      case 'long_rest_completed':
        // Already plain prose — pass through.
        return message;
      case 'announcement':
      default:
        return message;
    }
  } catch {
    return message;
  }
}
