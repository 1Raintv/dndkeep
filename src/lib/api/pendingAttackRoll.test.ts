import {beforeEach,expect,it,vi} from 'vitest';
import {recordPendingAttackRoll} from './pendingAttackRoll';
import type {PendingAttack} from '../../types';
import type {AttackRollSnapshot} from '../../rules/attackRollSnapshot';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('./psionicTurns',async original=>({...await original<typeof import('./psionicTurns')>(),psionicRpc:m.rpc}));
const id='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222';
const attack={id,campaign_id:campaign,encounter_id:null,attacker_participant_id:null,target_participant_id:null,updated_at:'2026-10-10T00:00:00Z'} as PendingAttack;
const snapshot:AttackRollSnapshot={version:1,attackId:id,campaignId:campaign,encounterId:null,attackerId:null,targetId:null,d20:10,total:15,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'};
const result=()=>({...attack,state:'attack_rolled',attack_d20:10,attack_total:15,target_ac:15,hit_result:'hit',attack_roll_snapshot:snapshot});
beforeEach(()=>{m.rpc.mockReset();m.rpc.mockResolvedValue({attack:result(),replayed:false});});
it('sends the original revision, evidence and buffs with idempotent retry',async()=>{
 expect(await recordPendingAttackRoll(attack,snapshot,null)).toMatchObject({replayed:false});
 expect(m.rpc).toHaveBeenCalledWith('record_pending_attack_roll',{p_attack_id:id,p_expected_updated_at:attack.updated_at,p_snapshot:snapshot,p_expected_buffs:null},true);
});
it.each([{attackId:campaign},{total:14},{targetId:campaign}])('rejects invalid or mismatched original evidence before sending %j',async patch=>{
 await expect(recordPendingAttackRoll(attack,{...snapshot,...patch},null)).rejects.toMatchObject({definitelyNotPaid:true});expect(m.rpc).not.toHaveBeenCalled();
});
it.each([{attack_total:16},{hit_result:'miss'},{state:'declared'},{attack_roll_snapshot:null},{campaign_id:id}])('rejects unverifiable saved results %j',async patch=>{
 m.rpc.mockResolvedValue({attack:{...result(),...patch},replayed:false});await expect(recordPendingAttackRoll(attack,snapshot,null)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('returns a competing saved roll without requiring it to equal discarded local dice',async()=>{
 const winner={...result(),attack_d20:11,attack_total:16,attack_roll_snapshot:{...snapshot,d20:11,total:16}};m.rpc.mockResolvedValue({attack:winner,replayed:true});
 expect(await recordPendingAttackRoll(attack,snapshot,null)).toEqual({attack:winner,replayed:true});
});
