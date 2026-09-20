import {refreshSceneTokens} from './refreshSceneTokens';
import { log } from '../../../lib/log';

/** v2.699 — Postgres subscriptions do not replay moves missed while offline. */
export function tokenReconnect(sceneId: string, campaignId: string, cancelled: () => boolean) {
  let subscribed = false;
  let revision = 0;
  return async (status: string) => {
    if (status !== 'SUBSCRIBED') { revision++; return; }
    if (!subscribed) { subscribed=true; return; } // Initial hydration already fetches.
    const request=++revision;
    try {
      await refreshSceneTokens(sceneId,campaignId,()=>cancelled() || request!==revision);
    } catch (error) { log.error('Map reconnect refresh failed',error,{sceneId}); }
  };
}
