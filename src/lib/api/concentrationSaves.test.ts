// @vitest-environment happy-dom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),die:vi.fn(),from:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:m.rpc,from:m.from}}));
vi.mock('../../rules/dice',()=>({rollDie:m.die}));
import {createConcentrationOffer,resolveConcentrationSave,savedConcentrationRolls} from './concentrationSaves';
const receipt={pendingId:'offer',outcome:'failed',d20:3,total:5,replayed:false};
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();m.die.mockReturnValue(3);m.rpc.mockResolvedValue({data:receipt,error:null});});
afterEach(()=>vi.restoreAllMocks());
it('stores the original die before sending, then forgets a verified receipt',async()=>{
 m.rpc.mockImplementation(async()=>{expect(savedConcentrationRolls('hero')).toEqual([{characterId:'hero',pendingId:'offer',d20:3,source:'player'}]);return {data:receipt,error:null};});
 expect(await resolveConcentrationSave('hero','offer','player')).toEqual(receipt);expect(savedConcentrationRolls('hero')).toEqual([]);
});
it('deduplicates simultaneous clicks and timeout in one tab',async()=>{
 let finish!:(v:unknown)=>void;m.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const first=resolveConcentrationSave('hero','offer','player'),second=resolveConcentrationSave('hero','offer','timeout');
 expect(first).toBe(second);expect(m.rpc).toHaveBeenCalledTimes(1);finish({data:receipt,error:null});await first;expect(m.die).toHaveBeenCalledTimes(1);
});
it('lost responses retain the same proposed roll and source for later confirmation',async()=>{
 m.rpc.mockRejectedValue(new Error('Offline'));await expect(resolveConcentrationSave('hero','offer','player')).rejects.toThrow('Offline');
 expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);
 expect(savedConcentrationRolls('hero')).toHaveLength(1);m.die.mockReturnValue(20);m.rpc.mockResolvedValue({data:{...receipt,replayed:true},error:null});
 await resolveConcentrationSave('hero','offer','timeout');expect(m.rpc.mock.calls[2][1]).toEqual({p_pending_id:'offer',p_d20:3,p_source:'player'});expect(m.die).toHaveBeenCalledTimes(1);
});
it('accepts another client winning the offer without overwriting its result',async()=>{
 m.rpc.mockResolvedValue({data:{...receipt,d20:18,total:20,outcome:'passed',replayed:true},error:null});
 expect(await resolveConcentrationSave('hero','offer','player')).toMatchObject({d20:18,outcome:'passed'});
});
it('retires an obsolete offer only on a verified receipt',async()=>{
 m.rpc.mockResolvedValue({data:{pendingId:'offer',outcome:'obsolete',d20:null,total:null,replayed:false},error:null});
 expect((await resolveConcentrationSave('hero','offer','player')).outcome).toBe('obsolete');expect(savedConcentrationRolls('hero')).toEqual([]);
});
it.each([{...receipt,pendingId:'other'},{...receipt,d20:0},{...receipt,total:null},{...receipt,outcome:'obsolete'}])('retains recovery after a malformed receipt %j',async data=>{
 m.rpc.mockResolvedValue({data,error:null});await expect(resolveConcentrationSave('hero','offer','player')).rejects.toThrow('could not be verified');expect(savedConcentrationRolls('hero')).toHaveLength(1);
});
it('does not send or reroll malformed saved browser data',async()=>{
 localStorage.setItem('dndkeep:concentration-roll:hero:offer','{"d20":99}');
 await expect(resolveConcentrationSave('hero','offer','player')).rejects.toThrow('does not match');expect(m.rpc).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();
});
it('storage failure prevents network mutation',async()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});
 await expect(resolveConcentrationSave('hero','offer','player')).rejects.toThrow('Storage full');expect(m.rpc).not.toHaveBeenCalled();
});
it('definite rejection does not loop or discard the proposed roll',async()=>{
 m.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'Not allowed'}});
 await expect(resolveConcentrationSave('hero','offer','player')).rejects.toThrow('Not allowed');expect(m.rpc).toHaveBeenCalledTimes(1);expect(savedConcentrationRolls('hero')).toHaveLength(1);
});

const offer={characterId:'hero',campaignId:'campaign',encounterId:'encounter',chainId:'chain',participantId:'participant',spell:'detect-magic',revision:4,damage:5,dc:10,bonus:2,proficient:false,automatic:false};
it.each([false,true])('creates a casting-bound offer for automatic=%s',async automatic=>{
 const insert=vi.fn().mockResolvedValue({error:null});m.from.mockReturnValue({insert});const before=Date.now();
 const id=await createConcentrationOffer({...offer,automatic});expect(insert).toHaveBeenCalledWith(expect.objectContaining({id,character_id:'hero',concentration_revision:4,spell_name:'detect-magic'}));
 const stored=insert.mock.calls[0][0];expect(Date.parse(stored.expires_at)-Date.parse(stored.offered_at)).toBe(automatic?0:120_000);expect(Date.parse(stored.offered_at)).toBeGreaterThanOrEqual(before);
});
it('cannot create an offer without a valid casting revision',async()=>{
 await expect(createConcentrationOffer({...offer,revision:NaN})).rejects.toThrow('casting could not be verified');expect(m.from).not.toHaveBeenCalled();
});
it('surfaces failed offer creation without attempting a roll',async()=>{
 m.from.mockReturnValue({insert:vi.fn().mockResolvedValue({error:{message:'Rejected'}})});
 await expect(createConcentrationOffer(offer)).rejects.toThrow('Rejected');expect(m.rpc).not.toHaveBeenCalled();expect(m.die).not.toHaveBeenCalled();
});
