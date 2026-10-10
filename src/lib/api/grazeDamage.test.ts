import {beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../../types';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('./psionicTurns',()=>({psionicRpc:rpc}));
const finish=vi.hoisted(()=>vi.fn());
vi.mock('./psionicDamageApplication',()=>({psionicTargetConModifier:()=>2,finishDamageConcentration:finish}));
import {recordGrazeDamage,applyGrazeDamage} from './grazeDamage';
const attack={id:'attack',state:'attack_rolled',attack_kind:'attack_roll',hit_result:'miss',graze_resolution_version:1,attack_ability_modifier:4,damage_type:'Slashing'} as PendingAttack;
function saved(use=true,modifier=4){const amount=use?Math.max(0,modifier):0;return {...attack,state:'damage_rolled',attack_ability_modifier:modifier,damage_rolls:[],damage_raw:amount,damage_final:amount,
 damage_components:{version:1,components:use?[{key:'base',source:'base',label:'Graze',damageType:'slashing',expression:String(amount),rolls:[],dieKinds:[],modifier:amount,rawTotal:amount}]:[]}};}
beforeEach(()=>{rpc.mockReset();finish.mockReset();});
it.each([4,0,-2])('confirms chosen Graze with ability %s without adding dice or other bonuses',async(modifier)=>{
 const result=saved(true,modifier);rpc.mockResolvedValue({attack:result,replayed:false});
 expect(await recordGrazeDamage({...attack,attack_ability_modifier:modifier},true)).toEqual(result);
 expect(rpc).toHaveBeenCalledWith('record_graze_damage',expect.objectContaining({p_use_graze:true,p_expected:expect.objectContaining({attack_ability_modifier:modifier})}),true);
});
it('confirms declining Graze as zero damage with no components',async()=>{
 rpc.mockResolvedValue({attack:saved(false),replayed:false});expect((await recordGrazeDamage(attack,false)).damage_raw).toBe(0);
});
it('accepts a saved winner after a lost response',async()=>{
 rpc.mockResolvedValue({attack:saved(),replayed:true});expect((await recordGrazeDamage(attack,true)).damage_raw).toBe(4);
});
it.each([{damage_raw:9},{damage_rolls:[4]},{hit_result:'hit'},{graze_resolution_version:null},{attack_ability_modifier:7},{damage_components:{version:1,components:[]}}])('rejects incompatible saved evidence %j',async(change)=>{
 rpc.mockResolvedValue({attack:{...saved(),...change},replayed:false});await expect(recordGrazeDamage(attack,true)).rejects.toThrow(/Graze/);
});
it('surfaces database failures without falling back to direct HP writes',async()=>{
 rpc.mockRejectedValue(new Error('Resolve offered reactions'));await expect(recordGrazeDamage(attack,true)).rejects.toThrow('Resolve offered reactions');expect(rpc).toHaveBeenCalledTimes(1);
});

const application=()=>({attack:{...saved(),state:'applied',damage_final:2},replayed:false,settlement:{attackId:'attack',damage:2,characterId:'target',concentrationCheckId:'check',concentrationMode:'auto'}});
it('applies with a reviewed context and resumes the committed concentration check',async()=>{
 const ctx={attack,target:null},result=application(),review={immune:false,resistant:true,vulnerable:false,note:'Reviewed conditional resistance'};
 rpc.mockResolvedValueOnce(null).mockResolvedValueOnce(result);
 expect(await applyGrazeDamage(attack,{decision:review,context:ctx})).toEqual(result.attack);
 expect(rpc).toHaveBeenLastCalledWith('apply_graze_damage',{p_attack_id:'attack',p_expected:ctx,p_con_modifier:2,p_defense_review:review},true);
 expect(finish).toHaveBeenCalledWith(result.settlement);
});
it('reads the saved result without querying a target that may have left the encounter',async()=>{
 const result={...application(),replayed:true};rpc.mockResolvedValue(result);
 await applyGrazeDamage(attack);expect(rpc).toHaveBeenCalledTimes(1);expect(finish).toHaveBeenCalledWith(result.settlement);
});
it('refuses a mismatched settlement without resolving concentration',async()=>{
 const result=application();result.settlement.damage=3;rpc.mockResolvedValue(result);
 await expect(applyGrazeDamage(attack)).rejects.toThrow(/could not be confirmed/);expect(finish).not.toHaveBeenCalled();
});
it('keeps a committed application recoverable when concentration delivery fails',async()=>{
 rpc.mockResolvedValue(application());finish.mockRejectedValueOnce(new Error('connection lost'));
 await expect(applyGrazeDamage(attack)).rejects.toThrow('connection lost');
 await applyGrazeDamage(attack);expect(rpc).toHaveBeenCalledTimes(2);expect(finish).toHaveBeenCalledTimes(2);
});

it('automatic application fetches current defenses only when no review was supplied',async()=>{
 const ctx={attack,target:null};rpc.mockResolvedValueOnce(null).mockResolvedValueOnce(ctx).mockResolvedValueOnce(application());
 await applyGrazeDamage(attack);expect(rpc.mock.calls[1][0]).toBe('get_pending_damage_context');
 expect(rpc).toHaveBeenLastCalledWith('apply_graze_damage',expect.objectContaining({p_expected:ctx,p_defense_review:null}),true);
});
