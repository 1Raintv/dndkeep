import {supabase} from '../supabase';
/** v2.754 — Server checks class level and changes only the PED key under RLS. */
export async function recoverPsionicReserves(characterId:string):Promise<number> {
  const {data,error}=await (supabase as any).rpc('recover_psionic_reserves',{p_character_id:characterId});
  if(error)throw error;
  return typeof data==='number'?data:0;
}
