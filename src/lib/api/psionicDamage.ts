import {psionicDamageComponent,readPsionicDamageDice,type PsionicDamageDice} from '../../rules/psionicDamageDice';
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
export async function queuePsionicDamage(input:{effectRollId?:string;requestId:string;context:PsionicDamageContext;target:CombatParticipant;characterId:string;characterName:string;amount:number;psionicDamageDice:PsionicDamageDice}){
 const {context,target}=input;
 // v2.850: a paid roll belongs to the original roster identities. A renamed
 // participant is fine; a repointed character/creature or combatant is not.
 const sameParticipant=(a:CombatParticipant,b:CombatParticipant)=>a.id===b.id&&a.participant_type===b.participant_type&&a.entity_id===b.entity_id&&(a.combatant_id??null)===(b.combatant_id??null);
 if(context.self.participant_type!=='character'||context.self.entity_id!==input.characterId||!context.participants.some(p=>sameParticipant(p,target)))throw new Error('The saved Psychic damage participants do not match. Keep the result for manual resolution.');
 if(!Number.isInteger(input.amount)||input.amount<1)throw new Error('Invalid Psychic damage total');
 const dice=readPsionicDamageDice(input.psionicDamageDice);if(!dice||psionicDamageComponent(dice).rawTotal!==input.amount)throw new Error('Saved Psychic damage dice do not match the total.');
 // v2.852: linked rolls are delivered from server-owned dice and target metadata.
 // Do not fall back to a client declaration when this receipt is unavailable.
 if(input.effectRollId!==undefined){
  if(input.effectRollId!==input.requestId)throw new Error('The saved effect identity changed.');
  const {data,error}=await (supabase as any).rpc('queue_destructive_thoughts_effect',{p_character_id:input.characterId,p_activation_id:input.effectRollId});
  if(error)throw error;
  if(!data||data.effect!=='destructive-thoughts'||data.requestId!==input.requestId||data.characterId!==input.characterId||data.attackId!==input.requestId||typeof data.replayed!=='boolean')throw new Error('Damage delivery could not be confirmed. Retry this saved result without spending again.');
  return;
 }
 // A lost response may already have inserted the row. Never create a second one.
 const matches=(row:Record<string,unknown>)=>row.campaign_id===context.campaignId&&row.encounter_id===context.encounterId&&row.attack_source==='ability'&&row.attacker_type==='character'&&row.target_type===target.participant_type&&row.attacker_participant_id===context.self.id&&row.target_participant_id===target.id&&row.attack_kind==='auto_hit'&&row.attack_name==='Destructive Thoughts'&&row.damage_dice===String(input.amount)&&String(row.damage_type).toLowerCase()==='psychic'&&JSON.stringify(readPsionicDamageDice(row.psionic_damage_dice))===JSON.stringify(dice);
 const {data:existing,error:existingError}=await supabase.from('pending_attacks').select('id,campaign_id,encounter_id,attack_source,attacker_type,target_type,attacker_participant_id,target_participant_id,attack_kind,attack_name,damage_dice,damage_type,psionic_damage_dice').eq('id',input.requestId).eq('campaign_id',context.campaignId).maybeSingle();
 if(existingError)throw existingError;if(existing){if(!matches(existing))throw new Error('The queued result differs from these saved dice or target. Check combat before applying damage.');return;}
 const fresh=await loadPsionicDamageContext(context.campaignId,input.characterId);
 const currentTarget=fresh?.participants.find(p=>p.id===target.id);
 if(!fresh||fresh.encounterId!==context.encounterId||!currentTarget||!sameParticipant(fresh.self,context.self)||!sameParticipant(currentTarget,target))throw new Error('The encounter or target changed. Keep the rolled damage for manual resolution.');
 const attack=await declareAttack({requestId:input.requestId,campaignId:fresh.campaignId,encounterId:fresh.encounterId,
  attackerParticipantId:fresh.self.id,attackerName:input.characterName,attackerType:'character',
  targetParticipantId:currentTarget.id,targetName:currentTarget.name,targetType:currentTarget.participant_type,
  psionicDamageDice:dice,attackSource:'ability',attackName:'Destructive Thoughts',attackKind:'auto_hit',damageDice:String(input.amount),damageType:'Psychic'});
 if(!attack)throw new Error('Damage could not be queued. Retry this result without spending again.');
 if(!matches(attack as unknown as Record<string,unknown>))throw new Error('The queued result differs from these saved dice or target. Check combat before applying damage.');
}
