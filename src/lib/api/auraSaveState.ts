import {getPsionicGuardsSaveAdvantage} from './psionicDisciplines';
import {supabase} from '../supabase';
import {JOINED_COMBATANT_FIELDS,normalizeParticipantRow} from '../combatParticipantNormalize';
/** v2.869: refuse missing effects instead of silently rolling an unmodified save.
 * This read is preparation only; atomic aura settlement must recheck its snapshot. */
export async function readAuraSaveState(campaignId:string,encounterId:string,participantId:string,ability:string){
 const {data,error}=await supabase.from('combat_participants').select('id, campaign_id, encounter_id, participant_type, entity_id, '+JOINED_COMBATANT_FIELDS).eq('id',participantId).single();
 if(error||!data)throw new Error('The aura target’s saving throw effects could not be read.');
 const row=normalizeParticipantRow(data as unknown as Parameters<typeof normalizeParticipantRow>[0]);
 if(row.campaign_id!==campaignId||row.encounter_id!==encounterId||!row.combatants)throw new Error('The aura target changed. Refresh combat.');
 const conditions=row.active_conditions??[],buffs=row.active_buffs??[],exhaustion=row.exhaustion_level??0;
 if(!Array.isArray(conditions)||!conditions.every(c=>typeof c==='string')||!Array.isArray(buffs)
  ||!Number.isInteger(exhaustion)||exhaustion<0||exhaustion>6)throw new Error('Review the aura target’s saving throw effects.');
 // Use the same narrow, read-only protection API as other player saves.
 // A saved badge or selected discipline does not prove its duration is active.
 let advantage=false;
 if(ability==='INT'&&row.participant_type==='character'){
  if(typeof row.entity_id!=='string'||!row.entity_id)throw new Error('The aura target character could not be verified.');
  advantage=await getPsionicGuardsSaveAdvantage(row.entity_id,ability);
 }
 return {conditions,buffs,exhaustion,advantage};
}
