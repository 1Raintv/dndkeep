import {readPropel,getPropelContext,getPropelEnhancements,finalizePropel} from '../../../lib/api/psionicPropel';
import {pendingPsionicPayments} from '../../../lib/psionicPaymentRecovery';
import {psionicDieSides} from '../../../rules/psionicRestoration';
import {offerPsionicRollEnhancements} from './offerPsionicRollEnhancements';
/** Resume only the saved base and paid extras. Finalization freezes all choices
 * before a save outcome can be submitted; stale turns cannot buy enhancements. */
export async function continuePropel(id:string,options:Parameters<typeof offerPsionicRollEnhancements>[0]){
 if(!options.active())return null;
 const characterId=options.current().id;
 const active=()=>options.active()&&options.current().id===characterId;
 const checkPayments=()=>{if(pendingPsionicPayments(characterId,true).some(p=>'propelId' in p.request&&p.request.propelId===id))throw new Error('Confirm the saved Propel enhancement payment before resolving its save.');};
 checkPayments();const row=await readPropel(characterId,id);
 if(!active())return null;
 if(row.outcome!==null||row.roll_result)return row;
 if(row.mode==='powered'){
  const context=await getPropelContext(characterId);if(!active())return null;
  if(context.turnId===row.request.turnId){
   const paid=await getPropelEnhancements(row);if(!active())return null;
   const enhanced=await offerPsionicRollEnhancements({...options,propelId:id,activationId:undefined,effectRollId:undefined,
    roll:row.base_roll,rolls:[row.base_roll,...paid.extraRolls],sides:psionicDieSides(row.psion_level),feature:row.source_feature,
    skipEnkindled:paid.extraRolls.length>0||paid.usedSurge,skipSurge:paid.usedSurge,active});
   if(enhanced?.unconfirmed||!active())return null;
  }else options.warn('The turn changed. Keeping the saved roll and paid enhancements; no new enhancements are available.');
 }
 if(!active())return null;checkPayments();return finalizePropel(characterId,id);
}
