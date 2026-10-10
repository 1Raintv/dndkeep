import {expect,it,vi} from 'vitest';
import type {CombatParticipant} from '../types';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{rpc:m.rpc}}));
vi.mock('./combatEvents',()=>({newChainId:()=> 'chain'}));
import {declareSaveBatch} from './saveBatch';
it('sends the exact rider metadata with its target declaration',async()=>{
 const conditionIntent={conditionName:'Frightened',sourcePrefix:'monster_action' as const,sourceKind:'frightful_presence',durationRounds:10,saveToEnd:{ability:'WIS',dc:15}};
 m.rpc.mockResolvedValue({data:[{pending_attack_id:'attack',target_participant_id:'target',target_name:'Target',immune_to_condition:false}],error:null});
 const result=await declareSaveBatch({campaignId:'campaign',encounterId:'encounter',attacker:{id:'actor',name:'Actor',type:'creature'},attackName:'Frightful Presence',saveDC:15,saveAbility:'WIS',saveSuccessEffect:'none',damageDice:null,damageType:null,inferredCondition:'frightened',conditionIntent,targets:[{id:'target',name:'Target',entity_id:'entity',participant_type:'character',is_dead:false} as CombatParticipant]});
 expect(m.rpc).toHaveBeenCalledWith('declare_save_batch',expect.objectContaining({p_targets:[expect.objectContaining({participant_id:'target',condition_intent:conditionIntent})]}));expect(result?.rows[0].pendingAttackId).toBe('attack');
});
