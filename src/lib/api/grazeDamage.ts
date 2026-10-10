import type {PendingAttack} from '../../types';
import {readDamageComponents} from '../../rules/damageComponents';
import {psionicRpc} from './psionicTurns';
import {psionicTargetConModifier,finishDamageConcentration} from './psionicDamageApplication';
/** First stage only: records the optional Graze choice after attack reactions.
 * HP is deliberately unchanged here; final application must settle atomically. */
export async function recordGrazeDamage(attack:PendingAttack,useGraze:boolean):Promise<PendingAttack>{
 const value=await psionicRpc('record_graze_damage',{p_attack_id:attack.id,p_expected:structuredClone(attack),p_use_graze:useGraze},true) as {attack?:PendingAttack;replayed?:boolean}|null;
 const saved=value?.attack,components=readDamageComponents(saved?.damage_components);
 const raw=useGraze?Math.max(0,attack.attack_ability_modifier??NaN):0;
 if(!saved||saved.id!==attack.id||!['damage_rolled','applied'].includes(saved.state)||typeof value?.replayed!=='boolean'
  ||saved.graze_resolution_version!==1||saved.attack_kind!=='attack_roll'||!['miss','fumble'].includes(saved.hit_result??'')
  ||saved.attack_ability_modifier!==attack.attack_ability_modifier||!Number.isSafeInteger(raw)||saved.damage_raw!==raw
  ||!Number.isSafeInteger(saved.damage_final)||Number(saved.damage_final)<0||!Array.isArray(saved.damage_rolls)||saved.damage_rolls.length!==0
  ||!components||components.components.length!==(useGraze?1:0))throw new Error('Graze damage could not be confirmed. Refresh this attack before continuing.');
 if(useGraze){const c=components.components[0];
  if(c.key!=='base'||c.source!=='base'||c.label!=='Graze'||c.rawTotal!==raw||c.modifier!==raw||c.expression!==String(raw)
   ||c.damageType!==attack.damage_type?.trim().toLowerCase()||c.rolls.length!==0)throw new Error('Saved Graze damage differs from the chosen ability modifier.');
 }
 return saved;
}

export interface GrazeDefenseReview {immune:boolean;resistant:boolean;vulnerable:boolean;note:string}
export interface GrazeDamageContext {attack:PendingAttack;target?:{definitionType:string;definition:Record<string,unknown>}|null}
export async function readGrazeDamageContext(attackId:string):Promise<GrazeDamageContext>{
 const ctx=await psionicRpc('get_pending_damage_context',{p_attack_id:attackId},true) as GrazeDamageContext;
 if(ctx?.attack?.id!==attackId)throw new Error('Graze target could not be confirmed. Refresh this attack.');return ctx;
}
/** Resume a committed receipt before looking up current target state. */
export async function applyGrazeDamage(attack:PendingAttack,review?:{decision:GrazeDefenseReview;context:GrazeDamageContext}):Promise<PendingAttack>{
 const reviewed=review?structuredClone(review):undefined;
 let value=await psionicRpc('apply_graze_damage',{p_attack_id:attack.id},true);
 if(value===null){
  // Bind a manual ruling to the exact defenses the DM inspected, not a fresh
  // context that could silently validate an old ruling against changed data.
  const ctx=reviewed?.context??await readGrazeDamageContext(attack.id);
  if(ctx?.attack?.id!==attack.id)throw new Error('Graze target could not be confirmed. Refresh this attack.');
  value=await psionicRpc('apply_graze_damage',{p_attack_id:attack.id,p_expected:ctx,p_con_modifier:psionicTargetConModifier(ctx),p_defense_review:reviewed?.decision??null},true);
 }
 const r=value as {attack:PendingAttack;replayed:boolean;settlement:{attackId:string;damage:number;characterId:string|null;concentrationCheckId:string|null;concentrationMode:string}}|null;
 const saved=r?.attack,s=r?.settlement;
 if(!saved||saved.id!==attack.id||saved.state!=='applied'||saved.graze_resolution_version!==1||saved.attack_kind!=='attack_roll'
  ||!['miss','fumble'].includes(saved.hit_result??'')||typeof r?.replayed!=='boolean'||!s||s.attackId!==attack.id
  ||!Number.isSafeInteger(s.damage)||s.damage<0||saved.damage_final!==s.damage
  ||!(s.characterId===null||typeof s.characterId==='string')||!(s.concentrationCheckId===null||typeof s.concentrationCheckId==='string')
  ||!['off','prompt','auto'].includes(s.concentrationMode))throw new Error('Graze application could not be confirmed. Resume this attack; do not apply another hit.');
 await finishDamageConcentration(s);return saved;
}
