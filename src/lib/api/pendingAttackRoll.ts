import type {PendingAttack} from '../../types';
import {readAttackRollSnapshot,type AttackRollSnapshot} from '../../rules/attackRollSnapshot';
import {psionicRpc,PsionicRequestError} from './psionicTurns';
export interface AttackRollHistory {
 advantageState:'normal'|'advantage'|'disadvantage';d20Alt:number|null;exhaustionLevel:number;
 buffContributions:{key:string;name:string;source:string;dice:string;rolls:number[];total:number}[];
}
/** v2.869: retry the identical roll; the server returns the winner if another
 * caller recorded this attack first. Never publish the losing dice as history. */
export async function recordPendingAttackRoll(attack:PendingAttack,snapshot:AttackRollSnapshot,expectedBuffs:unknown,history:AttackRollHistory):Promise<{attack:PendingAttack;replayed:boolean}>{
 const input=structuredClone({attack,snapshot,expectedBuffs,history});
 if(!readAttackRollSnapshot(input.snapshot)||input.snapshot.attackId!==attack.id||input.snapshot.campaignId!==attack.campaign_id
  ||input.snapshot.encounterId!==attack.encounter_id||input.snapshot.attackerId!==attack.attacker_participant_id||input.snapshot.targetId!==attack.target_participant_id
  ||typeof attack.updated_at!=='string'||!Number.isFinite(Date.parse(attack.updated_at)))throw new PsionicRequestError('Invalid attack evidence. No roll was sent.',true);
 const value=await psionicRpc('record_pending_attack_roll_with_history',{p_attack_id:input.attack.id,p_expected_updated_at:input.attack.updated_at,p_snapshot:input.snapshot,p_expected_buffs:input.expectedBuffs,p_history:input.history},true) as {attack?:PendingAttack;replayed?:boolean}|null;
 const a=value?.attack,s=readAttackRollSnapshot(a?.attack_roll_snapshot);
 if(!a||!s||a.id!==input.attack.id||a.campaign_id!==input.attack.campaign_id||s.attackId!==a.id||s.campaignId!==a.campaign_id
  ||!['attack_rolled','damage_rolled','applied'].includes(a.state)||typeof value?.replayed!=='boolean')throw new PsionicRequestError('Attack roll could not be confirmed. Refresh this attack before retrying.',false);
 if(!value.replayed&&(Object.keys(input.snapshot).some(k=>s[k as keyof AttackRollSnapshot]!==input.snapshot[k as keyof AttackRollSnapshot])
  ||a.attack_d20!==s.d20||a.attack_total!==s.total||a.target_ac!==s.targetAC||a.hit_result!==s.result))throw new PsionicRequestError('Saved attack differs from the submitted roll. Refresh this attack.',false);
 return {attack:a,replayed:value.replayed};
}
