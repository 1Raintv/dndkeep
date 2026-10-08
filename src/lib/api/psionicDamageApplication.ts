import type {PendingAttack,InventoryItem} from '../../types';
import {readPsionicDamageDice} from '../../rules/psionicDamageDice';
import {abilityModifier} from '../../rules/abilities';
import {getEffectiveAbilityScores} from '../attunement';
import {psionicRpc} from './psionicTurns';
import {readConcentrationResult,resolveConcentrationSave} from './concentrationSaves';
interface Application {attack:PendingAttack;replayed:boolean;settlement:{attackId:string;damage:number;characterId:string|null;concentrationCheckId:string|null;concentrationMode:'off'|'prompt'|'auto'}}
function verified(value:unknown,id:string):Application {
 const r=value as Application|null,s=r?.settlement;
 if(!r||r.attack?.id!==id||r.attack.state!=='applied'||!readPsionicDamageDice(r.attack.psionic_damage_dice)||typeof r.replayed!=='boolean'
  ||!s||s.attackId!==id||!Number.isSafeInteger(s.damage)||s.damage<0||r.attack.damage_final!==s.damage
  ||!(s.characterId===null||typeof s.characterId==='string')||!(s.concentrationCheckId===null||typeof s.concentrationCheckId==='string')
  ||!['off','prompt','auto'].includes(s.concentrationMode))throw new Error('Damage application could not be confirmed. Refresh this attack; do not create another hit.');
 return r;
}
/** v2.844: the attack ID is the idempotency identity. Probe a saved receipt
 * before reading fresh state so even a removed target cannot cause a new hit. */
export async function applyDestructiveThoughtsDamage(attack:PendingAttack):Promise<PendingAttack>{
 let value=await psionicRpc('apply_psionic_pending_damage',{p_attack_id:attack.id},true);
 if(value===null){
  if(attack.state==='applied')return attack; // legacy application predating receipts
  const ctx=await psionicRpc('get_pending_damage_context',{p_attack_id:attack.id},true) as {attack?:PendingAttack;target?:{definitionType:string;definition:Record<string,unknown>}|null};
  if(ctx?.attack?.id!==attack.id)throw new Error('Damage context could not be verified.');
  let modifier=0;
  if(ctx.target?.definitionType==='character'){
   const c=ctx.target.definition;
   const keys=['strength','dexterity','constitution','intelligence','wisdom','charisma'] as const;
   if(!c||!keys.every(k=>Number.isInteger(c[k])&&Number(c[k])>=1&&Number(c[k])<=50)||!(c.inventory==null||Array.isArray(c.inventory)))throw new Error('Target ability scores could not be verified.');
   const scores=Object.fromEntries(keys.map(k=>[k,c[k]])) as Record<typeof keys[number],number>;
   modifier=abilityModifier(getEffectiveAbilityScores(scores,c.inventory as InventoryItem[]|null).constitution);
  }
  value=await psionicRpc('apply_psionic_pending_damage',{p_attack_id:attack.id,p_expected:ctx,p_con_modifier:modifier},true);
 }
 const result=verified(value,attack.id),s=result.settlement;
 if(s.concentrationMode==='auto'&&s.concentrationCheckId&&s.characterId){
  await readConcentrationResult(s.characterId,s.concentrationCheckId)??await resolveConcentrationSave(s.characterId,s.concentrationCheckId,'player');
 }
 return result.attack;
}
