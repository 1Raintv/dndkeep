// @vitest-environment happy-dom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../supabase',()=>({supabase:{}}));
const mocks=vi.hoisted(()=>({advance:vi.fn(),cancel:vi.fn(),load:vi.fn()}));
vi.mock('../api/campaignTime',async original=>({...await original<typeof import('../api/campaignTime')>(),advanceCampaignTime:mocks.advance,cancelCampaignTime:mocks.cancel,loadCampaignClock:mocks.load}));
import {useCampaignTime} from './useCampaignTime';
import {savedCampaignTime,saveCampaignTime} from '../campaignTimeRecovery';
const user='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222';
const request={requestId:'33333333-3333-4333-8333-333333333333',campaignId:campaign,unit:'seconds' as const,amount:60,scale:6};
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();mocks.load.mockResolvedValue({rounds:0,scale:6});mocks.advance.mockResolvedValue({});mocks.cancel.mockResolvedValue(true);});
afterEach(cleanup);
it('saves before sending and clears only after confirmed success',async()=>{
 const {result}=renderHook(()=>useCampaignTime(user,campaign,true));await waitFor(()=>expect(result.current.clock).not.toBeNull());
 mocks.advance.mockImplementation(async r=>{expect(savedCampaignTime(user,campaign)[0].request).toEqual(r);});
 await act(()=>result.current.advance('seconds',60));expect(mocks.advance).toHaveBeenCalledTimes(1);expect(savedCampaignTime(user,campaign)).toEqual([]);expect(result.current.message).toBe('Time advance confirmed.');
});
it('keeps an unknown result across remount and retries the original identity',async()=>{
 mocks.advance.mockRejectedValue(new Error('Offline'));const first=renderHook(()=>useCampaignTime(user,campaign,true));await waitFor(()=>expect(first.result.current.clock).not.toBeNull());await act(()=>first.result.current.advance('seconds',60));
 const saved=savedCampaignTime(user,campaign)[0];first.unmount();mocks.advance.mockResolvedValue({});const next=renderHook(()=>useCampaignTime(user,campaign,true));await waitFor(()=>expect(next.result.current.saved).toHaveLength(1));await act(()=>next.result.current.confirm(saved));
 expect(mocks.advance.mock.calls[0][0]).toEqual(mocks.advance.mock.calls[1][0]);expect(savedCampaignTime(user,campaign)).toEqual([]);
});
it('does not send when another request is pending',async()=>{
 const {result}=renderHook(()=>useCampaignTime(user,campaign,true));await waitFor(()=>expect(result.current.clock).not.toBeNull());saveCampaignTime(user,request);
 await act(()=>result.current.advance('rounds',1));expect(mocks.advance).not.toHaveBeenCalled();expect(savedCampaignTime(user,campaign)).toHaveLength(1);
});
it('cancellation confirms an already-applied advance without creating a new identity',async()=>{
 const saved=saveCampaignTime(user,request);mocks.cancel.mockResolvedValue(false);const {result}=renderHook(()=>useCampaignTime(user,campaign,true));await act(()=>result.current.cancel(saved));
 expect(mocks.cancel).toHaveBeenCalledWith(request);expect(mocks.advance).toHaveBeenCalledWith(request);expect(result.current.message).toContain('already advanced');expect(savedCampaignTime(user,campaign)).toEqual([]);
});
it('cancellation failure retains recovery and a successful cancellation sends no advance',async()=>{
 const saved=saveCampaignTime(user,request);mocks.cancel.mockRejectedValueOnce(new Error('Offline'));const {result}=renderHook(()=>useCampaignTime(user,campaign,true));await act(()=>result.current.cancel(saved));expect(savedCampaignTime(user,campaign)).toHaveLength(1);
 mocks.cancel.mockResolvedValue(true);await act(()=>result.current.cancel(saved));expect(mocks.advance).not.toHaveBeenCalled();expect(savedCampaignTime(user,campaign)).toEqual([]);
});
it('a delayed result cannot update another campaign or clear its busy state',async()=>{
 let finish!:()=>void;mocks.advance.mockImplementation(()=>new Promise<void>(r=>{finish=r;}));const {result,rerender}=renderHook(({id})=>useCampaignTime(user,id,true),{initialProps:{id:campaign}});await waitFor(()=>expect(result.current.clock).not.toBeNull());
 let pending!:Promise<void>;act(()=>{pending=result.current.advance('seconds',60);});await waitFor(()=>expect(mocks.advance).toHaveBeenCalled());
 rerender({id:'44444444-4444-4444-8444-444444444444'});await act(async()=>{finish();await pending;});expect(result.current.message).toBe('');expect(result.current.saved).toEqual([]);
});
it('corrupt recovery blocks requests without erasing the stored data',async()=>{
 localStorage.setItem(`dndkeep:campaign-time:${user}:${campaign}:bad`,'bad');const {result}=renderHook(()=>useCampaignTime(user,campaign,true));await waitFor(()=>expect(result.current.storageError).toContain('unreadable'));
 await act(()=>result.current.advance('seconds',60));expect(mocks.advance).not.toHaveBeenCalled();expect(localStorage.length).toBe(1);
});

it('storage write failure prevents sending and keeps the error visible',async()=>{
 const {result}=renderHook(()=>useCampaignTime(user,campaign,true));await waitFor(()=>expect(result.current.clock).not.toBeNull());
 const fail=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});
 try{await act(()=>result.current.advance('seconds',60));expect(mocks.advance).not.toHaveBeenCalled();expect(result.current.error).toContain('Storage full');}finally{fail.mockRestore();}
});
