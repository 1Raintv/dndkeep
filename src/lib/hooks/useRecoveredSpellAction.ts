import {useEffect,useRef} from 'react';
import {recoverableSpellAction,type ConfirmedSpellAction,type SpellActionKind} from '../../rules/spellActionCost';
/** v2.863: wait for combat context to load, then restore only this turn's cost.
 * The server also confirms currentTurnId, preventing stale provider state from
 * making an old replay look current. Never reset unrelated/manual action flags. */
export function useRecoveredSpellAction(castId:string,action:ConfirmedSpellAction|null|undefined,encounter:{id:string;status:string;psionic_turn_id?:string}|null,onAction:(kind:SpellActionKind)=>void){
 const announced=useRef(new Set<string>()),callback=useRef(onAction);callback.current=onAction;
 useEffect(()=>{const kind=recoverableSpellAction(action,encounter);if(!kind||!action)return;
  const key=castId+':'+action.turnId;if(announced.current.has(key))return;
  announced.current.add(key);callback.current(kind);
 },[castId,action,encounter]);
}
