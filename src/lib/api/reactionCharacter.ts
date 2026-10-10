import {psionProgression} from '../../rules/psionProgression';
import {supabase} from '../supabase';
import type {Character} from '../../types';
/** Read the current reactor, never a cached offer's spell DC or resource count. */
export async function loadReactionCharacter(participantId:string):Promise<Character>{
 const {data:part,error:partError}=await supabase.from('combat_participants').select('entity_id').eq('id',participantId).single();
 if(partError)throw partError;
 if(!part?.entity_id)throw new Error('Reaction character unavailable.');
 const {data,error}=await supabase.from('characters').select('*').eq('id',part.entity_id).single();
 if(error)throw error;
 if(!data)throw new Error('Reaction character unavailable.');
 return data as Character;
}

/** Candidate discovery only; the scoped reaction RPC decides current eligibility. */
export async function loadTelepathCandidates(campaignId:string,encounterId:string){
 const {data:parts,error:partError}=await supabase.from('combat_participants').select('entity_id').eq('campaign_id',campaignId).eq('encounter_id',encounterId).eq('participant_type','character');
 if(partError)throw partError;const ids=[...new Set((parts??[]).map(p=>p.entity_id).filter((id):id is string=>!!id))];if(!ids.length)return [];
 const {data,error}=await supabase.from('characters').select('*').eq('campaign_id',campaignId).in('id',ids);if(error)throw error;
 return (data??[]).filter(c=>{const p=psionProgression(c);return p?.subclass==='Telepath'&&p.level>=3;}).map(c=>({id:c.id,name:c.name}));
}
