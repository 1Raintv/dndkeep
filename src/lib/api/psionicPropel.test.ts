import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./psionicTurns',async()=>{const actual=await vi.importActual<typeof import('./psionicTurns')>('./psionicTurns');return {...actual,psionicRpc:mocks.rpc};});
vi.mock('../supabase',()=>({supabase:{}}));
import {beginPropel,readPropel,finalizePropel,finishPropel,listPropel,getPropelContext,getPropelEnhancements,validPropelRecord,type PropelRecord,type PropelRequest} from './psionicPropel';
const character='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const request:PropelRequest={requestId:id,turnId:`solo:${character}:0`,mode:'powered',movement:'push',roll:4,target:{name:'Goblin',legalTargetConfirmed:true}};
const record=()=>({turn_context:{soloTurn:0},request_id:id,character_id:character,request:{turnId:`solo:${character}:0`,mode:'powered',movement:'push',roll:4,target:request.target},
 source_feature:'Telekinetic Propel',mode:'powered',movement:'push',base_roll:4,psion_level:5,target:request.target,caster_snapshot:{id:character,class_name:'Psion',level:5},created_at:'2026-10-09T15:00:00Z',
 action_receipt:{claim:{requestId:id,actorId:character,turnId:`solo:${character}:0`,ownerTurnId:'own',kind:'bonusAction',grantId:'normal:bonusAction',grantSource:'normal',purpose:'feature',sourceId:'Telekinetic Propel'},replayed:false,attackLimit:null},roll_result:null,outcome:null,result:null});
const roll=()=>({declarationId:id,originalRolls:[4],enkindledRolls:[],rolls:[4],usedSurge:false,total:4});
const finished=()=>{const r={...record(),roll_result:roll(),outcome:'failed'};return {...r,result:{declarationId:id,outcome:'failed',energyCost:1,
 energy:{requestId:id,remaining:2,energyRevision:1,replayed:false,rolls:[4],restorationResource:null,restorationUsed:null},feet:20,movement:'push',target:r.target,roll:r.roll_result,action:r.action_receipt,replayed:false}};};
beforeEach(()=>vi.resetAllMocks());
it('submits a frozen declaration and validates its captured action',async()=>{
 mocks.rpc.mockResolvedValue(record());expect(await beginPropel(character,request)).toEqual(record());
 expect(mocks.rpc).toHaveBeenCalledWith('psionic_propel',{p_character:character,p_operation:'begin',p_payload:request},true);
});
it.each([{character_id:id},{base_roll:7},{psion_level:11},{source_feature:'Warp Propel'},{target:{name:'Other',legalTargetConfirmed:true}},{action_receipt:null},{roll_result:{...roll(),total:5}},{outcome:'failed'}])('keeps recovery for inconsistent records: %j',async patch=>{
 mocks.rpc.mockResolvedValue({...record(),...patch});await expect(readPropel(character,id)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('rejects a valid-looking receipt belonging to another request',async()=>{
 mocks.rpc.mockResolvedValue(record());await expect(readPropel(character,'00000000-0000-4000-8000-000000000003')).rejects.toMatchObject({definitelyNotPaid:false});
});
it('does not send invalid declarations',async()=>{
 for(const patch of [{requestId:'bad'},{mode:'free',roll:4},{target:{name:'Goblin',legalTargetConfirmed:false}}])await expect(beginPropel(character,{...request,...patch} as PropelRequest)).rejects.toMatchObject({definitelyNotPaid:true});
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it('requires finalized dice before accepting finalization',async()=>{
 mocks.rpc.mockResolvedValue(record());await expect(finalizePropel(character,id)).rejects.toMatchObject({definitelyNotPaid:false});
 mocks.rpc.mockResolvedValue({...record(),roll_result:roll()});expect(await finalizePropel(character,id)).toMatchObject({roll_result:{total:4}});
});
it('validates the conditional die payment and movement',async()=>{
 const good=finished();expect(validPropelRecord(good,character)).toBe(true);
 mocks.rpc.mockResolvedValue(good);expect(await finishPropel(character,id,'failed')).toEqual(good);
 for(const patch of [{energyCost:0},{feet:25},{energy:{...good.result.energy,requestId:character}},{energy:{...good.result.energy,rolls:[5]}},{roll:{...roll(),total:7}}])expect(validPropelRecord({...good,result:{...good.result,...patch}},character)).toBe(false);
 await expect(finishPropel(character,id,'passed')).rejects.toMatchObject({definitelyNotPaid:false});
});
it('keeps declaration input stable while a request is in flight',async()=>{
 const mutable=structuredClone(request);let resolve!:(v:unknown)=>void;mocks.rpc.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=beginPropel(character,mutable);mutable.target.name='Changed';mutable.roll=8;resolve(record());await expect(pending).resolves.toMatchObject({base_roll:4});
 expect(mocks.rpc.mock.calls[0][1].p_payload.target.name).toBe('Goblin');
});
it('validates recovery pages, cursors and pending-only records',async()=>{
 mocks.rpc.mockResolvedValue({items:[record()],nextCursor:null});expect((await listPropel(character)).items).toHaveLength(1);
 for(const page of [{items:[record(),record()],nextCursor:null},{items:[finished()],nextCursor:null},{items:[record()],nextCursor:{createdAt:record().created_at,requestId:id}}]){
  mocks.rpc.mockResolvedValue(page);await expect(listPropel(character)).rejects.toMatchObject({definitelyNotPaid:false});
 }
});
it('does not use a context for a different character',async()=>{
 const context={actorId:character,turnId:`solo:${character}:0`,ownerTurnId:'own',isOwnTurn:true,encounterId:null,participantId:null,bonusAvailable:true};
 mocks.rpc.mockResolvedValue(context);expect(await getPropelContext(character)).toEqual(context);
 mocks.rpc.mockResolvedValue({...context,actorId:id});await expect(getPropelContext(character)).rejects.toMatchObject({definitelyNotPaid:false});
});

it('preserves microsecond ordering when recovering older pending declarations',async()=>{
 const r={...record(),created_at:'2026-10-09T15:00:00.123450Z'};
 const cursor={createdAt:'2026-10-09T15:00:00.123456Z',requestId:character};
 mocks.rpc.mockResolvedValue({items:[r],nextCursor:null});expect((await listPropel(character,cursor)).items).toEqual([r]);
 mocks.rpc.mockResolvedValue({items:[{...r,created_at:cursor.createdAt}],nextCursor:null});await expect(listPropel(character,cursor)).rejects.toMatchObject({definitelyNotPaid:false});
});

it('validates paid enhancement identities, levels and dice before recovery',async()=>{
 const saved={...record(),psion_level:20,caster_snapshot:{id:character,class_name:'Psion',level:20}} as unknown as PropelRecord;
 mocks.rpc.mockResolvedValue({declarationId:id,extraRolls:[2,6],usedSurge:true});
 expect(await getPropelEnhancements(saved)).toEqual({declarationId:id,extraRolls:[2,6],usedSurge:true});
 for(const patch of [{declarationId:character},{extraRolls:[13]},{extraRolls:[1,2,3]},{usedSurge:'true'}]){
  mocks.rpc.mockResolvedValue({declarationId:id,extraRolls:[2,6],usedSurge:true,...patch});await expect(getPropelEnhancements(saved)).rejects.toMatchObject({definitelyNotPaid:false});
 }
 mocks.rpc.mockResolvedValue({declarationId:id,extraRolls:[2],usedSurge:false});
 await expect(getPropelEnhancements(record() as unknown as PropelRecord)).rejects.toMatchObject({definitelyNotPaid:false});
});

it.each([null,7,{soloTurn:-1},{soloTurn:1},{encounterId:'bad',turnId:'turn',round:1,index:0}])('rejects inconsistent saved turn contexts: %j',async turn_context=>{
 mocks.rpc.mockResolvedValue({...record(),turn_context});await expect(readPropel(character,id)).rejects.toMatchObject({definitelyNotPaid:false});
});

it('sends frozen save evidence and rejects a substituted confirmed save',async()=>{
 const save={participantId:'manual',outcome:'failed' as const,dc:15,d20:3,bonus:2,total:5,rolls:[3],advantage:false,naturalExtremes:false};
 const good={...finished(),save_details:save};mocks.rpc.mockResolvedValue(good);
 expect(await finishPropel(character,id,'failed',save)).toEqual(good);
 expect(mocks.rpc).toHaveBeenCalledWith('psionic_propel',{p_character:character,p_operation:'finish',p_payload:{declarationId:id,outcome:'failed',save}},true);
 mocks.rpc.mockResolvedValue({...good,save_details:{...save,dc:16}});
 await expect(finishPropel(character,id,'failed',save)).rejects.toMatchObject({definitelyNotPaid:false});
});
