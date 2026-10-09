// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({accept:vi.fn(),decline:vi.fn(),query:vi.fn()}));
vi.mock('../../lib/legendaryResistance',()=>({acceptLegendaryResistance:m.accept,declineLegendaryResistance:m.decline}));
vi.mock('../../lib/supabase',()=>({supabase:{from:m.query,channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
import LegendaryResistancePromptModal from './LegendaryResistancePromptModal';
beforeEach(()=>{
 vi.clearAllMocks();m.accept.mockResolvedValue({});m.decline.mockResolvedValue({});
 m.query.mockImplementation((table:string)=>{
  const data=table==='pending_attacks'?[{id:'save',target_participant_id:'creature',target_name:'Dragon',encounter_id:'enc',save_total:5,save_dc:15}]:table==='combat_participants'?[{id:'creature',legendary_resistance:3,legendary_resistance_used:0}]:[{id:'enc',in_lair:false}];
  const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return q;
 });
});
afterEach(cleanup);
it('a failed decision shows an error and permits retry',async()=>{
 m.accept.mockRejectedValueOnce(new Error('Decision not confirmed. Retry the same choice.'));
 render(<LegendaryResistancePromptModal campaignId="campaign" isDM/>);
 const button=await screen.findByRole('button',{name:'Use Legendary Resistance'});
 await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);
 expect((await screen.findByRole('alert')).textContent).toContain('Retry the same choice');
 await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);
 await waitFor(()=>expect(m.accept).toHaveBeenCalledTimes(2));
});
it('same-frame acceptance and decline cannot race',async()=>{
 let resolve!:(v:unknown)=>void;m.accept.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 render(<LegendaryResistancePromptModal campaignId="campaign" isDM/>);
 const button=await screen.findByRole('button',{name:'Use Legendary Resistance'});
 await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
 act(()=>{fireEvent.click(button);fireEvent.click(button);fireEvent.click(screen.getByRole('button',{name:'Decline'}));});
 expect(m.accept).toHaveBeenCalledTimes(1);expect(m.decline).not.toHaveBeenCalled();await act(async()=>resolve({}));
});
