import {beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../../types';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('./psionicTurns',()=>({psionicRpc:rpc}));
import {recordGrazeDamage} from './grazeDamage';
const attack={id:'attack',state:'attack_rolled',attack_kind:'attack_roll',hit_result:'miss',graze_resolution_version:1,attack_ability_modifier:4,damage_type:'Slashing'} as PendingAttack;
function saved(use=true,modifier=4){const amount=use?Math.max(0,modifier):0;return {...attack,state:'damage_rolled',attack_ability_modifier:modifier,damage_rolls:[],damage_raw:amount,damage_final:amount,
 damage_components:{version:1,components:use?[{key:'base',source:'base',label:'Graze',damageType:'slashing',expression:String(amount),rolls:[],dieKinds:[],modifier:amount,rawTotal:amount}]:[]}};}
beforeEach(()=>{rpc.mockReset();});
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
