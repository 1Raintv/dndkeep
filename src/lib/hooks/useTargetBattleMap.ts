import {useCallback,useEffect,useState} from 'react';
import {useBattleMapStore} from '../stores/battleMapStore';
import {loadActiveBattleMap,type ActiveBattleMap} from '../battleMapGeometry';
import {useLiveBattleMap} from './useLiveBattleMap';

/** v2.801 — one loading/failure contract for attack and spell pickers. A failed
 * read is not a map without positions. Successful no-map play stays available. */
export function useTargetBattleMap(enabled:boolean,campaignId:string|null|undefined){
  const sceneId=useBattleMapStore(s=>s.currentSceneId);
  const sceneLoading=useBattleMapStore(s=>s.loading);
  const [attempt,setAttempt]=useState(0);
  const retry=useCallback(()=>setAttempt(n=>n+1),[]);
  const key=enabled && campaignId ? JSON.stringify([campaignId,sceneId,attempt]) : null;
  const [loaded,setLoaded]=useState<{key:string;map:ActiveBattleMap|null;failed:boolean}|null>(null);
  const snapshot=loaded?.key===key ? loaded.map : null;
  const battleMap=useLiveBattleMap(snapshot);
  const loading=key!==null && (loaded?.key!==key || (snapshot!==null && snapshot.id===sceneId && sceneLoading));
  const failed=key!==null && loaded?.key===key && loaded.failed;
  useEffect(()=>{
    if(!campaignId || !key){setLoaded(null);return;}
    let cancelled=false;
    const timer=setTimeout(()=>{
      cancelled=true;setLoaded({key,map:null,failed:true});
    },15_000);
    loadActiveBattleMap(campaignId,{viewedSceneId:sceneId,throwOnError:true}).then(map=>{
      clearTimeout(timer);
      if(!cancelled)setLoaded({key,map,failed:false});
    },()=>{
      clearTimeout(timer);
      if(!cancelled)setLoaded({key,map:null,failed:true});
    });
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[campaignId,key,sceneId]);
  return {battleMap,loading,failed,retry,sceneId};
}
