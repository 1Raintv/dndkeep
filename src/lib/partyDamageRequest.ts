import type {Campaign,Character} from '../types';
import {resolveAutomation} from './automations';
import {CONDITION_MAP} from '../data/conditions';
import {concentrationDamageEffect} from '../rules/concentrationSave';
import {abilityModifier} from '../rules/abilities';
import {applyDamageToPools} from '../rules/hp';
import {getEffectiveAbilityScores} from './attunement';
import {applyDamageTypeModifiers,DAMAGE_TYPES,type DamageModifier} from './damageModifiers';
type DamageCharacter=Pick<Character,'id'|'name'|'species'|'strength'|'dexterity'|'constitution'|'intelligence'|'wisdom'|'charisma'|'inventory'|'damage_resistances'|'damage_vulnerabilities'|'damage_immunities'|'concentration_spell'|'hit_point_revision'|'active_conditions'|'automation_overrides'|'advanced_automations_unlocked'>;
export interface PartyDamageContext {
 character:DamageCharacter;campaign:Pick<Campaign,'id'|'automation_defaults'>;
 participant:{id:string;encounter_id:string;combatant_id:string}|null;
 combatant:({id:string;active_conditions:string[]|null}&PartyDamagePools)|null;pools:PartyDamagePools;
}
export interface PartyDamagePools {current_hp:number;max_hp:number;temp_hp:number}
export interface PartyDamageRequest {requestId:string;saveId:string;campaignId:string;characterId:string;amount:number;half:boolean;affinity:DamageModifier;damage:number;damageType:string|null;modifier:number;expected:PartyDamageContext}
export interface PartyDamageReceipt {requestId:string;saveId:string;damage:number;damageType:string|null;beforeHP:number;beforeTempHP:number;afterHP:number;afterTempHP:number;checkId:string|null;concentrationBroken:boolean;automation:'off'|'prompt'|'auto';participantId:string|null;character:PartyDamagePools&{id:string;hit_point_revision:number};replayed:boolean}
export const partyDamageUuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const pools=(v:PartyDamagePools|null|undefined)=>!!v&&[v.current_hp,v.max_hp,v.temp_hp].every(count)&&v.current_hp<=v.max_hp;
export function validPartyDamageContext(value:unknown,campaignId:string,characterId:string):value is PartyDamageContext {
 const v=value as PartyDamageContext|null,c=v?.character,p=v?.participant,b=v?.combatant;
 return !!v&&!!c&&partyDamageUuid(characterId)&&partyDamageUuid(campaignId)&&c.id===characterId&&v.campaign?.id===campaignId
  &&typeof c.name==='string'&&typeof c.species==='string'&&[c.strength,c.dexterity,c.constitution,c.intelligence,c.wisdom,c.charisma].every(n=>count(n)&&n>=1)
  &&count(c.hit_point_revision)&&(c.inventory==null||Array.isArray(c.inventory)&&c.inventory.every(i=>i&&typeof i==='object'))
  &&[c.damage_resistances,c.damage_vulnerabilities,c.damage_immunities,c.active_conditions].every(a=>a==null||Array.isArray(a)&&a.every(t=>typeof t==='string'))
  &&(c.concentration_spell==null||typeof c.concentration_spell==='string')&&pools(v.pools)&&((p===null&&b===null)||(!!p&&!!b&&partyDamageUuid(p.id)&&partyDamageUuid(p.encounter_id)&&p.combatant_id===b.id&&partyDamageUuid(b.id)&&pools(b)&&(b.active_conditions==null||Array.isArray(b.active_conditions)&&b.active_conditions.every(c=>typeof c==='string'))
   &&['current_hp','max_hp','temp_hp'].every(k=>v.pools[k as keyof PartyDamagePools]===b[k as keyof PartyDamagePools])));
}
export function validPartyDamageRequest(value:unknown):value is PartyDamageRequest {
 const r=value as PartyDamageRequest|null;
 return !!r&&partyDamageUuid(r.requestId)&&partyDamageUuid(r.saveId)&&r.requestId!==r.saveId&&count(r.damage)
  &&(r.damageType===null||DAMAGE_TYPES.includes(r.damageType as typeof DAMAGE_TYPES[number]))
  &&count(r.amount)&&r.amount>0&&typeof r.half==='boolean'&&Number.isInteger(r.modifier)&&r.modifier>=-5&&r.modifier<=20&&validPartyDamageContext(r.expected,r.campaignId,r.characterId)
  &&previewPartyDamage(r.expected,r.amount,r.damageType,r.half).final===r.damage&&previewPartyDamage(r.expected,r.amount,r.damageType,r.half).modifier===r.affinity;
}
export function previewPartyDamage(context:PartyDamageContext,amount:number,type:string|null,half:boolean){
 const conditions=context.combatant?(context.combatant.active_conditions??[]):(context.character.active_conditions??[]);
 const adjusted=applyDamageTypeModifiers(half?Math.floor(amount/2):amount,type,context.character,{resistanceAll:conditions.some(c=>CONDITION_MAP[c]?.resistanceAll)});
 const applied=applyDamageToPools(context.pools.current_hp,context.pools.temp_hp,adjusted.final);
 const automation=resolveAutomation('concentration_on_damage',context.character,context.campaign);
 const concentration=concentrationDamageEffect(adjusted.final,applied.hpAfter,!!context.character.concentration_spell,conditions.some(c=>CONDITION_MAP[c]?.concentrationBreaks),automation);
 return {...adjusted,...applied,automation,concentration};
}
export function createPartyDamageRequest(context:PartyDamageContext,amount:number,type:string|null,half:boolean):PartyDamageRequest {
 if(!count(amount)||amount===0||!validPartyDamageContext(context,context.campaign.id,context.character.id))throw new Error('Refresh the damage preview before applying.');
 const expected=structuredClone(context),preview=previewPartyDamage(expected,amount,type,half),damage=preview.final;
 const modifier=abilityModifier(getEffectiveAbilityScores(expected.character,expected.character.inventory).constitution);
 const request={requestId:crypto.randomUUID(),saveId:crypto.randomUUID(),campaignId:context.campaign.id,characterId:context.character.id,amount,half,affinity:preview.modifier,damage,damageType:type,modifier,expected};
 if(!validPartyDamageRequest(request))throw new Error('The damage amount or character could not be verified.');return request;
}
export function verifyPartyDamageReceipt(value:unknown,r:PartyDamageRequest):PartyDamageReceipt {
 const v=value as PartyDamageReceipt|null,c=v?.character,expected=applyDamageToPools(r.expected.pools.current_hp,r.expected.pools.temp_hp,r.damage);
 if(!v||v.requestId!==r.requestId||v.saveId!==r.saveId||v.damage!==r.damage||v.damageType!==r.damageType||typeof v.replayed!=='boolean'
  ||v.beforeHP!==r.expected.pools.current_hp||v.beforeTempHP!==r.expected.pools.temp_hp||v.afterHP!==expected.hpAfter||v.afterTempHP!==expected.tempAfter
  ||!(v.checkId===null||v.checkId===r.saveId)||typeof v.concentrationBroken!=='boolean'||!['off','prompt','auto'].includes(v.automation)
  ||v.participantId!==(r.expected.participant?.id??null)||!c||c.id!==r.characterId||!pools(c)||!count(c.hit_point_revision)
  ||c.hit_point_revision<r.expected.character.hit_point_revision!)throw new Error('Damage was not confirmed. Keep the saved damage and confirm it again.');
 const preview=previewPartyDamage(r.expected,r.amount,r.damageType,r.half);
 if(v.concentrationBroken!==(preview.concentration.kind==='ends')||v.automation!==preview.automation||v.checkId!==(preview.concentration.kind==='save'?r.saveId:null))throw new Error('The concentration check could not be verified. Keep the saved damage.');
 return {...v,character:{id:c.id,current_hp:c.current_hp,max_hp:c.max_hp,temp_hp:c.temp_hp,hit_point_revision:c.hit_point_revision}};
}
export const damageModifierLabel:Record<DamageModifier,string>={none:'',resistant:'resistant',vulnerable:'vulnerable',immune:'immune','resistant-vulnerable':'resistance then vulnerability'};
