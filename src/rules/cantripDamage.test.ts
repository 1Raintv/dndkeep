import {expect,it} from 'vitest';
import {cantripDamage} from './cantripDamage';
const pc={class_name:'Psion',subclass:'Telepath',level:6,spell_sources:{'mind-sliver':['class:Psion']}};
const spell={id:'mind-sliver',level:0,damage_at_char_level:{'1':'1d6','5':'2d6','11':'3d6','17':'4d6'}};
it.each([[1,'1d6'],[4,'1d6'],[5,'2d6'],[10,'2d6'],[11,'3d6'],[16,'3d6'],[17,'4d6'],[20,'4d6']])('scales at character level %s',(level,dice)=>{
 expect(cantripDamage({...pc,level:Number(level)},spell,'1d6',4).dice).toBe(dice);
});
it('adds INT only from six Telepath levels and preserves a negative modifier',()=>{
 expect(cantripDamage(pc,spell,'1d6',4).bonus).toBe(4);
 expect(cantripDamage(pc,spell,'1d6',-1).bonus).toBe(-1);
 expect(cantripDamage({...pc,level:5,secondary_class:'Wizard',secondary_level:1},spell,'1d6',4).bonus).toBe(0);
 expect(cantripDamage({...pc,subclass:'Psi Warper'},spell,'1d6',4).bonus).toBe(0);
});
it('scales by total level while qualifying by the secondary Psion level',()=>{
 expect(cantripDamage({...pc,class_name:'Wizard',level:5,secondary_class:'Psion',secondary_subclass:'Telepath',secondary_level:6},spell,'1d6',4)).toEqual({dice:'3d6',bonus:4,needsSourceReview:false});
 expect(cantripDamage({...pc,secondary_class:null,secondary_level:5},spell,'1d6',4).dice).toBe('2d6');
});
it('never invents Psion ownership from the spell catalog or a legacy empty map',()=>{
 expect(cantripDamage({...pc,spell_sources:{}},spell,'1d6',4)).toEqual({dice:'2d6',bonus:0,needsSourceReview:true});
 expect(cantripDamage({...pc,spell_sources:{'mind-sliver':['class:Wizard']}},spell,'1d6',4).bonus).toBe(0);
 expect(cantripDamage({...pc,spell_sources:{'mind-sliver':['grant:class:Psion']}},spell,'1d6',4).bonus).toBe(4);
});
it('does not affect leveled spells, utility cantrips, or choose conditional damage',()=>{
 expect(cantripDamage(pc,{...spell,level:1},'1d6',4)).toEqual({dice:'1d6',bonus:0,needsSourceReview:false});
 expect(cantripDamage(pc,{id:'mage-hand',level:0},null,4).dice).toBeNull();
 expect(cantripDamage(pc,spell,null,4)).toEqual({dice:'2d6',bonus:4,needsSourceReview:false});
 expect(cantripDamage(pc,{...spell,damage_at_char_level:{'1':'1d8/1d12','5':'2d8/2d12'}},'1d8',4).dice).toBe('1d8');
});

it('does not advertise True Strike’s extra dice as its entire weapon attack',()=>{
 expect(cantripDamage(pc,{id:'true-strike',level:0,damage_at_char_level:{'1':'0','5':'1d6'}},null,4)).toEqual({dice:null,bonus:0,needsSourceReview:false});
});

it('applies Potent Thoughts only when the shared cantrip is cast through Psion',()=>{
 const shared={...pc,spell_sources:{'mind-sliver':['class:Psion','class:Wizard']}};
 expect(cantripDamage(shared,spell,'1d6',4)).toMatchObject({bonus:0,needsSourceReview:true});
 expect(cantripDamage(shared,spell,'1d6',4,'Wizard')).toMatchObject({bonus:0,needsSourceReview:false});
 expect(cantripDamage(shared,spell,'1d6',4,'Psion')).toMatchObject({bonus:4,needsSourceReview:false});
 expect(cantripDamage({...pc,spell_sources:{'mind-sliver':['class:Psion','grant:class:Psion']}},spell,'1d6',4).bonus).toBe(4);
});
