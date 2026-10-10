import {supabase} from '../supabase';
/** v2.869: saving throws must follow the actual linked definition. Unknown or
 * mismatched sources stay unavailable; never fall back to a same-ID homebrew. */
export async function readCreatureSaveDefinition(part:{campaign_id:string;entity_id:string|null;combatant_id?:string|null}):Promise<Record<string,unknown>|null>{
 if(!part.campaign_id||!part.combatant_id)return null;
 const linked=await supabase.from('combatants').select('campaign_id, definition_type, definition_id, owner_id, stat_block_snapshot').eq('id',part.combatant_id).eq('campaign_id',part.campaign_id).single();
 const cb=linked.data;if(linked.error||!cb||cb.campaign_id!==part.campaign_id||cb.definition_id!==part.entity_id)return null;
 if(cb.definition_type==='custom'){
  const row=cb.stat_block_snapshot;return row&&typeof row==='object'&&!Array.isArray(row)?row as Record<string,unknown>:null;
 }
 if(!part.entity_id)return null;
 if(cb.definition_type==='srd_monster'){
  const result=await supabase.from('monsters').select('owner_id, str, dex, con, int, wis, cha, saving_throws').eq('id',part.entity_id).is('owner_id',null).single();
  return !result.error&&result.data?.owner_id===null?result.data as unknown as Record<string,unknown>:null;
 }
 if(!['homebrew_monster','narrative_npc','roster_npc'].includes(cb.definition_type))return null;
 const result=await supabase.from('homebrew_monsters').select('campaign_id, owner_id, user_id, ability_scores, save_proficiencies, cr').eq('id',part.entity_id).single();
 const row=result.data;if(result.error||!row)return null;
 if(row.campaign_id!==part.campaign_id&&!(row.campaign_id===null&&cb.owner_id&&(row.owner_id===cb.owner_id||row.user_id===cb.owner_id)))return null;
 return row as unknown as Record<string,unknown>;
}
