import {beforeEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({apply:vi.fn(),remove:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:(table:string)=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='characters'?{weapon_masteries:['Rapier'],level:5,strength:10,dexterity:16}:{entity_id:'hero',participant_type:'character'}})})})})}}));
vi.mock('./buffs',()=>({applyBuff:h.apply,removeBuff:h.remove}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn(),newChainId:()=>''}));
import {applyOnHitMasteryRiders,sweepExpiredMasteryMarkers,sweepEndedMasteryMarkers} from './masteryRiders';
import type {PendingAttack} from '../types';
beforeEach(()=>{h.apply.mockReset();h.remove.mockReset();});
it('creates Vex with a next-start/end lifetime rather than a second-start approximation',async()=>{
 await applyOnHitMasteryRiders({atk:{attacker_type:'character',attacker_participant_id:'A',target_participant_id:'B',attack_name:'Rapier',campaign_id:'camp',encounter_id:'enc'} as PendingAttack,damageDealt:2,targetIsDead:false});
 const buff=h.apply.mock.calls[0][0].buff;expect(buff).toMatchObject({key:'mastery_vexed',onlyVsTargetParticipantId:'B',expiresAtEndOfTurnOf:'A',expiresAfterNextTurnStarts:true});expect(buff).not.toHaveProperty('expiresAtStartOfTurnOf');expect(buff).not.toHaveProperty('expiresSkipFirst');
});
it('does not grant Vex when the hit dealt no damage',async()=>{
 await applyOnHitMasteryRiders({atk:{attacker_type:'character',attacker_participant_id:'A',target_participant_id:'B',attack_name:'Rapier'} as PendingAttack,damageDealt:0,targetIsDead:false});expect(h.apply).not.toHaveBeenCalled();
});
it('live start sweep arms Vex without emitting a second applied event',async()=>{
 await sweepExpiredMasteryMarkers('A',[{id:'A',campaign_id:'camp',encounter_id:'enc',active_buffs:[{key:'mastery_vexed',name:'Vexed',source:'mastery',expiresAtEndOfTurnOf:'A',expiresAfterNextTurnStarts:true}]}]);
 expect(h.apply).toHaveBeenCalledWith(expect.objectContaining({participantId:'A',emitEvent:false,buff:expect.objectContaining({expiresAfterNextTurnStarts:false})}));expect(h.remove).not.toHaveBeenCalled();
});
it('live end sweep removes only the armed source marker',async()=>{
 await sweepEndedMasteryMarkers('A',[{id:'A',active_buffs:[{key:'mastery_vexed',expiresAtEndOfTurnOf:'A',expiresAfterNextTurnStarts:false},{key:'other',expiresAtStartOfTurnOf:'A'}]}]);
 expect(h.remove).toHaveBeenCalledTimes(1);expect(h.remove).toHaveBeenCalledWith(expect.objectContaining({participantId:'A',key:'mastery_vexed',reason:'mastery_marker_expired'}));expect(h.apply).not.toHaveBeenCalled();
});
