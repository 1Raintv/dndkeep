// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
import {supabase} from '../supabase';
import type {SpellDeclarationRequest} from '../spellDeclarationRequest';
import {acknowledgeSpellDeclaration,declarePaidSpell,saveSpellDeclaration,savedSpellDeclaration,settlePaidSpell,readDeclaredSpell,cancelUnpaidDeclaration,queueDeclaredSpellAttack} from './declaredSpells';
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

function mockRead(cast:unknown,save:unknown=null,castError:unknown=null,saveError:unknown=null){
 vi.mocked(supabase.from).mockImplementation((table:string)=>{
  const query:Record<string,unknown>={};for(const method of ['select','eq'])query[method]=()=>query;
  query.maybeSingle=async()=>table==='pending_spell_casts'?{data:cast,error:castError}:{data:save,error:saveError};return query as never;
 });
}
it('only asks to settle an uncontested cast after its deadline',async()=>{
 mockRead({...row,expires_at:'2099-01-01T00:00:00Z'});expect((await readDeclaredSpell(request)).readyToSettle).toBe(false);
 mockRead({...row,expires_at:'2000-01-01T00:00:00Z'});expect((await readDeclaredSpell(request)).readyToSettle).toBe(true);expect(supabase.rpc).not.toHaveBeenCalled();
});
it('a terminal row requests settlement but does not invent its receipt',async()=>{
 mockRead({...row,state:'countered'});expect((await readDeclaredSpell(request)).readyToSettle).toBe(true);expect(supabase.rpc).not.toHaveBeenCalled();
});
it.each([{save_result:null,pending_lr_decision:false,ready:false},{save_result:'failed',pending_lr_decision:true,ready:false},{save_result:'failed',pending_lr_decision:false,ready:true},{save_result:'passed',pending_lr_decision:false,ready:true}])('waits for the recorded save and Legendary Resistance decision: %j',async value=>{
 mockRead({...row,state:'counterspell_offered',counterspell_attack_id:other},value);expect((await readDeclaredSpell(request)).readyToSettle).toBe(value.ready);
});
it('fails closed on unreadable, substituted or canceled declarations',async()=>{
 mockRead(null,null,{message:'Offline'});await expect(readDeclaredSpell(request)).rejects.toThrow('Offline');
 mockRead({...row,id:other});await expect(readDeclaredSpell(request)).rejects.toThrow('receipt');
 mockRead({...row,state:'canceled'});await expect(readDeclaredSpell(request)).rejects.toThrow('canceled');
});
it('does not treat a missing save or failed lookup as a successful spell',async()=>{
 mockRead({...row,state:'counterspell_offered',counterspell_attack_id:other},null,null,{message:'Save offline'});await expect(readDeclaredSpell(request)).rejects.toThrow('Save offline');
 mockRead({...row,state:'counterspell_offered',counterspell_attack_id:other});await expect(readDeclaredSpell(request)).rejects.toThrow('could not be loaded');
});

const canceled={castId:id,characterId:id,canceled:true,replayed:false};
it('forgets only a verified unpaid cancellation and sends no slot writes',async()=>{
 saveSpellDeclaration(request);vi.mocked(supabase.rpc).mockResolvedValueOnce({data:canceled,error:null} as never);
 expect(await cancelUnpaidDeclaration(request)).toBe(true);expect(savedSpellDeclaration(id,id)).toBeNull();expect(supabase.from).not.toHaveBeenCalled();
});
it('keeps an already paid request available for recovery',async()=>{
 saveSpellDeclaration(request);vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{...canceled,canceled:false},error:null} as never);
 expect(await cancelUnpaidDeclaration(request)).toBe(false);expect(savedSpellDeclaration(id,id)).toEqual(request);
});
it.each([{castId:other},{characterId:other},{canceled:'true'},{replayed:undefined}])('keeps a request when cancellation receipt is invalid: %j',async patch=>{
 saveSpellDeclaration(request);vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{...canceled,...patch},error:null} as never);
 await expect(cancelUnpaidDeclaration(request)).rejects.toThrow('receipt');expect(savedSpellDeclaration(id,id)).toEqual(request);
});
it('retries a lost cancellation response with identical identity',async()=>{
 saveSpellDeclaration(request);vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({data:{...canceled,replayed:true},error:null} as never);
 expect(await cancelUnpaidDeclaration(request)).toBe(true);expect(vi.mocked(supabase.rpc).mock.calls[0]).toEqual(vi.mocked(supabase.rpc).mock.calls[1]);
});
it('never clears a newer local request when an old cancellation completes',async()=>{
 saveSpellDeclaration({...request,castId:other});vi.mocked(supabase.rpc).mockResolvedValueOnce({data:canceled,error:null} as never);
 await expect(cancelUnpaidDeclaration(request)).rejects.toThrow('replaced');expect(savedSpellDeclaration(id,id)?.castId).toBe(other);
});
it('verified cancellation releases a hung request without letting its late result erase a new in-flight request',async()=>{
 let oldResolve!:(v:unknown)=>void,newResolve!:(v:unknown)=>void;
 vi.mocked(supabase.rpc).mockReturnValueOnce(new Promise(r=>{oldResolve=r;}) as never);
 const old=declarePaidSpell(request);
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:canceled,error:null} as never);await cancelUnpaidDeclaration(request);
 const newer={...request,castId:other};vi.mocked(supabase.rpc).mockReturnValueOnce(new Promise(r=>{newResolve=r;}) as never);
 const pending=declarePaidSpell(newer);oldResolve({data:null,error:{code:'P0001',message:'Canceled'}});await expect(old).rejects.toThrow('Canceled');
 expect(declarePaidSpell(newer)).toBe(pending);expect(()=>acknowledgeSpellDeclaration(newer)).toThrow('finish');
 newResolve({data:{cast:{...row,id:other}},error:null});await pending;
});

it('delivers only the saved cast ID and recovers a lost response without a new attack insert',async()=>{
 const r={...request,context:{...request.context,combat:{kind:'save' as const,damageDice:'3d8',damageType:'Psychic',attackBonus:null,targetAC:null,saveAbility:'WIS' as const,saveSuccessEffect:'half' as const,actorCombatantId:id,target:{participantId:other,entityId:other,type:'character' as const,combatantId:other}}}};
 vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:{castId:id,attackId:id,characterId:id,kind:'save',replayed:true},error:null} as never);
 await expect(queueDeclaredSpellAttack(r)).resolves.toMatchObject({replayed:true});
 expect(supabase.rpc).toHaveBeenCalledTimes(2);expect(supabase.rpc).toHaveBeenLastCalledWith('queue_declared_spell_attack',{p_cast_id:id});expect(supabase.from).not.toHaveBeenCalled();
 vi.mocked(supabase.rpc).mockResolvedValue({data:{castId:id,attackId:other,characterId:id,kind:'save',replayed:false},error:null} as never);
 await expect(queueDeclaredSpellAttack(r)).rejects.toThrow('could not be confirmed');
});

it('preserves captured action context separately from a mutable catalog or current turn',async()=>{
 const action={encounterId:other,turnId:id,currentTurnId:other,kind:'reaction'};
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{cast:{...row,encounter_id:other},actionContext:action},error:null} as never);
 expect((await declarePaidSpell({...request,context:{...request.context,actionKind:'reaction'}})).actionContext).toEqual(action);
});
it.each([{kind:'bonusAction'},{turnId:'invalid'},{encounterId:id},{currentTurnId:'invalid'}])('rejects an invalid action receipt %j',async patch=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{cast:{...row,encounter_id:other},actionContext:{encounterId:other,turnId:id,currentTurnId:id,kind:'action',...patch}},error:null} as never);
 await expect(declarePaidSpell({...request,context:{...request.context,actionKind:'action'}})).rejects.toThrow('action receipt');
});

it('refreshes shared action indicators after a verified declaration',async()=>{
 const changed=vi.fn();window.addEventListener('dndkeep:action-budget-changed',changed);
 try{await declarePaidSpell(request);expect(changed).toHaveBeenCalledTimes(1);}
 finally{window.removeEventListener('dndkeep:action-budget-changed',changed);}
});
