import {expect,it} from 'vitest';
import {telepathyBaseRange,telepathicConnectionRange,connectionSecondsRemaining,connectionRangeDisplay} from './telepathicConnection';
const psion={class_name:'Psion',level:5,subclass:'Telepath'};
it('uses Psion levels for the Telepath base range in either class order',()=>{
 expect(telepathyBaseRange(psion)).toBe(30);
 expect(telepathyBaseRange({...psion,level:6})).toBe(60);
 expect(telepathyBaseRange({...psion,level:6,subclass:'Psi Warper'})).toBe(30);
 expect(telepathyBaseRange({class_name:'Fighter',level:11,secondary_class:'Psion',secondary_level:5,secondary_subclass:'Telepath'})).toBe(30);
 expect(telepathyBaseRange({class_name:'Fighter',level:11,secondary_class:'Psion',secondary_level:6,secondary_subclass:'Telepath'})).toBe(60);
 expect(telepathyBaseRange({...psion,class_name:'Wizard'})).toBeNull();
});
it('validates enhanced totals before deriving range',()=>{
 expect(telepathicConnectionRange(psion,8)).toBe(110);
 expect(telepathicConnectionRange(psion,9)).toBeNull();
 expect(telepathicConnectionRange({...psion,level:7},4,{originalRoll:1,surged:true})).toBe(100);
 expect(telepathicConnectionRange({...psion,level:20},19,{originalRoll:2,enkindledRolls:[6,9],surged:true})).toBe(250);
 expect(telepathicConnectionRange({...psion,level:19},19,{originalRoll:2,enkindledRolls:[6,9],surged:true})).toBeNull();
});
it('expires at the exact game-time hour and never starts a new duration on read',()=>{
 expect(connectionSecondsRemaining(100,100)).toBe(3600);
 expect(connectionSecondsRemaining(100,3699)).toBe(1);
 expect(connectionSecondsRemaining(100,3700)).toBe(0);
 expect(connectionSecondsRemaining(100,4000)).toBe(0);
 expect(connectionSecondsRemaining(100,160)).toBe(3540);
});
it('one-minute meditation consumes a minute, not the whole extension',()=>{
 expect(connectionSecondsRemaining(100,100,60)).toBe(3540);
 expect(connectionSecondsRemaining(100,3640,60)).toBe(0);
 expect(connectionSecondsRemaining(100,100,3600)).toBe(0);
});
it.each([NaN,Infinity,-1,0.5])('rejects invalid clock input %s',value=>{
 expect(connectionSecondsRemaining(value,100)).toBeNull();
 expect(connectionSecondsRemaining(0,value)).toBeNull();
 expect(connectionSecondsRemaining(0,100,value)).toBeNull();
});
it('rejects a rewound clock and handles large elapsed values without overflow',()=>{
 expect(connectionSecondsRemaining(100,99)).toBeNull();
 expect(connectionSecondsRemaining(0,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)).toBe(0);
 expect(connectionSecondsRemaining(Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)).toBe(3600);
});

it('overlapping extensions use the strongest active bonus and reveal weaker ones after expiry',()=>{
 expect(connectionRangeDisplay(60,[{total:8,remainingSeconds:1},{total:3,remainingSeconds:300}])).toEqual({range:140,remainingSeconds:1,needsReview:false});
 expect(connectionRangeDisplay(60,[{total:8,remainingSeconds:0},{total:3,remainingSeconds:299}])).toEqual({range:90,remainingSeconds:299,needsReview:false});
 expect(connectionRangeDisplay(30,[])).toEqual({range:30,remainingSeconds:null,needsReview:false});
});
it('unsettled rolls and missing clocks require review; ties keep the longest active duration',()=>{
 expect(connectionRangeDisplay(30,[{total:null,remainingSeconds:60}]).needsReview).toBe(true);
 expect(connectionRangeDisplay(30,[{total:4,remainingSeconds:null}]).needsReview).toBe(true);
 expect(connectionRangeDisplay(30,[{total:4,remainingSeconds:10},{total:4,remainingSeconds:50}]).remainingSeconds).toBe(50);
});
