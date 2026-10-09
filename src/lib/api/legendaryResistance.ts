import {supabase} from '../supabase';
import type {PendingAttack} from '../../types';
/** Server owns authorization, charge spending, final save and the event log. */
export async function decideLegendaryResistance(attackId:string,accept:boolean):Promise<PendingAttack>{
 const {data,error}=await (supabase as any).rpc('decide_legendary_resistance',{p_attack:attackId,p_accept:accept});
 if(error)throw new Error(error.message??'Legendary Resistance decision could not be confirmed. Retry the same choice.');
 const attack=data as PendingAttack|null;
 if(!attack||attack.id!==attackId||attack.pending_lr_decision!==false||attack.save_result!==(accept?'passed':'failed'))
  throw new Error('Legendary Resistance decision could not be verified. Retry the same choice.');
 return attack;
}
