import {savingThrowPassed} from './savingThrows';
export interface PropelSaveDetails {participantId:string;outcome:'passed'|'failed'|'auto-failed';dc:number;d20?:number;bonus?:number;total?:number;rolls?:number[];advantage?:boolean;disadvantage?:boolean;automaticFailure?:boolean;naturalExtremes?:boolean}
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
/** Save evidence is a record of a confirmed resolution, not permission to target
 * another creature. The declaration independently owns the target identity. */
export function validPropelSave(value:unknown,outcome:string,participantId?:string|null):value is PropelSaveDetails|null{
 if(value==null)return true;
 if(!value||typeof value!=='object'||outcome==='cancelled')return false;
 const s=value as PropelSaveDetails;
 if(Object.keys(s).some(k=>!['participantId','outcome','dc','d20','bonus','total','rolls','advantage','disadvantage','automaticFailure','naturalExtremes'].includes(k))
  ||typeof s.participantId!=='string'||!s.participantId||s.participantId!==(participantId??'manual')
  ||!['passed','failed','auto-failed'].includes(s.outcome)||(s.outcome==='passed'?'passed':'failed')!==outcome||!integer(s.dc,0,1000))return false;
 if(s.d20===undefined)return [s.bonus,s.total,s.rolls,s.advantage,s.disadvantage,s.automaticFailure,s.naturalExtremes].every(v=>v===undefined);
 const disadvantage=s.disadvantage??false,automatic=s.automaticFailure??false;
 if((s.disadvantage!==undefined&&typeof s.disadvantage!=='boolean')||(s.automaticFailure!==undefined&&typeof s.automaticFailure!=='boolean'))return false;
 if(s.outcome==='auto-failed'||!integer(s.d20,1,20)||!integer(s.bonus,-1000,1000)||s.total!==s.d20+s.bonus!
  ||!Array.isArray(s.rolls)||s.rolls.length!==(automatic?0:s.advantage!==disadvantage?2:1)||s.rolls.some(n=>!integer(n,1,20))
  ||typeof s.advantage!=='boolean'||typeof s.naturalExtremes!=='boolean'||s.d20!==(automatic?1:disadvantage&&!s.advantage?Math.min(...s.rolls):s.advantage&&!disadvantage?Math.max(...s.rolls):s.rolls[0]))return false;
 return savingThrowPassed(s.d20,s.total!,s.dc,{naturalExtremes:s.naturalExtremes,forceFailure:automatic})===(outcome==='passed');
}
