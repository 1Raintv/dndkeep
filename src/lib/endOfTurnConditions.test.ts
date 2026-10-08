import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({guards:vi.fn(),bonus:vi.fn(),die:vi.fn(),remove:vi.fn(),event:vi.fn(),select:vi.fn(),row:null as Record<string,unknown>|null}));
vi.mock('./supabase',()=>({supabase:{from:()=>({select:m.select})}}));
vi.mock('./api/psionicDisciplines',()=>({getPsionicGuardsSaveAdvantage:m.guards}));
vi.mock('./pendingAttack',()=>({getTargetSaveBonus:m.bonus}));
vi.mock('./conditions',()=>({removeCondition:m.remove}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./campaignImmunities',()=>({grantImmunity:vi.fn(),resolveParticipantToEntity:vi.fn()}));
vi.mock('../rules/dice',async original=>({...await original<typeof import('../rules/dice')>(),rollDie:m.die}));
import {processEndOfTurnConditions} from './endOfTurnConditions';
const input={participantId:'participant',campaignId:'campaign',encounterId:'encounter',currentRound:1,participantName:'Psion',participantType:'character' as const};
beforeEach(()=>{
 vi.clearAllMocks();m.guards.mockResolvedValue(false);m.bonus.mockResolvedValue({bonus:7,naturalExtremes:false});m.die.mockReturnValue(3);
 m.row={combatant_id:'combatant',entity_id:'hero',participant_type:'character',combatants:{active_conditions:['Poisoned'],condition_sources:{Poisoned:{save_to_end:{ability:'INT',dc:18}}}}};
 m.select.mockImplementation(()=>({eq:()=>({maybeSingle:async()=>({data:m.row})})}));
});
it('keeps the higher Guards die, records both, and removes the condition on success',async()=>{
 m.guards.mockResolvedValue(true);m.die.mockReturnValueOnce(3).mockReturnValueOnce(17);
 expect(await processEndOfTurnConditions(input)).toEqual({endedBySave:['Poisoned'],expired:[],persisted:[]});
 expect(m.guards).toHaveBeenCalledWith('hero','INT');expect(m.select).toHaveBeenCalledWith(expect.stringContaining('entity_id, participant_type'));
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({d20:17,total:24,advantage:true,psionic_guards:true,individual_results:[3,17],passed:true})}));
 expect(m.remove).toHaveBeenCalledWith(expect.objectContaining({conditionName:'Poisoned',participantId:'participant'}));
});
it('expired Guards rolls once and preserves a failed condition',async()=>{
 expect((await processEndOfTurnConditions(input)).persisted).toEqual(['Poisoned']);expect(m.die).toHaveBeenCalledTimes(1);expect(m.remove).not.toHaveBeenCalled();
});
it('failed protection read cannot roll, announce or remove a condition',async()=>{
 m.guards.mockRejectedValue(new Error('Protection unavailable'));await expect(processEndOfTurnConditions(input)).rejects.toThrow('Protection unavailable');
 expect(m.die).not.toHaveBeenCalled();expect(m.event).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();
});
it('creatures never query private character protection',async()=>{
 m.row!.participant_type='creature';await processEndOfTurnConditions({...input,participantType:'creature'});expect(m.guards).not.toHaveBeenCalled();expect(m.die).toHaveBeenCalledTimes(1);
});
it('preserves the target natural-extremes house rule',async()=>{
 m.bonus.mockResolvedValue({bonus:20,naturalExtremes:true});m.die.mockReturnValue(1);
 expect((await processEndOfTurnConditions(input)).persisted).toEqual(['Poisoned']);expect(m.remove).not.toHaveBeenCalled();
});
it('conditions with only an expiry never read Guards or roll',async()=>{
 m.row!.combatants={active_conditions:['Poisoned'],condition_sources:{Poisoned:{expires_at_round:1}}};
 expect((await processEndOfTurnConditions(input)).expired).toEqual(['Poisoned']);expect(m.guards).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();
});
it('keeps hidden participant rolls hidden',async()=>{
 await processEndOfTurnConditions({...input,hiddenFromPlayers:true});expect(m.event).toHaveBeenCalledWith(expect.objectContaining({visibility:'hidden_from_players'}));
});
it('participants without conditions do no work',async()=>{
 m.row!.combatants={active_conditions:[],condition_sources:{}};await processEndOfTurnConditions(input);expect(m.guards).not.toHaveBeenCalled();expect(m.bonus).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();
});

it('processes only the parent save; stale child timers cannot stand a waking creature up',async()=>{
 m.die.mockReturnValue(20);
 m.row!.combatants={active_conditions:['Unconscious','Prone','Incapacitated'],condition_sources:{
  Unconscious:{source:'spell:sleep',save_to_end:{ability:'WIS',dc:10}},
  Prone:{source:'cascade:Unconscious',save_to_end:{ability:'WIS',dc:10},expires_at_round:1},
  Incapacitated:{source:'cascade:Unconscious',expires_at_round:1},
 }};
 expect(await processEndOfTurnConditions(input)).toEqual({endedBySave:['Unconscious'],expired:[],persisted:[]});
 expect(m.remove).toHaveBeenCalledTimes(1);expect(m.die).toHaveBeenCalledTimes(1);
 expect(m.remove).toHaveBeenCalledWith(expect.objectContaining({conditionName:'Unconscious'}));
});
it('expires only active parent effects, ignoring stale source entries and derived timers',async()=>{
 m.row!.combatants={active_conditions:['Stunned','Incapacitated'],condition_sources:{
  Stunned:{expires_at_round:1},Incapacitated:{source:'cascade:Stunned',expires_at_round:1},Poisoned:{expires_at_round:1},
 }};
 expect((await processEndOfTurnConditions(input)).expired).toEqual(['Stunned']);expect(m.remove).toHaveBeenCalledTimes(1);
});
