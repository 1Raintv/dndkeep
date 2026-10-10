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
const history={advantageState:'normal' as const,d20Alt:null,exhaustionLevel:0,buffContributions:[]};
const result=()=>({...attack,state:'attack_rolled',attack_d20:10,attack_total:15,target_ac:15,hit_result:'hit',attack_roll_snapshot:snapshot});
beforeEach(()=>{m.rpc.mockReset();m.rpc.mockResolvedValue({attack:result(),replayed:false});});
it('sends the original revision, evidence and buffs with idempotent retry',async()=>{
 expect(await recordPendingAttackRoll(attack,snapshot,null,history)).toMatchObject({replayed:false});
 expect(m.rpc).toHaveBeenCalledWith('record_pending_attack_roll_with_history',{p_attack_id:id,p_expected_updated_at:attack.updated_at,p_snapshot:snapshot,p_expected_buffs:null,p_history:history},true);
});
it.each([{attackId:campaign},{total:14},{targetId:campaign}])('rejects invalid or mismatched original evidence before sending %j',async patch=>{
 await expect(recordPendingAttackRoll(attack,{...snapshot,...patch},null,history)).rejects.toMatchObject({definitelyNotPaid:true});expect(m.rpc).not.toHaveBeenCalled();
});
it.each([{attack_total:16},{hit_result:'miss'},{state:'declared'},{attack_roll_snapshot:null},{campaign_id:id}])('rejects unverifiable saved results %j',async patch=>{
 m.rpc.mockResolvedValue({attack:{...result(),...patch},replayed:false});await expect(recordPendingAttackRoll(attack,snapshot,null,history)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('returns a competing saved roll without requiring it to equal discarded local dice',async()=>{
 const winner={...result(),attack_d20:11,attack_total:16,attack_roll_snapshot:{...snapshot,d20:11,total:16}};m.rpc.mockResolvedValue({attack:winner,replayed:true});
 expect(await recordPendingAttackRoll(attack,snapshot,null,history)).toEqual({attack:winner,replayed:true});
});

it('freezes detailed history across caller edits while the saved request is pending',async()=>{
 let finish!:(value:unknown)=>void;m.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const detail={...history,buffContributions:[{key:'bless',name:'Bless',source:'spell:bless',dice:'1d4',rolls:[3],total:3}]};
 const pending=recordPendingAttackRoll(attack,snapshot,null,detail);detail.buffContributions[0].rolls[0]=4;
 expect(m.rpc.mock.calls[0][1].p_history.buffContributions[0].rolls).toEqual([3]);finish({attack:result(),replayed:false});await pending;
});
