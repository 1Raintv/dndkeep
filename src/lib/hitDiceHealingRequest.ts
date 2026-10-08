import type {Character} from '../types';
import type {HitDie} from '../rules/hitDice';
const fields=['current_hp','max_hp','hit_point_revision','psionic_hit_dice_revision','constitution','inventory'] as const;
export interface HitDiceHealingRequest {
 requestId:string;sourceFeature:'Hit Dice healing';hitDie:HitDie;rolls:number[];
 constitutionModifier:number;expected:Record<string,unknown>;recoveryNote?:string;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
/** v2.798 — freeze the roll and the equipment/stat snapshot before sending.
 * Recovery must confirm this request, never recalculate a new healing roll. */
export function createHitDiceHealingRequest(character:Character,hitDie:HitDie,rolls:readonly number[],constitutionModifier:number,requestId:string):HitDiceHealingRequest{
 const expected=Object.fromEntries(fields.map(key=>[key,character[key]??null]));
 const request=JSON.parse(JSON.stringify({requestId,sourceFeature:'Hit Dice healing',hitDie,rolls,constitutionModifier,expected})) as HitDiceHealingRequest;
 if(!validHitDiceHealingRequest(request))throw new Error('Healing could not be prepared. Reload the sheet before rolling Hit Dice.');
 return request;
}
export function validHitDiceHealingRequest(value:unknown):value is HitDiceHealingRequest{
 if(!object(value)||typeof value.requestId!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(value.requestId)||value.sourceFeature!=='Hit Dice healing'
  ||![6,8,10,12].includes(Number(value.hitDie))||!integer(value.hitDie,6,12)
  ||!Array.isArray(value.rolls)||value.rolls.length<1||value.rolls.length>20||!value.rolls.every(n=>integer(n,1,Number(value.hitDie)))
  ||!integer(value.constitutionModifier,-5,10)||!object(value.expected)
  ||(value.recoveryNote!==undefined&&(typeof value.recoveryNote!=='string'||value.recoveryNote.length>1000)))return false;
 const e=value.expected;
 return Object.keys(e).length===fields.length&&fields.every(key=>Object.prototype.hasOwnProperty.call(e,key))
  &&integer(e.current_hp,1)&&integer(e.max_hp,1)&&Number(e.current_hp)<Number(e.max_hp)
  &&integer(e.hit_point_revision,0)&&integer(e.psionic_hit_dice_revision,0)&&integer(e.constitution,0)
  &&(e.inventory===null||Array.isArray(e.inventory));
}
