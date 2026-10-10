import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),finish:vi.fn(),modifier:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('./psionicDamageApplication',()=>({finishPsionicDamageApplication:m.finish,psionicTargetConModifier:m.modifier}));
import {applyPsionicDamagePlan,previewPsionicDamage,type PsionicDamagePlan} from './psionicDamageResolution';
const plan=()=>({context:{attack:{id:'attack',damage_final:13,psionic_damage_dice:{version:1,sides:8,originalRolls:[1,5,3],rolls:[1,5,3],modifier:4}},target:null},choice:{},activations:[{id:'activation',total:8}],usedThisTurn:false,pendingActivation:false,defensesKnown:true,immune:false,resistant:true,vulnerable:false,bypass:true,damageBefore:13,damageAfter:13,replacement:null,turnId:'turn',attackerCharacterId:'actor'} as unknown as PsionicDamagePlan);
beforeEach(()=>{vi.clearAllMocks();m.modifier.mockReturnValue(2);m.finish.mockResolvedValue({state:'applied'});});
it('validates returned previews before exposing apply controls',async()=>{
 m.rpc.mockResolvedValue(plan());expect(await previewPsionicDamage('attack')).toEqual(plan());
 m.rpc.mockResolvedValue({...plan(),damageAfter:-1});await expect(previewPsionicDamage('attack')).rejects.toThrow('could not be verified');
});
it('a saved receipt bypasses stale targets and does not spend another turn use',async()=>{
 m.rpc.mockResolvedValue({saved:true});await applyPsionicDamagePlan(plan());expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.modifier).not.toHaveBeenCalled();expect(m.finish).toHaveBeenCalledWith({saved:true},'attack');
});
it('submits the captured plan and target modifier to one atomic write',async()=>{
 m.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce({done:true});const p=plan();await applyPsionicDamagePlan(p);
 expect(m.rpc).toHaveBeenLastCalledWith('apply_psionic_damage_resolution',{p_attack_id:'attack',p_expected:p,p_con_modifier:2},true);
});
it('does not apply an unresolved defense preview',async()=>{
 m.rpc.mockResolvedValue(null);await expect(applyPsionicDamagePlan({...plan(),defensesKnown:false,damageAfter:null})).rejects.toThrow('Review Psychic defenses');expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('detaches the clicked choice while awaiting the receipt probe',async()=>{
 let resolve!:(v:unknown)=>void;m.rpc.mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValueOnce({done:true});const p=plan();const pending=applyPsionicDamagePlan(p);p.choice.affinity='immune';resolve(null);await pending;
 expect(m.rpc.mock.calls[1][1].p_expected.choice).toEqual({});
});

it('rejects a plausible but incorrect positive damage total before any write',async()=>{
 const p={...plan(),damageAfter:12};m.rpc.mockResolvedValue(p);
 await expect(previewPsionicDamage('attack')).rejects.toThrow('could not be verified');
 m.rpc.mockClear();await expect(applyPsionicDamagePlan(p)).rejects.toThrow('Refresh');expect(m.rpc).not.toHaveBeenCalled();
});
