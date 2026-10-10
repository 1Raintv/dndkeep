import {loadActiveBattleMap,distanceBetweenTokensFt,type BattleMapToken} from './battleMapGeometry';
import type {TelepathAttackContext} from './api/telepathReactions';
export type TelepathSpatialEvidence={status:'review';reason:'scene'|'identity'|'geometry'}|
 {status:'measured';sceneId:string;actor:BattleMapToken;subject:BattleMapToken;distanceFeet:number;visibilityReviewRequired:true};
/** Use exact instances only. Name/species fallback is useful for displaying
 * legacy maps, but cannot identify the creature whose roll is being changed.
 * Distance alone does not establish visibility (walls, darkness, conditions).
 * A later acceptance must revalidate these positions and the saved turn. */
export async function loadTelepathSpatialEvidence(context:TelepathAttackContext,sceneId:string|null):Promise<TelepathSpatialEvidence>{
 if(!sceneId)return {status:'review',reason:'scene'};
 const map=await loadActiveBattleMap(context.attack.snapshot.campaignId,{viewedSceneId:sceneId,throwOnError:true});
 if(!map||map.id!==sceneId)return {status:'review',reason:'scene'};
 const actors=map.tokens.filter(t=>t.character_id===context.characterId);
 const subjects=map.tokens.filter(t=>t.combatant_id===context.subject.combatantId);
 if(actors.length!==1||subjects.length!==1||!actors[0].id||!subjects[0].id
  ||(context.subject.self?actors[0].id!==subjects[0].id:actors[0].id===subjects[0].id))return {status:'review',reason:'identity'};
 const [actor,subject]=[actors[0],subjects[0]];
 if([actor,subject].some(t=>!Number.isInteger(t.row)||!Number.isInteger(t.col)||!Number.isInteger(t.size)||t.size!<1||t.size!>4))return {status:'review',reason:'geometry'};
 return {status:'measured',sceneId,actor:{...actor},subject:{...subject},distanceFeet:distanceBetweenTokensFt(actor,subject),visibilityReviewRequired:true};
}
