import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {getSharpenedRollRecords,finalizeSharpenedRoll} from './sharpenedRolls';
const id='11111111-1111-4111-8111-111111111111';
const row={incapacitationTracked:true,endedByIncapacitation:false,requestId:id,characterId:'hero',originalRolls:[2,3,8],rolls:[4,4,8],total:16,activatedAt:'2026-10-08T12:00:00Z',turn:{soloTurn:0}};
beforeEach(()=>vi.resetAllMocks());
it('validates pending and finalized records without treating either as active',async()=>{
 mocks.rpc.mockResolvedValue({data:[{...row,finalized:false}],error:null});expect(await getSharpenedRollRecords('hero')).toEqual([{...row,finalized:false}]);
});
it('retries final confirmation with the same activation and verifies its result',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({data:{...row,replayed:true},error:null});
 expect((await finalizeSharpenedRoll('hero',id)).total).toBe(16);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
});
it.each([{total:99},{characterId:'other'},{requestId:'wrong'},{rolls:[4,3,8]},{originalRolls:[]},{activatedAt:'invalid'},{turn:{}},{replayed:undefined}])('keeps confirmation uncertain for invalid data %j',async invalid=>{
 mocks.rpc.mockResolvedValue({data:{...row,replayed:false,...invalid},error:null});await expect(finalizeSharpenedRoll('hero',id)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('rejects duplicate records and malformed confirmation identifiers',async()=>{
 mocks.rpc.mockResolvedValue({data:[{...row,finalized:true},{...row,finalized:true}],error:null});await expect(getSharpenedRollRecords('hero')).rejects.toThrow(/verified/);
 mocks.rpc.mockClear();await expect(finalizeSharpenedRoll('hero','bad')).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
});

it('rejects incomplete or contradictory incapacitation status',async()=>{
 for(const invalid of [{incapacitationTracked:undefined},{endedByIncapacitation:'yes'},{incapacitationTracked:false,endedByIncapacitation:true}]){
 mocks.rpc.mockResolvedValue({data:[{...row,finalized:true,...invalid}],error:null});await expect(getSharpenedRollRecords('hero')).rejects.toThrow(/verified/);
 }
});
