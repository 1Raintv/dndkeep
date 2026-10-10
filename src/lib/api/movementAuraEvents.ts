import {psionicRpc} from './psionicTurns';
export interface MovementAuraEvent {
 id:string;sequence:string;campaignId:string;encounterId:string;turnId:string;placementId:string;capturedAt:string;
 context:Record<string,unknown>;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sequence=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
const invalid=()=>new Error('Movement aura history could not be verified. Keep the move for DM review.');
/** v2.869: immutable evidence, NOT a claim that any aura triggered. Cursor values
 * stay decimal strings to preserve Postgres bigint precision. DM auth is server-side. */
export async function readMovementAuraEvents(encounterId:string,before:string|null=null,limit=50):Promise<MovementAuraEvent[]> {
 if(!uuid(encounterId)||(before!==null&&!sequence(before))||!Number.isInteger(limit)||limit<1||limit>100)throw invalid();
 const rows:unknown=await psionicRpc('read_movement_aura_events',{p_encounter:encounterId,p_before:before,p_limit:limit},true);
 return verifyMovementAuraEvents(rows,encounterId,before,limit);
}
export function verifyMovementAuraEvents(rows:unknown,encounterId:string,before:string|null=null,limit=50,ascending=false):MovementAuraEvent[]{
 if(!uuid(encounterId)||(before!==null&&!sequence(before))||!Number.isInteger(limit)||limit<1||limit>100||!Array.isArray(rows)||rows.length>limit)throw invalid();
 const ids=new Set<string>();let previous=before,campaign:string|undefined;
 for(const r of rows){
  if(!object(r)||!uuid(r.id)||ids.has(r.id)||!sequence(r.sequence)||r.encounterId!==encounterId||!uuid(r.campaignId)
   ||(campaign!==undefined&&r.campaignId!==campaign)||!uuid(r.turnId)||!uuid(r.placementId)
   ||typeof r.capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(r.capturedAt)||!Number.isFinite(Date.parse(r.capturedAt))||!object(r.context)
   ||r.context.version!==1||r.context.geometryVerified!==false||typeof r.context.kind!=='string'||!['position','scene_transfer','identity_change'].includes(r.context.kind)
   ||typeof r.context.source!=='string'||!['scene_tokens','scene_token_placements'].includes(r.context.source)||!Array.isArray(r.context.tokens)
   ||!Array.isArray(r.context.moverParticipantIds)||!r.context.moverParticipantIds.length||!r.context.moverParticipantIds.every(uuid)
   ||new Set(r.context.moverParticipantIds).size!==r.context.moverParticipantIds.length
   ||!('from' in r.context)||!('to' in r.context)||![r.context.from,r.context.to].every(v=>v===null||object(v))
   ||(r.context.from===null&&r.context.to===null)||!Array.isArray(r.context.scenes)||!Array.isArray(r.context.participants)
   ||(previous!==null&&(ascending?BigInt(r.sequence)<=BigInt(previous):BigInt(r.sequence)>=BigInt(previous))))throw invalid();
  ids.add(r.id);previous=r.sequence;campaign=r.campaignId;
 }
 return structuredClone(rows) as MovementAuraEvent[];
}
