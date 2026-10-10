import {expect,it} from 'vitest';
import {auraReviewPreview} from './auraReviewPreview';
const context=(effects:unknown[]=[])=>({save:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[]},aura:{aura:{saveAbility:'WIS',saveDC:14,damageDice:'15',halfOnSave:true}},target:{participant:{id:'target',participant_type:'monster'},combatant:{current_hp:20,max_hp:20,temp_hp:0,active_conditions:[]}},legendaryResistance:{capacity:1,used:0},nextSaveEffects:effects});
const proposal=()=>({save:{baseBonus:0,dice:[15],effectRolls:[]},penaltyD4:2 as number|null,damageRoll:{dice:[],modifier:15,total:15},affinity:'normal',useResistance:false});
it('offers resistance only when an unexpired penalty changes this save to failure',()=>{
 const active=auraReviewPreview(context([{id:'a',expired:false}]),proposal());
 expect(active).toMatchObject({penalty:2,canUseResistance:true,normal:{save:{total:13,passed:false},damage:15},resisted:{damage:7}});
 expect(auraReviewPreview(context([{id:'a',expired:true}]),proposal())).toMatchObject({penalty:0,canUseResistance:false,normal:{save:{total:15,passed:true},damage:7},resisted:null});
});
it('overlapping effects subtract one d4 and expired copies add nothing',()=>{
 expect(auraReviewPreview(context([{id:'a',expired:true},{id:'b',expired:false},{id:'c',expired:false}]),proposal()).penalty).toBe(2);
});
it('automatic failure uses no dice or penalty while preserving the resistance option',()=>{
 const c=context([{id:'a',expired:false}]);c.save.autoFail=true;const p=proposal();p.save.dice=[];p.penaltyD4=null;
 expect(auraReviewPreview(c,p)).toMatchObject({penalty:0,canUseResistance:true,normal:{save:{d20:null,passed:false}}});
});
it.each([[{id:'a'}],[{id:'a',expired:null}],[{id:'a',expired:false},{id:'a',expired:true}]].map(effects=>({effects})))('refuses ambiguous expiry %j',({effects})=>{
 expect(()=>auraReviewPreview(context(effects),proposal())).toThrow();
});
it('does not offer unavailable resistance or mutate a saved choice',()=>{
 const c=context([{id:'a',expired:false}]),p=proposal();c.legendaryResistance.used=1;p.useResistance=true;
 expect(auraReviewPreview(c,p)).toMatchObject({canUseResistance:false,resisted:null});expect(p.useResistance).toBe(true);
});
