/** v2.746 — bound a token-position save. supabase-js PostgREST calls carry
 * no timeout, and now that the drag lease is renewed for as long as a save
 * is pending (useTokenDragSharing), an unbounded PATCH — captive portal,
 * half-open socket, tab throttled mid-request — would keep the sender's
 * "Saving move…" badge and EVERY peer's lock (and therefore
 * isMapMovementBusy → every target picker) alive forever. 15 s is far past
 * any healthy round-trip and short enough that a stuck table recovers on
 * its own. A rejection still propagates; only silence is converted. */
export const SAVE_TIMEOUT_MS=15_000;
export function withTimeout<T>(promise:Promise<T>,ms:number,onTimeout:()=>T):Promise<T> {
  return new Promise<T>((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;resolve(onTimeout());},ms);
    promise.then(
      value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},
      error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);},
    );
  });
}
