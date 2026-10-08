import {beforeEach,expect,it,vi} from 'vitest';
import type {Character,PendingReaction} from '../../types';
import {acceptCounterspellAtomic} from './counterspell';
import {supabase} from '../supabase';
vi.mock('../supabase',()=>({supabase:{rpc:vi.fn(),from:vi.fn()}}));
const character={id:'hero',class_name:'Fighter',level:3,secondary_class:'Psion',secondary_level:5,
 intelligence:18,wisdom:10,charisma:12,spell_sources:{counterspell:['class:Psion']},spell_preparation_sources:{counterspell:['class:Psion']},prepared_spells:['counterspell'],spell_slots:{3:{total:2,used:0},5:{total:1,used:0}}} as unknown as Character;
const offer:Pick<PendingReaction,'id'|'decision_payload'>={id:'offer',decision_payload:{spell_cast_id:'cast'}};
const receipt={offerId:'offer',castId:'cast',attackId:'attack',slotLevel:3,source:'class:Psion',ability:'intelligence',saveDC:15,replayed:false};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(supabase.rpc).mockResolvedValue({data:receipt,error:null} as never);});
it('sends the selected class, effective modifier and immutable source/slot snapshot in one RPC',async()=>{
 await expect(acceptCounterspellAtomic(offer,character,3,'Psion')).resolves.toEqual(receipt);
 expect(supabase.rpc).toHaveBeenCalledWith('accept_counterspell_atomic',expect.objectContaining({p_offer_id:'offer',p_slot:3,p_source:'class:Psion',p_ability:'intelligence',p_modifier:4,p_expected:expect.objectContaining({level:3,secondary_level:5,slot:{total:2,used:0}})}));
 expect(supabase.from).not.toHaveBeenCalled();
});
it('retries a lost response with identical captured arguments, not a new payment',async()=>{
 const current=structuredClone(character);
 vi.mocked(supabase.rpc).mockImplementationOnce(async()=>{current.spell_slots[3].used=1;return {data:null,error:{message:'Lost response',code:'NETWORK'}} as never;}).mockResolvedValueOnce({data:{...receipt,replayed:true},error:null} as never);
 await expect(acceptCounterspellAtomic(offer,current,3)).resolves.toMatchObject({replayed:true});
 expect(supabase.rpc).toHaveBeenCalledTimes(2);
 const calls=vi.mocked(supabase.rpc).mock.calls;expect(calls[0][1]).toEqual(calls[1][1]);
 expect(calls[1][1]).toMatchObject({p_expected:{slot:{total:2,used:0}}});
});
it('does not retry a rejected transaction or fall back to loose writes',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{code:'P0001',message:'Reaction is already spent'}} as never);
 await expect(acceptCounterspellAtomic(offer,character,3)).rejects.toThrow('Reaction is already spent');
 expect(supabase.rpc).toHaveBeenCalledTimes(1);expect(supabase.from).not.toHaveBeenCalled();
});
it.each([0,2,4,10,3.5])('rejects unavailable slot %i without a request',async level=>{
 await expect(acceptCounterspellAtomic(offer,character,level)).rejects.toThrow('slot');expect(supabase.rpc).not.toHaveBeenCalled();
});
it('rejects missing and unprepared sources without a request',async()=>{
 await expect(acceptCounterspellAtomic(offer,character,3,'Wizard')).rejects.toThrow('source');
 await expect(acceptCounterspellAtomic(offer,{...character,spell_preparation_sources:{counterspell:[]}},3)).rejects.toThrow('source');expect(supabase.rpc).not.toHaveBeenCalled();
});
it.each([{saveDC:19},{castId:'different'},{slotLevel:5},{source:'class:Sorcerer'},{attackId:''},{replayed:undefined}])('rejects mismatched receipts: %j',async patch=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{...receipt,...patch},error:null} as never);
 await expect(acceptCounterspellAtomic(offer,character,3)).rejects.toThrow('receipt');
});
it('coalesces identical in-flight requests and refuses a changed choice',async()=>{
 let resolve!:(value:unknown)=>void;
 vi.mocked(supabase.rpc).mockReturnValueOnce(new Promise(r=>{resolve=r;}) as never);
 const first=acceptCounterspellAtomic(offer,character,3);expect(acceptCounterspellAtomic(offer,character,3)).toBe(first);
 await expect(acceptCounterspellAtomic(offer,character,5)).rejects.toThrow('different Counterspell');
 resolve({data:receipt,error:null});await first;expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
