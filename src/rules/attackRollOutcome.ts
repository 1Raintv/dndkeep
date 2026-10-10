export type AttackRollOutcome='hit'|'miss'|'crit'|'fumble';
export interface AttackRollEvidence {
 d20:number;total:number;targetAC:number;
 naturalOneAutoFails?:boolean;
 /** Paralysis/unconsciousness makes a hit critical; it does not ensure a hit. */
 criticalOnHit?:boolean;
 /** Total cover forces failure; an explicit automatic hit bypasses AC. */
 automatic?:'none'|'success'|'failure';
}
/** v2.869 — one calculation for attack resolution and numerical reactions.
 * Callers capture rules/conditions with the original roll, not after a reaction.
 * Unknown evidence must not silently become an AC of 10 or a successful hit. */
export function attackRollOutcome({d20,total,targetAC,naturalOneAutoFails=true,criticalOnHit=false,automatic='none'}:AttackRollEvidence):AttackRollOutcome|null {
 if(!Number.isInteger(d20)||d20<1||d20>20||!Number.isSafeInteger(total)||!Number.isSafeInteger(targetAC)
  ||typeof naturalOneAutoFails!=='boolean'||typeof criticalOnHit!=='boolean'||!['none','success','failure'].includes(automatic))return null;
 if(automatic==='failure')return 'miss';
 if(automatic==='success')return criticalOnHit||d20===20?'crit':'hit';
 if(d20===20)return 'crit';
 if(d20===1&&naturalOneAutoFails)return 'fumble';
 if(total<targetAC)return 'miss';
 return criticalOnHit?'crit':'hit';
}
