export const MASTERY_VEX_KEY='mastery_vexed';
export interface MasteryExpiryBuff {
 key:string;expiresAtStartOfTurnOf?:string;expiresSkipFirst?:boolean;
 expiresAtEndOfTurnOf?:string;expiresAfterNextTurnStarts?:boolean;
}
/** v2.869: Vex arms at the attacker's next start, then expires at that end.
 * This works for hits on and off the attacker's own turn. Repeated starts
 * cannot consume another lifetime step; no "second start" approximation. */
export function advanceMasteryExpiry<B extends MasteryExpiryBuff>(buffs:readonly B[],actor:string,timing:'turn_start'|'turn_end'):{next:B[];removed:B[];changed:boolean}{
 const next:B[]=[],removed:B[]=[];let changed=false;
 for(const buff of buffs){
  let update=buff,remove=false;
  if(timing==='turn_end'){
   remove=buff.expiresAtEndOfTurnOf===actor&&buff.expiresAfterNextTurnStarts===false;
   // A legacy Vex whose first start already ran is due at this end.
   if(buff.key===MASTERY_VEX_KEY&&buff.expiresAtStartOfTurnOf===actor&&!buff.expiresSkipFirst)remove=true;
  }else if(buff.expiresAtEndOfTurnOf===actor){
   if(buff.expiresAfterNextTurnStarts===true)update={...buff,expiresAfterNextTurnStarts:false};
  }else if(buff.expiresAtStartOfTurnOf===actor){
   if(buff.expiresSkipFirst){
    update={...buff};delete update.expiresSkipFirst;
    if(buff.key===MASTERY_VEX_KEY){delete update.expiresAtStartOfTurnOf;update.expiresAtEndOfTurnOf=actor;update.expiresAfterNextTurnStarts=false;}
   }else remove=true;
  }
  if(remove){removed.push(buff);changed=true;}else{next.push(update);changed ||= update!==buff;}
 }
 return {next,removed,changed};
}
