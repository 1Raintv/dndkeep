import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({createOffer:vi.fn(),resolve:vi.fn(),saveCharacter:null as Record<string,unknown>|null,die:vi.fn(),query:vi.fn(),event:vi.fn(),clearConditions:vi.fn(),clearBuffs:vi.fn(),preference:vi.fn(),writes:[] as Array<{table:string;patch:Record<string,unknown>}>,writeError:null as {message:string}|null,character:false,conditions:[] as string[]}));
vi.mock('./api/concentrationSaves',()=>({createConcentrationOffer:m.createOffer,resolveConcentrationSave:m.resolve}));
vi.mock('./supabase',()=>({supabase:{from:m.query}}));
vi.mock('../rules/dice',async importOriginal=>({...await importOriginal<typeof import('../rules/dice')>(),rollDie:m.die}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./api/characterSaveRules',()=>({getCharacterSaveNaturalExtremes:m.preference}));
vi.mock('./conditions',()=>({conditionsAutoFailSave:(c:string[])=>c.includes('Paralyzed'),conditionsDisadvantageSave:()=>false,clearConditionsFromConcentration:m.clearConditions}));
vi.mock('./buffs',()=>({getSaveBonuses:()=>[],clearBuffsFromConcentration:m.clearBuffs}));
vi.mock('./combatParticipantNormalize',()=>({JOINED_COMBATANT_FIELDS:'combatant',normalizeParticipantRow:(r:unknown)=>r}));
import {rollSave,runConcentrationSave} from './pendingAttack';
beforeEach(()=>{
 vi.clearAllMocks();m.saveCharacter=null;m.createOffer.mockResolvedValue('offer');m.resolve.mockResolvedValue({outcome:'passed'});m.writes=[];m.writeError=null;m.character=false;m.conditions=[];m.die.mockReturnValue(1);m.preference.mockResolvedValue(false);
 m.query.mockImplementation((table:string)=>{
  let patch:Record<string,unknown>|undefined;
  const result=()=>({error:table==='characters'?m.writeError:null,data:table==='pending_attacks'?{id:'attack',attack_kind:'save',save_ability:'STR',save_dc:13,target_participant_id:'target',target_type:m.character?'character':'creature',...patch}:table==='combat_participants'?{participant_type:m.character?'character':'creature',entity_id:'hero',active_conditions:m.conditions}:table==='characters'?m.saveCharacter:null});
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

const context={campaignId:'campaign',encounterId:'encounter',chainId:'chain',participantId:'target',targetName:'Psion',damage:5};
it.each(['prompt','auto','off'])('campaign concentration mode %s uses the shared transaction boundary',async mode=>{
 m.character=true;m.saveCharacter={id:'hero',concentration_spell:'detect-magic',concentration_revision:7,constitution:14,level:5,secondary_class:null,secondary_level:0,saving_throw_proficiencies:['constitution'],advanced_automations_unlocked:true,automation_overrides:{concentration_on_damage:mode}};
 await runConcentrationSave(context);
 if(mode==='off'){expect(m.createOffer).not.toHaveBeenCalled();expect(m.resolve).not.toHaveBeenCalled();return;}
 expect(m.createOffer).toHaveBeenCalledWith(expect.objectContaining({characterId:'hero',revision:7,spell:'detect-magic',bonus:5,dc:10,automatic:mode==='auto'}));
 if(mode==='auto')expect(m.resolve).toHaveBeenCalledWith('hero','offer','player');else expect(m.resolve).not.toHaveBeenCalled();
 expect(m.writes).toEqual([]);expect(m.clearConditions).not.toHaveBeenCalled();expect(m.clearBuffs).not.toHaveBeenCalled();
});
it('failed offer creation prevents automatic settlement',async()=>{
 m.character=true;m.saveCharacter={id:'hero',concentration_spell:'detect-magic',concentration_revision:7,constitution:14,level:5,saving_throw_proficiencies:[],advanced_automations_unlocked:true,automation_overrides:{concentration_on_damage:'auto'}};
 m.createOffer.mockRejectedValueOnce(new Error('Offer not saved'));await expect(runConcentrationSave(context)).rejects.toThrow('Offer not saved');expect(m.resolve).not.toHaveBeenCalled();
});
