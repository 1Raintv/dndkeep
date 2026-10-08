// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TokenHitPointControls} from './TokenHitPointControls';
const id='11111111-1111-4111-8111-111111111111';
const m=vi.hoisted(()=>({rpc:vi.fn(),character:{id:'11111111-1111-4111-8111-111111111111',current_hp:10,max_hp:20,temp_hp:4,hit_point_revision:0}}));
vi.mock('../../../context/AuthContext',()=>({useAuth:()=>({user:{id:'11111111-1111-4111-8111-111111111111'}})}));
vi.mock('../../../lib/supabase',()=>({supabase:{rpc:m.rpc,from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{...m.character},error:null})};return q;}}}));
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();m.character={id,current_hp:10,max_hp:20,temp_hp:4,hit_point_revision:0};});
afterEach(()=>{cleanup();vi.useRealTimers();});
const ready=async(isDM=true)=>{const view=render(<TokenHitPointControls character={m.character} isDM={isDM}/>);await waitFor(()=>expect(screen.queryByText('Refreshing HP…')).toBeNull());return view;};
function receipt(args:Record<string,unknown>){return {requestId:args.p_request_id,mode:args.p_mode,amount:args.p_amount,beforeHP:10,beforeTempHP:4,afterHP:args.p_mode==='set'?0:8,afterTempHP:args.p_mode==='set'?4:0,replayed:false,character:{...m.character,current_hp:args.p_mode==='set'?0:8,temp_hp:args.p_mode==='set'?4:0,hit_point_revision:1}};}
it('sets HP to zero and displays preserved temporary HP',async()=>{
 m.rpc.mockImplementation(async(_name,args)=>({data:receipt(args as Record<string,unknown>),error:null}) as never);
 await ready();fireEvent.click(screen.getByRole('button',{name:'Set HP'}));fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));
 await screen.findByText('HP updated.');expect(screen.getByText('0 / 20')).toBeTruthy();expect(screen.getByText('+4 temp')).toBeTruthy();await waitFor(()=>expect((screen.getByLabelText('HP amount') as HTMLInputElement).value).toBe(''));
});
it('blocks fractional amounts before sending',async()=>{
 await ready();fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'1.5'}});expect((screen.getByRole('button',{name:'Apply'}) as HTMLButtonElement).disabled).toBe(true);expect(m.rpc).not.toHaveBeenCalled();
});
it('keeps an ambiguous failure recoverable after the panel closes without spending twice',async()=>{
 m.rpc.mockRejectedValue(new Error('offline'));let view=await ready();fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'6'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));await screen.findByRole('alert');
 const args=m.rpc.mock.calls[0][1];expect(m.rpc).toHaveBeenCalledTimes(2);view.unmount();
 m.rpc.mockResolvedValue({data:{...receipt(args as Record<string,unknown>),replayed:true},error:null} as never);view=await ready();
 expect(screen.getByText(/Saved damage adjustment: 6/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Retry saved adjustment'}));await screen.findByText('Saved HP adjustment confirmed.');
 expect(m.rpc.mock.calls[2][1]).toEqual(args);expect(screen.getByText('8 / 20')).toBeTruthy();expect(screen.queryByText('+4 temp')).toBeNull();expect(localStorage.length).toBe(0);view.unmount();
});
it('cancels a rejected unpaid adjustment with the server receipt',async()=>{
 m.rpc.mockResolvedValueOnce({data:null,error:{code:'P0001',message:'HP changed'}} as never);await ready();fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'6'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));await screen.findByText('HP changed');
 const args=m.rpc.mock.calls[0][1] as Record<string,unknown>;
 m.rpc.mockResolvedValueOnce({data:{requestId:args.p_request_id,characterId:id,canceled:true,replayed:false},error:null} as never);
 fireEvent.click(screen.getByRole('button',{name:'Cancel unconfirmed adjustment'}));await screen.findByText('Adjustment canceled before it was applied.');expect(screen.getByText('10 / 20')).toBeTruthy();expect(localStorage.length).toBe(0);
});
it('prevents duplicate submits while confirmation is outstanding',async()=>{
 let resolve!:(v:unknown)=>void;m.rpc.mockReturnValueOnce(new Promise(r=>{resolve=r;}) as never);await ready();fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'6'}});
 const form=screen.getByLabelText('HP amount').closest('form')!;fireEvent.submit(form);fireEvent.submit(form);expect(m.rpc).toHaveBeenCalledTimes(1);
 const args=m.rpc.mock.calls[0][1];await act(async()=>{resolve({data:receipt(args as Record<string,unknown>),error:null});});
});
it('does not show DM adjustment controls to a player',async()=>{await ready(false);expect(screen.queryByLabelText('HP amount')).toBeNull();expect(screen.getByText('+4 temp')).toBeTruthy();});

it('times out a silent save, ignores its late response and retries the same saved adjustment',async()=>{
 let resolve!:(v:unknown)=>void;m.rpc.mockReturnValueOnce(new Promise(r=>{resolve=r;}) as never);await ready();vi.useFakeTimers();
 fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'6'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));
 const args=m.rpc.mock.calls[0][1] as Record<string,unknown>;await act(async()=>{await vi.advanceTimersByTimeAsync(15001);});
 expect(screen.getByRole('alert').textContent).toContain('took too long');expect((screen.getByRole('button',{name:'Retry saved adjustment'}) as HTMLButtonElement).disabled).toBe(false);
 await act(async()=>{resolve({data:receipt(args),error:null});});expect(screen.getByText('10 / 20')).toBeTruthy();expect(screen.queryByText('HP updated.')).toBeNull();
 m.rpc.mockResolvedValueOnce({data:{...receipt(args),replayed:true},error:null});await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Retry saved adjustment'}));});
 expect(m.rpc.mock.calls[1][1]).toEqual(args);expect(screen.getByText('8 / 20')).toBeTruthy();
});
it('never applies a late receipt to a different character',async()=>{
 let resolve!:(v:unknown)=>void;m.rpc.mockReturnValueOnce(new Promise(r=>{resolve=r;}) as never);const view=await ready();
 fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'6'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));const args=m.rpc.mock.calls[0][1] as Record<string,unknown>;const old=receipt(args);
 m.character={id:'22222222-2222-4222-8222-222222222222',current_hp:15,max_hp:30,temp_hp:0,hit_point_revision:2};view.rerender(<TokenHitPointControls character={m.character} isDM/>);
 await waitFor(()=>expect(screen.getByText('15 / 30')).toBeTruthy());await act(async()=>{resolve({data:old,error:null});});expect(screen.getByText('15 / 30')).toBeTruthy();expect(screen.queryByText('HP updated.')).toBeNull();
 expect(localStorage.getItem(`dndkeep:hp-adjustment:${id}:${id}`)).not.toBeNull();
});

it('previews temp-first damage without sending it',async()=>{
 await ready();fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'6'}});
 expect(screen.getByRole('status',{name:'HP adjustment preview'}).textContent).toContain('After damage: 8 / 20 HP');
 expect(screen.getByText('4 damage absorbed by temporary HP')).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();
 expect(screen.getByRole('meter',{name:'Current hit points'}).getAttribute('aria-valuetext')).toBe('10 of 20 HP, plus 4 temporary HP');
});
it('previews capped healing and setting zero with temporary HP preserved',async()=>{
 await ready();fireEvent.click(screen.getByRole('button',{name:'Heal'}));fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'50'}});
 expect(screen.getByText('After healing: 20 / 20 HP')).toBeTruthy();expect(screen.getByText('Capped at maximum HP')).toBeTruthy();expect(screen.getByText('4 temporary HP remaining')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Set HP'}));fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'0'}});expect(screen.getByText('After setting HP: 0 / 20 HP')).toBeTruthy();expect(screen.getByText('4 temporary HP remaining')).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();
});
it('clears the amount and mode when switching to another token',async()=>{
 const view=await ready();fireEvent.click(screen.getByRole('button',{name:'Set HP'}));fireEvent.change(screen.getByLabelText('HP amount'),{target:{value:'6'}});
 m.character={id:'22222222-2222-4222-8222-222222222222',current_hp:15,max_hp:30,temp_hp:0,hit_point_revision:2};view.rerender(<TokenHitPointControls character={m.character} isDM/>);
 await waitFor(()=>expect(screen.getByText('15 / 30')).toBeTruthy());expect((screen.getByLabelText('HP amount') as HTMLInputElement).value).toBe('');expect(screen.getByRole('button',{name:'Damage'}).getAttribute('aria-pressed')).toBe('true');expect(screen.queryByRole('status',{name:'HP adjustment preview'})).toBeNull();expect(m.rpc).not.toHaveBeenCalled();
});
