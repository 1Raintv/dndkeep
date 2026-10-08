import type {Character} from '../types';
import type {PsionicTurn} from './api/psionicTurns';
/** v2.813 — identifiers and payload shape only. The database checks ownership,
 * learned choices, current turn, level, pool and the captured ability snapshot. */
import {DISCIPLINE_NAMES,type DisciplineId,disciplineIsConditional} from '../rules/psionicDisciplineUse';
export {DISCIPLINE_NAMES,disciplineIsConditional,type DisciplineId} from '../rules/psionicDisciplineUse';
export interface DisciplineClaim {
 requestId:string;turn:PsionicTurn;discipline:DisciplineId;sourceFeature:string;rolls:number[];count:number;
}
export interface DisciplineRequest extends DisciplineClaim {
 modifier:number;expected:Record<string,unknown>;recoveryNote?:string;
}
export interface DisciplineOutcomeRequest extends DisciplineClaim {changedOutcome:boolean;recoveryNote?:string}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const natural=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function validPsionicTurn(v:unknown):v is PsionicTurn {
 return object(v)&&((Object.keys(v).length===1&&natural(v.soloTurn))||
  (Object.keys(v).length===4&&typeof v.encounterId==='string'&&!!v.encounterId&&typeof v.turnId==='string'&&!!v.turnId&&natural(v.round)&&natural(v.index)));
}
export function validDisciplineClaim(v:unknown):v is DisciplineClaim {
 if(!object(v)||typeof v.requestId!=='string'||!v.requestId||typeof v.discipline!=='string'||!Object.prototype.hasOwnProperty.call(DISCIPLINE_NAMES,v.discipline))return false;
 const id=v.discipline as DisciplineId;
 return validPsionicTurn(v.turn)&&v.sourceFeature===DISCIPLINE_NAMES[id]&&Number.isInteger(v.count)&&Number(v.count)>=1&&Number(v.count)<=12
  &&(['biofeedback','destructive-thoughts'].includes(id)||v.count===1)&&Array.isArray(v.rolls)
  &&v.rolls.length===(id==='psionic-guards'?0:v.count)&&v.rolls.every(n=>Number.isInteger(n)&&n>=1&&n<=12);
}
const expectedKeys=['class_name','level','secondary_class','secondary_level','intelligence','inventory','disciplines'];
const note=(v:Record<string,unknown>)=>v.recoveryNote===undefined||(typeof v.recoveryNote==='string'&&v.recoveryNote.length<=1000);
export function validDisciplineRequest(v:unknown):v is DisciplineRequest {
 if(!object(v)||!validDisciplineClaim(v)||!object(v.expected)||!Number.isInteger(v.modifier)||Number(v.modifier)<-5||Number(v.modifier)>20)return false;
 return expectedKeys.every(k=>Object.prototype.hasOwnProperty.call(v.expected,k))&&Object.keys(v.expected).length===expectedKeys.length&&note(v);
}
export function validDisciplineOutcomeRequest(v:unknown):v is DisciplineOutcomeRequest {
 return object(v)&&validDisciplineClaim(v)&&disciplineIsConditional(v.discipline)&&typeof v.changedOutcome==='boolean'&&note(v);
}
export function createDisciplineRequest(c:Character,turn:PsionicTurn,discipline:DisciplineId,rolls:number[],count:number,modifier:number,requestId:string):DisciplineRequest {
 const expected=Object.fromEntries(expectedKeys.map(k=>[k,k==='disciplines'?c.class_resources?.['psion-disciplines']??null:c[k as keyof Character]??null]));
 const request=structuredClone({requestId,turn,discipline,sourceFeature:DISCIPLINE_NAMES[discipline],rolls,count,modifier,expected});
 if(!validDisciplineRequest(request))throw new Error('Invalid discipline request. No request was sent.');
 return request;
}

/** v2.830: legacy enhancements have no activation link; linked payments must
 * keep the exact Sharpened identity through browser recovery. */
export function validSharpenedEnhancementLink(v:{activationId?:unknown;sourceFeature?:unknown;requestId?:unknown}){
 return v.activationId===undefined||(typeof v.activationId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.activationId)&&v.activationId!==v.requestId&&v.sourceFeature==='Sharpened Mind');
}
