import {psionProgression} from '../../rules/psionProgression';
import {validPropelRecord,validPropelCursor,validatePropelPage,type PropelRecord,type PropelCursor,type PropelRoll,type PropelTarget} from './psionicPropel';
import {psionicRpc,PsionicRequestError} from './psionicTurns';
export type PropelMovementChoice='push'|'warp';
export interface PropelMovementReceipt {declarationId:string;characterId:string;choice:PropelMovementChoice|'none';feet:number;target:PropelTarget;roll:PropelRoll;replayed:boolean}
export type DeferredPropelRecord=PropelRecord&{movement_choice_required:true;movement_choice:PropelMovementReceipt|null};
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const invalid=()=>new PsionicRequestError('The saved movement could not be verified. Keep the original choice and confirm it before moving the target.',false);
/** The post-save receipt owns movement. Never replace the original payment or
 * interpret its legacy result.feet as permission to move a deferred target. */
export function validDeferredPropel(value:unknown,character:string):value is DeferredPropelRecord{
 if(!validPropelRecord(value,character))return false;
 const row=value as DeferredPropelRecord;
 if(row.movement_choice_required!==true||row.movement!=='push')return false;
 if(row.movement_choice===null)return true;
 const r=row.movement_choice,roll=row.roll_result;
 if(!r||row.outcome!=='failed'||!roll||r.declarationId!==row.request_id||r.characterId!==character||typeof r.replayed!=='boolean'
  ||!['push','warp','none'].includes(r.choice)||!r.target||!r.roll)return false;
 if(Object.keys(r.target).length!==Object.keys(row.target).length||Object.entries(row.target).some(([key,value])=>r.target[key as keyof PropelTarget]!==value))return false;
 if(r.roll.declarationId!==roll.declarationId||r.roll.total!==roll.total||r.roll.usedSurge!==roll.usedSurge
  ||(['originalRolls','enkindledRolls','rolls'] as const).some(key=>JSON.stringify(r.roll[key])!==JSON.stringify(roll[key])))return false;
 const progression=psionProgression(row.caster_snapshot);
 if(r.choice==='warp'&&(progression?.subclass!=='Psi Warper'||progression.level<3))return false;
 return r.feet===(r.choice==='none'?0:r.choice==='warp'?30:row.mode==='free'?5:5*roll.total);
}
async function call(character:string,operation:string,payload:Record<string,unknown>){
 if(!uuid(character))throw new PsionicRequestError('Invalid movement character.',true);
 return psionicRpc('propel_movement',{p_character:character,p_operation:operation,p_payload:structuredClone(payload)},true);
}
async function record(character:string,id:string,operation:string,choice?:PropelMovementChoice){
 if(!uuid(id))throw new PsionicRequestError('Invalid movement declaration.',true);
 const result=await call(character,operation,{declarationId:id,...(choice?{choice}:{})});
 if(!validDeferredPropel(result,character)||result.request_id!==id)throw invalid();return result;
}
export function readPropelMovement(character:string,id:string){return record(character,id,'read');}
export async function choosePropelMovement(character:string,id:string,choice:PropelMovementChoice){
 if(!['push','warp'].includes(choice))throw new PsionicRequestError('Choose push or Warp.',true);
 const row=await record(character,id,'choose',choice);
 if(row.movement_choice?.choice!==choice)throw invalid();return row;
}
/** Closing returns any committed winner; it never erases a movement choice. */
export async function closePropelMovement(character:string,id:string){
 const row=await record(character,id,'close');if(!row.movement_choice)throw invalid();return row;
}
export async function listPropelMovements(character:string,cursor:PropelCursor|null=null){
 if(!validPropelCursor(cursor))throw new PsionicRequestError('Invalid movement recovery cursor.',true);
 const result=await call(character,'list',{beforeTime:cursor?.createdAt??null,beforeId:cursor?.requestId??null});
 return validatePropelPage(result,character,cursor,row=>validDeferredPropel(row,character)&&row.outcome==='failed'&&row.movement_choice===null) as {items:DeferredPropelRecord[];nextCursor:PropelCursor|null};
}
