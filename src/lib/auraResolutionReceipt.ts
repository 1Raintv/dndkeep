import {auraDamageEvidence,validAuraDamagePools} from '../rules/auraDamageEvidence';
import {validAuraSaveEvidence} from '../rules/auraSaveEvidence';
import {concentrationDamageEffect} from '../rules/concentrationSave';
import {CONDITION_MAP} from '../data/conditions';
import {resolveAutomation,type AutomationValue} from './automations';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(uuid)&&new Set(v).size===v.length;
function concentrationSetting(value:unknown):Record<string,AutomationValue>{
 const mode=object(value)?value.concentration_on_damage:null;
 return mode==='off'||mode==='prompt'||mode==='auto'?{concentration_on_damage:mode}:{};
}
const invalid=()=>new Error('Aura resolution could not be verified. Keep the saved request for review.');
export interface AuraResolutionReceipt {
 requestId:string;encounterId:string;turnId:string;originId:string;targetId:string;auraKey:string;
 save:ReturnType<typeof auraDamageEvidence>['save'];penalty:Record<string,unknown>;
 acceptedResistance:boolean;passed:boolean;damage:number;damageResult:Record<string,unknown>|null;marker:string;replayed:boolean;
}
/** v2.869: receipt verification uses the original request, including when a
 * different browser won. Returned HP is historical and must not patch stores.
 * The authorized RPC remains responsible for geometry and reviewed modifiers. */
export function verifyAuraResolutionReceipt(expected:unknown,proposal:unknown,requestId:string,value:unknown):AuraResolutionReceipt {
 if(!uuid(requestId)||!object(expected)||!object(proposal)||!object(value)||!object(value.penalty)
  ||!object(expected.origin)||!object(expected.origin.participant)||!object(expected.target)||!object(expected.target.participant)
  ||!object(expected.target.combatant)||!object(expected.aura)||!object(expected.aura.aura)||!object(expected.save))throw invalid();
 const origin=expected.origin.participant,target=expected.target.participant,spec=expected.aura.aura,p=value.penalty;
 if(![expected.encounterId,expected.turnId,origin.id,target.id].every(uuid)||typeof spec.key!=='string'||!spec.key
  ||value.requestId!==requestId||value.encounterId!==expected.encounterId||value.turnId!==expected.turnId
  ||value.originId!==origin.id||value.targetId!==target.id||value.auraKey!==spec.key
  ||value.marker!==`aura_save:${origin.id}:${spec.key}`||value.marker!==expected.marker||typeof value.replayed!=='boolean'
  ||proposal.geometryConfirmed!==true||proposal.defensesReviewed!==true||!uuid(proposal.concentrationId)||proposal.concentrationId===requestId
  ||!integer(proposal.conModifier,-105,120)||Object.keys(proposal).some(k=>!['save','penaltyD4','damageRoll','affinity','useResistance','concentrationId','conModifier','geometryConfirmed','defensesReviewed'].includes(k)))throw invalid();
 const automatic=expected.save.autoFail;
 if(typeof automatic!=='boolean'||(automatic?proposal.penaltyD4!==null:!integer(proposal.penaltyD4,1,4))
  ||p.saveId!==requestId||p.saveKind!=='feature'||p.replayed!==false||!ids(p.consumedIds)||!ids(p.expiredIds)
  ||!Array.isArray(expected.nextSaveEffects))throw invalid();
 const consumedIds=p.consumedIds,expiredIds=p.expiredIds;
 const effectIds=expected.nextSaveEffects.map(e=>object(e)?e.id:null),resolved=[...p.consumedIds,...p.expiredIds];
 if(!ids(effectIds)||new Set(resolved).size!==resolved.length||resolved.length!==effectIds.length||resolved.some(id=>!effectIds.includes(id)))throw invalid();
 // Older historical receipts predate expiry flags; new snapshots must match
 // the exact consumed/expired partition used for the reviewed save.
 if(expected.nextSaveEffects.some(e=>object(e)&&'expired' in e&&(typeof e.expired!=='boolean'||
  (e.expired?!expiredIds.includes(e.id as string):!consumedIds.includes(e.id as string)))))throw invalid();
 const penalty=p.consumedIds.length&&!automatic?proposal.penaltyD4 as number:0;
 if(p.penalty!==penalty||p.die!==(penalty||null)||!validAuraSaveEvidence(expected,proposal.save,penalty,value.save)
  ||!validAuraDamagePools(expected,proposal,penalty,value))throw invalid();
 const damage=auraDamageEvidence(expected,proposal,penalty),result=value.damageResult;
 if(damage.damage>0){
  if(!object(result))throw invalid();
  if(target.participant_type==='character'){
   const party=expected.partyDamage;
   if(!object(party)||!object(party.character)||!object(party.campaign)||!object(party.participant)
    ||party.participant.id!==target.id||party.character.id!==target.entity_id
    ||!(party.character.concentration_spell===null||typeof party.character.concentration_spell==='string'))throw invalid();
   const mode=resolveAutomation('concentration_on_damage',
    {advanced_automations_unlocked:party.character.advanced_automations_unlocked===true,automation_overrides:concentrationSetting(party.character.automation_overrides)},
    {automation_defaults:concentrationSetting(party.campaign.automation_defaults)});
   const conditions=expected.target.combatant.active_conditions as string[];
   const concentration=concentrationDamageEffect(damage.damage,damage.pools!.afterHP,!!party.character.concentration_spell,
    conditions.some(c=>CONDITION_MAP[c]?.concentrationBreaks),mode);
   if(result.requestId!==requestId||result.saveId!==proposal.concentrationId||result.damage!==damage.damage
    ||result.damageType!==spec.damageType||result.participantId!==target.id||result.automation!==mode||result.replayed!==false
    ||result.checkId!==(concentration.kind==='save'?proposal.concentrationId:null)
    ||result.concentrationBroken!==(concentration.kind==='ends')||'character' in result)throw invalid();
  }else if(result.checkId!==null||result.concentrationBroken!==false)throw invalid();
 }
 return structuredClone(value) as unknown as AuraResolutionReceipt;
}
