import type {Character} from '../../types';
import {PsionicRequestError,psionicRpc,type PsionicTurn,type EnergyReceipt} from './psionicTurns';
import {validDisciplineClaim,validDisciplineRequest,validDisciplineOutcomeRequest,validPsionicTurn,disciplineIsConditional,type DisciplineClaim,type DisciplineRequest,type DisciplineOutcomeRequest} from '../psionicDisciplineRequest';
export interface DisciplineUse extends DisciplineClaim {
 conditional:boolean;energy:EnergyReceipt|null;outcome:{spent:boolean;energy?:EnergyReceipt|null}|null;
}
export interface DisciplineReceipt extends DisciplineUse {character:Character;replayed:boolean}
export interface GuardsEffect {requestId:string;startToken:string}
export interface DisciplineTurn {turn:PsionicTurn;uses:DisciplineUse[];pending:DisciplineUse[];guards?:GuardsEffect|null}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const natural=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const sameTurn=(a:PsionicTurn,b:PsionicTurn)=>'soloTurn' in a&&'soloTurn' in b?a.soloTurn===b.soloTurn:
 'encounterId' in a&&'encounterId' in b&&a.encounterId===b.encounterId&&a.round===b.round&&a.index===b.index&&a.turnId===b.turnId;
function energy(v:unknown,claim:DisciplineClaim):v is EnergyReceipt {
 return object(v)&&v.requestId===claim.requestId&&natural(v.remaining)&&Number(v.remaining)<=12&&natural(v.energyRevision)
  &&typeof v.replayed==='boolean'&&JSON.stringify(v.rolls)===JSON.stringify(claim.rolls)
  &&[v.restorationResource,v.restorationUsed].every(n=>n===null||natural(n));
}
function validUse(v:unknown):v is DisciplineUse {
 if(!object(v)||!validDisciplineClaim(v)||v.conditional!==disciplineIsConditional(v.discipline))return false;
 if(v.conditional){
  if(v.energy!==null)return false;
  return v.outcome===null||(object(v.outcome)&&typeof v.outcome.spent==='boolean'&&
   (v.outcome.spent?energy(v.outcome.energy,v):v.outcome.energy===null));
 }
 return energy(v.energy,v)&&object(v.outcome)&&v.outcome.spent===true;
}
function invalid():never {throw new PsionicRequestError('The discipline response could not be verified. Keep the saved request; do not roll again.',false);}
function readReceipt(v:unknown,characterId:string,claim:DisciplineClaim):DisciplineReceipt {
 if(!object(v)||!validUse(v)||v.requestId!==claim.requestId||v.discipline!==claim.discipline||v.sourceFeature!==claim.sourceFeature
  ||v.count!==claim.count||!sameTurn(v.turn,claim.turn)||JSON.stringify(v.rolls)!==JSON.stringify(claim.rolls)||typeof v.replayed!=='boolean')return invalid();
 const c=v.character;
 if(!object(c)||c.id!==characterId||!natural(c.psionic_energy_revision)||!object(c.class_resources)||!object(c.feature_uses))return invalid();
 const remaining=c.class_resources['psionic-energy-dice'];
 if(remaining!==undefined&&(!natural(remaining)||Number(remaining)>12))return invalid();
 const paid=v.outcome?.energy??v.energy;
 if(paid&&Number(c.psionic_energy_revision)<paid.energyRevision)return invalid();
 // Original payment counters are historical. Consumers acknowledge the current
 // character with revision ordering, never overwrite resources from v.energy.
 return v as unknown as DisciplineReceipt;
}
export async function beginPsionicDiscipline(characterId:string,input:DisciplineRequest):Promise<DisciplineReceipt>{
 const r=structuredClone(input);
 if(!validDisciplineRequest(r))throw new PsionicRequestError('Invalid saved discipline. No request was sent.',true);
 return readReceipt(await psionicRpc('begin_psionic_discipline',{p_character_id:characterId,p_request_id:r.requestId,p_turn:r.turn,
  p_discipline:r.discipline,p_rolls:r.rolls,p_count:r.count,p_modifier:r.modifier,p_expected:r.expected},true),characterId,r);
}
export async function finishPsionicDiscipline(characterId:string,input:DisciplineOutcomeRequest):Promise<DisciplineReceipt>{
 const r=structuredClone(input);
 if(!validDisciplineOutcomeRequest(r))throw new PsionicRequestError('Invalid saved discipline outcome. No request was sent.',true);
 const result=readReceipt(await psionicRpc('finish_psionic_discipline',{p_character_id:characterId,p_request_id:r.requestId,p_changed_outcome:r.changedOutcome},true),characterId,r);
 if(result.outcome?.spent!==r.changedOutcome)return invalid();
 return result;
}
export async function getPsionicDisciplineTurn(characterId:string):Promise<DisciplineTurn>{
 const v=await psionicRpc('get_psionic_discipline_turn',{p_character_id:characterId});
 if(!object(v)||!validPsionicTurn(v.turn)||!Array.isArray(v.uses)||!Array.isArray(v.pending)
  ||(v.guards!==undefined&&v.guards!==null&&(!object(v.guards)||!uuid(v.guards.requestId)||!uuid(v.guards.startToken)))
  ||!v.uses.every(u=>validUse(u)&&sameTurn(u.turn,v.turn as PsionicTurn))
  ||!v.pending.every(u=>validUse(u)&&u.conditional&&u.outcome===null))return invalid();
 const unique=(values:DisciplineUse[])=>new Set(values.map(u=>u.requestId)).size===values.length;
 if(!unique(v.uses)||!unique(v.pending)||new Set(v.uses.map(u=>u.discipline)).size!==v.uses.length)return invalid();
 // Both lists come from the same server snapshot. A current pending claim must
 // appear identically in each; otherwise do not hide or invent an unresolved use.
 for(const pending of v.pending as DisciplineUse[]){
  const current=(v.uses as DisciplineUse[]).find(u=>u.requestId===pending.requestId);
  if(sameTurn(pending.turn,v.turn)!==!!current||current&&(current.discipline!==pending.discipline||current.count!==pending.count||current.outcome!==null||JSON.stringify(current.rolls)!==JSON.stringify(pending.rolls)))return invalid();
 }
 if((v.uses as DisciplineUse[]).some(u=>u.conditional&&u.outcome===null&&!(v.pending as DisciplineUse[]).some(p=>p.requestId===u.requestId)))return invalid();
 return v as unknown as DisciplineTurn;
}

/** v2.818 — read at roll time; a cached badge is not proof of active protection.
 * v2.823: the narrow RPC also permits current campaign members, without
 * returning the private discipline ledger. */
export async function getPsionicGuardsSaveAdvantage(characterId:string,ability:string):Promise<boolean>{
 if(!['int','intelligence'].includes(ability.trim().toLowerCase()))return false;
 const active=await psionicRpc('get_psionic_guards_active',{p_character_id:characterId});
 if(typeof active!=='boolean')throw new Error('Protection could not be verified. Try the save again.');
 return active;
}
