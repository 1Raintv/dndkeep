import type {useModal} from '../../shared/Modal';
/** Retry the same saved request, never create a new payment after a lost response. */
export async function confirmPsionicPayment<T>(pay:()=>Promise<T>,options:{active:()=>boolean;confirm:ReturnType<typeof useModal>['confirm'];warn:(message:string)=>void;feature:string}){
 for(;;){
  try{return {status:'paid' as const,receipt:await pay()};}
  catch(error){
   const message=error instanceof Error?error.message:'Dice cost could not be confirmed.';
   if(error&&typeof error==='object'&&'definitelyNotPaid' in error&&error.definitelyNotPaid===true){options.warn(message);return {status:'rejected' as const};}
   if(options.active()&&await options.confirm({title:'Dice cost not confirmed',message:`${options.feature}: ${message} Retry this same dice cost, or check the saved-roll notice and History before resolving the feature. Do not spend or roll again.`,confirmLabel:'Retry same roll',cancelLabel:'Resolve later'}))continue;
   options.warn(`${options.feature}: dice cost is unconfirmed. Use the saved-roll recovery notice; the feature result was not applied.`);
   return {status:'unknown' as const};
  }
 }
}
