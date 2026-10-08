import {psionProgression} from '../../../rules/psionProgression';
import {psionicPoolRemaining,psionicDieCount} from '../../../rules/psionicRestoration';
import {useMemo,useRef,type ComponentType} from 'react';
import type {Character} from '../../../types';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
/** Component tests stub a server receipt. Real locking, limits and history are
 * exercised by psion-turn-ledger.spec.ts, not reproduced by this fake. */
export function testPsionicPersistence(current:()=>Character,ack:(patch:Partial<Character>)=>void=()=>{}):PsionicEnhancementPersistence{
 let accepted=current(),spent=accepted.hit_dice_spent??0,revision=accepted.psionic_hit_dice_revision??0;
 function pay(count:number){const c=current();if(c!==accepted){accepted=c;spent=c.hit_dice_spent??0;revision=c.psionic_hit_dice_revision??revision;}spent+=count;revision++;ack({hit_dice_spent:spent});return {hitDiceSpent:spent,hitDiceRevision:revision,replayed:false};}
 return {energy:async request=>{
  const c=current(),level=psionProgression(c)?.level??0,remaining=request.operation==='restore'?psionicDieCount(level):(psionicPoolRemaining(level,c.class_resources?.['psionic-energy-dice'])??0)-request.count;
  const patch={class_resources:{...c.class_resources,'psionic-energy-dice':remaining,...(request.operation==='restore'?{'psionic-restoration':0}:{})},...(request.operation==='restore'?{feature_uses:{...c.feature_uses,'Psionic Restoration':1}}:{})};
  ack(patch);return {requestId:request.requestId,remaining,restorationResource:request.operation==='restore'?0:null,restorationUsed:request.operation==='restore'?1:null,energyRevision:(c.psionic_energy_revision??0)+1,rolls:request.rolls,replayed:false};
 },getTurn:async()=>({turn:{soloTurn:0},used:null}),spend:async request=>({requestId:request.requestId,extraRolls:request.extraRolls,...pay(request.count)}),surge:async request=>{
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
