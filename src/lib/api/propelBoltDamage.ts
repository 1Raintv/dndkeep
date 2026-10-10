import type {PendingAttack} from '../../types';
import {psionicRpc} from './psionicTurns';
import {psionicTargetConModifier,finishDamageConcentration} from './psionicDamageApplication';
const invalid=()=>new Error('Bolt damage could not be confirmed. Resume the original attack; do not create another hit.');
export async function applyPropelBoltDamage(attack:PendingAttack):Promise<PendingAttack>{
 let value=await psionicRpc('apply_propel_bolt_damage',{p_attack_id:attack.id},true);
 if(value===null){
  const ctx=await psionicRpc('get_pending_damage_context',{p_attack_id:attack.id},true) as {attack?:PendingAttack;target?:{definitionType:string;definition:Record<string,unknown>}|null};
  if(ctx?.attack?.id!==attack.id)throw invalid();
  value=await psionicRpc('apply_propel_bolt_damage',{p_attack_id:attack.id,p_expected:ctx,p_con_modifier:psionicTargetConModifier(ctx)},true);
 }
 const r=value as {attack:PendingAttack;replayed:boolean;settlement:{attackId:string;damage:number;characterId:string|null;concentrationCheckId:string|null;concentrationMode:string}}|null;
 const s=r?.settlement;
 if(!r||r.attack?.id!==attack.id||r.attack.state!=='applied'||r.attack.attack_kind!=='auto_hit'||r.attack.attack_source!=='ability'||r.attack.attack_name!=='Telekinetic Bolt'||r.attack.damage_type?.toLowerCase()!=='force'||typeof r.replayed!=='boolean'
  ||!s||s.attackId!==attack.id||!Number.isSafeInteger(s.damage)||s.damage<0||r.attack.damage_final!==s.damage
  ||!(s.characterId===null||typeof s.characterId==='string')||!(s.concentrationCheckId===null||typeof s.concentrationCheckId==='string')||!['off','prompt','auto'].includes(s.concentrationMode))throw invalid();
 await finishDamageConcentration(s);return r.attack;
}
