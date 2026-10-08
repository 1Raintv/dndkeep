import {rollDie,physicalDiceList,physicalDiceOutcome} from './dice';
/** v2.752 — SRD 5.2.1 pp.6–7: normal saves compare total with DC.
 * Natural extremes are an explicit house rule, unlike attack/death rolls.
 * Forced failures (conditions or willing targets) take precedence. */
export function savingThrowPassed(d20: number, total: number, dc: number,
  options: { naturalExtremes?: boolean; forceFailure?: boolean } = {}): boolean {
  if (options.forceFailure) return false;
  if (options.naturalExtremes && d20 === 1) return false;
  if (options.naturalExtremes && d20 === 20) return true;
  return total >= dc;
}

/** v2.821: upkeep saves share physical dice selection and retain every face. */
export function rollSavingThrow(bonus:number,dc:number,options:{advantage?:boolean;disadvantage?:boolean;naturalExtremes?:boolean;forceFailure?:boolean}={}){
 const event={dieType:20,result:0,advantage:options.advantage,disadvantage:options.disadvantage};
 const dice=options.forceFailure?[]:physicalDiceList(event).map(d=>({...d,value:rollDie(20)}));
 const d20=options.forceFailure?1:physicalDiceOutcome(event,dice).total;
 const total=d20+bonus;
 return {d20,total,rolls:dice.map(d=>d.value),passed:savingThrowPassed(d20,total,dc,options)};
}
