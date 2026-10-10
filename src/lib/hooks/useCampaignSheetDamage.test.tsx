// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
const m=vi.hoisted(()=>({load:vi.fn(),submit:vi.fn(),cancel:vi.fn(),settle:vi.fn(),create:vi.fn(),saved:vi.fn(),save:vi.fn(),forget:vi.fn()}));
vi.mock('../api/partyDamage',()=>({loadPartyDamageContext:m.load,submitPartySheetDamage:m.submit,cancelPartyDamage:m.cancel,settlePartyAutomaticSave:m.settle}));
vi.mock('../partyDamageRequest',()=>({createPartyDamageRequest:m.create}));
vi.mock('../partyDamageRecovery',()=>({savedPartyDamage:m.saved,savePartyDamage:m.save,forgetPartyDamage:m.forget,PARTY_DAMAGE_CHANGED:'damage-test'}));
import {useCampaignSheetDamage} from './useCampaignSheetDamage';
const character={id:'hero',user_id:'owner',campaign_id:'campaign'} as Character;
const request={characterId:'hero',campaignId:'campaign',requestId:'request',damage:5};
const batch={version:1 as const,id:'batch',userId:'owner',campaignId:'campaign',requests:[request]} as unknown as Parameters<ReturnType<typeof useCampaignSheetDamage>['confirm']>[0];
const receipt={automation:'prompt',checkId:'check',character:{id:'hero',current_hp:15}};
beforeEach(()=>{vi.resetAllMocks();m.saved.mockReturnValue([]);m.load.mockResolvedValue({});m.create.mockReturnValue(request);m.save.mockReturnValue(batch);m.submit.mockResolvedValue(receipt);});
afterEach(cleanup);
function setup(){const ref={current:character},queue={flush:vi.fn().mockResolvedValue(undefined),getSnapshot:vi.fn(()=>({pending:false,error:null as string|null}))},accept=vi.fn();const hook=renderHook(()=>useCampaignSheetDamage('owner',ref,queue,false,accept));return {...hook,ref,queue,accept};}
it('flushes edits before fetching a fresh preview and persists before sending',async()=>{
 const h=setup();await act(async()=>{await h.result.current.applyDamage(5);});
 expect(h.queue.flush.mock.invocationCallOrder[0]).toBeLessThan(m.load.mock.invocationCallOrder[0]);
 expect(m.save.mock.invocationCallOrder[0]).toBeLessThan(m.submit.mock.invocationCallOrder[0]);
 expect(m.create).toHaveBeenCalledWith({},5,null,false);expect(h.accept).toHaveBeenCalledWith(receipt.character);expect(m.forget).toHaveBeenCalledWith(batch);
});
it('retains uncertain damage and confirms the same request without creating another roll',async()=>{
 m.submit.mockRejectedValueOnce(new Error('Lost reply'));const h=setup();
 await act(async()=>{await h.result.current.applyDamage(5);});expect(m.forget).not.toHaveBeenCalled();
 await act(async()=>{await h.result.current.confirm(batch);});
 expect(m.submit.mock.calls[0]).toEqual(m.submit.mock.calls[1]);expect(m.create).toHaveBeenCalledTimes(1);expect(m.forget).toHaveBeenCalledTimes(1);
});
it('replays current concentration state after an automatic save',async()=>{
 m.submit.mockResolvedValueOnce({...receipt,automation:'auto'});const h=setup();
 await act(async()=>{await h.result.current.applyDamage(5);});expect(m.settle).toHaveBeenCalledTimes(1);expect(m.submit).toHaveBeenCalledTimes(2);expect(h.accept).toHaveBeenCalledTimes(2);
});
it('does not replay another character or a group batch from the sheet',async()=>{
 const h=setup();await act(async()=>{await h.result.current.confirm({...batch,requests:[{...batch.requests[0],characterId:'someone-else'}]});});
 expect(m.submit).not.toHaveBeenCalled();expect(m.forget).not.toHaveBeenCalled();expect(h.result.current.error).toContain('Party view');
});
it('failed queued edits block a new hit before effects can roll',async()=>{
 const h=setup();h.queue.getSnapshot.mockReturnValue({pending:false,error:'failed'});
 await act(async()=>{await h.result.current.applyDamage(5);});expect(m.load).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
it('cancellation preserves already-applied damage by reading its receipt',async()=>{
 m.cancel.mockResolvedValue(false);const h=setup();await act(async()=>{await h.result.current.cancel(batch);});
 expect(m.submit).toHaveBeenCalledWith(request);expect(h.accept).toHaveBeenCalled();
});
it('a changed sheet cannot receive a late preview or roll effects',async()=>{
 let finish!:(v:unknown)=>void;m.load.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const h=setup();
 let promise!:Promise<boolean>;await act(async()=>{promise=h.result.current.applyDamage(5);});
 h.ref.current={...character,id:'another'};h.rerender();h.ref.current=character;h.rerender();
 await act(async()=>{finish({});await promise;});expect(m.create).not.toHaveBeenCalled();expect(m.submit).not.toHaveBeenCalled();
});

it('keeps the hit when automatic concentration settlement is unconfirmed',async()=>{
 m.submit.mockResolvedValue({...receipt,automation:'auto'});m.settle.mockRejectedValueOnce(new Error('Save reply lost'));const h=setup();
 await act(async()=>{await h.result.current.applyDamage(5);});expect(m.forget).not.toHaveBeenCalled();expect(h.accept).toHaveBeenCalledWith(receipt.character);
 await act(async()=>{await h.result.current.confirm(batch);});expect(m.create).toHaveBeenCalledTimes(1);expect(m.forget).toHaveBeenCalledTimes(1);
});
it('canceling an unapplied hit does not submit damage',async()=>{
 m.cancel.mockResolvedValue(true);const h=setup();await act(async()=>{await h.result.current.cancel(batch);});expect(m.submit).not.toHaveBeenCalled();expect(m.forget).toHaveBeenCalledWith(batch);
});
it('new pending edits during the preview prevent a new effects roll',async()=>{
 const h=setup();m.load.mockImplementationOnce(async()=>{h.queue.getSnapshot.mockReturnValue({pending:true,error:null});return {};});
 await act(async()=>{await h.result.current.applyDamage(5);});expect(m.create).not.toHaveBeenCalled();expect(m.submit).not.toHaveBeenCalled();
});
