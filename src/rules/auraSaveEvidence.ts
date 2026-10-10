import {physicalDiceOutcome} from './dice';
import {savedSaveBonusTotal,type SaveBonusRoll} from './saveBonuses';
import {exhaustionPenalty,savingThrowPassed} from './savingThrows';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const invalid=()=>new Error('Aura save evidence could not be verified. Keep the original request for review.');
export interface AuraSaveEvidence {
 participantId:string;ability:string;dc:number;dice:number[];d20:number|null;bonus:number;total:number|null;passed:boolean;
 automaticFailure:boolean;advantage:boolean;disadvantage:boolean;naturalExtremes:boolean;exhaustion:number;
 baseBonus:number;effectRolls:SaveBonusRoll[];buffTotal:number;penalty:number;
}
/** v2.869: reconstruct a historical save from its original snapshot and faces.
 * No dice or live-state writes here. Authorization, geometry, reviewed base
 * modifiers and next-save consumption remain the transaction's responsibility. */
export function auraSaveEvidence(context:unknown,proposal:unknown,penalty:number):AuraSaveEvidence {
 if(!object(context)||!object(context.save)||!object(context.aura)||!object(context.aura.aura)
  ||!object(context.target)||!object(context.target.participant)||!object(proposal))throw invalid();
 const state=context.save,spec=context.aura.aura,target=context.target.participant;
 if(typeof target.id!=='string'||!target.id||!['STR','DEX','CON','INT','WIS','CHA'].includes(String(spec.saveAbility))
  ||Object.keys(proposal).some(k=>!['baseBonus','dice','effectRolls'].includes(k))
  ||!integer(penalty,0,4)||!integer(proposal.baseBonus,-1000,1000)||!integer(spec.saveDC,0,1000)
  ||!integer(state.exhaustion,0,6)||typeof state.autoFail!=='boolean'||typeof state.advantage!=='boolean'
  ||typeof state.disadvantage!=='boolean'||typeof state.naturalExtremes!=='boolean'||!Array.isArray(state.buffs)
  ||!Array.isArray(proposal.dice)||proposal.dice.length!==(state.autoFail?0:state.advantage!==state.disadvantage?2:1)
  ||!proposal.dice.every(n=>integer(n,1,20)))throw invalid();
 const buffTotal=savedSaveBonusTotal(state.buffs,proposal.effectRolls,state.autoFail);
 if(state.autoFail&&(proposal.baseBonus!==0||penalty!==0))throw invalid();
 const bonus=state.autoFail?0:proposal.baseBonus+buffTotal-exhaustionPenalty(state.exhaustion)-penalty;
 if(!integer(bonus,-1000,1000))throw invalid();
 const d20=state.autoFail?null:physicalDiceOutcome({dieType:20,result:0,advantage:state.advantage,disadvantage:state.disadvantage},proposal.dice.map(value=>({die:20,value}))).total;
 const total=d20===null?null:d20+bonus;
 return {participantId:target.id,ability:String(spec.saveAbility),dc:spec.saveDC,dice:[...proposal.dice],d20,bonus,total,
  passed:d20!==null&&savingThrowPassed(d20,total!,spec.saveDC,{naturalExtremes:state.naturalExtremes}),
  automaticFailure:state.autoFail,advantage:state.advantage,disadvantage:state.disadvantage,naturalExtremes:state.naturalExtremes,
  exhaustion:state.exhaustion,baseBonus:proposal.baseBonus,effectRolls:structuredClone(proposal.effectRolls as SaveBonusRoll[]),buffTotal,penalty};
}

function sameEvidence(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((v,n)=>sameEvidence(v,b[n]));
 if(!object(a)||!object(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&sameEvidence(a[k],b[k]));
}
/** JSONB object key order is irrelevant, but every recorded field must match.
 * This verifies only the save subreceipt, not damage or transaction identity. */
export function validAuraSaveEvidence(context:unknown,proposal:unknown,penalty:number,value:unknown):value is AuraSaveEvidence {
 try{return sameEvidence(auraSaveEvidence(context,proposal,penalty),value);}catch{return false;}
}
