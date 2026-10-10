import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),update:vi.fn(),event:vi.fn(),mark:vi.fn(),concentration:vi.fn(),target:{} as Record<string,unknown>,writeError:null as {message:string}|null,damage:1}));
vi.mock('./supabase',()=>({supabase:{from:m.from}}));
vi.mock('./api/checked',()=>({checkedWrite:async(_op:unknown,_context:unknown,q:unknown)=>await q}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./cleave',()=>({markUsedThisTurn:m.mark}));
vi.mock('./pendingAttack',()=>({getTargetSaveBonus:async()=>({bonus:0,confidence:'high'}),rollDiceExpr:()=>({total:m.damage}),runConcentrationSave:m.concentration}));
vi.mock('../rules/dice',()=>({rollDie:()=>1}));
import {resolveAuraSave,type ActiveAura} from './auras';
const aura:ActiveAura={originParticipantId:'origin',originName:'Caster',originSize:1,originRow:0,originCol:0,spec:{key:'test',name:'Test aura',radiusFt:15,saveAbility:'WIS',saveDC:15,damageDice:'1d6',damageType:'radiant',halfOnSave:true,triggers:['turn_end'],exemptParticipantIds:[],speedInside:'half',affects:'all'}};
const run=()=>resolveAuraSave({campaignId:'campaign',encounterId:'encounter',aura,targetParticipantId:'target',targetName:'Target',targetType:'character',trigger:'turn_end'});
beforeEach(()=>{
 vi.clearAllMocks();m.damage=1;m.writeError=null;
 m.target={id:'target',combatant_id:'body',participant_type:'character',combatants:{current_hp:0,max_hp:20,temp_hp:3,death_save_failures:0,death_save_successes:0,is_stable:true,is_dead:false}};
 m.from.mockReturnValue({select:(fields:string)=>({eq:()=>({maybeSingle:async()=>({data:fields==='once_per_turn_used'?{once_per_turn_used:[]}:m.target,error:null})})}),
  update:m.update.mockImplementation(()=>({eq:()=>({select:()=>({single:async()=>({data:{id:'body'},error:m.writeError})})})}))});
});
it('live aura damage consumes temp HP, breaks stability and adds a failure at zero',async()=>{
 await run();expect(m.update).toHaveBeenCalledWith({current_hp:0,temp_hp:2,death_save_failures:1,is_stable:false,is_dead:false});
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({eventType:'damage_at_0_hp_failure_added',payload:expect.objectContaining({failures:1})}));expect(m.concentration).not.toHaveBeenCalled();
});
it('live aura massive damage records death',async()=>{
 m.target.combatants={current_hp:5,max_hp:20,temp_hp:3,death_save_failures:0,is_dead:false};m.damage=28;await run();
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({current_hp:0,is_dead:true,death_save_failures:3}));expect(m.event).toHaveBeenCalledWith(expect.objectContaining({eventType:'died',payload:expect.objectContaining({massive_damage_death:true})}));
});
it('failed HP write cannot emit successful damage or roll concentration',async()=>{
 m.writeError={message:'denied'};await expect(run()).rejects.toThrow('could not be confirmed');expect(m.event.mock.calls.map(c=>c[0].eventType)).toEqual(['save_rolled']);expect(m.concentration).not.toHaveBeenCalled();
});
it('surviving damage still checks concentration with full damage through temp HP',async()=>{
 m.target.combatants={current_hp:10,max_hp:20,temp_hp:3,is_dead:false};await run();expect(m.concentration).toHaveBeenCalledWith(expect.objectContaining({damage:1}));
});
