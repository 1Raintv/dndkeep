import {PsionicRequestError} from './api/psionicTurns';
import {rememberPsionicPayment,forgetPsionicPayment,setPsionicPaymentActive,hasSavedPsionicPayment,type PendingPsionicPayment} from './psionicPaymentRecovery';
/** v2.784 — player and DM transactions share one durable request lifecycle.
 * Never clear an ambiguous outcome; only an acknowledged or rejected request. */
export async function settleSavedPsionicPayment<T>(characterId:string,payment:PendingPsionicPayment,send:()=>Promise<T>):Promise<T>{
 const saved=hasSavedPsionicPayment(characterId,payment.request.requestId);
 setPsionicPaymentActive(characterId,payment.request.requestId,true);
 try{
  try{rememberPsionicPayment(characterId,payment);}catch{throw new PsionicRequestError('Browser recovery storage is unavailable. No new request was sent.',!saved);}
  let receipt:T;
  try{receipt=await send();}catch(error){
   if(error instanceof PsionicRequestError&&error.definitelyNotPaid)forgetPsionicPayment(characterId,payment.request.requestId);
   throw error;
  }
  forgetPsionicPayment(characterId,payment.request.requestId);
  return receipt;
 }finally{setPsionicPaymentActive(characterId,payment.request.requestId,false);}
}
