import {psionicRpc} from './psionicTurns';
export interface TeleporterFollowup {
 parentId:string;characterId:string;turnId:string;psionLevel:number;
 kind:'free'|'slot';status:'waiting'|'ready'|'interrupted';encounterId:string|null;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** Read-only recovery hint. Casting must still consume the parent transactionally;
 * neither a cached ready state nor this endpoint grants another action. */
export async function getTeleporterFollowup(characterId:string):Promise<TeleporterFollowup|null>{
 if(!uuid(characterId))throw new Error('Invalid character for Teleporter Combat.');
 const value=await psionicRpc('get_teleporter_combat_followup',{p_character:characterId},true) as TeleporterFollowup|null;
 if(value===null)return null;
 if(!value||!uuid(value.parentId)||value.characterId!==characterId||typeof value.turnId!=='string'||!value.turnId
  ||!Number.isInteger(value.psionLevel)||value.psionLevel<6||value.psionLevel>20
  ||!['free','slot'].includes(value.kind)||!['waiting','ready','interrupted'].includes(value.status)
  ||!(value.encounterId===null||uuid(value.encounterId))||value.kind==='free'&&value.status!=='ready'
  ||value.kind==='slot'&&value.encounterId===null)throw new Error('The Misty Step follow-up could not be verified.');
 return value;
}
