import {beforeEach,expect,it,vi} from 'vitest';
import {offerOpportunityAttacks} from './pendingReaction';
const state=vi.hoisted(()=>({buffs:[] as unknown[],insert:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:()=>{
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{}}),insert:state.insert,
 then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[{id:'reactor',participant_type:'creature',combatant_id:'piece',combatants:{active_buffs:state.buffs,is_dead:false},reaction_used:false}]}).then(resolve)};return q;
}}}));
vi.mock('./automations',()=>({resolveAutomation:()=> 'prompt'}));
vi.mock('./battleMapGeometry',()=>({loadActiveBattleMap:async()=>({tokens:[{}]}),findTokenForParticipant:()=>({}),participantLookup:(p:unknown)=>p,tokenFootprintRange:()=>({rMin:0,rMax:0,cMin:0,cMax:0})}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn()}));
const input={campaignId:'campaign',encounterId:'encounter',moverParticipantId:'mover',moverName:'Mover',moverType:'character' as const,moverDisengaged:false,fromRow:0,fromCol:1,toRow:0,toCol:2};
beforeEach(()=>{state.buffs=[];state.insert.mockReset().mockResolvedValue({error:null});});
it('suppresses Opportunity Attack offers for a joined Disorient effect',async()=>{
 state.buffs=[{key:'telekinetic_disorient:use',technique:'disorient',preventsOpportunityAttacks:true}];
 await expect(offerOpportunityAttacks(input)).resolves.toBe(0);expect(state.insert).not.toHaveBeenCalled();
});
it.each([{buffs:[]},{buffs:[{key:'telekinetic_boost:use',technique:'boost',speedBonus:10}]}])('allows an otherwise eligible reactor after expiry or with Boost only: %j',async ({buffs})=>{
 state.buffs=buffs;await expect(offerOpportunityAttacks(input)).resolves.toBe(1);expect(state.insert).toHaveBeenCalledWith([expect.objectContaining({reactor_participant_id:'reactor',reaction_key:'opportunity_attack'})]);
});
