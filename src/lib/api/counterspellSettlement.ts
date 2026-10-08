import {supabase} from '../supabase';
import {settlePaidSpell} from './declaredSpells';
import {emitCombatEvent} from '../combatEvents';
import type {PendingAttack} from '../../types';
/** v2.804: settlement uses the saved roll, including on a retry. Paid casts
 * never fall back to loose outcome writes or a guessed slot refund. */
export async function settleCounterspellSave(attack:PendingAttack){
 if(!attack.attack_name?.startsWith('Counterspell')||!attack.save_result||attack.pending_lr_decision)return;
 const lookup=await supabase.from('pending_spell_casts').select('id,state,caster_character_id').eq('counterspell_attack_id',attack.id).eq('campaign_id',attack.campaign_id).maybeSingle();
 if(lookup.error)throw new Error(lookup.error.message);const cast=lookup.data;if(!cast)return;
 if(cast.caster_character_id){const receipt=await settlePaidSpell(cast.id);if(!('legacy' in receipt))return;}
 // Explicitly untracked historical casts retain their previous resolution path.
 // Never infer that an old, unrecorded payment is refundable.
 if(cast.state!=='counterspell_offered')return;
 const saved=attack.save_result==='passed',outcome=saved?'saved_through':'countered';
 const update=await supabase.from('pending_spell_casts').update({state:saved?'resolved':'countered',outcome,resolved_at:new Date().toISOString()})
  .eq('id',cast.id).eq('counterspell_attack_id',attack.id).eq('state','counterspell_offered').select('id').maybeSingle();
 if(update.error)throw new Error(update.error.message);if(!update.data)return;
 await emitCombatEvent({campaignId:attack.campaign_id,encounterId:attack.encounter_id,chainId:attack.chain_id,sequence:71,
  actorType:'system',actorName:'System',targetType:attack.target_type==='character'?'player':['monster','npc'].includes(attack.target_type??'')?'creature':attack.target_type,
  targetName:attack.target_name,eventType:'spell_counterspell_resolved',payload:{spell_cast_id:cast.id,target_saved:saved,outcome,save_d20:attack.save_d20,save_total:attack.save_total}});
}
