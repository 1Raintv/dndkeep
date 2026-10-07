import type {Character} from '../../../types';
import type {EnergyRequest,PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {acceptPsionicEnergyReceipt} from '../../../lib/characterRealtime';
import {confirmPsionicPayment} from './confirmPsionicPayment';
/** v2.784 — all callers retain one payment ID and acknowledge without a second
 * write. A late response must never update the next character's local ref. */
export async function payPsionicEnergy(persistence:PsionicEnhancementPersistence|undefined,latest:{current:Character},request:EnergyRequest,options:Omit<Parameters<typeof confirmPsionicPayment>[1],'feature'>){
 if(!persistence){options.warn('Energy Dice saving is unavailable. Try reopening this sheet.');return null;}
 const characterId=latest.current.id;
 const payment=await confirmPsionicPayment(()=>persistence.energy(request),{...options,feature:request.sourceFeature});
 if(payment.status!=='paid')return null;
 if(latest.current.id===characterId)acceptPsionicEnergyReceipt(latest,payment.receipt);
 return payment.receipt;
}
