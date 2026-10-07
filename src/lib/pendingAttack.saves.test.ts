import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({die:vi.fn(),query:vi.fn(),event:vi.fn(),clearConditions:vi.fn(),clearBuffs:vi.fn(),preference:vi.fn(),writes:[] as Array<{table:string;patch:Record<string,unknown>}>,character:false,conditions:[] as string[]}));
vi.mock('./supabase',()=>({supabase:{from:m.query}}));
vi.mock('../rules/dice',async importOriginal=>({...await importOriginal<typeof import('../rules/dice')>(),rollDie:m.die}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./api/characterSaveRules',()=>({getCharacterSaveNaturalExtremes:m.preference}));
vi.mock('./conditions',()=>({conditionsAutoFailSave:(c:string[])=>c.includes('Paralyzed'),conditionsDisadvantageSave:()=>false,clearConditionsFromConcentration:m.clearConditions}));
vi.mock('./buffs',()=>({getSaveBonuses:()=>[],clearBuffsFromConcentration:m.clearBuffs}));
vi.mock('./combatParticipantNormalize',()=>({JOINED_COMBATANT_FIELDS:'combatant',normalizeParticipantRow:(r:unknown)=>r}));
import {rollSave,performConcentrationSave} from './pendingAttack';
beforeEach(()=>{
 vi.clearAllMocks();m.writes=[];m.character=false;m.conditions=[];m.die.mockReturnValue(1);m.preference.mockResolvedValue(false);
 m.query.mockImplementation((table:string)=>{
  let patch:Record<string,unknown>|undefined;
  const result=()=>({data:table==='pending_attacks'?{id:'attack',attack_kind:'save',save_ability:'STR',save_dc:13,target_participant_id:'target',target_type:m.character?'character':'creature',...patch}:table==='combat_participants'?{participant_type:m.character?'character':'creature',entity_id:'hero',active_conditions:m.conditions}:null});
  const q={select:()=>q,eq:()=>q,update:(p:Record<string,unknown>)=>{patch=p;m.writes.push({table,patch:p});return q;},single:async()=>result(),maybeSingle:async()=>result(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
  return q;
 });
});
it('creature natural 1 succeeds when its total meets DC',async()=>{
 const result=await rollSave('attack',12);
 expect(result?.save_result).toBe('passed');expect(m.preference).not.toHaveBeenCalled();
});
it('creature natural 20 still fails an unreachable DC',async()=>{
 m.die.mockReturnValue(20);
 expect((await rollSave('attack',-8))?.save_result).toBe('failed');
});
it('character save reads and preserves its house rule',async()=>{
 m.character=true;m.preference.mockResolvedValue(true);
 expect((await rollSave('attack',12))?.save_result).toBe('failed');
 expect(m.preference).toHaveBeenCalledWith('hero');
});
it('conditions force failure even when the numerical total succeeds',async()=>{
 m.conditions=['Paralyzed'];
 expect((await rollSave('attack',30))?.save_result).toBe('failed');
 expect(m.die).not.toHaveBeenCalled();
});
const concentration={ctx:{campaignId:'campaign',encounterId:'enc',chainId:'chain',participantId:'target',targetName:'Psion',damage:20},charId:'hero',concentrationSpell:'Hold Person',dc:13,bonus:12,resolutionSource:'timeout' as const,automationSetting:'prompt'};
it('successful RAW concentration on natural 1 retains spell and effects',async()=>{
 expect((await performConcentrationSave(concentration)).saved).toBe(true);
 expect(m.preference).toHaveBeenCalledWith('hero');
 expect(m.writes).toEqual([]);expect(m.clearConditions).not.toHaveBeenCalled();
});
it('house-rule concentration failure clears spell and dependent effects',async()=>{
 expect((await performConcentrationSave({...concentration,naturalExtremes:true})).saved).toBe(false);
 expect(m.preference).not.toHaveBeenCalled();
 expect(m.writes).toContainEqual({table:'characters',patch:{concentration_spell:'',concentration_rounds_remaining:null}});
 expect(m.clearConditions).toHaveBeenCalled();expect(m.clearBuffs).toHaveBeenCalled();
});
it('failed preference read leaves concentration intact',async()=>{
 m.preference.mockRejectedValue(new Error('offline'));
 await expect(performConcentrationSave(concentration)).rejects.toThrow('offline');
 expect(m.writes).toEqual([]);expect(m.event).not.toHaveBeenCalled();
});
