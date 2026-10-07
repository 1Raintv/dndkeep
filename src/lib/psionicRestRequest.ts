import type {Character} from '../types';
export const SHORT_REST_FIELDS=['spell_slots','class_resources','feature_uses'] as const;
export const LONG_REST_FIELDS=['current_hp','temp_hp','spell_slots','active_conditions','exhaustion_level','death_saves_successes','death_saves_failures','hit_dice_spent','class_resources','feature_uses','inventory','concentration_spell','concentration_rounds_remaining','concentration_slot_level'] as const;
const CONTEXT_FIELDS=['class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'] as const;
export interface PsionicRestRequest {
 requestId:string;restKind:'short'|'long';sourceFeature:'Short Rest'|'Long Rest';
 expected:Record<string,unknown>;updates:Record<string,unknown>;recoveryNote?:string;
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** v2.784 — freeze the entire rest, including item recharge rolls, before any
 * request is sent. Retries must never recalculate recovery from a newer sheet. */
export function createPsionicRestRequest(character:Character,restKind:'short'|'long',updates:Partial<Character>,requestId:string):PsionicRestRequest{
 const fields=restKind==='short'?SHORT_REST_FIELDS:LONG_REST_FIELDS;
 const expected=Object.fromEntries([...fields,...CONTEXT_FIELDS].map(key=>[key,character[key]??null]));
 const request=JSON.parse(JSON.stringify({requestId,restKind,sourceFeature:restKind==='short'?'Short Rest':'Long Rest',expected,updates})) as PsionicRestRequest;
 if(!validPsionicRestRequest(request))throw new Error('Incomplete rest recovery. No rest request was sent.');
 return request;
}
export function validPsionicRestRequest(value:unknown):value is PsionicRestRequest{
 if(!object(value)||typeof value.requestId!=='string'||!value.requestId||!['short','long'].includes(String(value.restKind)))return false;
 if(value.sourceFeature!==(value.restKind==='short'?'Short Rest':'Long Rest')||!object(value.expected)||!object(value.updates))return false;
 const fields=value.restKind==='short'?SHORT_REST_FIELDS:LONG_REST_FIELDS;
 const has=(record:Record<string,unknown>,key:string)=>Object.prototype.hasOwnProperty.call(record,key);
 const expected=value.expected,updates=value.updates;
 return Object.keys(updates).length===fields.length&&fields.every(key=>has(updates,key))
  &&Object.keys(expected).length===fields.length+CONTEXT_FIELDS.length&&[...fields,...CONTEXT_FIELDS].every(key=>has(expected,key))
  &&object(updates.class_resources)&&object(updates.feature_uses)
  &&(value.recoveryNote===undefined||(typeof value.recoveryNote==='string'&&value.recoveryNote.length<=1000));
}
