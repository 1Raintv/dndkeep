import {supabase} from '../supabase';
/** v2.869: the server serializes cancellation with saves/damage. Never report
 * success for a rejected write or an invisible/missing attack. Retrying the
 * same canceled row is safe and does not refund any resources. */
export async function cancelPendingAttack(attackId:string):Promise<void>{
 const {data,error}=await supabase.from('pending_attacks').update({state:'canceled'}).eq('id',attackId).select('id,state').single();
 if(error)throw new Error(error.message);
 if(!data||data.id!==attackId||data.state!=='canceled')throw new Error('Attack cancellation could not be confirmed. Refresh this attack before retrying.');
}
