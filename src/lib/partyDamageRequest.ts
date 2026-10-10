import {rollSaveBonuses,validSaveBonusRolls,type SaveBonusRoll} from '../rules/saveBonuses';
import {computeActiveBonuses} from './gameUtils';
import {legacySavedSpeciesResistances} from '../rules/speciesResistances';
import type {Campaign,Character} from '../types';
import {resolveAutomation} from './automations';
import {CONDITION_MAP} from '../data/conditions';
import {concentrationDamageEffect} from '../rules/concentrationSave';
import {abilityModifier} from '../rules/abilities';
import {applyDamageToPools} from '../rules/hp';
import {getEffectiveAbilityScores} from './attunement';
import {applyDamageTypeModifiers,DAMAGE_TYPES,type DamageModifier} from './damageModifiers';
type DamageCharacter=Pick<Character,'id'|'name'|'species'|'species_choices'|'strength'|'dexterity'|'constitution'|'intelligence'|'wisdom'|'charisma'|'inventory'|'damage_resistances'|'damage_vulnerabilities'|'damage_immunities'|'concentration_spell'|'hit_point_revision'|'active_conditions'|'automation_overrides'|'advanced_automations_unlocked'|'active_buffs'|'exhaustion_level'>;
export interface PartyDamageContext {
 character:DamageCharacter;campaign:Pick<Campaign,'id'|'automation_defaults'>;
 participant:{id:string;encounter_id:string;combatant_id:string}|null;
 combatant:({id:string;active_conditions:string[]|null;active_buffs?:unknown[]|null;exhaustion_level?:number|null}&PartyDamagePools)|null;pools:PartyDamagePools;
}
export interface PartyDamagePools {current_hp:number;max_hp:number;temp_hp:number}
export interface PartyDamageRequest {affinityRules?:2;requestId:string;saveId:string;campaignId:string;characterId:string;amount:number;half:boolean;affinity:DamageModifier;damage:number;damageType:string|null;modifier:number;baseModifier?:number;effectRolls?:SaveBonusRoll[];expected:PartyDamageContext}
export interface PartyDamageReceipt {requestId:string;saveId:string;damage:number;damageType:string|null;beforeHP:number;beforeTempHP:number;afterHP:number;afterTempHP:number;checkId:string|null;concentrationBroken:boolean;automation:'off'|'prompt'|'auto';participantId:string|null;character:PartyDamagePools&{id:string;hit_point_revision:number};replayed:boolean}
export const partyDamageUuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const pools=(v:PartyDamagePools|null|undefined)=>!!v&&[v.current_hp,v.max_hp,v.temp_hp].every(count)&&v.current_hp<=v.max_hp;
const saveTraits=(v:{active_buffs?:unknown;exhaustion_level?:unknown})=>(v.active_buffs==null||Array.isArray(v.active_buffs))&&(v.exhaustion_level==null||Number.isInteger(v.exhaustion_level)&&Number(v.exhaustion_level)>=0&&Number(v.exhaustion_level)<=6);
export function validPartyDamageContext(value:unknown,campaignId:string,characterId:string):value is PartyDamageContext {
 const v=value as PartyDamageContext|null,c=v?.character,p=v?.participant,b=v?.combatant;
 return !!v&&!!c&&partyDamageUuid(characterId)&&partyDamageUuid(campaignId)&&c.id===characterId&&v.campaign?.id===campaignId
  &&saveTraits(c)&&(!b||saveTraits(b))&&typeof c.name==='string'&&typeof c.species==='string'&&[c.strength,c.dexterity,c.constitution,c.intelligence,c.wisdom,c.charisma].every(n=>count(n)&&n>=1)
  &&count(c.hit_point_revision)&&(c.inventory==null||Array.isArray(c.inventory)&&c.inventory.every(i=>i&&typeof i==='object'))
  &&[c.damage_resistances,c.damage_vulnerabilities,c.damage_immunities,c.active_conditions].every(a=>a==null||Array.isArray(a)&&a.every(t=>typeof t==='string'))
  &&(c.concentration_spell==null||typeof c.concentration_spell==='string')&&pools(v.pools)&&((p===null&&b===null)||(!!p&&!!b&&partyDamageUuid(p.id)&&partyDamageUuid(p.encounter_id)&&p.combatant_id===b.id&&partyDamageUuid(b.id)&&pools(b)&&(b.active_conditions==null||Array.isArray(b.active_conditions)&&b.active_conditions.every(c=>typeof c==='string'))
   &&['current_hp','max_hp','temp_hp'].every(k=>v.pools[k as keyof PartyDamagePools]===b[k as keyof PartyDamagePools])));
}
export function validPartyDamageRequest(value:unknown):value is PartyDamageRequest {
 const r=value as PartyDamageRequest|null;
 return !!r&&partyDamageUuid(r.requestId)&&partyDamageUuid(r.saveId)&&r.requestId!==r.saveId&&count(r.damage)
  &&(r.damageType===null||DAMAGE_TYPES.includes(r.damageType as typeof DAMAGE_TYPES[number]))
  &&count(r.amount)&&r.amount>0&&typeof r.half==='boolean'&&Number.isInteger(r.modifier)&&r.modifier>=-105&&r.modifier<=120&&validPartyDamageContext(r.expected,r.campaignId,r.characterId)
  &&(r.effectRolls===undefined&&r.baseModifier===undefined||validSaveBonusRolls(r.effectRolls)&&Number.isSafeInteger(r.baseModifier)&&r.modifier===r.baseModifier!+r.effectRolls.reduce((sum,x)=>sum+x.total,0))
  &&(r.affinityRules===undefined||r.affinityRules===2)
  &&savedDamagePreview(r).final===r.damage&&savedDamagePreview(r).modifier===r.affinity;
}
// Saved requests predate the corrected species rules. Preserve their exact math
// for receipt replay/cancellation; a new application still requires a current DB snapshot.
function savedDamagePreview(r:PartyDamageRequest){
 if(r.affinityRules===2)return previewPartyDamage(r.expected,r.amount,r.damageType,r.half);
 const c=r.expected.character;
 const legacy={...r.expected,character:{...c,species:'',damage_resistances:[...(c.damage_resistances??[]),...legacySavedSpeciesResistances(c.species)]}};
 return previewPartyDamage(legacy,r.amount,r.damageType,r.half);
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
 const equipment=computeActiveBonuses([],expected.character.inventory??[]).saveBonus;
 if(!Number.isSafeInteger(equipment))throw new Error('Review equipment saving throw bonuses.');
 const baseModifier=abilityModifier(getEffectiveAbilityScores(expected.character,expected.character.inventory).constitution)+equipment;
 const buffs=expected.combatant?expected.combatant.active_buffs??[]:expected.character.active_buffs??[];
 // v2.869: persist effect dice with the damage request, but never roll for an
 // immune hit, broken concentration, or automation-off preview.
 const effects=rollSaveBonuses(preview.concentration.kind==='save'?buffs:[],0),modifier=baseModifier+effects.bonus;
 const request={affinityRules:2 as const,requestId:crypto.randomUUID(),saveId:crypto.randomUUID(),campaignId:context.campaign.id,characterId:context.character.id,amount,half,affinity:preview.modifier,damage,damageType:type,modifier,baseModifier,effectRolls:effects.rolls,expected};
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
