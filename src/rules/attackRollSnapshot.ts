import {attackRollOutcome,type AttackRollOutcome,type AttackRollEvidence} from './attackRollOutcome';
export interface AttackRollSnapshot extends Required<AttackRollEvidence> {
 version:1;attackId:string;campaignId:string;encounterId:string|null;attackerId:string|null;targetId:string|null;result:AttackRollOutcome;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** v2.869 — never infer original critical rules from a mutable hit_result. */
export function readAttackRollSnapshot(value:unknown):AttackRollSnapshot|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const s=value as AttackRollSnapshot;
 if(s.version!==1||!uuid(s.attackId)||!uuid(s.campaignId)||![s.encounterId,s.attackerId,s.targetId].every(v=>v===null||uuid(v))
  ||typeof s.naturalOneAutoFails!=='boolean'||typeof s.criticalOnHit!=='boolean'||!['none','success','failure'].includes(s.automatic)
  ||!['hit','miss','crit','fumble'].includes(s.result)||attackRollOutcome(s)!==s.result)return null;
 return {...s};
}
