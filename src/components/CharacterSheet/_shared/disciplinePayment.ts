import type {Character} from '../../../types';
import type {PsionicEnhancementPersistence,PsionicTurn} from '../../../lib/api/psionicTurns';
import type {DisciplineUse} from '../../../lib/api/psionicDisciplines';
import {createDisciplineRequest,type DisciplineId} from '../../../lib/psionicDisciplineRequest';
import {pendingPsionicPayments} from '../../../lib/psionicPaymentRecovery';
import {acceptSavedPsionicResources} from '../../../lib/characterRealtime';
import {getEffectiveAbilityScores} from '../../../lib/attunement';
import {abilityModifier} from '../../../rules/abilities';
import {confirmPsionicPayment} from './confirmPsionicPayment';
type Options=Omit<Parameters<typeof confirmPsionicPayment>[1],'feature'>&{recoveryNote?:string;effectContext?:Record<string,unknown>};
export interface PreparedDiscipline {character:Character;turn:PsionicTurn}
/** Capture the authoritative turn before rolling. Failure cannot silently fall
 * back to an untracked Energy Die payment or invent a fresh solo turn. */
export async function prepareDiscipline(persistence:PsionicEnhancementPersistence|undefined,latest:{current:Character},options:Options):Promise<PreparedDiscipline|null>{
 if(!persistence?.getDisciplineTurn||!persistence.beginDiscipline||!persistence.finishDiscipline){options.warn('Discipline saving is unavailable. Reopen this sheet before rolling.');return null;}
 const id=latest.current.id;
 if(pendingPsionicPayments(id,true).some(p=>p.kind.startsWith('discipline-'))){options.warn('Confirm the saved discipline attempt before rolling again.');return null;}
 try{
  const state=await persistence.getDisciplineTurn();
  if(!options.active()||latest.current.id!==id)return null;
  return {character:structuredClone(latest.current),turn:structuredClone(state.turn)};
 }catch(error){options.warn(error instanceof Error?error.message:'The discipline turn could not be checked. No roll was made.');return null;}
}
export async function beginDiscipline(persistence:PsionicEnhancementPersistence,latest:{current:Character},prepared:PreparedDiscipline,discipline:DisciplineId,rolls:number[],count:number,options:Options){
 if(!options.active()||latest.current.id!==prepared.character.id||!persistence.beginDiscipline)return null;
 try{
 const request=createDisciplineRequest(prepared.character,prepared.turn,discipline,rolls,count,abilityModifier(getEffectiveAbilityScores(prepared.character,prepared.character.inventory).intelligence),crypto.randomUUID());
 if(options.effectContext!==undefined)request.effectContext=structuredClone(options.effectContext);
 if(options.recoveryNote)request.recoveryNote=options.recoveryNote.slice(0,1000);
 const result=await confirmPsionicPayment(()=>persistence.beginDiscipline!(request),{...options,feature:request.sourceFeature});
 if(result.status!=='paid')return null;
 if(options.active()&&latest.current.id===prepared.character.id)acceptSavedPsionicResources(latest,result.receipt.character);
 return result.receipt;
 }catch(error){options.warn(error instanceof Error?error.message:'The discipline request could not be prepared.');return null;}
}
export async function finishDiscipline(persistence:PsionicEnhancementPersistence,latest:{current:Character},use:DisciplineUse,changedOutcome:boolean,options:Options){
 if(!options.active()||!persistence.finishDiscipline)return null;
 const id=latest.current.id,request={requestId:use.requestId,turn:use.turn,discipline:use.discipline,sourceFeature:use.sourceFeature,rolls:use.rolls,count:use.count,changedOutcome,recoveryNote:options.recoveryNote?.slice(0,1000)};
 const result=await confirmPsionicPayment(()=>persistence.finishDiscipline!(request),{...options,feature:request.sourceFeature});
 if(result.status!=='paid')return null;
 if(options.active()&&latest.current.id===id)acceptSavedPsionicResources(latest,result.receipt.character);
 return result.receipt;
}
