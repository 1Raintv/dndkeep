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
 modifier:number;expected:Record<string,unknown>;recoveryNote?:string;effectContext?:Record<string,unknown>;
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
 return expectedKeys.every(k=>Object.prototype.hasOwnProperty.call(v.expected,k))&&Object.keys(v.expected).length===expectedKeys.length&&note(v)&&(v.effectContext===undefined||(['destructive-thoughts','biofeedback'].includes(v.discipline)&&validEffectContext(v.effectContext)));
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

/** v2.852: linked enhancements preserve their parent through retries. Legacy
 * generic payments remain valid, but cannot acquire a parent retroactively. */
export function validPsionicEnhancementLink(v:{activationId?:unknown;effectRollId?:unknown;sourceFeature?:unknown;requestId?:unknown}){
 const uuid=(id:unknown)=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&id!==v.requestId;
 if(v.activationId!==undefined)return v.effectRollId===undefined&&uuid(v.activationId)&&v.sourceFeature==='Sharpened Mind';
 return v.effectRollId===undefined||uuid(v.effectRollId)&&['Destructive Thoughts','Biofeedback'].includes(String(v.sourceFeature));
}
export function validEffectContext(value:unknown):value is Record<string,unknown>{
 if(!object(value))return false;
 const json=(v:unknown,depth=0):boolean=>depth<=12&&(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||Array.isArray(v)&&v.every(n=>json(n,depth+1))||object(v)&&Object.values(v).every(n=>json(n,depth+1)));
 try{return json(value)&&new TextEncoder().encode(JSON.stringify(value)).length<=8192;}catch{return false;}
}
