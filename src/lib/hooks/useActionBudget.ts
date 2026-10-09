import {useEffect,useState} from 'react';
import {ACTION_BUDGET_CHANGED,getActionBudget,type SavedActionBudget} from '../api/actionBudget';
/** Saved claims only change through verified server reads. A failed refresh keeps
 * the last known spent state; late reads cannot update a different character. */
export function useActionBudget(characterId:string,enabled=true){
 const [state,setState]=useState<{id:string;budget:SavedActionBudget|null;error:string}>({id:characterId,budget:null,error:''});
 useEffect(()=>{
  if(!enabled)return;
  let stopped=false,running=false,requested=0;
  async function refresh(){
   requested++;if(running)return;running=true;
   try{do{const revision=requested;
    try{const budget=await getActionBudget(characterId);if(!stopped&&revision===requested)setState(old=>old.id===characterId&&old.error===''&&JSON.stringify(old.budget)===JSON.stringify(budget)?old:{id:characterId,budget,error:''});}
    catch{if(!stopped&&revision===requested)setState(old=>({id:characterId,budget:old.id===characterId?old.budget:null,error:'Saved actions could not be refreshed. Last confirmed spending is retained.'}));}
    if(stopped||revision===requested)break;
   }while(!stopped);}finally{running=false;}
  }
  const update=()=>{void refresh();};update();
  const timer=setInterval(()=>{if(!running)update();},5000);
  window.addEventListener(ACTION_BUDGET_CHANGED,update);window.addEventListener('dndkeep:psionic-payment-changed',update);
  window.addEventListener('focus',update);window.addEventListener('storage',update);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener(ACTION_BUDGET_CHANGED,update);window.removeEventListener('dndkeep:psionic-payment-changed',update);window.removeEventListener('focus',update);window.removeEventListener('storage',update);};
 },[characterId,enabled]);
 return enabled&&state.id===characterId?{budget:state.budget,error:state.error}:{budget:null,error:''};
}
