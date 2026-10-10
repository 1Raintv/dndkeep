// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import ReactionPromptModal from './ReactionPromptModal';
const state=vi.hoisted(()=>({buffs:[] as unknown[],readError:false,declare:vi.fn(),roll:vi.fn(),write:vi.fn()}));
vi.mock('../../lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'player'}}}})},channel:()=>{const ch={on:()=>ch,subscribe:()=>ch};return ch;},removeChannel:vi.fn(),from:(table:string)=>{
 const q={select:()=>q,eq:()=>q,update:state.write,order:async()=>({data:[{id:'offer',campaign_id:'campaign',reactor_participant_id:'reactor',reactor_name:'Hero',reactor_type:'character',reaction_key:'opportunity_attack',reaction_name:'Opportunity Attack',expires_at:new Date(Date.now()+120000).toISOString(),decision_payload:{mover_participant_id:'mover',mover_name:'Enemy'}}]}),single:async()=>table==='campaigns'?{data:{owner_id:'dm'}}:{data:state.readError?null:{encounter_id:'encounter',participant_type:'character',ac:12,combatants:{active_buffs:state.buffs}},error:state.readError?{message:'offline'}:null}};return q;
}}}));
vi.mock('../../lib/pendingAttack',()=>({declareAttack:state.declare,rollAttackRoll:state.roll}));
vi.mock('../../lib/pendingReaction',()=>({acceptReaction:vi.fn(),declineReaction:vi.fn(),expireReaction:vi.fn()}));
vi.mock('../../lib/hooks/useCounterspellChoice',()=>({useCounterspellChoice:()=>({character:null,selected:null})}));
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();state.buffs=[];state.readError=false;state.declare.mockResolvedValue({id:'attack'});state.roll.mockResolvedValue(undefined);state.write.mockImplementation(()=>({eq:async()=>({error:null})}));});
it('checks a Disorient received after opening, keeps the reaction unspent and allows retry after expiry',async()=>{
 render(<ReactionPromptModal campaignId="campaign"/>);const accept=await screen.findByRole('button',{name:/Make Attack/});
 state.buffs=[{key:'telekinetic_disorient:use',technique:'disorient',preventsOpportunityAttacks:true}];fireEvent.click(accept);
 await screen.findByText(/Telekinetic Disorient prevents/);expect(state.declare).not.toHaveBeenCalled();expect(state.roll).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();
 state.buffs=[];fireEvent.click(accept);await waitFor(()=>expect(state.roll).toHaveBeenCalledWith('attack'));expect(state.declare).toHaveBeenCalledTimes(1);
});
it('does not attack when the latest reactor state cannot be verified, and restores the button',async()=>{
 state.readError=true;render(<ReactionPromptModal campaignId="campaign"/>);const accept=await screen.findByRole('button',{name:/Make Attack/});fireEvent.click(accept);
 await screen.findByText(/Could not verify the reacting creature/);expect(state.declare).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();expect((accept as HTMLButtonElement).disabled).toBe(false);
});
