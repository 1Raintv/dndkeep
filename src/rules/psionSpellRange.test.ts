import {expect,it} from 'vitest';
import {hasStrongerTelekinesis,psionSpellRange} from './psionSpellRange';
const character={class_name:'Psion',level:3,subclass:'Psykinetic'},spell={id:'mage-hand',level:0,range:'30 feet'};
it('adds thirty feet only from Psykinetic level three',()=>{
 expect(psionSpellRange(character,spell)).toBe('60 feet');expect(spell.range).toBe('30 feet');
 expect(psionSpellRange({...character,level:2},spell)).toBe('30 feet');
});
it('uses Psion level and subclass in either class order',()=>{
 const secondary={class_name:'Fighter',level:17,secondary_class:'Psion',secondary_level:3,secondary_subclass:'Psykinetic'};
 expect(psionSpellRange(secondary,spell)).toBe('60 feet');
 expect(psionSpellRange({...secondary,secondary_level:2},spell)).toBe('30 feet');
});
it.each(['Telepath','Metamorph','Psi Warper',null])('does not grant the modifier to %s',subclass=>expect(psionSpellRange({...character,subclass},spell)).toBe('30 feet'));
it.each([{level:2.5},{level:21},{secondary_class:'Psion',secondary_level:3},{secondary_class:'Fighter',secondary_level:18}])('does not grant range from invalid progression %j',patch=>expect(psionSpellRange({...character,...patch},spell)).toBe('30 feet'));
it('does not change another spell or a nonstandard leveled copy',()=>{
 expect(psionSpellRange(character,{...spell,id:'minor-illusion'})).toBe('30 feet');
 expect(hasStrongerTelekinesis(character,{...spell,level:1})).toBe(false);
});
it.each([['30 ft','60 ft'],['30 ft.','60 ft.'],['60 feet','90 feet'],['Self','Self'],['Touch','Touch']])('handles range %s without guessing unrecognized ranges',(range,expected)=>expect(psionSpellRange(character,{...spell,range})).toBe(expected));
