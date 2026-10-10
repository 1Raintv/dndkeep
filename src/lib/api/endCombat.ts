import {supabase} from '../supabase';
import {psionicRpc} from './psionicTurns';
import {withCurrentTurnUser} from './liveTurnTransitions';
export interface CombatCompletion {encounterId:string;turnId:string;endedAt:string;characterCount:number;templateCount:number;replayed:boolean}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** v2.869: the server owns carry-over and its receipt. Retrying a lost reply
 * reads that receipt without reapplying old HP to a healed character. */
export async function completeCombat(encounterId:string):Promise<CombatCompletion>{
 if(!uuid(encounterId))throw new Error('Combat identity could not be verified.');
 return withCurrentTurnUser(async(_user,guard)=>{
  const history=await psionicRpc('read_combat_completion',{p_encounter:encounterId},true);guard();
  if(history!==null)return verify(history,encounterId);
  const {data,error}=await supabase.from('combat_encounters').select('psionic_turn_id').eq('id',encounterId).single();guard();
  if(error)throw new Error(error.message);
  const turn=data?.psionic_turn_id;if(!uuid(turn))throw new Error('Combat turn could not be verified.');
  const value=await psionicRpc('end_combat_encounter',{p_encounter:encounterId,p_turn:turn},true);guard();
  return verify(value,encounterId,turn);
 });
}

function verify(value:unknown,encounterId:string,turn?:string):CombatCompletion{
  const r=value as CombatCompletion|null;
  if(!r||r.encounterId!==encounterId||!uuid(r.turnId)||(turn!==undefined&&r.turnId!==turn)||typeof r.endedAt!=='string'||!Number.isFinite(Date.parse(r.endedAt))
   ||![r.characterCount,r.templateCount].every(n=>Number.isSafeInteger(n)&&n>=0)||typeof r.replayed!=='boolean'){
   throw new Error('Combat completion could not be confirmed. Retry End Combat to recover its saved result.');
  }
  return r;
}
