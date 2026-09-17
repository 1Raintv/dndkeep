import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import { dragPresence } from '../../../lib/map/dragPresence';

/** v2.700 — Presence is for connection membership, not high-frequency holds.
 * Broadcast leases keep group locks responsive without exhausting Presence's
 * per-client limit. Disconnects remove locks; missed releases expire in 6s. */
export function useTokenDragSharing(sceneId:string|undefined,userId:string) {
  const port=useRef<{hold:(ids:string[])=>void;move:(id:string,x:number,y:number)=>void}|null>(null);
  useEffect(()=>{
    if(!sceneId || !userId) return;
    const channel=supabase.channel(`battle_map:scene_drag:${sceneId}`,{config:{presence:{key:userId}}});
    let held:string[]=[];
    let legacy:Record<string,string>={};
    const leases=new Map<string,{ids:string[];expires:number}>();
    const publish=()=>{
      const locks={...legacy};
      for(const [owner,lease] of leases) {
        if(lease.expires<=Date.now()) {leases.delete(owner);continue;}
        for(const id of lease.ids) locks[id]=owner;
      }
      const store=useBattleMapStore.getState();
      if(store.currentSceneId===sceneId && JSON.stringify(store.remoteDragLocks)!==JSON.stringify(locks)) store.setRemoteDragLocks(locks);
    };
    const sendHold=()=>{void channel.send({type:'broadcast',event:'drag_hold',payload:{senderId:userId,ids:held}});};
    channel.on('broadcast',{event:'drag_hold'},({payload})=>{
      if(!payload || payload.senderId===userId || typeof payload.senderId!=='string' || !Array.isArray(payload.ids)) return;
      leases.set(payload.senderId,{ids:payload.ids.filter((id:unknown)=>typeof id==='string'),expires:Date.now()+6000});
      publish();
    });
    channel.on('broadcast',{event:'drag_move'},({payload})=>{
      if(!payload || payload.senderId===userId || typeof payload.tokenId!=='string' || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
      useBattleMapStore.getState().updateTokenPosition(payload.tokenId,payload.x,payload.y);
    });
    channel.on('presence',{event:'sync'},()=>{
      const state=channel.presenceState();
      legacy=dragPresence(state);
      for(const owner of leases.keys()) if(!state[owner]) leases.delete(owner);
      publish();
    });
    channel.subscribe(status=>{if(status==='SUBSCRIBED') {void channel.track({userId});if(held.length) sendHold();}});
    const heartbeat=setInterval(()=>{if(held.length) sendHold();publish();},2000);
    port.current={
      hold(ids) {held=ids;sendHold();},
      move(id,x,y) {void channel.send({type:'broadcast',event:'drag_move',payload:{tokenId:id,x,y,senderId:userId}});},
    };
    return ()=>{clearInterval(heartbeat);port.current=null;void supabase.removeChannel(channel);};
  },[sceneId,userId]);
  return {
    start:useCallback((ids:string|string[])=>port.current?.hold(Array.isArray(ids)?ids:[ids]),[]),
    move:useCallback((id:string,x:number,y:number)=>port.current?.move(id,x,y),[]),
    end:useCallback((_ids:string|string[])=>port.current?.hold([]),[]),
  };
}
