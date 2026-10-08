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
