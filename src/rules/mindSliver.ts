/** Mind Sliver, PHB 2024: next save only, through the end of the caster's
 * next turn. This pure planner requires verified combat state; persistence
 * must consume all matching effects in the same transaction as the save.
 * It deliberately does not use start-of-turn buff expiry or wall-clock time. */
export interface MindSliverEffect {
 id:string;encounterId:string;casterId:string;targetId:string;
 /** Monotonic caster turn-start count captured when the spell was cast. */
 castTurnOrdinal:number;
}
export interface MindSliverClock {
 casterId:string;
 /** Last completed caster turn, not the current round or target's turn. */
 lastEndedTurnOrdinal:number;
}
export type MindSliverSavePlan =
 {ok:true;penaltyDice:'1d4'|null;consumeIds:string[];expiredIds:string[]}|
 {ok:false;reason:'invalid-effect'|'unverified-clock'};
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const ordinal=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER;
/** Input effects are unsettled records, including overlapping casts. Every
 * still-active instance has the same next-save trigger: consume them together,
 * but subtract only one die (overlapping instances of one spell don't stack).
 * Auto-failed saves also consume the trigger; the caller needn't roll a die
 * where the result cannot change. Replays must return the saved receipt. */
export function planMindSliverSave(
 effects:readonly MindSliverEffect[],clocks:readonly MindSliverClock[],
 encounterId:string,targetId:string,
):MindSliverSavePlan {
 if(!text(encounterId)||!text(targetId))return {ok:false,reason:'invalid-effect'};
 const consumeIds:string[]=[],expiredIds:string[]=[],seen=new Set<string>();
 for(const effect of effects){
  if(![effect.id,effect.encounterId,effect.casterId,effect.targetId].every(text)||!ordinal(effect.castTurnOrdinal)||seen.has(effect.id))
   return {ok:false,reason:'invalid-effect'};
  seen.add(effect.id);
  if(effect.encounterId!==encounterId||effect.targetId!==targetId)continue;
  const matching=clocks.filter(clock=>clock.casterId===effect.casterId);
  if(matching.length!==1||!ordinal(matching[0].lastEndedTurnOrdinal)||matching[0].lastEndedTurnOrdinal<effect.castTurnOrdinal-1)return {ok:false,reason:'unverified-clock'};
  // The next own turn has ordinal cast+1 whether the cast happened during
  // the caster's current turn or as a reaction between their turns.
  if(matching[0].lastEndedTurnOrdinal>=effect.castTurnOrdinal+1)expiredIds.push(effect.id);
  else consumeIds.push(effect.id);
 }
 return {ok:true,penaltyDice:consumeIds.length?'1d4':null,consumeIds,expiredIds};
}
