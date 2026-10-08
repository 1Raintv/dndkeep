// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useMapConditions} from './useMapConditions';
import {MapConditionFeedback} from './MapConditionFeedback';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../../../context/AuthContext',()=>({useAuth:()=>({user:{id:'11111111-1111-4111-8111-111111111111'}})}));
vi.mock('../../../lib/supabase',()=>({supabase:{rpc:m.rpc}}));
function Controls({target=id,enabled=true}:{target?:string;enabled?:boolean}){const state=useMapConditions(id,'character',target,enabled);return <><button disabled={state.blocked} onClick={()=>state.change('Unconscious',true)}>Apply condition</button><MapConditionFeedback state={state}/></>;}
function receipt(args:Record<string,unknown>){return {requestId:args.p_request_id,condition:args.p_condition,present:args.p_present,canceled:false,replayed:false,conditionPresent:true,blocked:false,concentrationEnded:true};}
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();m.rpc.mockImplementation(async(_n,a)=>({data:receipt(a),error:null}));});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('blocks duplicate clicks and reports concentration settlement',async()=>{
 let resolve!:(v:unknown)=>void;let args!:Record<string,unknown>;m.rpc.mockImplementation((_n,a)=>{args=a;return new Promise(r=>resolve=r);});
 render(<Controls/>);fireEvent.click(screen.getByRole('button',{name:'Apply condition'}));fireEvent.click(screen.getByRole('button',{name:'Apply condition'}));expect(m.rpc).toHaveBeenCalledTimes(1);
 await act(async()=>resolve({data:receipt(args),error:null}));expect(screen.getByText('Condition updated. Concentration ended.')).toBeTruthy();expect(screen.queryByText(/awaiting confirmation/)).toBeNull();
});
it('reloads saved intent, retries the same identity, and prevents a different change',async()=>{
 m.rpc.mockRejectedValue(new Error('offline'));const view=render(<Controls/>);fireEvent.click(screen.getByRole('button',{name:'Apply condition'}));await screen.findByRole('alert');
 const args=m.rpc.mock.calls[0][1];view.unmount();render(<Controls/>);expect(screen.getByRole('button',{name:'Apply condition'}).hasAttribute('disabled')).toBe(true);
 m.rpc.mockResolvedValue({data:{...receipt(args),replayed:true},error:null});fireEvent.click(screen.getByRole('button',{name:'Retry saved condition'}));await screen.findByText('Saved condition change confirmed.');expect(m.rpc.mock.calls[2][1]).toEqual(args);
});
it('ignores a late response after switching tokens',async()=>{
 let resolve!:(v:unknown)=>void;let args!:Record<string,unknown>;m.rpc.mockImplementation((_n,a)=>{args=a;return new Promise(r=>resolve=r);});
 const view=render(<Controls/>);fireEvent.click(screen.getByRole('button',{name:'Apply condition'}));view.rerender(<Controls target={other}/>);
 await act(async()=>resolve({data:receipt(args),error:null}));expect(screen.queryByText(/Concentration ended/)).toBeNull();expect(localStorage.length).toBe(1);
});
it('allows cancellation after silence and never claims an unconfirmed request was canceled',async()=>{
 vi.useFakeTimers();m.rpc.mockImplementation(()=>new Promise(()=>{}));render(<Controls/>);fireEvent.click(screen.getByRole('button',{name:'Apply condition'}));
 await act(async()=>{await vi.advanceTimersByTimeAsync(15_001);});expect(screen.getByRole('alert').textContent).toContain('too long');
 const args=m.rpc.mock.calls[0][1];m.rpc.mockResolvedValue({data:{...receipt(args),canceled:true,replayed:false},error:null});
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Cancel unconfirmed change'})));expect(screen.getByText('Condition change canceled.')).toBeTruthy();expect(m.rpc.mock.calls[1][1]).toMatchObject({p_cancel:true,p_request_id:args.p_request_id});
});
it('read-only controls cannot submit',async()=>{render(<Controls enabled={false}/>);fireEvent.click(screen.getByRole('button',{name:'Apply condition'}));await waitFor(()=>expect(m.rpc).not.toHaveBeenCalled());});
