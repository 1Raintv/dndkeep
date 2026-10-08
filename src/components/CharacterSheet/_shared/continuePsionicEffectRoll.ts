import type {PsionicEffectReceipt} from '../../../lib/api/psionicEffectRolls';
import {pendingPsionicPayments} from '../../../lib/psionicPaymentRecovery';
import {offerPsionicRollEnhancements} from './offerPsionicRollEnhancements';
import type {PsionicTurn} from '../../../lib/api/psionicTurns';
const sameTurn=(a:PsionicTurn,b:PsionicTurn)=>'soloTurn' in a&&'soloTurn' in b?a.soloTurn===b.soloTurn:'encounterId' in a&&'encounterId' in b&&a.encounterId===b.encounterId&&a.turnId===b.turnId&&a.round===b.round&&a.index===b.index;
/** v2.852: resume paid choices from the server, never from regenerated dice. */
export async function continuePsionicEffectRoll(id:string,options:Parameters<typeof offerPsionicRollEnhancements>[0]):Promise<PsionicEffectReceipt|null>{
 const p=options.persistence;if(!p?.getEffectRolls||!p.finalizeEffectRoll||!p.getDisciplineTurn)throw new Error('Saved effect recovery is unavailable on this sheet.');
 if(!options.active())return null;const characterId=options.current().id;
 const active=()=>options.active()&&options.current().id===characterId;
 const checkPayments=()=>{if(pendingPsionicPayments(characterId,true).some(v=>v.request.requestId===id||('effectRollId' in v.request&&v.request.effectRollId===id)))throw new Error('Confirm the saved dice payment before finishing this roll.');};
 checkPayments();const row=(await p.getEffectRolls()).find(r=>r.requestId===id);
 if(!row||row.characterId!==characterId)throw new Error('The paid effect record is unavailable. Do not roll or spend again.');
 if(!active())return null;
 if(row.expiredByLongRest)throw new Error('A Long Rest ended this unapplied Biofeedback benefit.');
 if(!row.finalized){
  const turn=await p.getDisciplineTurn();if(!active())return null;
  if(sameTurn(row.turn,turn.turn)){
   const enhanced=await offerPsionicRollEnhancements({...options,effectRollId:id,roll:row.originalRolls[0],rolls:row.originalRolls,sides:row.sides,feature:row.discipline==='biofeedback'?'Biofeedback':'Destructive Thoughts',skipEnkindled:row.enkindledRolls.length>0||row.usedSurge,skipSurge:row.usedSurge,active});
   if(enhanced?.unconfirmed||!active())return null;
  }else options.warn('The turn changed. Keeping the dice already paid; no new enhancements are available.');
 }
 if(!active())return null;checkPayments();return p.finalizeEffectRoll(id);
}
