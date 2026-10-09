import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({createOffer:vi.fn(),resolve:vi.fn(),creatureType:'creature',lrTotal:0,lrUsed:0,lrError:null as {message:string}|null,lrMissing:false,lair:vi.fn(),targetError:null as {message:string}|null,targetMissing:false,guards:vi.fn(),disadvantage:false,ability:'STR',saveResult:null as string|null,saveCharacter:null as Record<string,unknown>|null,die:vi.fn(),query:vi.fn(),event:vi.fn(),clearConditions:vi.fn(),clearBuffs:vi.fn(),preference:vi.fn(),writes:[] as Array<{table:string;patch:Record<string,unknown>}>,writeError:null as {message:string}|null,character:false,conditions:[] as string[]}));
vi.mock('./api/concentrationSaves',()=>({createConcentrationOffer:m.createOffer,resolveConcentrationSave:m.resolve}));
vi.mock('./legendaryResistance',()=>({encounterLairBonus:m.lair}));
vi.mock('./supabase',()=>({supabase:{from:m.query}}));
vi.mock('../rules/dice',async importOriginal=>({...await importOriginal<typeof import('../rules/dice')>(),rollDie:m.die}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./api/psionicDisciplines',()=>({getPsionicGuardsSaveAdvantage:m.guards}));
vi.mock('./api/characterSaveRules',()=>({getCharacterSaveNaturalExtremes:m.preference}));
vi.mock('./conditions',()=>({conditionsAutoFailSave:(c:string[])=>c.includes('Paralyzed'),conditionsDisadvantageSave:()=>m.disadvantage,clearConditionsFromConcentration:m.clearConditions}));
vi.mock('./buffs',()=>({getSaveBonuses:()=>[],clearBuffsFromConcentration:m.clearBuffs}));
vi.mock('./combatParticipantNormalize',()=>({JOINED_COMBATANT_FIELDS:'combatant',normalizeParticipantRow:(r:unknown)=>r}));
import {rollSave,runConcentrationSave} from './pendingAttack';
beforeEach(()=>{
 vi.clearAllMocks();m.creatureType='creature';m.lrTotal=0;m.lrUsed=0;m.lrError=null;m.lrMissing=false;m.lair.mockResolvedValue(0);m.targetError=null;m.targetMissing=false;m.guards.mockResolvedValue(false);m.disadvantage=false;m.ability='STR';m.saveResult=null;m.saveCharacter=null;m.createOffer.mockResolvedValue('offer');m.resolve.mockResolvedValue({outcome:'passed'});m.writes=[];m.writeError=null;m.character=false;m.conditions=[];m.die.mockReturnValue(1);m.preference.mockResolvedValue(false);
 m.query.mockImplementation((table:string)=>{
  let patch:Record<string,unknown>|undefined;let fields='';
  const result=()=>fields.startsWith('legendary_resistance')?{error:m.lrError,data:m.lrMissing?null:{legendary_resistance:m.lrTotal,legendary_resistance_used:m.lrUsed}}:({error:table==='characters'?m.writeError:table==='combat_participants'?m.targetError:null,data:table==='pending_attacks'?{id:'attack',attack_kind:'save',save_ability:m.ability,save_result:m.saveResult,save_dc:13,target_participant_id:'target',target_type:m.character?'character':m.creatureType,...patch}:table==='combat_participants'?(m.targetMissing?null:{participant_type:m.character?'character':m.creatureType,entity_id:'hero',active_conditions:m.conditions}):table==='characters'?m.saveCharacter:null});
  const q={select:(value='')=>{fields=value;return q;},eq:()=>q,update:(p:Record<string,unknown>)=>{patch=p;m.writes.push({table,patch:p});return q;},single:async()=>result(),maybeSingle:async()=>result(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
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

it('campaign Intelligence save keeps the higher Guards die and logs its discarded partner',async()=>{
 m.character=true;m.ability='INT';m.guards.mockResolvedValue(true);m.die.mockReturnValueOnce(4).mockReturnValueOnce(16);
 expect(await rollSave('attack',7)).toMatchObject({save_d20:16,save_total:23,save_result:'passed'});
 expect(m.guards).toHaveBeenCalledWith('hero','INT');expect(m.die).toHaveBeenCalledTimes(2);
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({eventType:'save_rolled',payload:expect.objectContaining({advantage:true,disadvantage:false,psionic_guards:true,individual_results:[16,4]})}));
});
it('expired Guards leaves a single campaign save die',async()=>{
 m.character=true;m.ability='INT';m.die.mockReturnValue(5);expect(await rollSave('attack',7)).toMatchObject({save_d20:5,save_total:12,save_result:'failed'});expect(m.die).toHaveBeenCalledTimes(1);
});
it('Guards and condition Disadvantage cancel to one die',async()=>{
 m.character=true;m.ability='INT';m.guards.mockResolvedValue(true);m.disadvantage=true;m.die.mockReturnValue(10);
 expect(await rollSave('attack',7)).toMatchObject({save_d20:10,save_total:17});expect(m.die).toHaveBeenCalledTimes(1);
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({advantage:false,disadvantage:false})}));
});
it('unopposed condition Disadvantage still keeps the lower die',async()=>{
 m.disadvantage=true;m.die.mockReturnValueOnce(16).mockReturnValueOnce(4);expect(await rollSave('attack',7)).toMatchObject({save_d20:4,save_total:11});expect(m.die).toHaveBeenCalledTimes(2);expect(m.guards).not.toHaveBeenCalled();
});
it('failed Guards lookup prevents rolling, updating or announcing an unverified result',async()=>{
 m.character=true;m.ability='INT';m.guards.mockRejectedValue(new Error('Protection unavailable'));
 await expect(rollSave('attack',7)).rejects.toThrow('Protection unavailable');expect(m.die).not.toHaveBeenCalled();expect(m.writes).toEqual([]);expect(m.event).not.toHaveBeenCalled();
});
it('an automatically failed save does not look up Guards',async()=>{
 m.character=true;m.conditions=['Paralyzed'];await rollSave('attack',7);expect(m.guards).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();
});
it('a recorded save retry neither rolls nor rereads Guards',async()=>{
 m.character=true;m.ability='INT';m.saveResult='passed';expect((await rollSave('attack',7))?.save_result).toBe('passed');expect(m.guards).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();expect(m.writes).toEqual([]);
});

it.each(['error','missing'])('unverified target (%s) never falls back to an unprotected save',async mode=>{
 if(mode==='error')m.targetError={message:'Target unavailable'};else m.targetMissing=true;
 await expect(rollSave('attack',7)).rejects.toThrow();expect(m.die).not.toHaveBeenCalled();expect(m.writes).toEqual([]);expect(m.event).not.toHaveBeenCalled();
});

it.each(['creature','monster','npc'])('offers Legendary Resistance for a failed %s save',async type=>{
 m.creatureType=type;m.lrTotal=3;m.lrUsed=1;
 expect(await rollSave('attack',0)).toMatchObject({save_result:'failed',pending_lr_decision:true});
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({actorType:'monster',eventType:'save_rolled'}));
});
it('does not offer exhausted resistance or resistance after a passed save',async()=>{
 m.lrTotal=3;m.lrUsed=3;expect((await rollSave('attack',0))?.pending_lr_decision).toBe(false);
 m.lrUsed=0;expect((await rollSave('attack',20))?.pending_lr_decision).toBe(false);
});
it('respects the existing in-lair allowance without granting resistance to ordinary creatures',async()=>{
 m.lrTotal=3;m.lrUsed=3;m.lair.mockResolvedValue(1);expect((await rollSave('attack',0))?.pending_lr_decision).toBe(true);
 m.lrTotal=0;m.lrUsed=0;expect((await rollSave('attack',0))?.pending_lr_decision).toBe(false);
});
it.each(['error','missing'])('does not record a failed save when resistance is unverified (%s)',async kind=>{
 if(kind==='error')m.lrError={message:'Resistance unavailable'};else m.lrMissing=true;
 await expect(rollSave('attack',0)).rejects.toThrow(/Resistance|resistance/);
 expect(m.writes).toEqual([]);expect(m.event).not.toHaveBeenCalled();
});
