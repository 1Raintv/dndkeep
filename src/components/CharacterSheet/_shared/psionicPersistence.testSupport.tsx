import {useMemo,useRef,type ComponentType} from 'react';
import type {Character} from '../../../types';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
/** Component tests stub a server receipt. Real locking, limits and history are
 * exercised by psion-turn-ledger.spec.ts, not reproduced by this fake. */
export function testPsionicPersistence(current:()=>Character,ack:(patch:Partial<Character>)=>void=()=>{}):PsionicEnhancementPersistence{
 let accepted=current(),spent=accepted.hit_dice_spent??0,revision=accepted.psionic_hit_dice_revision??0;
 function pay(count:number){const c=current();if(c!==accepted){accepted=c;spent=c.hit_dice_spent??0;revision=c.psionic_hit_dice_revision??revision;}spent+=count;revision++;ack({hit_dice_spent:spent});return {hitDiceSpent:spent,hitDiceRevision:revision,replayed:false};}
 return {getTurn:async()=>({turn:{soloTurn:0},used:null}),spend:async request=>({requestId:request.requestId,extraRolls:request.extraRolls,...pay(request.count)}),surge:async request=>{
  const rolls=request.rolls.map(n=>Math.max(4,n));return {requestId:request.requestId,rolls,total:rolls.reduce((a,b)=>a+b,0),...pay(1)};
 }};
}
type Base={character:Character;onUpdate:(patch:Partial<Character>)=>void;persistence?:PsionicEnhancementPersistence};
export function withTestPsionicPersistence<P extends Base>(Component:ComponentType<P>){
 return function Wrapper(props:P){
  const latest=useRef(props);latest.current=props;
  const persistence=useMemo(()=>testPsionicPersistence(()=>latest.current.character,patch=>latest.current.onUpdate(patch)),[props.character.id]);
  return <Component {...props} persistence={props.persistence??persistence}/>;
 };
}
