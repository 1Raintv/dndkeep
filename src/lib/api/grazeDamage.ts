import type {PendingAttack} from '../../types';
import {readDamageComponents} from '../../rules/damageComponents';
import {psionicRpc} from './psionicTurns';
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
