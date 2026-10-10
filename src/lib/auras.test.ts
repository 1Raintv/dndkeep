import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),update:vi.fn(),event:vi.fn(),mark:vi.fn(),concentration:vi.fn(),target:{} as Record<string,unknown>,writeError:null as {message:string}|null,markerError:null as {message:string}|null,damage:1,die:vi.fn(()=>1),saveState:vi.fn(),saveBonus:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:m.from}}));
vi.mock('./api/checked',()=>({checkedWrite:async(_op:unknown,_context:unknown,q:unknown)=>await q}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./cleave',()=>({markUsedThisTurn:m.mark}));
vi.mock('./api/auraSaveState',()=>({readAuraSaveState:m.saveState}));
vi.mock('./pendingAttack',()=>({getTargetSaveBonus:m.saveBonus,rollDiceExpr:()=>({total:m.damage}),runConcentrationSave:m.concentration}));
vi.mock('../rules/dice',async importOriginal=>({...await importOriginal<typeof import('../rules/dice')>(),rollDie:m.die}));
import {resolveAuraSave,type ActiveAura} from './auras';
const aura:ActiveAura={originParticipantId:'origin',originName:'Caster',originSize:1,originRow:0,originCol:0,spec:{key:'test',name:'Test aura',radiusFt:15,saveAbility:'WIS',saveDC:15,damageDice:'1d6',damageType:'radiant',halfOnSave:true,triggers:['turn_end'],exemptParticipantIds:[],speedInside:'half',affects:'all'}};
const run=()=>resolveAuraSave({campaignId:'campaign',encounterId:'encounter',aura,targetParticipantId:'target',targetName:'Target',targetType:'character',trigger:'turn_end'});
beforeEach(()=>{
 vi.clearAllMocks();m.die.mockReset().mockReturnValue(1);m.saveState.mockReset().mockResolvedValue({conditions:[],buffs:[],exhaustion:0});m.saveBonus.mockReset().mockResolvedValue({bonus:0,confidence:'high',naturalExtremes:false});m.damage=1;m.writeError=null;m.markerError=null;
 m.target={id:'target',combatant_id:'body',participant_type:'character',combatants:{current_hp:0,max_hp:20,temp_hp:3,death_save_failures:0,death_save_successes:0,is_stable:true,is_dead:false}};
 m.from.mockReturnValue({select:(fields:string)=>({eq:()=>({maybeSingle:async()=>({data:fields==='once_per_turn_used'?{once_per_turn_used:[]}:m.target,error:fields==='once_per_turn_used'?m.markerError:null})})}),
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

it('preparation failure leaves the aura marker untouched',async()=>{
 m.saveState.mockRejectedValue(new Error('Offline'));await expect(run()).rejects.toThrow('Offline');expect(m.mark).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();
});
it('unknown save bonus cannot silently use zero or spend the marker',async()=>{
 m.saveBonus.mockResolvedValue({bonus:0,confidence:'low'});await expect(run()).rejects.toThrow('Review');expect(m.mark).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();
});
it('exhaustion and flat effects change the actual save result',async()=>{
 m.damage=0;m.die.mockReturnValue(15);m.saveState.mockResolvedValue({conditions:[],buffs:[{name:'Ward',saveBonus:2}],exhaustion:2});await run();
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({eventType:'save_rolled',payload:expect.objectContaining({bonus:-2,total:13,success:false,rolls:[15]})}));
});
it('Restrained uses the lower of two Dexterity save dice',async()=>{
 m.damage=0;m.die.mockReturnValueOnce(18).mockReturnValueOnce(4);m.saveState.mockResolvedValue({conditions:['Restrained'],buffs:[],exhaustion:0});
 await resolveAuraSave({campaignId:'campaign',encounterId:'encounter',aura:{...aura,spec:{...aura.spec,saveAbility:'DEX'}},targetParticipantId:'target',targetName:'Target',targetType:'character',trigger:'turn_end'});
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({d20:4,rolls:[18,4],disadvantage:true,success:false})}));
});
it('automatic failure rolls no save dice and cannot be rescued by a natural 20',async()=>{
 m.damage=0;m.die.mockReturnValue(20);m.saveState.mockResolvedValue({conditions:['Unconscious'],buffs:[{name:'Bless'}],exhaustion:0});
 await resolveAuraSave({campaignId:'campaign',encounterId:'encounter',aura:{...aura,spec:{...aura.spec,saveAbility:'STR'}},targetParticipantId:'target',targetName:'Target',targetType:'character',trigger:'turn_end'});
 expect(m.die).not.toHaveBeenCalled();expect(m.saveBonus).not.toHaveBeenCalled();expect(m.event).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({d20:null,total:null,rolls:[],automatic_failure:true,success:false})}));
});

it('Bless and Bane dice are included once with their signed contributions',async()=>{
 m.damage=0;m.die.mockReturnValue(10);m.saveState.mockResolvedValue({conditions:[],buffs:[{name:'Bless'},{name:'Bless',saveBonus:'1d4'},{name:'Bane'}],exhaustion:0});await run();
 const payload=m.event.mock.calls[0][0].payload;expect(payload.effect_rolls).toHaveLength(2);
 expect(payload.effect_rolls[0].total).toBeGreaterThanOrEqual(1);expect(payload.effect_rolls[0].total).toBeLessThanOrEqual(4);
 expect(payload.effect_rolls[1].total).toBeGreaterThanOrEqual(-4);expect(payload.effect_rolls[1].total).toBeLessThanOrEqual(-1);
 expect(payload.total).toBe(10+payload.effect_rolls[0].total+payload.effect_rolls[1].total);
});

it('failed once-per-turn read cannot reroll or consume an uncertain prior use',async()=>{
 m.markerError={message:'offline'};await expect(run()).rejects.toThrow('previous use');expect(m.saveState).not.toHaveBeenCalled();expect(m.mark).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();
});
