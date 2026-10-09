import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({resolve:vi.fn(),remove:vi.fn(),event:vi.fn(),select:vi.fn(),row:null as Record<string,unknown>|null}));
vi.mock('./supabase',()=>({supabase:{from:()=>({select:m.select})}}));
vi.mock('./api/conditionTurnSaves',()=>({resolveConditionTurnSave:m.resolve}));
vi.mock('./conditions',()=>({removeCondition:m.remove}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./campaignImmunities',()=>({grantImmunity:vi.fn(),resolveParticipantToEntity:vi.fn()}));
import {processEndOfTurnConditions} from './endOfTurnConditions';
const input={participantId:'participant',campaignId:'campaign',encounterId:'encounter',currentRound:1,turnId:'turn',participantName:'Psion',participantType:'character' as const};
beforeEach(()=>{
 vi.clearAllMocks();m.resolve.mockResolvedValue({passed:false});
 m.row={combatant_id:'combatant',entity_id:'hero',participant_type:'character',combatants:{active_conditions:['Poisoned'],condition_sources:{Poisoned:{save_to_end:{ability:'INT',dc:18}}}}};
 m.select.mockImplementation(()=>({eq:()=>({maybeSingle:async()=>({data:m.row})})}));
});
it('routes a condition save through the saved transaction without duplicate writes',async()=>{
 m.resolve.mockResolvedValue({passed:true});
 expect(await processEndOfTurnConditions(input)).toEqual({endedBySave:['Poisoned'],expired:[],persisted:[]});
 expect(m.resolve).toHaveBeenCalledWith({participantId:'participant',turnId:'turn',condition:'Poisoned'});expect(m.remove).not.toHaveBeenCalled();
});
it('keeps a failed condition',async()=>{expect((await processEndOfTurnConditions(input)).persisted).toEqual(['Poisoned']);expect(m.remove).not.toHaveBeenCalled();});
it('propagates an uncertain save without removing its condition',async()=>{m.resolve.mockRejectedValue(new Error('Unconfirmed'));await expect(processEndOfTurnConditions(input)).rejects.toThrow('Unconfirmed');expect(m.remove).not.toHaveBeenCalled();});
it('duration-only conditions do not roll a save',async()=>{m.row!.combatants={active_conditions:['Poisoned'],condition_sources:{Poisoned:{expires_at_round:1}}};expect((await processEndOfTurnConditions(input)).expired).toEqual(['Poisoned']);expect(m.resolve).not.toHaveBeenCalled();});
it('participants without conditions do no work',async()=>{m.row!.combatants={active_conditions:[],condition_sources:{}};await processEndOfTurnConditions(input);expect(m.resolve).not.toHaveBeenCalled();});

it('processes only the parent save; stale child timers cannot stand a waking creature up',async()=>{
 m.resolve.mockResolvedValue({passed:true});
 m.row!.combatants={active_conditions:['Unconscious','Prone','Incapacitated'],condition_sources:{
  Unconscious:{source:'spell:sleep',save_to_end:{ability:'WIS',dc:10}},
  Prone:{source:'cascade:Unconscious',save_to_end:{ability:'WIS',dc:10},expires_at_round:1},
  Incapacitated:{source:'cascade:Unconscious',expires_at_round:1},
 }};
 expect(await processEndOfTurnConditions(input)).toEqual({endedBySave:['Unconscious'],expired:[],persisted:[]});
 expect(m.remove).not.toHaveBeenCalled();expect(m.resolve).toHaveBeenCalledTimes(1);
});
it('expires only active parent effects, ignoring stale source entries and derived timers',async()=>{
 m.row!.combatants={active_conditions:['Stunned','Incapacitated'],condition_sources:{
  Stunned:{expires_at_round:1},Incapacitated:{source:'cascade:Stunned',expires_at_round:1},Poisoned:{expires_at_round:1},
 }};
 expect((await processEndOfTurnConditions(input)).expired).toEqual(['Stunned']);expect(m.remove).toHaveBeenCalledTimes(1);
});
