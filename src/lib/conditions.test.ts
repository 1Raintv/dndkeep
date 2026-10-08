import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),update:vi.fn(),event:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({single:m.read})}),update:m.update})}}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./api/checked',()=>({checkedWrite:async(_op:unknown,_context:unknown,query:unknown)=>query}));
import {CONDITION_MAP} from '../data/conditions';
import {conditionsSpeedZero,conditionsAutoFailSave,removeCondition} from './conditions';
it('2024 Stunned permits movement but retains incapacity and Strength/Dexterity save failures',()=>{
 expect(conditionsSpeedZero(['Stunned','Incapacitated'])).toBe(false);
 expect(CONDITION_MAP.Stunned).toMatchObject({cantAct:true,cantReact:true,concentrationBreaks:true,attackAdvantageReceived:true});
 expect(CONDITION_MAP.Stunned.cantMove).not.toBe(true);expect(CONDITION_MAP.Stunned.effects).not.toContain("Can't move.");
 expect(conditionsAutoFailSave(['Stunned'],'STR')).toBe(true);expect(conditionsAutoFailSave(['Stunned'],'DEX')).toBe(true);expect(conditionsAutoFailSave(['Stunned'],'CON')).toBe(false);
});
it.each(['Grappled','Restrained','Paralyzed','Petrified','Unconscious'])('%s still prevents voluntary movement',condition=>expect(conditionsSpeedZero([condition])).toBe(true));
it('another immobilizing condition still applies to a Stunned creature',()=>expect(conditionsSpeedZero(['Stunned','Grappled'])).toBe(true));

beforeEach(()=>{
 vi.clearAllMocks();m.update.mockImplementation(()=>({eq:async()=>({error:null})}));
 m.read.mockResolvedValue({data:{combatant_id:'actor',participant_type:'creature',campaign_id:'campaign',name:'Sleeper',combatants:{
  active_conditions:['Unconscious','Prone','Incapacitated','Stunned'],condition_sources:{
   Unconscious:{source:'spell:sleep'},Prone:{source:'cascade:Unconscious'},Incapacitated:{source:'cascade:Unconscious'},Stunned:{source:'other'},
  },
 }},error:null});
});
it('the actual removal writer retains Prone and shared Incapacitated and logs only removals',async()=>{
 await removeCondition({participantId:'participant',conditionName:'Unconscious'});
 expect(m.update).toHaveBeenCalledWith({active_conditions:['Prone','Incapacitated','Stunned'],condition_sources:{Prone:{source:'fall:Unconscious'},Incapacitated:{source:'cascade:Stunned'},Stunned:{source:'other'}}});
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({payload:{condition:'Unconscious',cascaded_removed:[]}}));
});
it('a failed write cannot announce removal or let turn upkeep silently continue',async()=>{
 m.update.mockImplementation(()=>({eq:async()=>({error:{message:'Write failed'}})}));
 await expect(removeCondition({participantId:'participant',conditionName:'Unconscious'})).rejects.toThrow('Write failed');expect(m.event).not.toHaveBeenCalled();
});
it('a failed read stops condition removal',async()=>{
 m.read.mockResolvedValue({data:null,error:{message:'Read failed'}});
 await expect(removeCondition({participantId:'participant',conditionName:'Unconscious'})).rejects.toThrow('Read failed');expect(m.update).not.toHaveBeenCalled();
});
