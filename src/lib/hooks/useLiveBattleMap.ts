import {useMemo} from 'react';
import {useBattleMapStore} from '../stores/battleMapStore';
import type {ActiveBattleMap} from '../battleMapGeometry';
import {tokenSizeCells} from '../map/coords';

/** v2.743 — attack distances and highlights must use the same positions as the map. */
export function useLiveBattleMap(snapshot:ActiveBattleMap|null) {
  const tokens=useBattleMapStore(s=>s.tokens);
  const sceneId=useBattleMapStore(s=>s.currentSceneId);
  const loading=useBattleMapStore(s=>s.loading);
  return useMemo(()=>{
    if(!snapshot || !sceneId)return snapshot;
    if(sceneId!==snapshot.id || loading)return null;
    return {...snapshot,tokens:Object.values(tokens).map(t=>({
      id:t.id,combatant_id:t.combatantId??undefined,
      row:Math.floor(t.y/snapshot.grid_size),col:Math.floor(t.x/snapshot.grid_size),
      name:t.name,character_id:t.characterId??undefined,creature_id:t.creatureId??undefined,
      size:tokenSizeCells(t.size),size_label:t.size,
    }))};
  },[snapshot,tokens,sceneId,loading]);
}
