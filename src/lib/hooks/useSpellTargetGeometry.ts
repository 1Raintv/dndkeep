import {useEffect,useMemo,useState} from 'react';
import {useBattleMapStore} from '../stores/battleMapStore';
import {useLiveBattleMap} from './useLiveBattleMap';
import {loadActiveBattleMap,buildParticipantPositions,buildParticipantFootprints,deriveCover,
  participantSizeLabel,type ActiveBattleMap,type ParticipantForTokenLookup} from '../battleMapGeometry';

/** v2.745 — spell previews and cover follow the same live token instances as attacks. */
export function useSpellTargetGeometry(open:boolean,campaignId:string,caster:ParticipantForTokenLookup|null,participants:ParticipantForTokenLookup[]) {
  const sceneId=useBattleMapStore(s=>s.currentSceneId);
  const [snapshot,setSnapshot]=useState<ActiveBattleMap|null>(null);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    setSnapshot(null);
    if(!open){setLoading(false);return;}
    let cancelled=false;
    setLoading(true);
    loadActiveBattleMap(campaignId).then(map=>{if(!cancelled)setSnapshot(map);})
      .catch(()=>{/* Maps are optional; theater-of-the-mind targeting remains available. */})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[open,campaignId,sceneId]);
  const battleMap=useLiveBattleMap(snapshot);
  return useMemo(()=>{
    const input=caster?[caster,...participants]:participants;
    const positions=battleMap?buildParticipantPositions(input,battleMap.tokens):null;
    const footprints=battleMap?buildParticipantFootprints(input,battleMap.tokens):null;
    const coverByTarget:Record<string,'half'|'three_quarters'|'total'>={};
    const casterPos=caster?positions?.get(caster.id):null;
    if(battleMap && casterPos && positions)for(const participant of participants){
      const targetPos=positions.get(participant.id);
      if(!targetPos)continue;
      const cover=deriveCover(casterPos,targetPos,participantSizeLabel(participant,battleMap.tokens),
        battleMap.walls,battleMap.tokens,battleMap.grid_size).level;
      if(cover!=='none')coverByTarget[participant.id]=cover;
    }
    return {battleMap,positions,footprints,coverByTarget,gridSize:battleMap?.grid_size??50,loading};
  },[battleMap,caster,participants,loading]);
}
