import {beforeEach,expect,it,vi} from 'vitest';
import {beginConnection,readConnection,finishConnection,listConnections,validConnectionRecord,type ConnectionRecord} from './telepathicConnection';
const mock=vi.hoisted(()=>({rpc:vi.fn(),notify:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('./actionBudget',()=>({notifyActionBudgetChanged:mock.notify}));
vi.mock('./psionicTurns',()=>({psionicRpc:mock.rpc,PsionicRequestError:class extends Error {constructor(message:string,public definitelyNotPaid:boolean){super(message);}}}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function saved():ConnectionRecord {
 return {request_id:id(1),character_id:id(2),request:{turnId:`solo:${id(2)}:0`,roll:2,free:true},source_feature:'Telepathic Connection',base_roll:2,psion_level:7,base_range:60,
  turn_context:{soloTurn:0},action_receipt:{claim:{requestId:id(1),actorId:id(2),turnId:`solo:${id(2)}:0`,ownerTurnId:'own',kind:'bonusAction',grantId:'normal:bonusAction',grantSource:'normal',purpose:'feature',sourceId:'Telepathic Connection'},attackLimit:null,replayed:false},
  energy_receipt:{requestId:id(1),remaining:6,energyRevision:1,connectionUsed:1,restorationResource:null,restorationUsed:null,rolls:[2],replayed:false},start_seconds:10,elapsed_adjustment:0,ended_by_rest:false,remainingSeconds:3600,
  roll_result:{declarationId:id(1),originalRolls:[2],enkindledRolls:[],usedSurge:false,rolls:[2],total:2},created_at:'2026-10-10T14:00:00Z'};
}
beforeEach(()=>{mock.rpc.mockReset();mock.notify.mockReset();});
it('accepts a complete saved effect and an unknown clock for explicit review',()=>{
 expect(validConnectionRecord(saved(),id(2))).toBe(true);
 expect(validConnectionRecord({...saved(),remainingSeconds:null},id(2))).toBe(true);
});
it.each([
 (r:ConnectionRecord)=>{r.character_id=id(3);},
 (r:ConnectionRecord)=>{r.energy_receipt.remaining=7;},
 (r:ConnectionRecord)=>{r.energy_receipt.connectionUsed=2;},
 (r:ConnectionRecord)=>{r.action_receipt.claim.kind='action';},
 (r:ConnectionRecord)=>{r.remainingSeconds=3601;},
 (r:ConnectionRecord)=>{r.ended_by_rest=true;},
 (r:ConnectionRecord)=>{r.roll_result!.total=3;},
 (r:ConnectionRecord)=>{r.roll_result!.originalRolls=[3];},
 (r:ConnectionRecord)=>{r.roll_result!.usedSurge=true;},
 (r:ConnectionRecord)=>{r.psion_level=5;},
 (r:ConnectionRecord)=>{r.start_seconds=-1;},
])('rejects inconsistent saved data (%#)',change=>{const r=saved();change(r);expect(validConnectionRecord(r,id(2))).toBe(false);});
it('begin validates exact identity and freezes the original request',async()=>{
 const r=saved(),request={requestId:r.request_id,...r.request};
 let done!:(v:unknown)=>void;mock.rpc.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));
 const pending=beginConnection(id(2),request);request.roll=4;done(r);
 expect((await pending).base_roll).toBe(2);expect(mock.notify).toHaveBeenCalledOnce();
 expect(mock.rpc.mock.calls[0][1].p_payload.roll).toBe(2);
});
it('mismatched success remains uncertain and does not notify a completed claim',async()=>{
 const r=saved();mock.rpc.mockResolvedValue(r);
 await expect(beginConnection(id(2),{requestId:id(1),turnId:r.request.turnId,roll:3,free:true})).rejects.toMatchObject({definitelyNotPaid:false});
 expect(mock.notify).not.toHaveBeenCalled();
});
it('only read allows a missing record; finish requires a finalized roll',async()=>{
 mock.rpc.mockResolvedValue(null);expect(await readConnection(id(2),id(1))).toBeNull();
 await expect(finishConnection(id(2),id(1))).rejects.toMatchObject({definitelyNotPaid:false});
 mock.rpc.mockResolvedValue({...saved(),roll_result:null});await expect(finishConnection(id(2),id(1))).rejects.toThrow();
});
it('rejects duplicate list entries and invalid identities before a request',async()=>{
 mock.rpc.mockResolvedValue([saved(),saved()]);await expect(listConnections(id(2))).rejects.toThrow();
 mock.rpc.mockClear();await expect(readConnection('invalid',id(1))).rejects.toMatchObject({definitelyNotPaid:true});expect(mock.rpc).not.toHaveBeenCalled();
});
