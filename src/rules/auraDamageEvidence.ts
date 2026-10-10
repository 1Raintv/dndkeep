import {validDiceGroups} from './dice';
import {applyDamageAffinities} from './damageAffinities';
import {applyDamageToPools} from './hp';
import {auraSaveEvidence} from './auraSaveEvidence';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const pool=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=2147483647;
const invalid=()=>new Error('Aura damage evidence could not be verified. Keep the original request for review.');
/** v2.869: reconstruct damage and historical pools, never overwrite live HP
 * from these values. Defenses are the DM-reviewed proposal; this does not
 * establish geometry, ownership, concentration effects or penalty consumption. */
export function auraDamageEvidence(context:unknown,proposal:unknown,penalty:number){
 if(!object(context)||!object(proposal)||!object(context.aura)||!object(context.aura.aura)
  ||!object(context.target)||!object(context.target.combatant)||!object(context.target.participant)
  ||!object(context.legendaryResistance))throw invalid();
 const spec=context.aura.aura,cb=context.target.combatant,lr=context.legendaryResistance;
 const save=auraSaveEvidence(context,proposal.save,penalty);
 if(typeof proposal.useResistance!=='boolean'||typeof spec.halfOnSave!=='boolean'
  ||!pool(lr.capacity)||!pool(lr.used)||!pool(cb.current_hp)||!pool(cb.temp_hp)||!pool(cb.max_hp)
  ||cb.max_hp<1||cb.current_hp>cb.max_hp||!Array.isArray(cb.active_conditions)||!cb.active_conditions.every(c=>typeof c==='string')
  ||typeof proposal.affinity!=='string'||!['normal','immune','resistant','vulnerable','resistant-vulnerable'].includes(proposal.affinity))throw invalid();
 if(proposal.useResistance&&(save.passed||lr.used>=lr.capacity||!['creature','monster','npc'].includes(String(context.target.participant.participant_type))))throw invalid();
 let raw=0;
 if(spec.damageDice===null){if(proposal.damageRoll!==null)throw invalid();}
 else{
  if(typeof spec.damageDice!=='string'||!validDiceGroups(spec.damageDice,proposal.damageRoll))throw invalid();
  raw=proposal.damageRoll.total;
 }
 const passed=save.passed||proposal.useResistance;
 const afterSave=Math.max(0,passed?(spec.halfOnSave?Math.floor(raw/2):0):raw);
 const damage=applyDamageAffinities(afterSave,{
  immune:proposal.affinity==='immune',
  resistant:['resistant','resistant-vulnerable'].includes(proposal.affinity)||cb.active_conditions.includes('Petrified'),
  vulnerable:['vulnerable','resistant-vulnerable'].includes(proposal.affinity),
 }).final;
 if(!pool(damage))throw invalid();
 const pools=applyDamageToPools(cb.current_hp,cb.temp_hp,damage);
 return {save,passed,acceptedResistance:proposal.useResistance,damage,
  pools:damage===0?null:{beforeHP:cb.current_hp,beforeTempHP:cb.temp_hp,afterHP:pools.hpAfter,afterTempHP:pools.tempAfter}};
}
/** Only the damage/pool fields are checked here. The caller must also verify
 * the save receipt, identity, penalty and concentration metadata. */
export function validAuraDamagePools(context:unknown,proposal:unknown,penalty:number,result:unknown):boolean {
 try{
  const expected=auraDamageEvidence(context,proposal,penalty);
  if(!object(result)||result.damage!==expected.damage||result.passed!==expected.passed||result.acceptedResistance!==expected.acceptedResistance)return false;
  if(expected.pools===null)return result.damageResult===null;
  const actual=result.damageResult;if(!object(actual))return false;
  return Object.entries(expected.pools).every(([k,v])=>actual[k]===v);
 }catch{return false;}
}
