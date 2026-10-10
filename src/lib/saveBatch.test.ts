import {beforeEach,expect,it,vi} from 'vitest';
import type {CombatParticipant} from '../types';
const m=vi.hoisted(()=>({rpc:vi.fn(),paid:vi.fn(),single:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn()}));
vi.mock('./api/psionicTurns',()=>({psionicRpc:m.paid}));
beforeEach(()=>{vi.clearAllMocks();m.from.mockReturnValue({select:m.select});m.select.mockReturnValue({eq:m.eq});m.eq.mockReturnValue({single:m.single});m.single.mockResolvedValue({data:{psionic_turn_id:'turn'},error:null});});
vi.mock('./supabase',()=>({supabase:{rpc:m.rpc,from:m.from}}));
vi.mock('./combatEvents',()=>({newChainId:()=> 'chain'}));
import {declareSaveBatch} from './saveBatch';
it('sends the exact rider metadata with its target declaration',async()=>{
 const conditionIntent={conditionName:'Frightened',sourcePrefix:'monster_action' as const,sourceKind:'frightful_presence',durationRounds:10,saveToEnd:{ability:'WIS',dc:15}};
 m.rpc.mockResolvedValue({data:[{pending_attack_id:'attack',target_participant_id:'target',target_name:'Target',immune_to_condition:false}],error:null});
 const result=await declareSaveBatch({campaignId:'campaign',encounterId:'encounter',attacker:{id:'actor',name:'Actor',type:'creature'},attackName:'Frightful Presence',saveDC:15,saveAbility:'WIS',saveSuccessEffect:'none',damageDice:null,damageType:null,inferredCondition:'frightened',conditionIntent,targets:[{id:'target',name:'Target',entity_id:'entity',participant_type:'character',is_dead:false} as CombatParticipant]});
 expect(m.rpc).toHaveBeenCalledWith('declare_save_batch',expect.objectContaining({p_targets:[expect.objectContaining({participant_id:'target',condition_intent:conditionIntent})]}));expect(result?.rows[0].pendingAttackId).toBe('attack');
});

const paidInput=()=>({campaignId:'campaign',encounterId:'encounter',attacker:{id:'actor',name:'Actor',type:'creature' as const},attackName:'Wing',saveDC:15,saveAbility:'DEX' as const,saveSuccessEffect:'none' as const,damageDice:null,damageType:null,inferredCondition:null,legendaryCost:2,targets:[{id:'target',name:'Target',entity_id:'entity',participant_type:'character',is_dead:false} as CombatParticipant]});
const paidReceipt=()=>({chainId:'chain',turnId:'turn',cost:2,remaining:1,replayed:false,rows:[{pending_attack_id:'attack',target_participant_id:'target',target_name:'Target',immune_to_condition:false}]});
it('charges with declaration using the verified turn and an idempotent request',async()=>{
 m.paid.mockResolvedValue(paidReceipt());expect((await declareSaveBatch(paidInput()))?.rows[0].pendingAttackId).toBe('attack');
 expect(m.paid).toHaveBeenCalledWith('declare_paid_legendary_saves',{p_request:expect.objectContaining({p_turn_id:'turn',p_legendary_cost:2,p_chain_id:'chain'})},true);expect(m.rpc).not.toHaveBeenCalled();
});
it.each([{chainId:'other'},{turnId:'other'},{cost:1},{remaining:-1},{replayed:null}])('rejects an unverifiable payment receipt %j',async change=>{
 m.paid.mockResolvedValue({...paidReceipt(),...change});await expect(declareSaveBatch(paidInput())).rejects.toThrow(/could not be verified/);
});
it('does not charge if the turn cannot be read',async()=>{
 m.single.mockResolvedValue({data:null,error:{message:'offline'}});await expect(declareSaveBatch(paidInput())).rejects.toThrow(/verify/);expect(m.paid).not.toHaveBeenCalled();
});

it.each([null,[],[{pending_attack_id:'attack',target_participant_id:'unknown',target_name:'Unknown',immune_to_condition:false}]])('rejects incomplete paid target receipts %j',async rows=>{
 m.paid.mockResolvedValue({...paidReceipt(),rows});await expect(declareSaveBatch(paidInput())).rejects.toThrow(/targets could not be verified/);
});
