import {useMemo} from 'react';
import {useTargetBattleMap} from './useTargetBattleMap';
import {buildParticipantPositions,buildParticipantFootprints,deriveCover,
  participantSizeLabel,type ParticipantForTokenLookup} from '../battleMapGeometry';

/** v2.745 — spell previews and cover follow the same live token instances as attacks. */
export function useSpellTargetGeometry(open:boolean,campaignId:string,caster:ParticipantForTokenLookup|null,participants:ParticipantForTokenLookup[]) {
  const {battleMap,loading,failed,retry}=useTargetBattleMap(open,campaignId);
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
    // gridSize is PIXELS per cell (scenes.grid_size_px) — for rendering
    // only. v2.746: SpellTargetPickerModal once passed it as the
    // feetPerSquare argument of the AoE finders, turning a 20-ft radius
    // into 0 cells; never feed it into distance math.
    return {battleMap,positions,footprints,coverByTarget,gridSize:battleMap?.grid_size??50,loading,failed,retry};
  },[battleMap,caster,participants,loading,failed,retry]);
}
