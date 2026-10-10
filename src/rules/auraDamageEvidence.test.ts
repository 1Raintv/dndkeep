import {expect,it} from 'vitest';
import {auraDamageEvidence,validAuraDamagePools} from './auraDamageEvidence';
const context=()=>({save:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[]},aura:{aura:{saveAbility:'WIS',saveDC:14,damageDice:'3d8' as string|null,halfOnSave:true}},target:{participant:{id:'target',participant_type:'monster'},combatant:{current_hp:20,max_hp:20,temp_hp:2,active_conditions:[] as string[]}},legendaryResistance:{capacity:1,used:0}});
const proposal=()=>({save:{baseBonus:0,dice:[1],effectRolls:[]},damageRoll:{dice:[{die:8,value:5},{die:8,value:5},{die:8,value:5}],modifier:0,total:15} as unknown,affinity:'normal',useResistance:false});
it.each([['normal',15],['resistant',7],['vulnerable',30],['resistant-vulnerable',14],['immune',0]])('applies %s defenses to failed-save damage', (affinity,damage)=>{
 expect(auraDamageEvidence(context(),{...proposal(),affinity},0).damage).toBe(damage);
});
it('halves a successful save before resistance then vulnerability',()=>{
 const p=proposal();p.save.dice=[20];p.affinity='resistant-vulnerable';
 expect(auraDamageEvidence(context(),p,0)).toMatchObject({passed:true,damage:6,pools:{beforeHP:20,beforeTempHP:2,afterHP:16,afterTempHP:0}});
});
it('uses a reviewed Legendary Resistance only on an eligible failed save',()=>{
 const p=proposal();p.useResistance=true;expect(auraDamageEvidence(context(),p,0)).toMatchObject({passed:true,acceptedResistance:true,damage:7});
 const spent=context();spent.legendaryResistance.used=1;expect(()=>auraDamageEvidence(spent,p,0)).toThrow();
 const player=context();player.target.participant.participant_type='character';expect(()=>auraDamageEvidence(player,p,0)).toThrow();
 p.save.dice=[20];expect(()=>auraDamageEvidence(context(),p,0)).toThrow();
});
it('includes Petrified resistance but immunity still prevents all damage',()=>{
 const c=context();c.target.combatant.active_conditions=['Petrified'];
 expect(auraDamageEvidence(c,proposal(),0).damage).toBe(7);
 expect(auraDamageEvidence(c,{...proposal(),affinity:'immune'},0)).toMatchObject({damage:0,pools:null});
});
it('requires no damage evidence for a nondamaging aura',()=>{
 const c=context();c.aura.aura.damageDice=null;const p={...proposal(),damageRoll:null};
 expect(auraDamageEvidence(c,p,0)).toMatchObject({damage:0,pools:null});
 expect(()=>auraDamageEvidence(c,proposal(),0)).toThrow();
});
it('handles zero damage on success and clamps negative rolls before defenses',()=>{
 const c=context(),p=proposal();c.aura.aura.halfOnSave=false;p.save.dice=[20];expect(auraDamageEvidence(c,p,0).damage).toBe(0);
 c.aura.aura.damageDice='0-5';p.damageRoll={dice:[],modifier:-5,total:-5};p.save.dice=[1];expect(auraDamageEvidence(c,p,0).damage).toBe(0);
});
it('rejects changed damage dice, overflowing damage and invalid HP',()=>{
 const p=proposal();p.damageRoll={dice:[],modifier:15,total:15};expect(()=>auraDamageEvidence(context(),p,0)).toThrow();
 const c=context();c.aura.aura.damageDice='2147483648';p.damageRoll={dice:[],modifier:2147483648,total:2147483648};expect(()=>auraDamageEvidence(c,p,0)).toThrow();
 const bad=context();bad.target.combatant.current_hp=21;expect(()=>auraDamageEvidence(bad,proposal(),0)).toThrow();
});
it('verifies historical HP pools without accepting changed damage or outcomes',()=>{
 const c=context(),p=proposal(),e=auraDamageEvidence(c,p,0),r={damage:e.damage,passed:e.passed,acceptedResistance:e.acceptedResistance,damageResult:e.pools};
 expect(validAuraDamagePools(c,p,0,r)).toBe(true);
 for(const patch of [{damage:0},{passed:true},{acceptedResistance:true},{damageResult:null},{damageResult:{...e.pools,afterHP:20}}])expect(validAuraDamagePools(c,p,0,{...r,...patch})).toBe(false);
 expect(c.target.combatant.current_hp).toBe(20);
});
