import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import { dragPresence } from '../../../lib/map/dragPresence';
import { subscribeTokenMoves } from './pendingTokenMoves';
import { pendingTokenIds } from './heldTokens';

/** v2.700 — Presence is for connection membership, not high-frequency holds.
 * Broadcast leases keep group locks responsive without exhausting Presence's
 * per-client limit. Disconnects remove locks; missed releases expire in 6s.
 *
 * v2.746 — pointer release ends the GESTURE, not its asynchronous save.
 * Pre-v2.746 end() sent hold([]) synchronously at pointerup, while the
 * position PATCH was still in flight; peers unlocked and could target an
 * optimistic position, and any unrelated refresh on their side rewound it
 * (the "shifts a little after I let go" seen on the other screens). Now the
 * lease covers `held ∪ this scene's pending saves` (heldTokens.ts) and is
 * re-sent whenever a reservation begins or ends, so peers stay locked until
 * the sender's save settles. Three guards keep that from stranding anyone:
 *   • sends are deduped on the sorted id list (pointerup otherwise emits
 *     [id]→[]→[id] in one tick); the heartbeat and SUBSCRIBED force a resend
 *     so leases still renew past the 6 s expiry;
 *   • a lease that expires or whose owner leaves presence WITH ids still on
 *     it fires onLeaseLost(ids) — the caller refetches the scene so a
 *     crashed / navigated-away sender cannot leave a phantom position;
 *   • an id that DROPS OUT of a peer's lease (a normal release) ALSO fires
 *     onLeaseLost(ids), after the lock is cleared. Reviewer-caught v2.746
 *     regression: click-to-move, arrow-key nudges and undo/redo save a
 *     position without ever sending a drag_move, so the only thing a peer
 *     hears about them is the DB echo — and refreshSceneTokens keeps a
 *     REMOTE-LOCKED token at its live (= origin) position, so that echo was
 *     discarded and the peer stayed on the origin until an unrelated update
 *     refetched the list (a delayed teleport: the reported "shift"). The
 *     lease is released only once the sender's PATCH has returned, so the
 *     refetch on release always reads the settled row — and it also heals
 *     a drag_move dropped by the throttle or the network. One list fetch
 *     per peer per settled move, the same fetch the echo already costs;
 *   • drag_move for a token THIS client is dragging is ignored (an echoed
 *     or racing peer position must not fight the local ghost).
 * The 15 s save timeout (saveTimeout.ts) bounds how long a lease can live. */
export function useTokenDragSharing(sceneId:string|undefined,userId:string,onLeaseLost?:(ids:string[])=>void) {
  const port=useRef<{hold:(ids:string[])=>void;move:(id:string,x:number,y:number)=>void}|null>(null);
  // Ref so a fresh callback identity never tears the channel down mid-drag.
  const onLeaseLostRef=useRef(onLeaseLost);
  useEffect(()=>{onLeaseLostRef.current=onLeaseLost;},[onLeaseLost]);
  useEffect(()=>{
    if(!sceneId || !userId) return;
    const channel=supabase.channel(`battle_map:scene_drag:${sceneId}`,{config:{presence:{key:userId}}});
    let held:string[]=[];
    let legacy:Record<string,string>={};
    const leases=new Map<string,{ids:string[];expires:number}>();
    const lost=(ids:string[])=>{if(ids.length) onLeaseLostRef.current?.(ids);};
    const publish=()=>{
      const locks={...legacy};
      const expired:string[][]=[];
      for(const [owner,lease] of leases) {
        if(lease.expires<=Date.now()) {leases.delete(owner);expired.push(lease.ids);continue;}
        for(const id of lease.ids) locks[id]=owner;
      }
      const store=useBattleMapStore.getState();
      if(store.currentSceneId===sceneId && JSON.stringify(store.remoteDragLocks)!==JSON.stringify(locks)) store.setRemoteDragLocks(locks);
      for(const ids of expired) lost(ids);
    };
    // Scene-scoped: the reservation map is browser-global, so pending saves
    // are read through this scene's token map only.
    const heldIds=()=>{
      const store=useBattleMapStore.getState();
      const pending=store.currentSceneId===sceneId?pendingTokenIds(store):[];
      return [...new Set([...held,...pending])].sort();
    };
    let lastSent:string|null=null;
    const sendHold=(force=false)=>{
      const ids=heldIds();const key=JSON.stringify(ids);
      if(!force && key===lastSent) return;
      lastSent=key;
      void channel.send({type:'broadcast',event:'drag_hold',payload:{senderId:userId,ids}});
    };
    channel.on('broadcast',{event:'drag_hold'},({payload})=>{
      if(!payload || payload.senderId===userId || typeof payload.senderId!=='string' || !Array.isArray(payload.ids)) return;
      const prev=leases.get(payload.senderId)?.ids??[];
      const ids:string[]=payload.ids.filter((id:unknown):id is string=>typeof id==='string');
      leases.set(payload.senderId,{ids,expires:Date.now()+6000});
      // publish() FIRST: refreshSceneTokens reads remoteDragLocks synchronously
      // at call time, so the refetch triggered below must see the lock gone
      // or it would "protect" the origin position all over again.
      publish();
      lost(prev.filter(id=>!ids.includes(id)));
    });
    channel.on('broadcast',{event:'drag_move'},({payload})=>{
      if(!payload || payload.senderId===userId || typeof payload.tokenId!=='string' || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
      const store=useBattleMapStore.getState();
      if(store.dragging===payload.tokenId) return;
      store.updateTokenPosition(payload.tokenId,payload.x,payload.y);
    });
    channel.on('presence',{event:'sync'},()=>{
      const state=channel.presenceState();
      legacy=dragPresence(state);
      // A presence diff can arrive a beat after the broadcast that created a
      // lease; only prune leases older than one heartbeat (2 s of its 6 s).
      const pruned:string[][]=[];
      for(const [owner,lease] of leases) if(!state[owner] && lease.expires-Date.now()<4000) {leases.delete(owner);pruned.push(lease.ids);}
      publish();
      for(const ids of pruned) lost(ids);
    });
    channel.subscribe(status=>{if(status==='SUBSCRIBED') {void channel.track({userId});if(heldIds().length) sendHold(true);}});
    const heartbeat=setInterval(()=>{if(heldIds().length) sendHold(true);publish();},2000);
    const unsubscribeMoves=subscribeTokenMoves(()=>sendHold());
    port.current={
      hold(ids) {held=ids;sendHold();},
      move(id,x,y) {void channel.send({type:'broadcast',event:'drag_move',payload:{tokenId:id,x,y,senderId:userId}});},
    };
    return ()=>{clearInterval(heartbeat);unsubscribeMoves();port.current=null;void supabase.removeChannel(channel);};
  },[sceneId,userId]);
  return {
    start:useCallback((ids:string|string[])=>port.current?.hold(Array.isArray(ids)?ids:[ids]),[]),
    move:useCallback((id:string,x:number,y:number)=>port.current?.move(id,x,y),[]),
    end:useCallback((_ids:string|string[])=>port.current?.hold([]),[]),
  };
}
