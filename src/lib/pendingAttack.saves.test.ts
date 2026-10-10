import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({createOffer:vi.fn(),resolve:vi.fn(),save:vi.fn(),counter:vi.fn(),query:vi.fn(),saveResult:null as string|null,saveCharacter:null as Record<string,unknown>|null,writes:[] as unknown[],clearConditions:vi.fn(),clearBuffs:vi.fn(),character:false}));
vi.mock('./api/attackSaves',()=>({resolveAttackSave:m.save,forgetAttackSave:vi.fn()}));
vi.mock('./api/counterspellSettlement',()=>({settleCounterspellSave:m.counter}));
vi.mock('./api/concentrationSaves',()=>({createConcentrationOffer:m.createOffer,resolveConcentrationSave:m.resolve}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn(),newChainId:()=> 'chain'}));
vi.mock('./supabase',()=>({supabase:{from:m.query}}));
vi.mock('./conditions',()=>({clearConditionsFromConcentration:m.clearConditions}));
vi.mock('./buffs',()=>({clearBuffsFromConcentration:m.clearBuffs}));
vi.mock('./combatParticipantNormalize',()=>({JOINED_COMBATANT_FIELDS:'combatant',normalizeParticipantRow:(r:unknown)=>r}));
import {rollSave,runConcentrationSave} from './pendingAttack';
beforeEach(()=>{
 vi.clearAllMocks();m.saveResult=null;m.character=false;m.saveCharacter=null;m.writes=[];
 m.createOffer.mockResolvedValue('offer');m.resolve.mockResolvedValue({outcome:'passed'});m.save.mockResolvedValue({id:'attack',save_result:'failed',save_total:9});m.counter.mockResolvedValue(undefined);
 m.query.mockImplementation((table:string)=>{
  const result=()=>({error:null,data:table==='pending_attacks'?{id:'attack',attack_kind:'save',save_result:m.saveResult}:table==='combat_participants'?{participant_type:m.character?'character':'creature',entity_id:'hero'}:table==='characters'?m.saveCharacter:null});
  const q={select:()=>q,eq:()=>q,update:(p:unknown)=>{m.writes.push(p);return q;},single:async()=>result(),maybeSingle:async()=>result()};return q;
 });
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


it('uses the transactional result without a second write or recalculation',async()=>{
 expect(await rollSave('attack',7)).toMatchObject({save_total:9,save_result:'failed'});expect(m.save).toHaveBeenCalledWith('attack',7);expect(m.writes).toEqual([]);expect(m.counter).toHaveBeenCalledWith(expect.objectContaining({save_total:9}));
});
it('an existing result retries downstream settlement without rerolling',async()=>{
 m.saveResult='passed';await rollSave('attack',7);expect(m.save).not.toHaveBeenCalled();expect(m.counter).toHaveBeenCalledWith(expect.objectContaining({save_result:'passed'}));
});
it('unconfirmed saves do not settle Counterspell',async()=>{
 m.save.mockRejectedValueOnce(new Error('Saved roll awaits retry'));await expect(rollSave('attack',7)).rejects.toThrow('awaits retry');expect(m.counter).not.toHaveBeenCalled();
});
it('downstream settlement errors remain retryable after the save commits',async()=>{
 m.counter.mockRejectedValueOnce(new Error('Payment not confirmed'));await expect(rollSave('attack',7)).rejects.toThrow('Payment');
 m.saveResult='failed';await rollSave('attack',7);expect(m.save).toHaveBeenCalledTimes(1);expect(m.counter).toHaveBeenCalledTimes(2);
});
