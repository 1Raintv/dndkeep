import {expect,it} from 'vitest';
import {auraDamageEvidence} from '../rules/auraDamageEvidence';
import {verifyAuraResolutionReceipt} from './auraResolutionReceipt';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(character=false){
 const expected={encounterId:id(1),turnId:id(2),marker:`aura_save:${id(3)}:fixture`,origin:{participant:{id:id(3)}},
  target:{participant:{id:id(4),participant_type:character?'character':'monster',entity_id:id(5)},combatant:{current_hp:20,max_hp:20,temp_hp:0,active_conditions:[] as string[]}},
  aura:{aura:{key:'fixture',saveAbility:'WIS',saveDC:14,damageDice:'1d8',damageType:'radiant',halfOnSave:true}},
  save:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[]},legendaryResistance:{capacity:0,used:0},nextSaveEffects:[] as {id:string}[],
  partyDamage:{character:{id:id(5),concentration_spell:'Bless',advanced_automations_unlocked:false,automation_overrides:{}},campaign:{automation_defaults:{}},participant:{id:id(4)}}};
 const proposal={save:{baseBonus:0,dice:[1],effectRolls:[]},penaltyD4:2 as number|null,damageRoll:{dice:[{die:8,value:5}],modifier:0,total:5},affinity:'normal',useResistance:false,concentrationId:id(6),conModifier:0,geometryConfirmed:true,defensesReviewed:true};
 const requestId=id(7),d=auraDamageEvidence(expected,proposal,0);
 const result={requestId,encounterId:id(1),turnId:id(2),originId:id(3),targetId:id(4),auraKey:'fixture',marker:expected.marker,replayed:false,
  save:d.save,penalty:{saveId:requestId,saveKind:'feature',penalty:0,die:null as number|null,consumedIds:[] as string[],expiredIds:[] as string[],replayed:false},passed:false,acceptedResistance:false,damage:5,
  damageResult:{...d.pools,checkId:character?id(6):null,concentrationBroken:false,...(character?{requestId,saveId:id(6),damage:5,damageType:'radiant',participantId:id(4),automation:'prompt',replayed:false}:{})}};
 return {expected,proposal,requestId,result};
}
it.each([false,true])('verifies a full historical receipt, character=%s',character=>{
 const f=fixture(character);expect(verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toEqual(f.result);
 const replay={...f.result,replayed:true};expect(verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,replay)).toEqual(replay);
});
it.each(['requestId','encounterId','turnId','originId','targetId','auraKey','marker'])('rejects changed %s',field=>{
 const f=fixture();expect(()=>verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,{...f.result,[field]:id(99)})).toThrow();
});
it('requires every pending effect to be consumed or expired exactly once',()=>{
 const f=fixture();f.expected.nextSaveEffects=[{id:id(8)},{id:id(9)}];
 f.result.penalty.expiredIds=[id(8),id(9)];expect(verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toEqual(f.result);
 for(const expiredIds of [[id(8)],[id(8),id(8)],[id(8),id(10)]])expect(()=>verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,{...f.result,penalty:{...f.result.penalty,expiredIds}})).toThrow();
});
it('uses one recorded d4 for overlapping consumed effects',()=>{
 const f=fixture();f.expected.nextSaveEffects=[{id:id(8)},{id:id(9)}];f.result.penalty.consumedIds=[id(8),id(9)];f.result.penalty.penalty=2;f.result.penalty.die=2;
 f.result.save=auraDamageEvidence(f.expected,f.proposal,2).save;
 expect(verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toEqual(f.result);
 expect(()=>verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,{...f.result,penalty:{...f.result.penalty,penalty:4}})).toThrow();
});
it('consumes an automatic failure trigger without a penalty die',()=>{
 const f=fixture();f.expected.save.autoFail=true;f.proposal.save.dice=[];f.proposal.penaltyD4=null;f.expected.nextSaveEffects=[{id:id(8)}];f.result.penalty.consumedIds=[id(8)];
 f.result.save=auraDamageEvidence(f.expected,f.proposal,0).save;
 expect(verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toEqual(f.result);
 f.proposal.penaltyD4=2;expect(()=>verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toThrow();
});
it.each([{checkId:null},{checkId:id(99)},{concentrationBroken:true},{automation:'off'},{damageType:'fire'},{participantId:id(99)},{saveId:id(99)},{character:{current_hp:20}}])('rejects changed character damage metadata %j',patch=>{
 const f=fixture(true);expect(()=>verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,{...f.result,damageResult:{...f.result.damageResult,...patch}})).toThrow();
});
it('ends concentration at zero HP rather than accepting another check',()=>{
 const f=fixture(true);f.expected.target.combatant.current_hp=3;f.result.damageResult.beforeHP=3;f.result.damageResult.afterHP=0;f.result.damageResult.checkId=null;f.result.damageResult.concentrationBroken=true;
 expect(verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toEqual(f.result);
 f.result.damageResult.checkId=id(6);expect(()=>verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toThrow();
});
it('requires explicit geometry and defenses review and distinct concentration identity',()=>{
 const f=fixture();for(const patch of [{geometryConfirmed:false},{defensesReviewed:false},{concentrationId:f.requestId},{conModifier:121},{unknown:true}])
  expect(()=>verifyAuraResolutionReceipt(f.expected,{...f.proposal,...patch},f.requestId,f.result)).toThrow();
});

it.each(['off','prompt','auto'] as const)('matches campaign concentration automation %s',mode=>{
 const f=fixture(true);f.expected.partyDamage.campaign.automation_defaults={concentration_on_damage:mode};
 f.result.damageResult.automation=mode;f.result.damageResult.checkId=mode==='off'?null:id(6);
 expect(verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toEqual(f.result);
});
it.each([false,true])('honors character overrides only when unlocked=%s',unlocked=>{
 const f=fixture(true);f.expected.partyDamage.character.advanced_automations_unlocked=unlocked;
 f.expected.partyDamage.character.automation_overrides={concentration_on_damage:'off'};
 f.result.damageResult.automation=unlocked?'off':'prompt';f.result.damageResult.checkId=unlocked?null:id(6);
 expect(verifyAuraResolutionReceipt(f.expected,f.proposal,f.requestId,f.result)).toEqual(f.result);
});
