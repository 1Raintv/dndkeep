import {expect,it} from 'vitest';
import {planTelepathicReaction,type TelepathicReactionContext} from './telepathicReactions';
function context():TelepathicReactionContext {return {
 character:{class_name:'Psion',level:10,subclass:'Telepath',class_resources:{'psionic-energy-dice':8}},
 reactionAvailable:true,canTakeReactions:true,connectionEffects:[],subject:{self:false,visible:true,distanceFeet:60},
 event:{kind:'attack',d20:12,total:17,threshold:15,successful:true,automatic:'none'},
};}
it.each([[2,0,15,true],[3,1,14,false]])('Distraction subtracts %i with conditional cost %i', (roll,cost,total,successful)=>{
 expect(planTelepathicReaction(context(),'distraction',roll)).toMatchObject({ok:true,reactionCost:1,energyCost:cost,total,successful,remaining:8-cost});
});
it.each(['attack','check'] as const)('Bolstering turns a failed %s into success at the threshold',kind=>{
 const c=context();c.event={...c.event,kind,total:12,successful:false};
 expect(planTelepathicReaction(c,'bolstering',2)).toMatchObject({ok:true,reactionCost:1,energyCost:0,successful:false});
 expect(planTelepathicReaction(c,'bolstering',3)).toMatchObject({ok:true,reactionCost:1,energyCost:1,total:15,successful:true});
});
it('attack natural extremes survive modifiers; checks use the total',()=>{
 const c=context();c.event={...c.event,d20:20,total:20,threshold:19};
 expect(planTelepathicReaction(c,'distraction',8)).toMatchObject({ok:true,energyCost:0,total:12,successful:true});
 c.event={...c.event,d20:1,total:1,threshold:5,successful:false};
 expect(planTelepathicReaction(c,'bolstering',8)).toMatchObject({ok:true,energyCost:0,successful:false});
 c.event.kind='check';expect(planTelepathicReaction(c,'bolstering',8)).toMatchObject({ok:true,energyCost:1,successful:true});
});
it('keeps explicit automatic outcomes such as expanded critical hits',()=>{
 const c=context();c.event.automatic='success';
 expect(planTelepathicReaction(c,'distraction',8)).toMatchObject({ok:true,energyCost:0,successful:true});
});
it('uses Psion subclass levels regardless of class order',()=>{
 const c=context();c.character={class_name:'Fighter',level:7,secondary_class:'Psion',secondary_level:3,secondary_subclass:'Telepath'};c.subject.distanceFeet=30;
 expect(planTelepathicReaction(c,'distraction',3).ok).toBe(true);
 expect(planTelepathicReaction(c,'bolstering',3)).toEqual({ok:false,reason:'ineligible'});
 c.character.secondary_subclass='Psi Warper';expect(planTelepathicReaction(c,'distraction',3).ok).toBe(false);
});
it('uses the strongest live Connection range, rejects unknown range and respects expiry',()=>{
 const c=context();c.subject.distanceFeet=100;c.connectionEffects=[{total:4,remainingSeconds:1},{total:2,remainingSeconds:10}];
 expect(planTelepathicReaction(c,'distraction',3).ok).toBe(true);
 c.subject.distanceFeet=101;expect(planTelepathicReaction(c,'distraction',3)).toMatchObject({reason:'target'});
 c.subject.distanceFeet=100;c.connectionEffects=[{total:4,remainingSeconds:0}];expect(planTelepathicReaction(c,'distraction',3)).toMatchObject({reason:'target'});
 c.connectionEffects=[{total:4,remainingSeconds:null}];expect(planTelepathicReaction(c,'distraction',3)).toMatchObject({reason:'range-unverified'});
});
it('Bolstering allows self without visibility, but another creature must be visible',()=>{
 const c=context();c.event.total=12;c.event.successful=false;c.subject={self:true,visible:false,distanceFeet:0};
 expect(planTelepathicReaction(c,'bolstering',3).ok).toBe(true);
 c.subject.self=false;expect(planTelepathicReaction(c,'bolstering',3)).toMatchObject({reason:'target'});
});
it.each(['reactionAvailable','canTakeReactions'] as const)('requires %s even when the energy die would be retained',field=>{
 const c=context();c[field]=false;expect(planTelepathicReaction(c,'distraction',1)).toMatchObject({reason:'reaction-unavailable'});
});
it.each([0,-1,1.5,9,NaN,null])('rejects unavailable or corrupt energy pool %s',value=>{
 const c=context();c.character.class_resources={'psionic-energy-dice':value};expect(planTelepathicReaction(c,'distraction',1)).toMatchObject({reason:'no-dice'});
});
it('rejects ineligible events and inconsistent saved outcomes',()=>{
 const c=context();c.event.kind='check';expect(planTelepathicReaction(c,'distraction',3)).toMatchObject({reason:'event'});
 c.event.kind='attack';c.event.successful=false;expect(planTelepathicReaction(c,'distraction',3)).toMatchObject({reason:'event'});
 expect(planTelepathicReaction(context(),'bolstering',3)).toMatchObject({reason:'event'});
});
it('validates Energy Die sides and saved enhancement totals',()=>{
 const c=context();expect(planTelepathicReaction(c,'distraction',9)).toMatchObject({reason:'roll'});
 expect(planTelepathicReaction(c,'distraction',4,{originalRoll:1,surged:true}).ok).toBe(true);
 expect(planTelepathicReaction(c,'distraction',4,{originalRoll:2})).toMatchObject({reason:'roll'});
 c.character.level=20;c.event.total=30;
 expect(planTelepathicReaction(c,'distraction',19,{originalRoll:2,enkindledRolls:[6,9],surged:true})).toMatchObject({ok:true,total:11,energyCost:1});
});

it('Distraction can prevent a condition-based critical hit but cannot prevent a natural 20',()=>{
 const c=context();c.event.criticalOnHit=true;
 expect(planTelepathicReaction(c,'distraction',2)).toMatchObject({ok:true,attackResult:'crit',energyCost:0});
 expect(planTelepathicReaction(c,'distraction',3)).toMatchObject({ok:true,attackResult:'miss',energyCost:1});
 c.event.d20=20;
 expect(planTelepathicReaction(c,'distraction',8)).toMatchObject({ok:true,attackResult:'crit',energyCost:0});
});
it('Bolstering honors the captured natural-1 house rule and conditional critical damage',()=>{
 const c=context();c.event={...c.event,d20:1,total:12,successful:false,naturalOneAutoFails:false,criticalOnHit:true};
 expect(planTelepathicReaction(c,'bolstering',3)).toMatchObject({ok:true,attackResult:'crit',energyCost:1});
 c.event.naturalOneAutoFails=true;
 expect(planTelepathicReaction(c,'bolstering',3)).toMatchObject({ok:true,attackResult:'fumble',energyCost:0});
 c.event.automatic='failure';
 expect(planTelepathicReaction(c,'bolstering',3)).toMatchObject({ok:true,attackResult:'miss',energyCost:0});
});
