import {psionicRpc} from './psionicTurns';
import {validMutableFormSpec,mutableFormBenefits,type MutableFormSpec} from '../../rules/mutableForm';
export interface ActiveMutableForm extends MutableFormSpec {
 declarationId:string;remainingSeconds:number;wearingArmor:boolean;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** v2.869 — shared read contains no private dice, HP receipt or inventory. Read
 * at resolution time; a cached badge is not proof the duration remains active. */
export async function readActiveMutableForm(characterId:string):Promise<ActiveMutableForm|null> {
 if(!uuid(characterId))throw new Error('Invalid Mutable Form character.');
 const data=await psionicRpc('get_mutable_form_active',{p_character:characterId});
 if(data===null)return null;
 const v=data as Partial<ActiveMutableForm>|undefined;
 if(!validMutableFormSpec(data)||!v||!uuid(v.declarationId)||typeof v.wearingArmor!=='boolean'
  ||!Number.isSafeInteger(v.remainingSeconds)||Number(v.remainingSeconds)<=0||Number(v.remainingSeconds)>data.durationSeconds
  ||Object.keys(data).some(k=>!['declarationId','remainingSeconds','durationSeconds','fleshWeaver','improvement','wearingArmor'].includes(k)))
  throw new Error('Mutable Form effects could not be verified. Refresh before resolving the action.');
 return structuredClone(data) as ActiveMutableForm;
}
export async function readMutableFormBenefits(characterId:string) {
 const form=await readActiveMutableForm(characterId);
 return form?mutableFormBenefits(form,form.wearingArmor):null;
}
