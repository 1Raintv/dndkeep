import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications(userId: string | undefined) {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setSupported(false);
      setPermission('unsupported');
      return;
    }
    setSupported(true);
    setPermission(Notification.permission as PushPermission);
  }, []);

  async function requestPermission(): Promise<PushPermission> {
    if (!supported) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result as PushPermission);
    return result as PushPermission;
  }

  async function enablePush(): Promise<boolean> {
    if (!userId || !supported) return false;

    const perm = await requestPermission();
    if (perm !== 'granted') return false;

    try {
      const _reg = await navigator.serviceWorker.ready;
      // For now store basic subscription flag — full VAPID push requires server-side keys
      // This enables local notifications and session-start alerts
      await supabase
        .from('profiles')
        .update({ push_enabled: true })
        .eq('id', userId);

      return true;
    } catch {
      return false;
    }
  }

  // Show a local notification (no server needed)
  function notify(title: string, body: string, url?: string) {
    if (permission !== 'granted') return;
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body,
        icon: '/icon-192.png',
        tag: 'dndkeep-session',
        data: url ? { url } : {},
      });
    });
  }

  return { permission, supported, enablePush, notify };
}
