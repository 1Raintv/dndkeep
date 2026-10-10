import {psionicRpc} from './psionicTurns';
export interface PropelSaveContext {
 declarationId:string;characterId:string;encounterId:string;participantId:string;legendaryResistanceRemaining:number;
 state:{target:{id:string;entityId:string;type:string;combatantId:string};conditions:string[];buffs:unknown[];exhaustion:number;naturalExtremes:boolean;autoFail:boolean;advantage:boolean;disadvantage:boolean};
}
/** A fresh read cannot itself authorize settlement; the final transaction must
 * compare this same context before consuming penalties or spending resources. */
export async function getPropelSaveContext(characterId:string,declarationId:string,encounterId:string,participantId:string):Promise<PropelSaveContext>{
 const r=await psionicRpc('get_propel_save_context',{p_character:characterId,p_declaration:declarationId}) as PropelSaveContext|null;
 if(!validPropelSaveContext(r,characterId,declarationId,encounterId,participantId))throw new Error('The declared target’s save settings could not be verified. Retry without changing the target.');
 return r;
}

export function validPropelSaveContext(value:unknown,characterId:string,declarationId:string,encounterId:string,participantId:string):value is PropelSaveContext {
 const r=value as PropelSaveContext|null;
 const s=r?.state;
 if(!r||r.characterId!==characterId||r.declarationId!==declarationId||r.encounterId!==encounterId||r.participantId!==participantId
  ||!Number.isSafeInteger(r.legendaryResistanceRemaining)||r.legendaryResistanceRemaining<0||!s||s.target?.id!==participantId
  ||typeof s.target.entityId!=='string'||typeof s.target.combatantId!=='string'||!['character','creature','monster','npc'].includes(s.target.type)
  ||!Array.isArray(s.conditions)||!s.conditions.every(v=>typeof v==='string')||!Array.isArray(s.buffs)
  ||!Number.isInteger(s.exhaustion)||s.exhaustion<0||s.exhaustion>6||![s.naturalExtremes,s.autoFail,s.advantage,s.disadvantage].every(v=>typeof v==='boolean'))
  return false;
 return true;
}
