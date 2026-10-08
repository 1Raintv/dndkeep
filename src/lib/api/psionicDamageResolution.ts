import type {PendingAttack} from '../../types';
import {readPsionicDamageDice} from '../../rules/psionicDamageDice';
import {psionicRpc} from './psionicTurns';
import {finishPsionicDamageApplication,psionicTargetConModifier} from './psionicDamageApplication';
export interface PsionicDamageChoice {activationId?:string;dieIndex?:number;affinity?:'normal'|'resistant'|'immune'|'vulnerable'|'resistant-vulnerable';amount?:number}
export interface PsionicDamagePlan {
 context:{attack:PendingAttack;target?:{definitionType:string;definition:Record<string,unknown>}|null};choice:PsionicDamageChoice;
 activations:{id:string;total:number}[];usedThisTurn:boolean;pendingActivation:boolean;defensesKnown:boolean;
 immune:boolean;resistant:boolean;vulnerable:boolean;bypass:boolean;damageBefore:number;damageAfter:number|null;
 replacement:{activationId:string;dieIndex:number;original:number;replacement:number}|null;turnId:string;attackerCharacterId:string|null;
}
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=2147483647;
export function validPsionicDamagePlan(value:unknown,id:string):value is PsionicDamagePlan {
 const p=value as PsionicDamagePlan|null;
 return !!p&&p.context?.attack?.id===id&&!!readPsionicDamageDice(p.context.attack.psionic_damage_dice)
  &&!!p.choice&&typeof p.choice==='object'&&Array.isArray(p.activations)&&p.activations.every(a=>typeof a.id==='string'&&integer(a.total)&&a.total>=1&&a.total<=36)
  &&[p.usedThisTurn,p.pendingActivation,p.defensesKnown,p.immune,p.resistant,p.vulnerable,p.bypass].every(v=>typeof v==='boolean')
  &&integer(p.damageBefore)&&(p.damageAfter===null||integer(p.damageAfter))&&typeof p.turnId==='string'
  &&(p.attackerCharacterId===null||typeof p.attackerCharacterId==='string')
  &&(p.replacement===null||typeof p.replacement.activationId==='string'&&integer(p.replacement.dieIndex)&&integer(p.replacement.original)&&p.replacement.original>=1&&integer(p.replacement.replacement)&&p.replacement.replacement>=1&&p.replacement.replacement<=36);
}
export async function previewPsionicDamage(id:string,choice:PsionicDamageChoice={}):Promise<PsionicDamagePlan>{
 const result=await psionicRpc('preview_psionic_damage',{p_attack_id:id,p_choice:choice},true);
 if(!validPsionicDamagePlan(result,id))throw new Error('The Psychic damage preview could not be verified.');return result;
}
export async function applyPsionicDamagePlan(plan:PsionicDamagePlan):Promise<PendingAttack>{
 plan=structuredClone(plan);
 const id=plan.context.attack.id;
 if(!validPsionicDamagePlan(plan,id))throw new Error('Refresh the Psychic damage preview before applying.');
 // Probe the existing attack receipt before touching mutable targets or turns.
 const saved=await psionicRpc('apply_psionic_pending_damage',{p_attack_id:id},true);
 if(saved!==null)return finishPsionicDamageApplication(saved,id);
 if(plan.damageAfter===null)throw new Error('Review Psychic defenses and finish any pending Sharpened roll.');
 const value=await psionicRpc('apply_psionic_damage_resolution',{p_attack_id:id,p_expected:plan,p_con_modifier:psionicTargetConModifier(plan.context)},true);
 return finishPsionicDamageApplication(value,id);
}
