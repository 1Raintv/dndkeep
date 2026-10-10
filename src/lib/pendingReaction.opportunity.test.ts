import {beforeEach,expect,it,vi} from 'vitest';
import {offerOpportunityAttacks} from './pendingReaction';
import {mutableFormBenefits} from '../rules/mutableForm';
const state=vi.hoisted(()=>({buffs:[] as unknown[],type:'creature',form:vi.fn(),insert:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:()=>{
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{}}),insert:state.insert,
 then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[{id:'reactor',participant_type:state.type,entity_id:'character-id',combatant_id:'piece',combatants:{active_buffs:state.buffs,is_dead:false},reaction_used:false}]}).then(resolve)};return q;
}}}));
vi.mock('./api/mutableForm',()=>({readMutableFormBenefits:state.form}));
vi.mock('./automations',()=>({resolveAutomation:()=> 'prompt'}));
vi.mock('./battleMapGeometry',()=>({loadActiveBattleMap:async()=>({tokens:[{}]}),findTokenForParticipant:()=>({}),participantLookup:(p:unknown)=>p,tokenFootprintRange:()=>({rMin:0,rMax:0,cMin:0,cMax:0})}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn()}));
const input={campaignId:'campaign',encounterId:'encounter',moverParticipantId:'mover',moverName:'Mover',moverType:'character' as const,moverDisengaged:false,fromRow:0,fromCol:1,toRow:0,toCol:2};
beforeEach(()=>{state.buffs=[];state.type='creature';state.form.mockReset().mockResolvedValue(null);state.insert.mockReset().mockResolvedValue({error:null});});
it('suppresses Opportunity Attack offers for a joined Disorient effect',async()=>{
 state.buffs=[{key:'telekinetic_disorient:use',technique:'disorient',preventsOpportunityAttacks:true}];
 await expect(offerOpportunityAttacks(input)).resolves.toBe(0);expect(state.insert).not.toHaveBeenCalled();
});
it.each([{buffs:[]},{buffs:[{key:'telekinetic_boost:use',technique:'boost',speedBonus:10}]}])('allows an otherwise eligible reactor after expiry or with Boost only: %j',async ({buffs})=>{
 state.buffs=buffs;await expect(offerOpportunityAttacks(input)).resolves.toBe(1);expect(state.insert).toHaveBeenCalledWith([expect.objectContaining({reactor_participant_id:'reactor',reaction_key:'opportunity_attack'})]);
});

const creatureMove={...input,moverType:'creature' as const};
function activeForm() {
 state.type='character';
 state.form.mockResolvedValue(mutableFormBenefits({durationSeconds:60,fleshWeaver:false,improvement:null},false));
}
it('does not provoke when moving from 5 to 10 feet inside Mutable Form reach',async()=>{
 activeForm();await expect(offerOpportunityAttacks(creatureMove)).resolves.toBe(0);
 expect(state.form).toHaveBeenCalledWith('character-id');expect(state.insert).not.toHaveBeenCalled();
});
it.each([{fromRow:0,fromCol:2,toRow:0,toCol:3},{fromRow:2,fromCol:2,toRow:3,toCol:3}])('offers at the extended boundary, including diagonals: %j',async positions=>{
 activeForm();await expect(offerOpportunityAttacks({...creatureMove,...positions})).resolves.toBe(1);
 expect(state.insert).toHaveBeenCalledWith([expect.objectContaining({reactor_participant_id:'reactor'})]);
});
it('does not provoke when entering extended reach or moving entirely outside it',async()=>{
 activeForm();
 await expect(offerOpportunityAttacks({...creatureMove,fromCol:3,toCol:2})).resolves.toBe(0);
 await expect(offerOpportunityAttacks({...creatureMove,fromCol:3,toCol:4})).resolves.toBe(0);
 expect(state.insert).not.toHaveBeenCalled();
});
it('reads expiry again on the next movement and restores the ordinary boundary',async()=>{
 activeForm();await expect(offerOpportunityAttacks(creatureMove)).resolves.toBe(0);
 state.form.mockResolvedValue(null);
 await expect(offerOpportunityAttacks(creatureMove)).resolves.toBe(1);
 expect(state.form).toHaveBeenCalledTimes(2);
});
it('does not treat an unreadable form as inactive or insert a guessed offer',async()=>{
 activeForm();state.form.mockRejectedValue(new Error('effects unavailable'));
 await expect(offerOpportunityAttacks(creatureMove)).rejects.toThrow('effects unavailable');
 expect(state.insert).not.toHaveBeenCalled();
});
it('does not query character effects for a creature reactor',async()=>{
 await expect(offerOpportunityAttacks(input)).resolves.toBe(1);expect(state.form).not.toHaveBeenCalled();
});
it('keeps Disengage and Disorient ahead of form reads',async()=>{
 activeForm();await expect(offerOpportunityAttacks({...creatureMove,moverDisengaged:true})).resolves.toBe(0);
 state.buffs=[{key:'telekinetic_disorient:use',technique:'disorient',preventsOpportunityAttacks:true}];
 await expect(offerOpportunityAttacks(creatureMove)).resolves.toBe(0);
 expect(state.form).not.toHaveBeenCalled();expect(state.insert).not.toHaveBeenCalled();
});
