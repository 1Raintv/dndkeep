import {supabase} from '../supabase';
import {declareAttack} from '../pendingAttack';
import {JOINED_COMBATANT_FIELDS,normalizeParticipantRow} from '../combatParticipantNormalize';
import type {CombatParticipant} from '../../types';
export interface PsionicDamageContext {campaignId:string;encounterId:string;self:CombatParticipant;participants:CombatParticipant[]}
export async function loadPsionicDamageContext(campaignId:string|null|undefined,characterId:string):Promise<PsionicDamageContext|null>{
 if(!campaignId)return null;
 const {data:enc,error}=await supabase.from('combat_encounters').select('id').eq('campaign_id',campaignId).eq('status','active').maybeSingle();
 if(error)throw error;if(!enc)return null;
 const {data,error:participantsError}=await (supabase as any).from('combat_participants').select('*, '+JOINED_COMBATANT_FIELDS).eq('encounter_id',enc.id);
 if(participantsError)throw participantsError;
 const participants=(data??[]).map(normalizeParticipantRow) as CombatParticipant[];
 const self=participants.find(p=>p.participant_type==='character'&&p.entity_id===characterId);
 if(!self)return null;
 return {campaignId,encounterId:enc.id,self,participants};
}
/** Submit a fixed, already-paid roll through the normal auto-hit damage flow.
 * The DM retains normal damage/reaction resolution; the spell's save is irrelevant. */
export async function queuePsionicDamage(input:{requestId:string;context:PsionicDamageContext;target:CombatParticipant;characterId:string;characterName:string;amount:number}){
 const {context,target}=input;
 if(!Number.isInteger(input.amount)||input.amount<1)throw new Error('Invalid Psychic damage total');
 // A lost response may already have inserted the row. Never create a second one.
 const {data:existing,error:existingError}=await supabase.from('pending_attacks').select('id').eq('id',input.requestId).eq('campaign_id',context.campaignId).maybeSingle();
 if(existingError)throw existingError;if(existing)return;
 const fresh=await loadPsionicDamageContext(context.campaignId,input.characterId);
 const currentTarget=fresh?.participants.find(p=>p.id===target.id);
 if(!fresh||fresh.encounterId!==context.encounterId||!currentTarget)throw new Error('The encounter or target changed. Keep the rolled damage for manual resolution.');
 const attack=await declareAttack({requestId:input.requestId,campaignId:fresh.campaignId,encounterId:fresh.encounterId,
  attackerParticipantId:fresh.self.id,attackerName:input.characterName,attackerType:'character',
  targetParticipantId:currentTarget.id,targetName:currentTarget.name,targetType:currentTarget.participant_type,
  attackSource:'ability',attackName:'Destructive Thoughts',attackKind:'auto_hit',damageDice:String(input.amount),damageType:'Psychic'});
 if(!attack)throw new Error('Damage could not be queued. Retry this result without spending again.');
}
