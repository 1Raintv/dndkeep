import {supabase} from '../supabase';
/** Round expiry must read after turn effects, not resurrect removed markers
 * from advanceTurn's earlier roster snapshot. Atomic clock integration will
 * replace this legacy read/write duration path. */
export async function readCombatantBuffs(combatantId:string){
 const {data,error}=await supabase.from('combatants').select('active_buffs').eq('id',combatantId).single();
 if(error)throw error;if(!data)throw new Error('Combatant buffs are unavailable');return data.active_buffs;
}
