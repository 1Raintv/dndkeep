import {supabase} from '../supabase';
import {resolveResistances,DAMAGE_TYPES} from '../damageModifiers';
import type {Character} from '../../types';
/** v2.869: preserve unknown/qualified creature defenses for review. Never infer
 * that an older NULL catalog field means no resistance. Reads precede aura use. */
export async function readAuraDamageDefenses(campaign:string,encounter:string,participant:string,type:string|null){
 const invalid=()=>new Error('Review the aura target’s damage defenses before resolving.');
 const damageType=type?.trim().toLowerCase()??null;
 if(damageType!==null&&!DAMAGE_TYPES.some(t=>t===damageType))throw invalid();
 const partResult=await supabase.from('combat_participants').select('entity_id, participant_type, campaign_id, encounter_id, combatant_id').eq('id',participant).single();
 const part=partResult.data;
 if(partResult.error||!part||part.campaign_id!==campaign||part.encounter_id!==encounter)throw invalid();
 const character=part.participant_type==='character';
 if(!character&&!['creature','monster','npc'].includes(part.participant_type))throw invalid();
 let row:Record<string,unknown>;
 const fields='damage_resistances, damage_immunities, damage_vulnerabilities';
 if(character){
  if(!part.entity_id)throw invalid();
  const result=await supabase.from('characters').select('species, species_choices, '+fields).eq('id',part.entity_id).eq('campaign_id',campaign).single();
  if(result.error||!result.data)throw invalid();row=result.data as unknown as Record<string,unknown>;
 }else{
  // v2.869: use the linked definition, never a name-based fallback or a
  // same-ID row in another creature table. Personal homebrew may be unfiled.
  if(!part.combatant_id)throw invalid();
  const linked=await supabase.from('combatants').select('campaign_id, definition_type, definition_id, owner_id, stat_block_snapshot').eq('id',part.combatant_id).eq('campaign_id',campaign).single();
  if(linked.error||!linked.data)throw invalid();const combatant=linked.data;
  if(combatant.campaign_id!==campaign||combatant.definition_id!==part.entity_id)throw invalid();
  if(combatant.definition_type==='custom'){
   const snapshot=combatant.stat_block_snapshot;
   if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw invalid();row=snapshot as Record<string,unknown>;
  }else if(combatant.definition_type==='srd_monster'){
   if(!part.entity_id)throw invalid();
   const result=await supabase.from('monsters').select('owner_id, '+fields).eq('id',part.entity_id).is('owner_id',null).single();
   if(result.error||!result.data)throw invalid();row=result.data as unknown as Record<string,unknown>;
   if(row.owner_id!==null)throw invalid();
  }else if(['homebrew_monster','narrative_npc','roster_npc'].includes(combatant.definition_type)){
   if(!part.entity_id)throw invalid();
   const result=await supabase.from('homebrew_monsters').select('campaign_id, owner_id, user_id, '+fields).eq('id',part.entity_id).single();
   if(result.error||!result.data)throw invalid();row=result.data as unknown as Record<string,unknown>;
   if(row.campaign_id!==campaign&&!(row.campaign_id===null&&combatant.owner_id&&(row.owner_id===combatant.owner_id||row.user_id===combatant.owner_id)))throw invalid();
  }else throw invalid();
 }
 const lists=['damage_resistances','damage_immunities','damage_vulnerabilities'].map(key=>{
  const raw=row[key];if(raw==null&&character)return [];
  if(!Array.isArray(raw)||!raw.every(v=>typeof v==='string'&&DAMAGE_TYPES.some(t=>t===v.trim().toLowerCase())))throw invalid();
  return raw.map(v=>v.trim().toLowerCase());
 });
 const [baseResistance,immune,vulnerable]=lists;let resistant=baseResistance;
 if(character){
  if(typeof row.species!=='string'||!(row.species_choices==null||typeof row.species_choices==='object'&&!Array.isArray(row.species_choices)))throw invalid();
  resistant=resolveResistances({species:row.species,species_choices:row.species_choices,damage_resistances:resistant} as Pick<Character,'species'|'species_choices'|'damage_resistances'>);
 }
 return {resistant:damageType!==null&&resistant.includes(damageType),immune:damageType!==null&&immune.includes(damageType),vulnerable:damageType!==null&&vulnerable.includes(damageType)};
}
