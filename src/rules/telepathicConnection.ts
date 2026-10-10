import {psionProgression,type PsionicClassState} from './psionProgression';
import {validPsionicRoll,type PsionicRollEnhancement} from './psionicEnhancedRoll';
/** Owner UA update pp.3,10: an extension lasts one hour of game time.
 * Keep this independent of Sharpened Mind's one-minute recovery token. */
export const CONNECTION_DURATION_SECONDS=3600;
export function telepathyBaseRange(character:PsionicClassState):number|null {
 const progression=psionProgression(character);
 return progression?progression.subclass==='Telepath'&&progression.level>=6?60:30:null;
}
/** Final roll includes only verified Surge/Enkindled adjustments. No dice,
 * payment, wall-clock reads or effects are created by this calculation. */
export function telepathicConnectionRange(character:PsionicClassState,roll:number,enhancement:PsionicRollEnhancement={}):number|null {
 const progression=psionProgression(character),base=telepathyBaseRange(character);
 if(!progression||base===null||!validPsionicRoll(progression.level,roll,enhancement))return null;
 return base+10*roll;
}
/** A caller must supply the same authoritative monotonic game clock for both
 * values. Unknown/backward clocks need review, not a fresh one-hour effect.
 * Extra elapsed time covers declared activities not yet included in the clock;
 * callers must not count the same activity in both inputs. */
export function connectionSecondsRemaining(startSeconds:number,currentSeconds:number,extraElapsedSeconds=0):number|null {
 if(![startSeconds,currentSeconds,extraElapsedSeconds].every(n=>Number.isSafeInteger(n)&&n>=0)||currentSeconds<startSeconds)return null;
 const elapsed=currentSeconds-startSeconds;
 // Compare before adding to avoid overflow for valid large clock values.
 if(elapsed>=CONNECTION_DURATION_SECONDS||extraElapsedSeconds>=CONNECTION_DURATION_SECONDS-elapsed)return 0;
 return CONNECTION_DURATION_SECONDS-elapsed-extraElapsedSeconds;
}
