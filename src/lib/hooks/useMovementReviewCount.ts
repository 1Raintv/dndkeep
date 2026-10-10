import {useCallback,useEffect,useRef,useState} from 'react';
import {movementAuraReviewCount} from '../api/movementAuraReviews';
/** Advisory status only. The server independently checks every turn boundary.
 * One read at a time; hidden tabs pause, scope changes discard old responses. */
export function useMovementReviewCount(encounterId:string){
 const [state,setState]=useState<{encounterId:string;count:string|null;failed:boolean}>({encounterId,count:null,failed:false});
 const refreshRef=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let alive=true,inFlight=false,queued=false,revision=0,timer:ReturnType<typeof setTimeout>|undefined;
  const visible=()=>document.visibilityState!=='hidden';
  const schedule=()=>{clearTimeout(timer);if(alive&&visible())timer=setTimeout(refresh,5000);};
  async function read(){
   if(!alive||!visible())return;
   if(inFlight){queued=true;return;}
   inFlight=true;queued=false;const started=revision;
   try{const count=await movementAuraReviewCount(encounterId);if(alive&&revision===started)setState({encounterId,count,failed:false});}
   catch{if(alive&&revision===started)setState({encounterId,count:null,failed:true});}
   finally{inFlight=false;if(alive){if(queued&&visible())void read();else schedule();}}
  }
  function refresh(){revision++;clearTimeout(timer);void read();}
  function visibility(){if(visible())refresh();else{revision++;clearTimeout(timer);}}
  refreshRef.current=refresh;refresh();
  document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
  return()=>{alive=false;revision++;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};
 },[encounterId]);
 const refresh=useCallback(()=>refreshRef.current(),[]);
 return {...(state.encounterId===encounterId?state:{count:null,failed:false}),refresh};
}
