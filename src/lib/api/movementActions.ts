import {psionicRpc} from './psionicTurns';
export type MovementActionKind='dash'|'disengage';
export interface MovementActionReceipt {encounterId:string;participantId:string;turnId:string;kind:MovementActionKind;requestId:string;replayed:boolean}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** The button supplies the rendered turn. A delayed click must never read a
 * newer turn and spend its Action. Server receipts deduplicate this exact use. */
export async function commitMovementAction(encounterId:string|null,participantId:string,turnId:string|undefined,kind:MovementActionKind):Promise<MovementActionReceipt>{
 if(!uuid(encounterId)||!uuid(participantId)||!uuid(turnId)||!['dash','disengage'].includes(kind))throw new Error('The movement turn could not be verified. Refresh combat.');
 const result=await psionicRpc('take_movement_action',{p_encounter:encounterId,p_participant:participantId,p_turn:turnId,p_kind:kind},true) as MovementActionReceipt|null;
 if(!result||result.encounterId!==encounterId||result.participantId!==participantId||result.turnId!==turnId||result.kind!==kind||!uuid(result.requestId)||typeof result.replayed!=='boolean')throw new Error('Movement action could not be confirmed. Check combat before retrying.');
 return result;
}
