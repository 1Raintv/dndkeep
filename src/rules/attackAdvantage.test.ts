import {expect,it} from 'vitest';
import {attackAdvantage} from './attackAdvantage';
const poisoned={name:'Poisoned',attackDisadvantage:true};
const restrained={name:'Restrained',attackAdvantageReceived:true};
const prone={name:'Prone',attackAdvantageReceived:true,attackDisadvantage:true};
it.each([{adv:true},{dis:true},{adv:true,dis:true},{}])('a cancelled condition pair stays cancelled with extra sources %j',extra=>{
 expect(attackAdvantage([poisoned],[restrained],2,extra)).toBe('normal');
});
it('additional sources never outnumber an opposing source',()=>{
 expect(attackAdvantage([poisoned,{name:'Invisible'}],[restrained],2,{adv:true})).toBe('normal');
 expect(attackAdvantage([poisoned,prone],[restrained],2,{dis:true})).toBe('normal');
});
it.each([[{},'normal'],[{adv:true},'advantage'],[{dis:true},'disadvantage'],[{adv:true,dis:true},'normal']] as const)('supports mastery-only rolls %j', (extra,result)=>{
 expect(attackAdvantage([],[],2,extra)).toBe(result);
});
it('Vex cancels Poisoned and Sap cancels advantage against a restrained target',()=>{
 expect(attackAdvantage([poisoned],[],2,{adv:true})).toBe('normal');
 expect(attackAdvantage([],[restrained],2,{dis:true})).toBe('normal');
});
it('Prone target grants advantage within five feet and disadvantage beyond',()=>{
 expect(attackAdvantage([],[prone],1)).toBe('advantage');
 expect(attackAdvantage([],[prone],2)).toBe('disadvantage');
 expect(attackAdvantage([],[prone],2,{adv:true})).toBe('normal');
 expect(attackAdvantage([prone],[prone],1)).toBe('normal');
});
it('retains invisible attacker/target cancellation when a marker is added',()=>{
 expect(attackAdvantage([{name:'Invisible'}],[{name:'Invisible'}],2,{adv:true})).toBe('normal');
 expect(attackAdvantage([{name:'Invisible'}],[{name:'Invisible'}],2,{dis:true})).toBe('normal');
});
