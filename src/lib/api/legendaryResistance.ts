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

/** Unknown lair state must not silently remove a creature's remaining resistance. */
export async function readEncounterLairBonus(encounterId:string|null|undefined):Promise<number>{
 if(!encounterId)return 0;
 const {data,error}=await supabase.from('combat_encounters').select('in_lair').eq('id',encounterId).maybeSingle();
 if(error)throw new Error(error.message??'Encounter lair setting could not be loaded. Retry.');
 if(!data||typeof data.in_lair!=='boolean')throw new Error('Encounter lair setting could not be verified. Retry.');
 return data.in_lair?1:0;
}
