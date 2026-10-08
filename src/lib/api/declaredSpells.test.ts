// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
import {supabase} from '../supabase';
import type {SpellDeclarationRequest} from '../spellDeclarationRequest';
import {acknowledgeSpellDeclaration,declarePaidSpell,saveSpellDeclaration,savedSpellDeclaration,settlePaidSpell} from './declaredSpells';
vi.mock('../supabase',()=>({supabase:{rpc:vi.fn(),from:vi.fn()}}));
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const request:SpellDeclarationRequest={castId:id,characterId:id,userId:id,participantId:id,campaignId:id,spellId:'fly',spellName:'Fly',slotLevel:3,expectedSlot:{total:2,used:0},context:{spellLevel:3,source:'class:Psion',ability:'intelligence',target:'Ally',isBonusAction:false,range:'Touch',duration:'10 minutes'}};
const row={id,caster_character_id:id,caster_participant_id:id,campaign_id:id,spell_level:3,spell_name:'Fly',state:'declared',chain_id:other,expires_at:'2026-10-08T00:00:30Z'};
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();vi.mocked(supabase.rpc).mockResolvedValue({data:{cast:row},error:null} as never);});
it('records the request before sending and keeps it after acknowledgment from the server',async()=>{
 vi.mocked(supabase.rpc).mockImplementationOnce(async()=>{expect(savedSpellDeclaration(id,id)).toEqual(request);return {data:{cast:row},error:null} as never;});
 await expect(declarePaidSpell(request)).resolves.toMatchObject(row);expect(savedSpellDeclaration(id,id)).toEqual(request);expect(supabase.from).not.toHaveBeenCalled();
});
it('retries a lost declaration response with the same stored intent even if caller data changes',async()=>{
 const mutable=structuredClone(request);
 vi.mocked(supabase.rpc).mockImplementationOnce(async()=>{mutable.expectedSlot!.used=1;return {data:null,error:{message:'Lost response'}} as never;}).mockResolvedValueOnce({data:{cast:row},error:null} as never);
 await declarePaidSpell(mutable);const calls=vi.mocked(supabase.rpc).mock.calls;
 expect(calls).toHaveLength(2);expect(calls[0][1]).toEqual(calls[1][1]);expect(calls[1][1]).toMatchObject({p_expected_slot:{used:0,total:2}});
});
it('retains a rejected request and never retries a semantic rejection',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{message:'Spell slot is unavailable',code:'P0001'}} as never);
 await expect(declarePaidSpell(request)).rejects.toThrow('unavailable');expect(supabase.rpc).toHaveBeenCalledTimes(1);expect(savedSpellDeclaration(id,id)).toEqual(request);
});
it('coalesces concurrent identical declarations and blocks changing the saved cast',async()=>{
 let resolve!:(value:unknown)=>void;vi.mocked(supabase.rpc).mockReturnValueOnce(new Promise(r=>{resolve=r;}) as never);
 const first=declarePaidSpell(request);expect(declarePaidSpell(request)).toBe(first);
 expect(()=>saveSpellDeclaration({...request,castId:other})).toThrow('saved spell');
 expect(()=>acknowledgeSpellDeclaration(request)).toThrow('finish');resolve({data:{cast:row},error:null});await first;
 expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
it('scopes disk data by user/character and cannot erase another tab’s newer request',()=>{
 saveSpellDeclaration(request);expect(savedSpellDeclaration(other,id)).toBeNull();
 localStorage.setItem(`dndkeep:declared-spell:${id}:${id}`,JSON.stringify({...request,castId:other}));
 expect(()=>acknowledgeSpellDeclaration(request)).toThrow('replaced');expect(savedSpellDeclaration(id,id)?.castId).toBe(other);
});
it('corrupt records remain visible instead of silently allowing another payment',()=>{
 localStorage.setItem(`dndkeep:declared-spell:${id}:${id}`,'{broken');expect(()=>savedSpellDeclaration(id,id)).toThrow('unreadable');expect(()=>saveSpellDeclaration(request)).toThrow('unreadable');
});
it.each([{spell_level:4},{caster_character_id:other},{id:other},{campaign_id:other},{expires_at:'invalid'}])('retains a request when its receipt mismatches: %j',async patch=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{cast:{...row,...patch}},error:null} as never);
 await expect(declarePaidSpell(request)).rejects.toThrow('receipt');expect(savedSpellDeclaration(id,id)).toEqual(request);
});
it('acknowledgment clears only this exact completed local request without a database write',async()=>{
 await declarePaidSpell(request);acknowledgeSpellDeclaration(request);expect(savedSpellDeclaration(id,id)).toBeNull();expect(supabase.from).not.toHaveBeenCalled();
});
it('settles through one idempotent RPC and does not make its own slot edits',async()=>{
 const result={castId:id,outcome:'countered',slotReturned:true,replayed:false};vi.mocked(supabase.rpc).mockResolvedValueOnce({data:result,error:null} as never);
 expect(await settlePaidSpell(id)).toEqual(result);expect(supabase.rpc).toHaveBeenCalledWith('settle_declared_spell_atomic',{p_cast_id:id});expect(supabase.from).not.toHaveBeenCalled();
});
it('recognizes legacy casts without fabricating a refunded payment',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{legacy:true,castId:id},error:null} as never);expect(await settlePaidSpell(id)).toEqual({legacy:true,castId:id});
});
it('rejects mismatched settlement receipts',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{castId:other,outcome:'countered',slotReturned:true,replayed:false},error:null} as never);
 await expect(settlePaidSpell(id)).rejects.toThrow('receipt');
});
