import {beforeEach,expect,it,vi} from 'vitest';
import {acceptReaction} from './pendingReaction';
import {acceptCounterspellAtomic} from './api/counterspell';
const db=vi.hoisted(()=>({writes:vi.fn(),offerState:'offered'}));
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>{
 const query:Record<string,unknown>={};
 for(const method of ['select','eq'])query[method]=()=>query;
 query.update=(value:unknown)=>{db.writes(value);return query;};
 query.single=async()=>({data:table==='pending_reactions'?{id:'offer',state:db.offerState,reaction_key:'counterspell',reactor_type:'character',reactor_participant_id:'reactor',decision_payload:{spell_cast_id:'canonical-cast'}}:
 table==='characters'?{id:'hero',spell_slots:{3:{total:2,used:0}}}:{entity_id:'hero'},error:null});
 return query;
}}}));
vi.mock('./api/counterspell',()=>({acceptCounterspellAtomic:vi.fn()}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn(),newChainId:()=> 'chain'}));
beforeEach(()=>{vi.clearAllMocks();db.offerState='offered';});
it('delegates the canonical offer and selected choice without another accepted-state write',async()=>{
 await acceptReaction('offer',{spell_cast_id:'overridden',spell_level_used:5,casting_source:'Psion'});
 expect(acceptCounterspellAtomic).toHaveBeenCalledWith(expect.objectContaining({decision_payload:{spell_cast_id:'canonical-cast'}}),expect.objectContaining({id:'hero'}),5,'Psion');
 expect(db.writes).not.toHaveBeenCalled();
});
it('keeps failed transactions unaccepted',async()=>{
 vi.mocked(acceptCounterspellAtomic).mockRejectedValueOnce(new Error('expired'));
 await expect(acceptReaction('offer')).rejects.toThrow('expired');expect(db.writes).not.toHaveBeenCalled();
});
it('does not create a new acceptance for an already accepted offer',async()=>{
 db.offerState='accepted';await acceptReaction('offer');expect(acceptCounterspellAtomic).not.toHaveBeenCalled();
});
