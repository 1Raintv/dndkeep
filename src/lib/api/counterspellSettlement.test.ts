import {beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../../types';
import {settleCounterspellSave} from './counterspellSettlement';
import {settlePaidSpell} from './declaredSpells';
import {emitCombatEvent} from '../combatEvents';
const m=vi.hoisted(()=>({cast:{id:'cast',state:'counterspell_offered',caster_character_id:'hero'} as Record<string,unknown>|null,error:null as null|{message:string},writes:vi.fn(),lookups:vi.fn(),changed:true}));
vi.mock('../supabase',()=>({supabase:{from:()=>{
 m.lookups();let writing=false;const q={select:()=>q,eq:()=>q,update:(patch:unknown)=>{writing=true;m.writes(patch);return q;},maybeSingle:async()=>({data:writing?(m.changed?{id:'cast'}:null):m.cast,error:m.error})};return q;
}}}));
vi.mock('./declaredSpells',()=>({settlePaidSpell:vi.fn()}));vi.mock('../combatEvents',()=>({emitCombatEvent:vi.fn()}));
const attack={id:'attack',attack_name:'Counterspell vs Fly',campaign_id:'campaign',save_result:'failed',pending_lr_decision:false,target_type:'character'} as PendingAttack;
beforeEach(()=>{vi.resetAllMocks();m.cast={id:'cast',state:'counterspell_offered',caster_character_id:'hero'};m.error=null;m.changed=true;vi.mocked(settlePaidSpell).mockResolvedValue({castId:'cast',outcome:'countered',slotReturned:true,replayed:false});});
it('lets the paid transaction own outcome, refund and history',async()=>{
 await settleCounterspellSave(attack);expect(settlePaidSpell).toHaveBeenCalledWith('cast');expect(m.writes).not.toHaveBeenCalled();expect(emitCombatEvent).not.toHaveBeenCalled();
});
it('retries a paid terminal cast through its immutable receipt',async()=>{
 m.cast!.state='countered';await settleCounterspellSave(attack);expect(settlePaidSpell).toHaveBeenCalledTimes(1);expect(m.writes).not.toHaveBeenCalled();
});
it('never falls back after a transaction failure',async()=>{
 vi.mocked(settlePaidSpell).mockRejectedValueOnce(new Error('offline'));await expect(settleCounterspellSave(attack)).rejects.toThrow('offline');expect(m.writes).not.toHaveBeenCalled();
});
it.each([{attack_name:'Other spell'},{save_result:null},{pending_lr_decision:true}])('does not settle before a final Counterspell save: %j',async patch=>{
 await settleCounterspellSave({...attack,...patch} as PendingAttack);expect(m.lookups).not.toHaveBeenCalled();expect(settlePaidSpell).not.toHaveBeenCalled();
});
it('resolves an explicitly legacy cast without fabricating a resource refund',async()=>{
 vi.mocked(settlePaidSpell).mockResolvedValueOnce({legacy:true,castId:'cast'});await settleCounterspellSave(attack);
 expect(m.writes).toHaveBeenCalledWith(expect.objectContaining({state:'countered',outcome:'countered'}));expect(emitCombatEvent).toHaveBeenCalledWith(expect.objectContaining({targetType:'player'}));
});
it('does not emit another legacy outcome after losing the state race',async()=>{
 vi.mocked(settlePaidSpell).mockResolvedValueOnce({legacy:true,castId:'cast'});m.changed=false;await settleCounterspellSave(attack);expect(emitCombatEvent).not.toHaveBeenCalled();
});
it('surfaces lookup errors instead of assuming an unrelated spell',async()=>{
 m.error={message:'Lookup failed'};await expect(settleCounterspellSave(attack)).rejects.toThrow('Lookup failed');expect(settlePaidSpell).not.toHaveBeenCalled();
});
