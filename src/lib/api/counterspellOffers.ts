import {supabase} from '../supabase';
const active=new Map<string,{request:string;promise:Promise<number>}>();
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** v2.804: prompts belong to a stable cast, not a component mount/network attempt.
 * The server owns their identity, names and deadline. It also preserves declined
 * offers, which the caster cannot necessarily read through ordinary table RLS. */
export function offerCounterspellOnce(castId:string,candidateIds:readonly string[]):Promise<number>{
 if(!uuid(castId)||candidateIds.length>128||candidateIds.some(id=>!uuid(id)))return Promise.reject(new Error('Invalid Counterspell candidates.'));
 const args={p_cast_id:castId,p_candidates:[...new Set(candidateIds)].sort()},request=JSON.stringify(args),running=active.get(castId);
 if(running)return running.request===request?running.promise:Promise.reject(new Error('Counterspell prompts are still being confirmed.'));
 const client=supabase as unknown as {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>};
 const promise=(async()=>{
  for(let attempt=0;;attempt++){
   let data:unknown;
   try{const result=await client.rpc('offer_counterspell_once',args);if(result.error)throw result.error;data=result.data;}
   catch(error){const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
    if(attempt===0&&!['P0001','42501','22023'].includes(code))continue;
    throw new Error(error&&typeof error==='object'&&'message' in error?String(error.message):'Counterspell prompts could not be confirmed.');}
   const receipt=data as {castId?:unknown;offerCount?:unknown}|null;
   if(!receipt||receipt.castId!==castId||typeof receipt.offerCount!=='number'||!Number.isSafeInteger(receipt.offerCount)||receipt.offerCount<0)
    throw new Error('The Counterspell prompt receipt could not be verified.');
   return receipt.offerCount;
  }
 })().finally(()=>active.delete(castId));
 active.set(castId,{request,promise});return promise;
}
