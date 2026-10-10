import {useEffect} from 'react';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';
import {findTokenForParticipant,participantLookup,tokenFootprintRange,type ActiveBattleMap,type ParticipantForTokenLookup} from '../../../lib/battleMapGeometry';

/** v2.869 — the target picker and reach overlay share a map snapshot and reach.
 * Clear only our own preview: closing a picker must not erase a newer hover. */
export function useTargetReachPreview(map:ActiveBattleMap|null,actor:ParticipantForTokenLookup|null|undefined,reachFt:number|null|undefined,enabled:boolean) {
 const sceneId=useBattleMapStore(s=>s.currentSceneId);
 useEffect(()=>{
  if(!enabled||!map||!actor||!Number.isFinite(reachFt)||!(Number(reachFt)>0)
   ||(sceneId!==null&&sceneId!==map.id))return;
  const token=findTokenForParticipant(participantLookup(actor),map.tokens);
  if(!token||!Number.isFinite(map.grid_size)||map.grid_size<=0)return;
  const footprint=tokenFootprintRange(token);
  const preview={sceneId:map.id,
   centerWorldX:(footprint.cMin+footprint.cMax+1)*map.grid_size/2,
   centerWorldY:(footprint.rMin+footprint.rMax+1)*map.grid_size/2,
   footprintCells:footprint.cMax-footprint.cMin+1,reachFt:Number(reachFt)};
  useBattleMapStore.getState().setReachPreview(preview);
  return ()=>{
   if(useBattleMapStore.getState().reachPreview===preview)useBattleMapStore.getState().setReachPreview(null);
  };
 },[map,actor,reachFt,enabled,sceneId]);
}
