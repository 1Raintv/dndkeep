import {supabase} from '../supabase';
import {resolveResistances,DAMAGE_TYPES} from '../damageModifiers';
import type {Character} from '../../types';
/** v2.869: preserve unknown/qualified creature defenses for review. Never infer
 * that an older NULL catalog field means no resistance. Reads precede aura use. */
export async function readAuraDamageDefenses(campaign:string,encounter:string,participant:string,type:string|null){
 const invalid=()=>new Error('Review the aura target’s damage defenses before resolving.');
 const damageType=type?.trim().toLowerCase()??null;
 if(damageType!==null&&!DAMAGE_TYPES.some(t=>t===damageType))throw invalid();
 const partResult=await supabase.from('combat_participants').select('entity_id, participant_type, campaign_id, encounter_id').eq('id',participant).single();
 const part=partResult.data;
 if(partResult.error||!part||part.campaign_id!==campaign||part.encounter_id!==encounter||!part.entity_id)throw invalid();
 const character=part.participant_type==='character';
 if(!character&&!['creature','monster','npc'].includes(part.participant_type))throw invalid();
 const result=character?await supabase.from('characters').select('species, species_choices, damage_resistances, damage_immunities, damage_vulnerabilities').eq('id',part.entity_id).eq('campaign_id',campaign).single():
  await supabase.from('homebrew_monsters').select('damage_resistances, damage_immunities, damage_vulnerabilities').eq('id',part.entity_id).eq('campaign_id',campaign).single();
 if(result.error||!result.data)throw invalid();const row=result.data as unknown as Record<string,unknown>;
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
