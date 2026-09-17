import * as tokensApi from '../../../lib/api/tokensApiRouter';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
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
      const tokens=await tokensApi.listTokens(sceneId,{campaignId});
      if (cancelled() || request!==revision) return;
      const store=useBattleMapStore.getState();
      if (store.currentSceneId!==sceneId) return;
      // Keep a currently held local preview; refresh every other token.
      store.setTokensBulk(tokens.map(t => {
        const held=store.dragging===t.id ? store.tokens[t.id] : undefined;
        return held ? {...t,x:held.x,y:held.y} : t;
      }));
    } catch (error) { log.error('Map reconnect refresh failed',error,{sceneId}); }
  };
}
