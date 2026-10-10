export type AdvantageState='advantage'|'disadvantage'|'normal';
export interface AttackCondition {name:string;attackDisadvantage?:boolean;attackAdvantageReceived?:boolean}
export interface AttackAdvantageSources {adv?:boolean;dis?:boolean}
/** v2.869 — retain both flags until ALL conditions and mastery effects are
 * known. A cancelled pair is not an absence of sources: adding another source
 * cannot undo that cancellation (2024 SRD, Advantage/Disadvantage). */
export function attackAdvantage(attacker:readonly AttackCondition[],target:readonly AttackCondition[],distanceCells:number,additional:AttackAdvantageSources={}):AdvantageState{
 let adv=additional.adv===true,dis=additional.dis===true;
 for(const c of attacker){
  if(c.attackDisadvantage)dis=true;
  if(c.name==='Invisible')adv=true;
 }
 for(const c of target){
  if(c.name==='Prone'){
   if(distanceCells<=1)adv=true;else dis=true;
  }else if(c.attackAdvantageReceived)adv=true;
  if(c.name==='Invisible')dis=true;
 }
 return adv===dis?'normal':adv?'advantage':'disadvantage';
}
