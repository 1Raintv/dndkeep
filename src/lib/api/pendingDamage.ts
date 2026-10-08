import type {PendingAttack} from '../../types';
import {readDamageComponents,type DamageComponentRecord} from '../../rules/damageComponents';
import {psionicRpc,PsionicRequestError} from './psionicTurns';
export const DAMAGE_EXPECTED_KEYS=['state','attack_kind','attack_source','hit_result','save_result','save_success_effect','damage_dice','damage_type','damage_group_id','attacker_participant_id','target_participant_id','pending_lr_decision'] as const;
export interface PendingDamageRecord {attack:PendingAttack;rolls:number[];raw:number;final:number;components:DamageComponentRecord;expectedBuffs:unknown}
export async function recordPendingDamage(input:PendingDamageRecord):Promise<{attack:PendingAttack;replayed:boolean}>{
 const r=structuredClone(input);if(!Array.isArray(r.rolls)||r.rolls.some(n=>!Number.isSafeInteger(n)||n<1)||!readDamageComponents(r.components)||!Number.isSafeInteger(r.raw)||!Number.isSafeInteger(r.final)||r.final<0)throw new PsionicRequestError('Invalid damage record. No roll was sent.',true);
 const expected=Object.fromEntries(DAMAGE_EXPECTED_KEYS.map(k=>[k,r.attack[k]??null]));
 const value=await psionicRpc('record_pending_damage',{p_attack_id:r.attack.id,p_expected:expected,p_rolls:r.rolls,p_raw:r.raw,p_final:r.final,p_components:r.components,p_expected_buffs:r.expectedBuffs},true) as {attack?:PendingAttack;replayed?:boolean}|null;
 const a=value?.attack;
 if(!a||a.id!==r.attack.id||!['damage_rolled','applied'].includes(a.state)||typeof value?.replayed!=='boolean'||(a.damage_components!==null&&a.damage_components!==undefined&&!readDamageComponents(a.damage_components)))throw new PsionicRequestError('Damage roll could not be confirmed. Refresh this attack; do not create another attack to retry it.',false);
 if(!Number.isSafeInteger(a.damage_raw)||!Number.isSafeInteger(a.damage_final)||Number(a.damage_final)<0||!Array.isArray(a.damage_rolls)||a.damage_rolls.some(n=>!Number.isSafeInteger(n)||n<1))throw new PsionicRequestError('Saved damage values could not be verified. Refresh this attack.',false);
 // A replay may belong to a competing valid roll; return that winner.
 if(!value.replayed&&(a.damage_raw!==r.raw||a.damage_final!==r.final||JSON.stringify(a.damage_rolls)!==JSON.stringify(r.rolls)||!sameComponents(a.damage_components,r.components)))throw new PsionicRequestError('Saved damage differs from the submitted roll. Refresh this attack.',false);
 return {attack:a,replayed:value.replayed};
}

// JSONB may reorder object keys; compare fields and ordered dice, not serialization.
function sameComponents(a:unknown,b:unknown):boolean {
 const left=readDamageComponents(a),right=readDamageComponents(b);
 return !!left&&!!right&&left.components.length===right.components.length&&left.components.every((c,i)=>{const d=right.components[i];return c.key===d.key&&c.source===d.source&&c.label===d.label&&c.damageType===d.damageType&&c.expression===d.expression&&c.modifier===d.modifier&&c.rawTotal===d.rawTotal&&JSON.stringify(c.rolls)===JSON.stringify(d.rolls)&&JSON.stringify(c.dieKinds)===JSON.stringify(d.dieKinds);});
}
