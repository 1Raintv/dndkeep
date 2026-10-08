import {beforeEach,expect,it,vi} from 'vitest';
import {offerCounterspell} from './pendingReaction';
import {offerCounterspellOnce} from './api/counterspellOffers';
const state=vi.hoisted(()=>({participantsError:null as null|{message:string},characterError:null as null|{message:string},distance:30,dead:false,spent:false,hasEncounter:true,insert:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>{
 const query:Record<string,unknown>={};for(const method of ['select','eq'])query[method]=()=>query;
 query.insert=state.insert;
 const result=()=>table==='characters'?{data:{id:'hero',class_name:'Psion',level:5,intelligence:18,spell_sources:{counterspell:['class:Psion']},spell_preparation_sources:{counterspell:['class:Psion']},spell_slots:{3:{total:2,used:0}}},error:state.characterError}
 :{data:[{id:'reactor',entity_id:'hero',participant_type:'character',reaction_used:state.spent,is_dead:state.dead}],error:state.participantsError};
 query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve);
 query.maybeSingle=async()=>table==='characters'?result():{data:{id:'caster'},error:null};return query;
}}}));
vi.mock('./api/counterspellOffers',()=>({offerCounterspellOnce:vi.fn()}));
vi.mock('./combatParticipantNormalize',()=>({JOINED_COMBATANT_FIELDS:'',normalizeParticipantRow:(row:unknown)=>row}));
vi.mock('./battleMapGeometry',()=>({loadActiveBattleMap:async()=>({tokens:[]}),findTokenForParticipant:(row:unknown)=>row,distanceBetweenTokensFt:()=>state.distance}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn(),newChainId:()=> 'chain'}));
const input={pendingSpellCastId:'cast',campaignId:'campaign',encounterId:'encounter',casterParticipantId:'caster',casterName:'Caster',spellName:'Fly',spellLevel:3};
beforeEach(()=>{vi.clearAllMocks();Object.assign(state,{participantsError:null,characterError:null,distance:30,dead:false,spent:false});vi.mocked(offerCounterspellOnce).mockResolvedValue(1);});
it('delegates eligible IDs to the canonical cast transaction, without loose inserts',async()=>{
 await expect(offerCounterspell(input)).resolves.toBe(1);expect(offerCounterspellOnce).toHaveBeenCalledWith('cast',['reactor']);expect(state.insert).not.toHaveBeenCalled();
});
it('does not turn a participant lookup failure into zero eligible reactions',async()=>{
 state.participantsError={message:'Participants unavailable'};await expect(offerCounterspell(input)).rejects.toThrow('Participants unavailable');expect(offerCounterspellOnce).not.toHaveBeenCalled();
});
it('does not turn a character lookup failure into zero eligible reactions',async()=>{
 state.characterError={message:'Character unavailable'};await expect(offerCounterspell(input)).rejects.toThrow('Character unavailable');expect(offerCounterspellOnce).not.toHaveBeenCalled();
});
it.each([{distance:65},{dead:true},{spent:true}])('preserves existing eligibility filtering: %j',async patch=>{
 Object.assign(state,patch);await offerCounterspell(input);expect(offerCounterspellOnce).toHaveBeenCalledWith('cast',[]);
});
it('does not invent an encounter outside combat',async()=>{
 await expect(offerCounterspell({...input,encounterId:null})).resolves.toBe(0);expect(offerCounterspellOnce).not.toHaveBeenCalled();
});
