import {applyDamageAffinities} from './damageAffinities';
import {psychicDamageRoll,type PsychicDamageAttack} from './psychicDamageRoll';
interface Preview {
 context:{attack:PsychicDamageAttack&{damage_final?:number|null}};
 choice:{amount?:number;affinity?:string;activationId?:string;dieIndex?:number};
 activations:{id:string;total:number}[];usedThisTurn:boolean;defensesKnown:boolean;
 immune:boolean;resistant:boolean;vulnerable:boolean;bypass:boolean;
 damageBefore:number;damageAfter:number|null;
 replacement:{activationId:string;dieIndex:number;original:number;replacement:number}|null;
}
const amount=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=2147483647;
/** v2.869: independently verify displayed damage against saved dice and the
 * reviewed defenses. Authorization, defense provenance and payment remain
 * server responsibilities. Replacing a die precedes save rounding and defenses. */
export function validPsychicDamagePreviewMath(p:Preview):boolean {
 try{
  const a=p.context.attack,roll=psychicDamageRoll(a),choice=p.choice;
  if(!roll||!amount(a.damage_final)||p.damageBefore!==a.damage_final
   ||choice.amount!==undefined&&!amount(choice.amount)
   ||choice.affinity!==undefined&&!['normal','immune','resistant','vulnerable','resistant-vulnerable'].includes(choice.affinity))return false;
  let raw=choice.amount??p.damageBefore;
  const afterDefenses=(n:number)=>applyDamageAffinities(n,{immune:p.immune,resistant:p.resistant,vulnerable:p.vulnerable,ignoreResistance:p.bypass}).final;
  const hasSelection=choice.activationId!==undefined||choice.dieIndex!==undefined;
  if(hasSelection!==(p.replacement!==null))return false;
  if(p.replacement){
   const r=p.replacement,selected=p.activations.find(v=>v.id===r.activationId);
   if(p.usedThisTurn||!p.defensesKnown&&choice.affinity===undefined||afterDefenses(raw)===0
    ||choice.activationId!==r.activationId||choice.dieIndex!==r.dieIndex
    ||!Number.isInteger(r.dieIndex)||r.dieIndex<0||r.dieIndex>=roll.rolls.length
    ||r.original!==roll.rolls[r.dieIndex]||!selected||selected.total!==r.replacement
    ||!amount(r.replacement)||r.replacement<1||r.replacement>36)return false;
   const seed=roll.rolls.reduce((sum,n)=>sum+n,roll.modifier);
   const afterSave=(n:number)=>a.attack_kind==='save'&&a.save_result==='passed'?(a.save_success_effect==='half'?Math.floor(n/2):0):n;
   if(!amount(seed)||raw!==afterSave(seed))return false;
   raw=afterSave(seed-r.original+r.replacement);
  }
  if(!p.defensesKnown&&choice.affinity===undefined)return p.damageAfter===null;
  const final=afterDefenses(raw);
  return amount(final)&&p.damageAfter===final;
 }catch{return false;}
}
