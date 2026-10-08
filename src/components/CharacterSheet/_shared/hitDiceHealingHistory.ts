import {shortRestHealing} from '../../../rules/restRecovery';
/** v2.798 — the transaction writes both legacy and unified history. Only a
 * verified matching request identity may hide its legacy mirror. */
export function formatHitDiceHealingEvent(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const p=value as Record<string,unknown>;
 if(p.source!=='Hit Dice'||typeof p.requestId!=='string'||!p.requestId||typeof p.hitDie!=='number'||![6,8,10,12].includes(p.hitDie)
  ||!Array.isArray(p.rolls)||p.rolls.length<1||p.rolls.length>20||!p.rolls.every(n=>Number.isInteger(n)&&n>=1&&n<=Number(p.hitDie))
  ||typeof p.constitutionModifier!=='number'||!Number.isInteger(p.constitutionModifier)||p.constitutionModifier< -5||p.constitutionModifier>10
  ||p.healing!==shortRestHealing(p.rolls,p.constitutionModifier)
  ||![p.gained,p.old_hp,p.new_hp].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=1)
  ||Number(p.gained)>Number(p.healing)||Number(p.new_hp)!==Number(p.old_hp)+Number(p.gained))return null;
 const con=p.constitutionModifier;
 return {requestId:p.requestId,title:'Short Rest: Hit Dice',detail:`Spent ${p.rolls.length}d${p.hitDie} · Rolls ${p.rolls.join(', ')} · CON ${con>=0?'+':''}${con} per die · Restored ${p.gained} HP (${p.old_hp} → ${p.new_hp})${p.gained!==p.healing?` · ${p.healing} HP rolled`:''}`};
}
export function mirroredHitDiceHealingRequests(rows:readonly {event_type?:unknown;payload?:unknown}[]){
 const requests=new Set<string>();for(const row of rows){if(row.event_type!=='healing_applied')continue;const event=formatHitDiceHealingEvent(row.payload);if(event)requests.add(event.requestId);}return requests;
}
