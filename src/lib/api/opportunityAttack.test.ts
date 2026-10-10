import {beforeEach,expect,it,vi} from 'vitest';
import {acceptOpportunityAttack} from './opportunityAttack';
const state=vi.hoisted(()=>({rpc:vi.fn(),notify:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:state.rpc}}));
vi.mock('./actionBudget',()=>({notifyActionBudgetChanged:state.notify}));
const offer={id:'offer',reactor_participant_id:'actor',decision_payload:{mover_participant_id:'target'}};
const choice={name:'Sword',bonus:3,dice:'1d8+2',damageType:'slashing'};
const receipt={offerId:'offer',attackId:'attack',actorId:'actor',targetId:'target',replayed:false};
beforeEach(()=>{vi.clearAllMocks();state.rpc.mockResolvedValue({data:receipt,error:null});});
it('checks the saved identity and notifies the shared budget',async()=>{
 await expect(acceptOpportunityAttack(offer,choice)).resolves.toEqual(receipt);
 expect(state.rpc).toHaveBeenCalledWith('accept_opportunity_attack',{p_offer:'offer',p_name:'Sword',p_bonus:3,p_dice:'1d8+2',p_damage_type:'slashing'});expect(state.notify).toHaveBeenCalledOnce();
});
it('retries transport failure with identical input and accepts the saved replay',async()=>{
 state.rpc.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({data:{...receipt,replayed:true},error:null});
 expect((await acceptOpportunityAttack(offer,choice)).replayed).toBe(true);expect(state.rpc.mock.calls[0]).toEqual(state.rpc.mock.calls[1]);
});
it('does not retry a rule rejection or announce spending',async()=>{
 state.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Disorient prevents Opportunity Attacks'}});
 await expect(acceptOpportunityAttack(offer,choice)).rejects.toThrow(/Disorient/);expect(state.rpc).toHaveBeenCalledOnce();expect(state.notify).not.toHaveBeenCalled();
});
it.each([{offerId:'other'},{actorId:'other'},{targetId:'other'},{attackId:''},{replayed:null}])('rejects mismatched receipt %j',async patch=>{
 state.rpc.mockResolvedValue({data:{...receipt,...patch},error:null});await expect(acceptOpportunityAttack(offer,choice)).rejects.toThrow(/receipt/);expect(state.notify).not.toHaveBeenCalled();
});
it('shares identical in-flight work and rejects conflicting weapon choices',async()=>{
 let finish!:(v:unknown)=>void;state.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const first=acceptOpportunityAttack(offer,choice),second=acceptOpportunityAttack(offer,choice);
 expect(first).toBe(second);await expect(acceptOpportunityAttack(offer,{...choice,bonus:4})).rejects.toThrow(/different/);
 finish({data:receipt,error:null});await first;expect(state.rpc).toHaveBeenCalledOnce();
});
it('rejects incomplete targets and noninteger attack bonuses before sending',async()=>{
 await expect(acceptOpportunityAttack({...offer,decision_payload:null},choice)).rejects.toThrow(/Review/);
 await expect(acceptOpportunityAttack(offer,{...choice,bonus:NaN})).rejects.toThrow(/Review/);expect(state.rpc).not.toHaveBeenCalled();
});
