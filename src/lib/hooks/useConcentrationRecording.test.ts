// @vitest-environment happy-dom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
const mocks=vi.hoisted(()=>({record:vi.fn(),prepare:vi.fn(),saved:vi.fn(),discard:vi.fn()}));
vi.mock('../api/concentrationCasting',()=>({recordConcentrationCast:mocks.record,saveConcentrationCastRequest:mocks.prepare,savedConcentrationCast:mocks.saved,discardConcentrationRecording:mocks.discard}));
import {useConcentrationRecording} from './useConcentrationRecording';
const context={spellId:'detect-magic',slotLevel:1,rounds:100,source:'class:Psion' as const,ability:'intelligence' as const};
const queue=()=>({flush:vi.fn(async()=>{}),getSnapshot:()=>({pending:false,error:null}),getAcknowledged:()=>null});
beforeEach(()=>{vi.clearAllMocks();mocks.saved.mockReturnValue(null);});afterEach(cleanup);
it('flushes queued edits then accepts the confirmed cast without another character write',async()=>{
 const q=queue(),accept=vi.fn(),ref={current:{id:'hero',concentration_revision:3} as Character};
 mocks.record.mockImplementation(async request=>{expect(q.flush).toHaveBeenCalledOnce();return {concentration_revision:4,concentration_casting_context:request.context};});
 const {result}=renderHook(()=>useConcentrationRecording(ref,q,accept));
 await act(async()=>{await result.current.record(context);});
 expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({characterId:'hero',expectedRevision:3,context:expect.objectContaining(context)}));
 expect(accept).toHaveBeenCalledOnce();expect(result.current.pending).toBeNull();expect(result.current.busy).toBe(false);
});
it('retains a failed recording and retries that exact cast without a new request id',async()=>{
 const q=queue(),ref={current:{id:'hero',concentration_revision:3} as Character};
 mocks.record.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({concentration_revision:4});
 const {result}=renderHook(()=>useConcentrationRecording(ref,q,vi.fn()));
 await act(async()=>{await result.current.record(context);});
 expect(result.current.error).toBe('offline');const first=mocks.record.mock.calls[0][0];mocks.saved.mockReturnValue(first);
 await act(async()=>{await result.current.retry();});
 expect(mocks.record.mock.calls[1][0]).toEqual(first);expect(result.current.pending).toBeNull();
});
it('loads a saved request after remount and does not rewrite its original revision',async()=>{
 const request={characterId:'hero',expectedRevision:2,context:{...context,requestId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}};mocks.saved.mockReturnValue(request);
 mocks.record.mockRejectedValue(new Error('Concentration changed'));
 const {result}=renderHook(()=>useConcentrationRecording({current:{id:'hero',concentration_revision:4} as Character},queue(),vi.fn()));
 await waitFor(()=>expect(result.current.pending).toEqual(request));await act(async()=>{await result.current.retry();});
 expect(mocks.record).toHaveBeenCalledWith(request);expect(result.current.error).toBe('Concentration changed');
 act(()=>result.current.discard());expect(mocks.discard).toHaveBeenCalledWith('hero',request.context.requestId);
});

it('saves before queue flush and preserves the intent when the page unmounts',async()=>{
 let finish!:()=>void;const q=queue();q.flush.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const {result,unmount}=renderHook(()=>useConcentrationRecording({current:{id:'hero',concentration_revision:3} as Character},q,vi.fn()));
 let work!:Promise<boolean>;act(()=>{work=result.current.record(context);});
 expect(mocks.prepare).toHaveBeenCalledOnce();expect(mocks.record).not.toHaveBeenCalled();
 expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(q.flush.mock.invocationCallOrder[0]);
 unmount();finish();await work;expect(mocks.record).not.toHaveBeenCalled();
});
it('does not rebase an unsent intent over another tabs newer concentration',async()=>{
 const ref={current:{id:'hero',concentration_revision:3} as Character};const q=queue();q.flush.mockImplementation(async()=>{ref.current={...ref.current,concentration_revision:4};});
 mocks.record.mockRejectedValue(new Error('Concentration changed'));
 const {result}=renderHook(()=>useConcentrationRecording(ref,q,vi.fn()));
 await act(async()=>{await result.current.record(context);});
 expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:3}));
});

it('retains the previous spell even if realtime arrives before the recording response',async()=>{
 const ref={current:{id:'hero',concentration_revision:3,concentration_spell:'invisibility'} as Character},accept=vi.fn();
 mocks.record.mockImplementation(async()=>{ref.current={...ref.current,concentration_spell:'detect-magic',concentration_revision:4};return {concentration_revision:4};});
 const {result}=renderHook(()=>useConcentrationRecording(ref,queue(),accept));await act(async()=>{await result.current.record(context);});
 expect(accept).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({previousSpell:'invisibility'}));
});

it('offers an explicit local repair when the saved request is unreadable',()=>{
 mocks.saved.mockImplementation(()=>{throw new Error('unreadable');});
 const {result}=renderHook(()=>useConcentrationRecording({current:{id:'hero',concentration_revision:3} as Character},queue(),vi.fn()));
 expect(result.current.blocked).toBe(true);act(()=>result.current.discard());
 expect(mocks.discard).toHaveBeenCalledWith('hero',undefined);expect(result.current.blocked).toBe(false);
});

it('records only durable casting fields when a UI selection includes display metadata',async()=>{
 mocks.record.mockResolvedValue({concentration_revision:4});
 const {result}=renderHook(()=>useConcentrationRecording({current:{id:'hero',concentration_revision:3} as Character},queue(),vi.fn()));
 const selected={...context,label:'Psion',className:'Psion',key:'Psion',modifier:4,saveDC:17,attack:9};
 await act(async()=>{await result.current.record(selected);});
 expect(mocks.record.mock.calls[0][0].context).toEqual({...context,requestId:expect.any(String)});
});
