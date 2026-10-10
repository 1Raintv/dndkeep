import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('./psionicTurns',()=>({psionicRpc:rpc}));
import {readMovementAuraEvents} from './movementAuraEvents';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=()=>({id:id(1),sequence:'9007199254740993',campaignId:id(2),encounterId:id(3),turnId:id(4),placementId:id(5),capturedAt:'2026-10-10T01:00:00+00:00',context:{version:1,geometryVerified:false,source:'scene_token_placements',tokens:[],moverParticipantIds:[id(6)],kind:'position',from:{x:35,y:35},to:{x:105,y:35},scenes:[],participants:[]}});
beforeEach(()=>{rpc.mockReset();rpc.mockResolvedValue([row()]);});
it('preserves bigint cursors and frozen movement evidence',async()=>{
 const rows=await readMovementAuraEvents(id(3),'9007199254740994');expect(rows).toEqual([row()]);expect(rpc).toHaveBeenCalledWith('read_movement_aura_events',{p_encounter:id(3),p_before:'9007199254740994',p_limit:50},true);
});
it.each([{encounterId:id(8)},{campaignId:'other'},{sequence:'1.5'},{sequence:'9223372036854775808'},{context:{...row().context,geometryVerified:true}},{capturedAt:'never'},{context:{...row().context,source:'other'}},{context:{...row().context,moverParticipantIds:[]}}])('rejects unverified history metadata (%s)',async patch=>{
 rpc.mockResolvedValue([{...row(),...patch}]);await expect(readMovementAuraEvents(id(3))).rejects.toThrow(/could not be verified/);
});
it('rejects duplicate events and out-of-order pages',async()=>{
 rpc.mockResolvedValue([row(),row()]);await expect(readMovementAuraEvents(id(3))).rejects.toThrow();
 rpc.mockResolvedValue([{...row(),sequence:'2'},{...row(),id:id(9),sequence:'3'}]);await expect(readMovementAuraEvents(id(3))).rejects.toThrow();
});
it('rejects a cursor-inclusive replay rather than skipping it silently',async()=>{await expect(readMovementAuraEvents(id(3),row().sequence)).rejects.toThrow();});
it('rejects invalid paging before calling the server',async()=>{
 for(const cursor of ['0','-1','1.2','9223372036854775808'])await expect(readMovementAuraEvents(id(3),cursor)).rejects.toThrow();
 await expect(readMovementAuraEvents(id(3),null,101)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
});
it('surfaces authorization/read errors without returning an empty queue',async()=>{
 rpc.mockRejectedValue(new Error('DM access required'));await expect(readMovementAuraEvents(id(3))).rejects.toThrow('DM access required');
});
